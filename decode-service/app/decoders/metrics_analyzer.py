"""
Signal Metrics Analyzer
Analyzes IQ samples and provides real-time quality metrics
"""
import asyncio
import numpy as np
from fastapi import WebSocket
import logging
import os
from utils.iq_processor import calculate_snr, calculate_signal_strength
from utils.rtl_tcp_client import RTLTCPClient

logger = logging.getLogger(__name__)

class MetricsAnalyzer:
    """Analyzes signal quality metrics from RTL-TCP stream"""

    def __init__(self, rtl_tcp_host=None, rtl_tcp_port=1234):
        # Get RTL-TCP host from environment or parameter
        # Default naming: sdr-service-{scenario_name}
        self.rtl_tcp_host = rtl_tcp_host or os.getenv('RTL_TCP_HOST', 'sdr-service')
        self.rtl_tcp_port = int(os.getenv('RTL_TCP_PORT', str(rtl_tcp_port)))
        self.rtl_tcp_client = None
        self.running = False
        self.spectrogram_history = []  # Store recent FFT rows for spectrogram
        self.max_spectrogram_rows = 50  # Keep last 50 rows for faster updates
        self.sample_rate = 1024000  # Default sample rate
        self.chunk_counter = 0  # Track chunks for throttling
        self.plot_update_interval = 5  # Send plots every N chunks (reduce traffic)

    async def analyze_stream(self, websocket: WebSocket, state: dict):
        """
        Main analysis loop - connects to RTL-TCP and analyzes real-time IQ stream

        Args:
            websocket: WebSocket connection to send data
            state: Current system state (iq_file, jamming, etc.)
        """
        self.running = True
        logger.info("Starting metrics analysis from RTL-TCP stream")

        try:
            # Connect to RTL-TCP server
            self.rtl_tcp_client = RTLTCPClient(
                host=self.rtl_tcp_host,
                port=self.rtl_tcp_port,
                chunk_size=8192  # Balanced chunk size
            )

            connected = await self.rtl_tcp_client.connect()
            if not connected:
                await websocket.send_json({
                    "type": "error",
                    "message": "Failed to connect to RTL-TCP server. Ensure SDR service is running."
                })
                return

            await websocket.send_json({
                "type": "status",
                "message": "Connected to RTL-TCP - analyzing live signal"
            })

            # Send initial file info (from state if available)
            iq_file = state.get("iq_file", "Live RTL-TCP Stream")
            if iq_file and not iq_file.startswith("/"):
                iq_file = os.path.basename(iq_file)

            await websocket.send_json({
                "type": "file_info",
                "data": {
                    "filename": iq_file if iq_file else "RTL-TCP Stream",
                    "duration_seconds": 0,  # Continuous stream
                    "sample_rate": self.sample_rate,
                    "total_samples": 0  # Unknown for stream
                }
            })

            # Main analysis loop - read from RTL-TCP stream
            while self.running:
                # Check if playback is active
                if not state.get("playing"):
                    await websocket.send_json({
                        "type": "status",
                        "message": "Paused - waiting for playback..."
                    })
                    await asyncio.sleep(0.5)
                    continue

                # Get chunk from RTL-TCP stream (this is REAL signal with REAL jamming!)
                chunk = await self.rtl_tcp_client.get_chunk()
                if chunk is None or len(chunk) == 0:
                    logger.warning("No data from RTL-TCP, reconnecting...")
                    await asyncio.sleep(1)
                    # Try to reconnect
                    connected = await self.rtl_tcp_client.connect()
                    if not connected:
                        await websocket.send_json({
                            "type": "error",
                            "message": "Lost connection to RTL-TCP server"
                        })
                        break
                    continue

                # Calculate metrics (using REAL jammed signal!)
                metrics = await self._analyze_chunk(chunk, state)

                # Send metrics to dashboard (every chunk for responsive UI)
                await websocket.send_json({
                    "type": "metrics",
                    "data": metrics
                })

                # Only compute and send plots every N chunks to reduce CPU + bandwidth
                self.chunk_counter += 1
                if self.chunk_counter >= self.plot_update_interval:
                    self.chunk_counter = 0
                    # Calculate and send IQ plot data (only when needed)
                    plot_data = await self._compute_plot_data(chunk)
                    await websocket.send_json({
                        "type": "iq_plots",
                        "data": plot_data
                    })

                # Yield control to event loop (don't hog CPU)
                await asyncio.sleep(0)

        except Exception as e:
            logger.error(f"Error in metrics analysis: {e}")
            await websocket.send_json({
                "type": "error",
                "message": str(e)
            })
        finally:
            if self.rtl_tcp_client:
                self.rtl_tcp_client.close()
                logger.info("Closed RTL-TCP connection")

    async def _analyze_chunk(self, iq_samples: np.ndarray, state: dict) -> dict:
        """
        Analyze a chunk of IQ samples and extract metrics

        Args:
            iq_samples: Complex IQ samples (already includes real jamming if active!)
            state: Current system state

        Returns:
            Dictionary of metrics
        """
        # Calculate SNR from REAL signal (jamming already mixed in!)
        snr_db = calculate_snr(iq_samples, sample_rate=self.sample_rate)

        # Calculate signal strength from REAL signal
        signal_strength_dbm = calculate_signal_strength(iq_samples)

        # Debug logging
        logger.debug(f"SNR: {snr_db:.2f} dB, Signal Strength: {signal_strength_dbm:.2f} dBm")

        # Get jamming status (for display purposes only - not for simulation)
        jamming_enabled = state.get("jamming_enabled", False)
        jamming_power = state.get("jamming_power", 0.0)

        # Calculate BER based on REAL SNR (already degraded by real jamming if active)
        # Use realistic relationship for digital communications: BER degrades exponentially with SNR
        # These thresholds are realistic for QPSK/BPSK without FEC
        if snr_db > 15:
            ber = 0.00001  # Excellent - 0.001%
        elif snr_db > 12:
            ber = 0.0001   # Very good - 0.01%
        elif snr_db > 10:
            ber = 0.001    # Good - 0.1%
        elif snr_db > 8:
            ber = 0.01     # Marginal - 1%
        elif snr_db > 6:
            ber = 0.05     # Poor - 5%
        elif snr_db > 4:
            ber = 0.15     # Very poor - 15%
        elif snr_db > 2:
            ber = 0.30     # Failing - 30%
        elif snr_db > 0:
            ber = 0.40     # Nearly dead - 40%
        else:
            ber = 0.50     # Dead - 50% (random guessing)

        # Calculate packet success rate using REAL probability math
        # For a packet of N bits, probability all bits are correct: P = (1 - BER)^N
        packet_bits = 1000

        # Clamp BER to prevent math errors
        ber_clamped = min(0.5, max(0.0, ber))

        # Real probability formula: probability that all 1000 bits arrive without error
        # P(success) = (1 - BER)^1000
        packet_success = (1.0 - ber_clamped) ** packet_bits

        # Examples of real math:
        # BER = 0.0001 (0.01%): (0.9999)^1000 = 0.905 (90.5% success)
        # BER = 0.001 (0.1%):   (0.999)^1000  = 0.368 (36.8% success)
        # BER = 0.01 (1%):      (0.99)^1000   = 0.00004 (0.004% success - basically dead!)
        # BER = 0.05 (5%):      (0.95)^1000   ≈ 0 (complete failure)
        # BER = 0.30 (30%):     (0.70)^1000   ≈ 0 (impossible to communicate)

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

    async def _compute_plot_data(self, iq_samples: np.ndarray) -> dict:
        """
        Compute IQ visualization plot data

        Args:
            iq_samples: Complex IQ samples

        Returns:
            Dictionary containing plot data for constellation, time-domain, PSD, and spectrogram
        """
        # 1. Constellation Diagram - downsample to ~500 points for efficiency
        downsample_factor = max(1, len(iq_samples) // 500)
        constellation_samples = iq_samples[::downsample_factor]
        constellation_data = {
            "i": constellation_samples.real.tolist(),
            "q": constellation_samples.imag.tolist()
        }

        # 2. Time-Domain Plot - show last 1024 samples
        time_samples = iq_samples[-1024:]
        time_indices = np.arange(len(time_samples))
        time_domain_data = {
            "time": time_indices.tolist(),
            "i": time_samples.real.tolist(),
            "q": time_samples.imag.tolist()
        }

        # 3. Power Spectral Density (PSD) - 1024-bin FFT
        fft_size = min(1024, len(iq_samples))
        fft_samples = iq_samples[:fft_size]
        fft = np.fft.fftshift(np.fft.fft(fft_samples))
        psd = 10 * np.log10(np.abs(fft) ** 2 + 1e-10)

        # Frequency axis (normalized)
        freqs = np.fft.fftshift(np.fft.fftfreq(fft_size))

        psd_data = {
            "frequency": freqs.tolist(),
            "power": psd.tolist()
        }

        # 4. Spectrogram - compute FFT row and add to history
        spec_fft_size = 512
        spec_samples = iq_samples[:spec_fft_size] if len(iq_samples) >= spec_fft_size else iq_samples
        spec_fft = np.fft.fftshift(np.fft.fft(spec_samples, n=spec_fft_size))
        spec_row = 10 * np.log10(np.abs(spec_fft) ** 2 + 1e-10)

        # Add to history and maintain max size
        self.spectrogram_history.append(spec_row.tolist())
        if len(self.spectrogram_history) > self.max_spectrogram_rows:
            self.spectrogram_history.pop(0)

        spectrogram_data = {
            "data": self.spectrogram_history,  # 2D array: [time_index][frequency_bin]
            "frequency_bins": spec_fft_size,
            "time_rows": len(self.spectrogram_history)
        }

        return {
            "constellation": constellation_data,
            "time_domain": time_domain_data,
            "psd": psd_data,
            "spectrogram": spectrogram_data
        }

    def stop(self):
        """Stop the analyzer"""
        self.running = False
        self.spectrogram_history = []  # Clear history
