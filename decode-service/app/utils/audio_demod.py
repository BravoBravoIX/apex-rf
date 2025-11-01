"""
Audio Demodulation Utilities
Convert IQ samples to audio for various modulation types
"""
import numpy as np
from scipy import signal
import logging

logger = logging.getLogger(__name__)

class AudioDemodulator:
    """Demodulates IQ samples to audio"""

    def __init__(self, sample_rate: int = 1024000):
        self.sample_rate = sample_rate

    def fm_demod(self, iq_samples: np.ndarray, audio_rate: int = 48000) -> np.ndarray:
        """
        FM demodulation

        Args:
            iq_samples: Complex IQ samples
            audio_rate: Target audio sample rate

        Returns:
            Audio samples (float32, mono)
        """
        # FM demod: derivative of phase
        phase = np.unwrap(np.angle(iq_samples))
        audio = np.diff(phase)

        # Normalize
        audio = audio / np.pi

        # Decimate to audio rate
        decimation_factor = self.sample_rate // audio_rate
        if decimation_factor > 1:
            audio = signal.decimate(audio, decimation_factor, ftype='fir')

        # Normalize to [-1, 1]
        max_val = np.max(np.abs(audio))
        if max_val > 0:
            audio = audio / max_val

        return audio.astype(np.float32)

    def am_demod(self, iq_samples: np.ndarray, audio_rate: int = 48000) -> np.ndarray:
        """
        AM demodulation (envelope detection)

        Args:
            iq_samples: Complex IQ samples
            audio_rate: Target audio sample rate

        Returns:
            Audio samples (float32, mono)
        """
        # Envelope detection: magnitude of complex signal
        audio = np.abs(iq_samples)

        # Remove DC component
        audio = audio - np.mean(audio)

        # Decimate to audio rate
        decimation_factor = self.sample_rate // audio_rate
        if decimation_factor > 1:
            audio = signal.decimate(audio, decimation_factor, ftype='fir')

        # Normalize to [-1, 1]
        max_val = np.max(np.abs(audio))
        if max_val > 0:
            audio = audio / max_val

        return audio.astype(np.float32)

    def ssb_demod(self, iq_samples: np.ndarray, mode: str = 'usb', audio_rate: int = 48000) -> np.ndarray:
        """
        SSB (Single Sideband) demodulation

        Args:
            iq_samples: Complex IQ samples
            mode: 'usb' (upper sideband) or 'lsb' (lower sideband)
            audio_rate: Target audio sample rate

        Returns:
            Audio samples (float32, mono)
        """
        # Proper SSB demodulation using product detector
        # For USB: multiply by e^(-j*0*t) (no shift needed if already centered)
        # For LSB: multiply by e^(j*0*t)

        # Apply Hilbert transform to get analytic signal
        # The IQ samples are already complex (analytic signal)

        # For USB: take real part after shifting to baseband
        # For LSB: take imaginary part
        if mode.lower() == 'usb':
            # USB: real part contains the upper sideband audio
            audio = np.real(iq_samples) + np.imag(iq_samples)
        else:  # lsb
            # LSB: imaginary part contains the lower sideband audio
            audio = np.real(iq_samples) - np.imag(iq_samples)

        # Apply lowpass filter to remove high frequency components
        # SSTV audio is in the 1200-2300 Hz range, so filter at ~3 kHz
        if len(audio) > 100:  # Only filter if we have enough samples
            nyquist = self.sample_rate / 2
            cutoff = min(3000 / nyquist, 0.4)  # 3 kHz or 40% of Nyquist
            try:
                sos = signal.butter(4, cutoff, btype='lowpass', output='sos')
                audio = signal.sosfilt(sos, audio)
            except Exception as e:
                logger.warning(f"Filter error: {e}")

        # Decimate to audio rate
        decimation_factor = self.sample_rate // audio_rate
        if decimation_factor > 1:
            try:
                audio = signal.decimate(audio, decimation_factor, ftype='fir', zero_phase=True)
            except:
                # Fallback: simple resampling
                audio = signal.resample(audio, len(audio) // decimation_factor)

        # Normalize to [-1, 1]
        max_val = np.max(np.abs(audio))
        if max_val > 0:
            audio = audio / max_val

        return audio.astype(np.float32)

    def gmsk_demod(self, iq_samples: np.ndarray, symbol_rate: int = 9600, audio_rate: int = 48000) -> np.ndarray:
        """
        GMSK demodulation (for AIS)
        Simplified implementation - extracts bits from FM demodulated signal

        Args:
            iq_samples: Complex IQ samples
            symbol_rate: Symbol rate (baud)
            audio_rate: Target audio sample rate

        Returns:
            Demodulated bits as audio
        """
        # First do FM demodulation
        audio = self.fm_demod(iq_samples, audio_rate)

        # The GMSK signal will appear as frequency shifts
        # This is a simplified version - full GMSK needs clock recovery
        return audio


def apply_bandpass_filter(iq_samples: np.ndarray,
                         low_freq: float,
                         high_freq: float,
                         sample_rate: int) -> np.ndarray:
    """
    Apply bandpass filter to IQ samples

    Args:
        iq_samples: Complex IQ samples
        low_freq: Low cutoff frequency in Hz
        high_freq: High cutoff frequency in Hz
        sample_rate: Sample rate in Hz

    Returns:
        Filtered IQ samples
    """
    # Design bandpass filter
    nyquist = sample_rate / 2
    low = low_freq / nyquist
    high = high_freq / nyquist

    # Ensure valid range
    low = max(0.01, min(low, 0.99))
    high = max(low + 0.01, min(high, 0.99))

    sos = signal.butter(6, [low, high], btype='bandpass', output='sos')

    # Apply filter to real and imaginary parts separately
    real_filtered = signal.sosfilt(sos, np.real(iq_samples))
    imag_filtered = signal.sosfilt(sos, np.imag(iq_samples))

    return real_filtered + 1j * imag_filtered


def apply_lowpass_filter(audio: np.ndarray, cutoff_freq: float, sample_rate: int) -> np.ndarray:
    """
    Apply lowpass filter to audio

    Args:
        audio: Audio samples
        cutoff_freq: Cutoff frequency in Hz
        sample_rate: Sample rate in Hz

    Returns:
        Filtered audio
    """
    nyquist = sample_rate / 2
    cutoff = cutoff_freq / nyquist

    # Ensure valid range
    cutoff = max(0.01, min(cutoff, 0.99))

    sos = signal.butter(6, cutoff, btype='lowpass', output='sos')
    filtered = signal.sosfilt(sos, audio)

    return filtered
