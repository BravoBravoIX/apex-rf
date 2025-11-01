import numpy as np

class SignalMixer:
    def __init__(self, sample_rate=1024000):
        self.sample_rate = sample_rate
        self.jamming_enabled = False
        self.jamming_type = "barrage"
        self.jamming_power = 0.1  # Linear amplitude (0.0 to 1.0)
        self.jamming_frequency = 100e6  # Target jamming frequency in Hz
        self.current_freq = 100e6  # Current GQRX center frequency
        self.sample_counter = 0  # For phase continuity

    def set_frequency(self, center_freq):
        """Update current center frequency from GQRX"""
        self.current_freq = center_freq
        self.sample_counter = 0  # Reset phase continuity on frequency change

    def set_sample_rate(self, sample_rate):
        """Update sample rate"""
        self.sample_rate = sample_rate
        self.sample_counter = 0

    def set_jamming_frequency(self, frequency):
        """Set target jamming frequency"""
        self.jamming_frequency = frequency
        self.sample_counter = 0
        print(f"🎯 Jamming frequency set to {frequency/1e6:.3f} MHz")

    def enable_jamming(self):
        """Enable jamming"""
        self.jamming_enabled = True
        print(f"🔴 Jamming ENABLED: {self.jamming_type}")

    def disable_jamming(self):
        """Disable jamming"""
        self.jamming_enabled = False
        print("✅ Jamming DISABLED")

    def set_jamming_type(self, jamming_type):
        """Set jamming type"""
        valid_types = ["barrage", "spot", "sweep", "pulse", "chirp", "fhss"]
        if jamming_type in valid_types:
            self.jamming_type = jamming_type
            self.sample_counter = 0
            print(f"⚡ Jamming type set to: {jamming_type}")
        else:
            print(f"❌ Invalid jamming type: {jamming_type}")

    def set_jamming_power(self, power):
        """Set jamming power (0.0 to 1.0 linear)"""
        self.jamming_power = max(0.0, min(1.0, power))
        print(f"📊 Jamming power set to: {self.jamming_power:.2f}")

    def is_in_bandwidth(self):
        """Check if jamming frequency is within current GQRX bandwidth"""
        freq_offset = self.jamming_frequency - self.current_freq
        bandwidth = self.sample_rate / 2
        return abs(freq_offset) < bandwidth

    def get_status(self):
        """Get current jamming status"""
        freq_offset = self.jamming_frequency - self.current_freq
        in_bandwidth = self.is_in_bandwidth()

        return {
            "enabled": self.jamming_enabled,
            "type": self.jamming_type,
            "power": self.jamming_power,
            "jamming_freq_mhz": self.jamming_frequency / 1e6,
            "current_freq_mhz": self.current_freq / 1e6,
            "sample_rate_mhz": self.sample_rate / 1e6,
            "in_bandwidth": in_bandwidth,
            "freq_offset_khz": freq_offset / 1e3 if in_bandwidth else None
        }

    def mix_signals(self, clean_iq):
        """Mix jamming signal into clean IQ samples"""
        if not self.jamming_enabled or len(clean_iq) == 0:
            return clean_iq

        # Generate jamming signal based on type
        jamming_iq = self._generate_jamming(len(clean_iq))

        # Check if any jamming was actually generated
        if np.max(np.abs(jamming_iq)) > 0:
            # Mix with appropriate power level
            mixed = clean_iq + jamming_iq
            return mixed
        else:
            # Jamming is out of bandwidth
            return clean_iq

    def _generate_jamming(self, num_samples):
        """Generate jamming signal based on selected type"""

        if self.jamming_type == "barrage":
            # Wideband noise jamming
            i = np.random.normal(0, self.jamming_power, num_samples)
            q = np.random.normal(0, self.jamming_power, num_samples)
            return i + 1j * q

        elif self.jamming_type == "spot":
            # Narrowband tone at fixed frequency
            freq_offset = self.jamming_frequency - self.current_freq

            # Only inject if jammer is within our bandwidth
            if not self.is_in_bandwidth():
                return np.zeros(num_samples, dtype=np.complex64)

            t = np.arange(num_samples) + self.sample_counter
            freq_normalized = freq_offset / self.sample_rate
            phase = 2 * np.pi * freq_normalized * t
            tone = self.jamming_power * np.exp(1j * phase)
            self.sample_counter += num_samples
            return tone

        elif self.jamming_type == "sweep":
            # Frequency sweep around fixed jamming frequency
            freq_offset = self.jamming_frequency - self.current_freq

            if not self.is_in_bandwidth():
                return np.zeros(num_samples, dtype=np.complex64)

            t = np.arange(num_samples) + self.sample_counter
            sweep_width = 50e3  # 50 kHz sweep width
            sweep_rate = 10  # Hz per second

            # Create sweep centered on jamming frequency
            instantaneous_offset = freq_offset + sweep_width * np.sin(2 * np.pi * sweep_rate * t / self.sample_rate)
            phase = np.cumsum(2 * np.pi * instantaneous_offset / self.sample_rate)
            sweep = self.jamming_power * np.exp(1j * phase)
            self.sample_counter += num_samples
            return sweep

        elif self.jamming_type == "pulse":
            # Pulsed jamming
            freq_offset = self.jamming_frequency - self.current_freq

            if not self.is_in_bandwidth():
                return np.zeros(num_samples, dtype=np.complex64)

            pulse_period = 1000  # samples
            pulse_width = 100    # samples
            jamming = np.zeros(num_samples, dtype=complex)

            for i in range(0, num_samples, pulse_period):
                end_idx = min(i + pulse_width, num_samples)
                t = np.arange(end_idx - i) + self.sample_counter + i
                freq_normalized = freq_offset / self.sample_rate
                phase = 2 * np.pi * freq_normalized * t
                jamming[i:end_idx] = self.jamming_power * np.exp(1j * phase)

            self.sample_counter += num_samples
            return jamming

        elif self.jamming_type == "chirp":
            # Linear frequency modulated chirp
            freq_offset = self.jamming_frequency - self.current_freq

            if not self.is_in_bandwidth():
                return np.zeros(num_samples, dtype=np.complex64)

            t = np.arange(num_samples) + self.sample_counter
            chirp_rate = 100e3  # 100 kHz/s chirp rate
            chirp_width = 50e3  # 50 kHz chirp width

            # Sawtooth frequency sweep
            sweep_time = self.sample_rate / chirp_rate
            phase_acc = (t % sweep_time) / sweep_time
            instantaneous_freq = freq_offset + chirp_width * (phase_acc - 0.5)

            phase = np.cumsum(2 * np.pi * instantaneous_freq / self.sample_rate)
            chirp = self.jamming_power * np.exp(1j * phase)
            self.sample_counter += num_samples
            return chirp

        elif self.jamming_type == "fhss":
            # Frequency hopping spread spectrum
            freq_offset = self.jamming_frequency - self.current_freq

            if not self.is_in_bandwidth():
                return np.zeros(num_samples, dtype=np.complex64)

            # Hop every 10ms
            hop_duration = int(0.01 * self.sample_rate)  # 10ms in samples
            hop_freqs = [-40e3, -20e3, 0, 20e3, 40e3]  # Hop frequencies relative to jam freq

            jamming = np.zeros(num_samples, dtype=complex)
            for i in range(0, num_samples, hop_duration):
                # Select random hop frequency
                hop_offset = np.random.choice(hop_freqs)
                total_offset = freq_offset + hop_offset

                # Generate tone for this hop
                end_idx = min(i + hop_duration, num_samples)
                t = np.arange(end_idx - i)
                tone = self.jamming_power * np.exp(1j * 2 * np.pi * total_offset / self.sample_rate * t)
                jamming[i:end_idx] = tone

            return jamming

        # Default: no jamming
        return np.zeros(num_samples, dtype=np.complex64)
