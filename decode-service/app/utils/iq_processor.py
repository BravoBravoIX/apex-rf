"""
IQ File Processing Utilities
Reads and processes complex IQ samples from files
"""
import numpy as np
import os
import asyncio
from typing import Generator
import logging

logger = logging.getLogger(__name__)

class IQFileReader:
    """Reads IQ files and provides streaming access to samples"""

    def __init__(self, file_path: str, sample_rate: int = 1024000, chunk_size: int = 16384):
        self.file_path = file_path
        self.sample_rate = sample_rate
        self.chunk_size = chunk_size
        self.position = 0
        self.samples = None
        self.total_samples = 0

    def load_file(self):
        """Load IQ file into memory"""
        if not os.path.exists(self.file_path):
            logger.error(f"IQ file not found: {self.file_path}")
            return False

        try:
            logger.info(f"Loading IQ file: {self.file_path}")
            self.samples = np.fromfile(self.file_path, dtype=np.complex64)
            self.total_samples = len(self.samples)
            logger.info(f"Loaded {self.total_samples:,} samples ({self.total_samples/self.sample_rate:.1f} seconds)")
            return True
        except Exception as e:
            logger.error(f"Error loading IQ file: {e}")
            return False

    def get_chunk(self) -> np.ndarray:
        """Get next chunk of IQ samples"""
        if self.samples is None:
            return None

        end_pos = min(self.position + self.chunk_size, self.total_samples)
        chunk = self.samples[self.position:end_pos]

        # Loop back to start when we reach the end
        if end_pos >= self.total_samples:
            self.position = 0
        else:
            self.position = end_pos

        return chunk

    async def stream_chunks(self, delay_per_chunk: float = None):
        """
        Async generator that yields chunks of IQ samples

        Args:
            delay_per_chunk: If provided, adds delay to simulate real-time streaming
        """
        if not self.load_file():
            return

        if delay_per_chunk is None:
            # Calculate real-time delay based on chunk size and sample rate
            delay_per_chunk = self.chunk_size / self.sample_rate

        while True:
            chunk = self.get_chunk()
            if chunk is None or len(chunk) == 0:
                break

            yield chunk

            if delay_per_chunk > 0:
                await asyncio.sleep(delay_per_chunk)

    def reset(self):
        """Reset read position to start"""
        self.position = 0

    def get_duration_seconds(self) -> float:
        """Get total duration of IQ file in seconds"""
        if self.total_samples == 0:
            return 0.0
        return self.total_samples / self.sample_rate


def calculate_snr(iq_samples: np.ndarray, signal_bandwidth_hz: float = None, sample_rate: int = 1024000) -> float:
    """
    Calculate Signal-to-Noise Ratio from IQ samples

    Args:
        iq_samples: Complex IQ samples
        signal_bandwidth_hz: Expected signal bandwidth (optional)
        sample_rate: Sample rate in Hz

    Returns:
        SNR in dB
    """
    # Calculate power spectral density
    fft = np.fft.fft(iq_samples)
    psd = np.abs(fft) ** 2

    if signal_bandwidth_hz:
        # Estimate signal power in expected bandwidth
        num_bins = int(len(iq_samples) * signal_bandwidth_hz / sample_rate)
        center = len(psd) // 2
        signal_bins = psd[center - num_bins//2:center + num_bins//2]
        signal_power = np.mean(signal_bins)

        # Noise power from edges of spectrum
        noise_bins = np.concatenate([psd[:num_bins], psd[-num_bins:]])
        noise_power = np.mean(noise_bins)
    else:
        # Simple signal/noise estimate
        signal_power = np.max(psd)
        noise_power = np.median(psd)

    if noise_power == 0:
        return float('inf')

    snr_linear = signal_power / noise_power
    snr_db = 10 * np.log10(snr_linear)

    return snr_db


def calculate_signal_strength(iq_samples: np.ndarray) -> float:
    """
    Calculate signal strength (power) from IQ samples

    Returns:
        Signal strength in dBm (relative)
    """
    # Calculate RMS power
    power_linear = np.mean(np.abs(iq_samples) ** 2)

    # Convert to dBm (relative to 1mW, arbitrary reference)
    if power_linear == 0:
        return -100.0

    power_dbm = 10 * np.log10(power_linear) + 30  # +30 to get mW reference

    return power_dbm
