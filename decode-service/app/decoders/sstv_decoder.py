"""
SSTV (Slow Scan TV) Decoder
Decodes SSTV images from IQ files
Supports Martin M1 mode (most common)
"""
import asyncio
import numpy as np
from fastapi import WebSocket
import logging
import os
import base64
import json
from io import BytesIO
from PIL import Image
from utils.iq_processor import IQFileReader
from utils.audio_demod import AudioDemodulator, apply_bandpass_filter
from utils.sstv_sync import SSTVSync

logger = logging.getLogger(__name__)

class SSTVDecoder:
    """Decodes SSTV images from IQ samples"""

    # SSTV Martin M1 constants
    MARTIN_M1_SYNC_FREQ = 1200  # Hz
    MARTIN_M1_BLACK_FREQ = 1500  # Hz
    MARTIN_M1_WHITE_FREQ = 2300  # Hz
    MARTIN_M1_WIDTH = 320
    MARTIN_M1_HEIGHT = 256
    MARTIN_M1_SCAN_TIME = 0.146  # seconds per line

    def __init__(self):
        self.iq_reader = None
        self.demodulator = None
        self.running = False
        self.current_image = None
        self.current_line = 0
        self.current_col = 0  # Track column position within current line
        self.sstv_sync = None  # Will be initialized with audio rate
        self.metadata = None
        self.decode_state = "WAITING_FOR_VIS"  # States: WAITING_FOR_VIS, WAITING_FOR_SYNC, DECODING
        self.vis_detected = False
        self.audio_buffer = np.array([], dtype=np.float32)
        self.vis_wait_time = 0  # Track time spent waiting for VIS

    def _load_metadata(self, metadata_file="/iq_library/metadata.json"):
        """Load IQ file metadata for sample rates"""
        try:
            with open(metadata_file, 'r') as f:
                data = json.load(f)
                self.metadata = {item['filename']: item for item in data.get('iq_files', [])}
                logger.info(f"Loaded metadata for {len(self.metadata)} IQ files")
                return True
        except Exception as e:
            logger.warning(f"Could not load metadata: {e}")
            self.metadata = {}
            return False

    def _get_sample_rate_for_file(self, filename):
        """Get the correct sample rate for an IQ file from metadata"""
        if self.metadata and filename in self.metadata:
            sample_rate = self.metadata[filename].get('sample_rate_hz', 62500)
            logger.info(f"Using sample rate {sample_rate} Hz from metadata for {filename}")
            return sample_rate
        logger.warning(f"No metadata found for {filename}, using default 62500 Hz")
        return 62500  # Default for SSTV files

    async def decode_stream(self, websocket: WebSocket, state: dict):
        """
        Main decode loop - reads IQ file and decodes SSTV

        Args:
            websocket: WebSocket connection to send data
            state: Current system state (iq_file, jamming, etc.)
        """
        self.running = True
        logger.info("Starting SSTV decoder")

        # Load metadata
        self._load_metadata()

        try:
            while self.running:
                # Wait for IQ file to be selected
                if not state.get("iq_file"):
                    await websocket.send_json({
                        "type": "status",
                        "message": "Waiting for IQ file selection..."
                    })
                    await asyncio.sleep(1)
                    continue

                # Check if playback is active
                if not state.get("playing"):
                    await websocket.send_json({
                        "type": "status",
                        "message": "Paused - waiting for playback..."
                    })
                    await asyncio.sleep(0.5)
                    continue

                # Get IQ file path
                iq_file = state["iq_file"]
                if not iq_file.startswith("/"):
                    iq_file = f"/iq_library/{os.path.basename(iq_file)}"

                # Check if this is an SSTV file
                if "sstv" not in os.path.basename(iq_file).lower():
                    await websocket.send_json({
                        "type": "status",
                        "message": "Not an SSTV file. Load sstv-20m.iq to decode images."
                    })
                    await asyncio.sleep(5)
                    continue

                # Initialize reader and demodulator if needed
                if self.iq_reader is None or self.iq_reader.file_path != iq_file:
                    # Get correct sample rate from metadata
                    filename = os.path.basename(iq_file)
                    sample_rate = self._get_sample_rate_for_file(filename)

                    logger.info(f"Initializing decoder for {filename} at {sample_rate} Hz")

                    self.iq_reader = IQFileReader(iq_file, sample_rate=sample_rate, chunk_size=8192)
                    if not self.iq_reader.load_file():
                        await websocket.send_json({
                            "type": "error",
                            "message": f"Failed to load IQ file: {iq_file}"
                        })
                        await asyncio.sleep(5)
                        continue

                    self.demodulator = AudioDemodulator(sample_rate=sample_rate)

                    # Initialize SSTV sync detector with audio rate
                    self.sstv_sync = SSTVSync(sample_rate=12000)

                    # Reset decode state
                    self.decode_state = "WAITING_FOR_VIS"
                    self.vis_detected = False
                    self.audio_buffer = np.array([], dtype=np.float32)
                    self.vis_wait_time = 0

                    # Initialize new image (resets line and col counters)
                    self._init_image()

                    # Send file info
                    await websocket.send_json({
                        "type": "file_info",
                        "data": {
                            "filename": os.path.basename(iq_file),
                            "duration_seconds": self.iq_reader.get_duration_seconds(),
                            "mode": "Detecting...",
                            "expected_width": self.MARTIN_M1_WIDTH,
                            "expected_height": self.MARTIN_M1_HEIGHT
                        }
                    })
                    logger.info(f"File loaded: {filename}, starting VIS detection")

                # Get chunk of IQ samples
                chunk = self.iq_reader.get_chunk()
                if chunk is None or len(chunk) == 0:
                    await asyncio.sleep(0.1)
                    continue

                # Apply jamming effect if enabled
                if state.get("jamming_enabled", False):
                    chunk = self._apply_jamming_effect(chunk, state.get("jamming_power", 0))

                # For RF recordings at HF (14.242 MHz):
                # The IQ samples contain the RF signal centered at baseband
                # SSTV uses SSB (USB), so we need to extract the upper sideband audio

                # The audio tones (1500-2300 Hz) are in the IQ samples
                # Simply take the real part which contains the baseband audio
                from scipy import signal as sp_signal

                # Use real part for USB audio extraction
                audio_raw = np.real(chunk)

                # Resample to audio rate (12 kHz)
                decimation_factor = self.iq_reader.sample_rate // 12000
                if decimation_factor > 1:
                    try:
                        audio = sp_signal.decimate(audio_raw, decimation_factor, ftype='fir', zero_phase=True)
                    except:
                        audio = sp_signal.resample(audio_raw, len(audio_raw) // decimation_factor)
                else:
                    audio = audio_raw

                # Apply bandpass filter for SSTV audio range (1200-2500 Hz)
                if len(audio) > 100:
                    nyquist = 12000 / 2
                    low = 1200 / nyquist
                    high = 2500 / nyquist
                    low = max(0.01, min(low, 0.99))
                    high = max(low + 0.01, min(high, 0.99))
                    try:
                        sos = sp_signal.butter(4, [low, high], btype='bandpass', output='sos')
                        audio = sp_signal.sosfilt(sos, audio)
                    except:
                        pass  # Skip filter if it fails

                # Normalize
                max_val = np.max(np.abs(audio))
                if max_val > 0:
                    audio = audio / max_val

                audio = audio.astype(np.float32)

                # Debug: Check audio spectrum for first chunk
                if self.decode_state == "DECODING" and len(self.audio_buffer) < 12000:
                    if len(audio) > 1024:
                        fft = np.fft.fft(audio[:1024])
                        freqs = np.fft.fftfreq(1024, 1/12000)
                        magnitude = np.abs(fft[:512])
                        freqs_pos = freqs[:512]
                        # Find peak
                        peak_idx = np.argmax(magnitude)
                        peak_freq = freqs_pos[peak_idx]
                        logger.info(f"Audio spectrum peak at {peak_freq:.1f} Hz, magnitude={magnitude[peak_idx]:.2f}, RMS={np.sqrt(np.mean(audio**2)):.4f}")

                # Add to audio buffer for VIS detection
                self.audio_buffer = np.concatenate([self.audio_buffer, audio])

                # Process based on current state
                if self.decode_state == "WAITING_FOR_VIS":
                    # Track time spent waiting
                    self.vis_wait_time += len(audio) / 12000.0

                    # Try to detect VIS code
                    if len(self.audio_buffer) > 12000 * 2:  # 2 seconds of audio
                        logger.debug(f"Checking for VIS code in {len(self.audio_buffer)} samples")
                        mode = self.sstv_sync.decode_vis_code(self.audio_buffer)
                        if mode:
                            logger.info(f"🎯 VIS code detected: {mode}")
                            self.vis_detected = True
                            self.decode_state = "WAITING_FOR_SYNC"
                            await websocket.send_json({
                                "type": "status",
                                "message": f"Detected SSTV mode: {mode}"
                            })
                            # Clear buffer after VIS detection
                            self.audio_buffer = np.array([], dtype=np.float32)
                        else:
                            # Keep last 2 seconds of buffer
                            if len(self.audio_buffer) > 12000 * 4:
                                self.audio_buffer = self.audio_buffer[-12000 * 2:]

                    # Timeout after 5 seconds - just start decoding anyway
                    if self.vis_wait_time > 5.0:
                        logger.warning(f"⚠️ No VIS code detected after {self.vis_wait_time:.1f}s, starting decode anyway")
                        self.decode_state = "DECODING"
                        await websocket.send_json({
                            "type": "status",
                            "message": "Starting decode (no VIS code found)"
                        })

                elif self.decode_state == "WAITING_FOR_SYNC":
                    # Look for sync pulse to start line
                    if len(self.audio_buffer) > 12000 * 0.5:  # 0.5 seconds
                        if self.sstv_sync.detect_sync_pulse(self.audio_buffer[:int(12000 * 0.03)]):
                            logger.info("🔄 Sync pulse detected, starting decode")
                            self.decode_state = "DECODING"
                            await websocket.send_json({
                                "type": "status",
                                "message": "Decoding image..."
                            })
                        # Keep sliding window
                        if len(self.audio_buffer) > 12000 * 1:
                            self.audio_buffer = self.audio_buffer[-int(12000 * 0.5):]

                elif self.decode_state == "DECODING":
                    # Decode SSTV from audio
                    image_data = await self._decode_sstv_audio(audio, websocket)

                    # If we completed an image, send it
                    if image_data:
                        await websocket.send_json({
                            "type": "image_complete",
                            "data": image_data
                        })
                        logger.info("✅ Image decode complete")

                        # Reset for next image
                        self._init_image()
                        self.decode_state = "WAITING_FOR_SYNC"

                # Delay to simulate real-time
                delay = len(chunk) / self.iq_reader.sample_rate
                await asyncio.sleep(delay)

        except Exception as e:
            logger.error(f"Error in SSTV decoder: {e}", exc_info=True)
            await websocket.send_json({
                "type": "error",
                "message": str(e)
            })

    def _init_image(self):
        """Initialize a new SSTV image"""
        self.current_image = np.zeros((self.MARTIN_M1_HEIGHT, self.MARTIN_M1_WIDTH, 3), dtype=np.uint8)
        self.current_line = 0
        self.current_col = 0

    def _apply_jamming_effect(self, iq_samples: np.ndarray, jamming_power: float) -> np.ndarray:
        """
        Simulate jamming by adding noise to IQ samples

        Args:
            iq_samples: Clean IQ samples
            jamming_power: Jamming power (0.0 to 1.0)

        Returns:
            IQ samples with jamming noise added
        """
        # Add random noise scaled by jamming power
        noise = (np.random.randn(len(iq_samples)) + 1j * np.random.randn(len(iq_samples)))
        noise *= jamming_power * 0.5

        return iq_samples + noise.astype(np.complex64)

    async def _decode_sstv_audio(self, audio: np.ndarray, websocket: WebSocket) -> dict:
        """
        Decode SSTV from audio samples using real frequency detection

        Args:
            audio: Audio samples at 12000 Hz
            websocket: WebSocket to send progress updates

        Returns:
            Image data dict if image is complete, None otherwise
        """
        # SSTV Martin M1 uses frequency to encode brightness:
        # Sync: 1200 Hz
        # Black: 1500 Hz
        # White: 2300 Hz
        # Scan time per line: 0.146 seconds
        # Pixel time: 0.146s / 320 pixels = 456 microseconds per pixel

        # Calculate samples per pixel
        samples_per_pixel = int(12000 * self.MARTIN_M1_SCAN_TIME / self.MARTIN_M1_WIDTH)

        logger.debug(f"Decoding {len(audio)} audio samples, {samples_per_pixel} samples/pixel")

        # Process audio in pixel-sized chunks
        pixels_to_add = len(audio) // samples_per_pixel

        if pixels_to_add == 0:
            return None

        for i in range(pixels_to_add):
            if self.current_line >= self.MARTIN_M1_HEIGHT:
                # Image complete
                logger.info(f"Image decoding complete: {self.MARTIN_M1_WIDTH}x{self.MARTIN_M1_HEIGHT}")
                return self._get_image_data()

            # Get audio segment for this pixel
            start_idx = i * samples_per_pixel
            end_idx = start_idx + samples_per_pixel
            pixel_audio = audio[start_idx:end_idx]

            # Detect dominant frequency using Goertzel algorithm
            if self.sstv_sync is None:
                freq = 1900  # Default to mid-gray if not initialized
            else:
                freq = self.sstv_sync.detect_frequency_goertzel(pixel_audio)

            # Debug: Log frequency range for first few lines
            if self.current_line < 5 and self.current_col < 10:
                logger.info(f"Line {self.current_line}, Col {self.current_col}: freq={freq:.1f} Hz, audio_rms={np.sqrt(np.mean(pixel_audio**2)):.4f}")

            # Map frequency to grayscale value
            # SSTV: 1500 Hz = black (0), 2300 Hz = white (255)
            if freq < 1500:
                gray_value = 0
            elif freq > 2300:
                gray_value = 255
            else:
                # Linear mapping: (freq - 1500) / (2300 - 1500) * 255
                gray_value = int((freq - 1500) / 800 * 255)
                gray_value = np.clip(gray_value, 0, 255)

            # Set RGB values using current position
            self.current_image[self.current_line, self.current_col] = [
                gray_value,
                gray_value,
                gray_value
            ]

            # Advance column
            self.current_col += 1

            # Move to next line when row is complete
            if self.current_col >= self.MARTIN_M1_WIDTH:
                self.current_col = 0  # Reset column

                # Send scan line update
                await websocket.send_json({
                    "type": "scan_line",
                    "data": {
                        "line_number": self.current_line,
                        "total_lines": self.MARTIN_M1_HEIGHT,
                        "progress": (self.current_line + 1) / self.MARTIN_M1_HEIGHT
                    }
                })
                logger.info(f"Decoded line {self.current_line + 1}/{self.MARTIN_M1_HEIGHT}")
                self.current_line += 1

        return None

    def _detect_frequency(self, audio_segment: np.ndarray, sample_rate: int) -> float:
        """
        Detect dominant frequency in audio segment using FFT

        Args:
            audio_segment: Audio samples
            sample_rate: Sample rate in Hz

        Returns:
            Dominant frequency in Hz
        """
        # Apply FFT
        fft = np.fft.fft(audio_segment)
        freqs = np.fft.fftfreq(len(audio_segment), 1/sample_rate)

        # Get magnitude spectrum (only positive frequencies)
        magnitude = np.abs(fft[:len(fft)//2])
        freqs = freqs[:len(freqs)//2]

        # Find peak frequency
        peak_idx = np.argmax(magnitude)
        peak_freq = abs(freqs[peak_idx])

        return peak_freq

    def _get_image_data(self) -> dict:
        """
        Convert current image to base64-encoded PNG

        Returns:
            Dictionary with image data
        """
        # Convert numpy array to PIL Image
        img = Image.fromarray(self.current_image, mode='RGB')

        # Encode as PNG in memory
        buffer = BytesIO()
        img.save(buffer, format='PNG')
        buffer.seek(0)

        # Encode to base64
        img_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')

        return {
            "image_base64": img_base64,
            "width": self.MARTIN_M1_WIDTH,
            "height": self.MARTIN_M1_HEIGHT,
            "mode": "Martin M1"
        }

    def stop(self):
        """Stop the decoder"""
        self.running = False
