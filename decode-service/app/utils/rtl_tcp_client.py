"""
RTL-TCP Client
Connects to RTL-TCP server to receive real-time IQ samples (with jamming)
"""
import asyncio
import numpy as np
import struct
import logging

logger = logging.getLogger(__name__)

class RTLTCPClient:
    """RTL-TCP client for receiving IQ samples from SDR service"""

    def __init__(self, host='sdr-service', port=1234, chunk_size=16384):
        """
        Initialize RTL-TCP client

        Args:
            host: RTL-TCP server hostname
            port: RTL-TCP server port
            chunk_size: Number of IQ samples to read per chunk
        """
        self.host = host
        self.port = port
        self.chunk_size = chunk_size
        self.reader = None
        self.writer = None
        self.connected = False
        self.sample_rate = 1024000  # Default, will be updated if server sends commands
        self.center_freq = 100e6     # Default

    async def connect(self):
        """Connect to RTL-TCP server"""
        try:
            logger.info(f"Connecting to RTL-TCP server at {self.host}:{self.port}")
            self.reader, self.writer = await asyncio.open_connection(self.host, self.port)

            # Read 12-byte dongle info header
            header = await self.reader.read(12)
            if len(header) != 12:
                raise ConnectionError("Failed to receive RTL-TCP header")

            # Parse header (magic, tuner type, gain stages)
            magic = header[0:4]
            tuner_type, gain_stages = struct.unpack('>II', header[4:12])

            logger.info(f"RTL-TCP connected: magic={magic}, tuner={tuner_type}, gain_stages={gain_stages}")
            self.connected = True
            return True

        except Exception as e:
            logger.error(f"Failed to connect to RTL-TCP server: {e}")
            self.connected = False
            return False

    async def get_chunk(self) -> np.ndarray:
        """
        Read a chunk of IQ samples from RTL-TCP stream

        Returns:
            Complex numpy array of IQ samples, or None if error
        """
        if not self.connected or not self.reader:
            return None

        try:
            # Each IQ sample is 2 bytes (I and Q as uint8)
            num_bytes = self.chunk_size * 2
            data = await self.reader.readexactly(num_bytes)

            if len(data) != num_bytes:
                logger.warning(f"Incomplete read: got {len(data)} bytes, expected {num_bytes}")
                return None

            # Convert uint8 IQ bytes back to complex64
            # RTL-TCP format: interleaved I/Q pairs, uint8 (0-255, centered at 127.5)
            iq_uint8 = np.frombuffer(data, dtype=np.uint8)

            # Deinterleave I and Q
            i = iq_uint8[0::2]
            q = iq_uint8[1::2]

            # Convert uint8 (0-255) back to float (-1.0 to +1.0)
            # Reverse of: uint8 = (float * 127.5) + 127.5
            i_float = (i.astype(np.float32) - 127.5) / 127.5
            q_float = (q.astype(np.float32) - 127.5) / 127.5

            # Create complex samples
            iq_samples = i_float + 1j * q_float

            return iq_samples.astype(np.complex64)

        except asyncio.IncompleteReadError:
            logger.warning("RTL-TCP connection closed by server")
            self.connected = False
            return None
        except Exception as e:
            logger.error(f"Error reading from RTL-TCP: {e}")
            self.connected = False
            return None

    async def send_command(self, cmd, param):
        """
        Send RTL-TCP command to server

        Args:
            cmd: Command byte (0x01-0x05)
            param: 32-bit parameter value
        """
        if not self.connected or not self.writer:
            return

        try:
            # RTL-TCP commands are 5 bytes: 1 byte cmd + 4 bytes param (big endian)
            command_bytes = struct.pack('>BI', cmd, param)
            self.writer.write(command_bytes)
            await self.writer.drain()
            logger.debug(f"Sent RTL-TCP command: {cmd:#04x} param={param}")
        except Exception as e:
            logger.error(f"Error sending RTL-TCP command: {e}")
            self.connected = False

    async def set_frequency(self, freq_hz):
        """Set center frequency (command 0x01)"""
        self.center_freq = freq_hz
        await self.send_command(0x01, int(freq_hz))

    async def set_sample_rate(self, sample_rate):
        """Set sample rate (command 0x02)"""
        self.sample_rate = sample_rate
        await self.send_command(0x02, int(sample_rate))

    def close(self):
        """Close connection"""
        if self.writer:
            try:
                self.writer.close()
                logger.info("RTL-TCP connection closed")
            except:
                pass
        self.connected = False
        self.reader = None
        self.writer = None

    async def __aenter__(self):
        """Async context manager entry"""
        await self.connect()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit"""
        self.close()
