"""
SSTV Synchronization and VIS Code Detection
Handles sync pulses, VIS codes, and line timing for SSTV decoding
"""
import numpy as np
from scipy import signal

class SSTVSync:
    """
    SSTV synchronization detector for VIS codes and line sync
    """

    # SSTV Frequencies
    SYNC_FREQ = 1200  # Hz - sync pulse
    VIS_BIT_0 = 1100  # Hz - VIS bit 0
    VIS_BIT_1 = 1300  # Hz - VIS bit 1
    BLACK_FREQ = 1500  # Hz
    WHITE_FREQ = 2300  # Hz

    # VIS Codes for common modes
    VIS_CODES = {
        0x2C: "Martin M1",
        0x28: "Martin M2",
        0x24: "Scottie S1",
        0x20: "Scottie S2",
        0x3C: "Robot 36"
    }

    # Mode parameters
    MODE_PARAMS = {
        "Martin M1": {
            "line_time": 0.146,  # seconds
            "width": 320,
            "height": 256,
            "color": True,
            "channel_order": ["G", "B", "R"]  # Green, Blue, Red
        },
        "Scottie S1": {
            "line_time": 0.138,
            "width": 320,
            "height": 256,
            "color": True,
            "channel_order": ["G", "B", "R"]
        },
        "Robot 36": {
            "line_time": 0.150,
            "width": 320,
            "height": 240,
            "color": True,
            "channel_order": ["Y", "R-Y", "B-Y"]  # YUV
        }
    }

    def __init__(self, sample_rate: int = 12000):
        """
        Initialize SSTV sync detector

        Args:
            sample_rate: Audio sample rate
        """
        self.sample_rate = sample_rate
        self.detected_mode = None
        self.sync_locked = False
        self.last_sync_time = 0

    def detect_tone(self, audio_segment: np.ndarray, target_freq: float, bandwidth: float = 50) -> float:
        """
        Detect presence of a specific tone using Goertzel algorithm

        Args:
            audio_segment: Audio samples
            target_freq: Target frequency in Hz
            bandwidth: Detection bandwidth in Hz

        Returns:
            Magnitude of the target frequency component
        """
        # Goertzel algorithm for single frequency detection
        N = len(audio_segment)
        k = int(0.5 + (N * target_freq) / self.sample_rate)
        omega = (2.0 * np.pi * k) / N
        sine = np.sin(omega)
        cosine = np.cos(omega)
        coeff = 2.0 * cosine

        q0 = 0.0
        q1 = 0.0
        q2 = 0.0

        for sample in audio_segment:
            q0 = coeff * q1 - q2 + sample
            q2 = q1
            q1 = q0

        # Calculate magnitude
        magnitude = np.sqrt(q1 * q1 + q2 * q2 - q1 * q2 * coeff)

        return magnitude

    def detect_sync_pulse(self, audio_segment: np.ndarray) -> bool:
        """
        Detect 1200 Hz sync pulse

        Args:
            audio_segment: Audio samples (should be ~30ms)

        Returns:
            True if sync pulse detected
        """
        sync_mag = self.detect_tone(audio_segment, self.SYNC_FREQ)
        noise_mag = self.detect_tone(audio_segment, 2000)  # Reference frequency

        # Sync pulse should be strong and dominant
        return sync_mag > noise_mag * 3 and sync_mag > 0.1

    def decode_vis_code(self, audio: np.ndarray) -> str:
        """
        Decode VIS (Vertical Interval Signaling) code

        VIS format:
        - Leader tone (1900 Hz, 300ms)
        - Break (1200 Hz, 10ms)
        - Start bit (1200 Hz, 30ms)
        - 7 data bits (1100/1300 Hz, 30ms each)
        - Parity bit (1100/1300 Hz, 30ms)
        - Stop bit (1200 Hz, 30ms)

        Args:
            audio: Audio samples containing VIS code

        Returns:
            Mode name if detected, None otherwise
        """
        bit_duration = int(0.030 * self.sample_rate)  # 30ms

        # Look for start bit (1200 Hz)
        for offset in range(0, len(audio) - bit_duration * 10, int(bit_duration / 2)):
            segment = audio[offset:offset + bit_duration]
            if self.detect_sync_pulse(segment):
                # Found potential start bit, decode data bits
                vis_bits = []

                for bit_num in range(7):
                    bit_offset = offset + bit_duration * (bit_num + 1)
                    if bit_offset + bit_duration > len(audio):
                        break

                    bit_segment = audio[bit_offset:bit_offset + bit_duration]

                    # Detect 1100 Hz (0) vs 1300 Hz (1)
                    mag_0 = self.detect_tone(bit_segment, self.VIS_BIT_0)
                    mag_1 = self.detect_tone(bit_segment, self.VIS_BIT_1)

                    vis_bits.append(1 if mag_1 > mag_0 else 0)

                if len(vis_bits) == 7:
                    # Convert bits to VIS code
                    vis_code = 0
                    for i, bit in enumerate(vis_bits):
                        vis_code |= (bit << i)

                    # Check if this is a known mode
                    if vis_code in self.VIS_CODES:
                        mode = self.VIS_CODES[vis_code]
                        self.detected_mode = mode
                        self.sync_locked = True
                        return mode

        return None

    def get_mode_params(self) -> dict:
        """
        Get parameters for the detected mode

        Returns:
            Dictionary of mode parameters
        """
        if self.detected_mode in self.MODE_PARAMS:
            return self.MODE_PARAMS[self.detected_mode]
        else:
            # Default to Martin M1
            return self.MODE_PARAMS["Martin M1"]

    def detect_frequency_goertzel(self, audio_segment: np.ndarray) -> float:
        """
        Detect dominant frequency in range 1500-2300 Hz for pixel brightness

        Args:
            audio_segment: Audio samples for one pixel

        Returns:
            Detected frequency in Hz
        """
        # Use FFT for more reliable frequency detection
        if len(audio_segment) < 10:
            return 1900  # Default if not enough samples

        # Apply FFT
        fft = np.fft.fft(audio_segment)
        freqs = np.fft.fftfreq(len(audio_segment), 1/self.sample_rate)

        # Get magnitude spectrum (only positive frequencies)
        magnitude = np.abs(fft[:len(fft)//2])
        freqs_positive = freqs[:len(freqs)//2]

        # Find frequencies in SSTV range (1500-2300 Hz)
        mask = (freqs_positive >= 1500) & (freqs_positive <= 2300)
        if not np.any(mask):
            return 1900  # Default if no frequencies in range

        # Find peak frequency in range
        sstv_magnitudes = magnitude[mask]
        sstv_freqs = freqs_positive[mask]

        if len(sstv_magnitudes) == 0:
            return 1900

        peak_idx = np.argmax(sstv_magnitudes)
        detected_freq = sstv_freqs[peak_idx]

        return float(detected_freq)
