"""
Clock Recovery and Bit Synchronization
Gardner timing error detector for symbol synchronization
"""
import numpy as np

class GardnerClockRecovery:
    """
    Gardner clock recovery for bit synchronization
    """
    def __init__(self, samples_per_symbol: float, loop_bandwidth: float = 0.01):
        """
        Initialize clock recovery

        Args:
            samples_per_symbol: Samples per bit/symbol
            loop_bandwidth: Loop filter bandwidth (0.001 - 0.1)
        """
        self.sps = samples_per_symbol
        self.mu = 0.0  # Fractional sample position
        self.omega = samples_per_symbol  # Current samples per symbol estimate
        self.omega_mid = samples_per_symbol
        self.omega_lim = 0.5  # Max deviation
        self.gain_omega = loop_bandwidth ** 2 / 4.0  # Loop gain
        self.gain_mu = loop_bandwidth

    def process(self, samples: np.ndarray) -> tuple:
        """
        Process samples and extract bits with timing recovery

        Args:
            samples: Input signal samples

        Returns:
            Tuple of (bits, error_rate)
        """
        bits = []
        i = 0
        last_sample = 0.0
        mid_sample = 0.0

        while i < len(samples) - int(self.omega):
            # Get current sample (decision point)
            curr_idx = int(i + self.mu)
            if curr_idx >= len(samples):
                break

            curr_sample = samples[curr_idx]

            # Get mid-point sample (half a symbol earlier)
            mid_idx = int(i + self.mu - self.omega / 2)
            if mid_idx >= 0 and mid_idx < len(samples):
                mid_sample = samples[mid_idx]

            # Gardner timing error detector
            # error = (current - previous) * midpoint
            timing_error = (curr_sample - last_sample) * mid_sample

            # Update mu (fractional interval)
            self.mu += self.gain_mu * timing_error

            # Update omega (samples per symbol estimate)
            self.omega += self.gain_omega * timing_error

            # Clamp omega
            self.omega = np.clip(
                self.omega,
                self.omega_mid - self.omega_lim,
                self.omega_mid + self.omega_lim
            )

            # Make bit decision
            bit = 1 if curr_sample > 0 else 0
            bits.append(bit)

            # Advance to next symbol
            i += int(self.omega)
            self.mu -= int(self.omega)
            if self.mu < 0:
                self.mu += self.omega
                i -= 1

            last_sample = curr_sample

        return bits


def nrzi_decode(bits: list) -> list:
    """
    Decode NRZI (Non-Return-to-Zero Inverted) encoding
    Used in AIS - transition = 0, no transition = 1

    Args:
        bits: NRZI encoded bits

    Returns:
        Decoded bits
    """
    decoded = []
    last_bit = 0

    for bit in bits:
        if bit == last_bit:
            decoded.append(1)  # No transition = 1
        else:
            decoded.append(0)  # Transition = 0
        last_bit = bit

    return decoded


def remove_bit_stuffing(bits: list) -> list:
    """
    Remove HDLC bit stuffing (used in AIS)
    After 5 consecutive 1s, a 0 is stuffed - remove these

    Args:
        bits: Bits with stuffing

    Returns:
        Bits without stuffing
    """
    unstuffed = []
    ones_count = 0

    i = 0
    while i < len(bits):
        bit = bits[i]

        if ones_count == 5 and bit == 0:
            # This is a stuffed bit, skip it
            ones_count = 0
            i += 1
            continue

        unstuffed.append(bit)

        if bit == 1:
            ones_count += 1
        else:
            ones_count = 0

        i += 1

    return unstuffed


def calculate_crc(bits: list) -> int:
    """
    Calculate CRC-16-CCITT for AIS messages

    Args:
        bits: Data bits

    Returns:
        CRC value
    """
    polynomial = 0x1021  # CRC-16-CCITT
    crc = 0xFFFF

    for bit in bits:
        crc ^= (bit << 15)
        if crc & 0x8000:
            crc = (crc << 1) ^ polynomial
        else:
            crc = crc << 1
        crc &= 0xFFFF

    return crc


def verify_ais_crc(bits: list) -> bool:
    """
    Verify AIS message CRC

    Args:
        bits: Complete AIS message with CRC

    Returns:
        True if CRC is valid
    """
    if len(bits) < 16:
        return False

    # Separate data and CRC
    data_bits = bits[:-16]
    crc_bits = bits[-16:]

    # Convert CRC bits to value
    received_crc = 0
    for bit in crc_bits:
        received_crc = (received_crc << 1) | bit

    # Calculate expected CRC
    calculated_crc = calculate_crc(data_bits)

    return received_crc == calculated_crc
