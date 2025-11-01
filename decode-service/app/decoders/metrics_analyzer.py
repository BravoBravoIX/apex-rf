"""
Signal Metrics Analyzer
Analyzes IQ samples and provides real-time quality metrics
"""
import asyncio
import numpy as np
from fastapi import WebSocket
import logging
import os
from utils.iq_processor import IQFileReader, calculate_snr, calculate_signal_strength

logger = logging.getLogger(__name__)

class MetricsAnalyzer:
    """Analyzes signal quality metrics from IQ files"""

    def __init__(self):
        self.iq_reader = None
        self.running = False

    async def analyze_stream(self, websocket: WebSocket, state: dict):
        """
        Main analysis loop - reads IQ file and sends metrics

        Args:
            websocket: WebSocket connection to send data
            state: Current system state (iq_file, jamming, etc.)
        """
        self.running = True
        logger.info("Starting metrics analysis")

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

                # Initialize reader if needed
                if self.iq_reader is None or self.iq_reader.file_path != iq_file:
                    self.iq_reader = IQFileReader(iq_file, chunk_size=32768)
                    if not self.iq_reader.load_file():
                        await websocket.send_json({
                            "type": "error",
                            "message": f"Failed to load IQ file: {iq_file}"
                        })
                        await asyncio.sleep(5)
                        continue

                    # Send file info
                    await websocket.send_json({
                        "type": "file_info",
                        "data": {
                            "filename": os.path.basename(iq_file),
                            "duration_seconds": self.iq_reader.get_duration_seconds(),
                            "sample_rate": self.iq_reader.sample_rate,
                            "total_samples": self.iq_reader.total_samples
                        }
                    })

                # Get chunk of samples
                chunk = self.iq_reader.get_chunk()
                if chunk is None or len(chunk) == 0:
                    await asyncio.sleep(0.1)
                    continue

                # Calculate metrics
                metrics = await self._analyze_chunk(chunk, state)

                # Send metrics to dashboard
                await websocket.send_json({
                    "type": "metrics",
                    "data": metrics
                })

                # Delay to simulate real-time (adjust based on chunk size)
                delay = len(chunk) / self.iq_reader.sample_rate
                await asyncio.sleep(delay)

        except Exception as e:
            logger.error(f"Error in metrics analysis: {e}")
            await websocket.send_json({
                "type": "error",
                "message": str(e)
            })

    async def _analyze_chunk(self, iq_samples: np.ndarray, state: dict) -> dict:
        """
        Analyze a chunk of IQ samples and extract metrics

        Args:
            iq_samples: Complex IQ samples
            state: Current system state

        Returns:
            Dictionary of metrics
        """
        # Calculate SNR
        snr_db = calculate_snr(iq_samples, sample_rate=self.iq_reader.sample_rate)

        # Calculate signal strength
        signal_strength_dbm = calculate_signal_strength(iq_samples)

        # Apply jamming impact first - it degrades SNR
        jamming_enabled = state.get("jamming_enabled", False)
        jamming_power = state.get("jamming_power", 0.0)

        if jamming_enabled and jamming_power > 0:
            # Degrade SNR based on jamming power
            # Full jamming can reduce SNR by 25dB
            snr_degradation = jamming_power * 25
            snr_db = snr_db - snr_degradation

        # Calculate BER based on SNR (after jamming)
        # Use realistic relationship: BER degrades exponentially with SNR
        if snr_db > 15:
            ber = 0.0001  # Excellent - 0.01%
        elif snr_db > 10:
            ber = 0.001   # Very good - 0.1%
        elif snr_db > 8:
            ber = 0.01    # Good - 1%
        elif snr_db > 5:
            ber = 0.05    # Fair - 5%
        elif snr_db > 3:
            ber = 0.15    # Poor - 15%
        elif snr_db > 0:
            ber = 0.30    # Very poor - 30%
        elif snr_db > -5:
            ber = 0.45    # Failing - 45%
        else:
            ber = 0.50    # Dead - 50%

        # Calculate packet success rate based on BER
        # Assume packets are 1000 bits - probability of no errors
        packet_bits = 1000
        if ber < 0.001:
            packet_success = 0.99  # Almost perfect
        elif ber < 0.01:
            packet_success = 0.90  # Very good
        elif ber < 0.05:
            packet_success = 0.60  # Usable with retransmits
        elif ber < 0.15:
            packet_success = 0.20  # Barely usable
        elif ber < 0.30:
            packet_success = 0.05  # Mostly failing
        else:
            packet_success = 0.01  # Essentially unusable

        # Calculate spectral metrics
        fft = np.fft.fftshift(np.fft.fft(iq_samples))
        psd = 10 * np.log10(np.abs(fft) ** 2 + 1e-10)

        # Bandwidth occupancy (percentage of spectrum with significant power)
        threshold = np.max(psd) - 20  # 20dB below peak
        bandwidth_occupancy = np.sum(psd > threshold) / len(psd)

        return {
            "timestamp": asyncio.get_event_loop().time(),
            "snr_db": float(snr_db),
            "signal_strength_dbm": float(signal_strength_dbm),
            "ber": float(ber),
            "packet_success_rate": float(packet_success),
            "bandwidth_occupancy": float(bandwidth_occupancy),
            "jamming_enabled": jamming_enabled,
            "jamming_power": jamming_power,
            "jamming_type": state.get("jamming_type", "none")
        }

    def stop(self):
        """Stop the analyzer"""
        self.running = False
