import asyncio
import struct
import numpy as np

class RTLTCPServer:
    def __init__(self, host='0.0.0.0', port=1234, signal_mixer=None):
        self.host = host
        self.port = port
        self.clients = []
        self.signal_mixer = signal_mixer
        self.client_readers = {}  # Track readers for command handling

    def create_dongle_info(self):
        """RTL-TCP handshake: 12-byte header"""
        # Magic: "RTL0", Tuner: R820T (1), Gain stages: 29
        return struct.pack('>4sII', b'RTL0', 1, 29)

    async def handle_client_commands(self, reader, writer):
        """Handle RTL-TCP commands from GQRX"""
        try:
            while True:
                # RTL-TCP commands are 5 bytes: 1 byte cmd + 4 bytes param
                data = await reader.read(5)
                if not data or len(data) != 5:
                    break

                cmd = data[0]
                param = struct.unpack('>I', data[1:5])[0]

                # Command 0x01: Set frequency
                if cmd == 0x01:
                    freq_hz = param
                    print(f"📻 GQRX tuned to: {freq_hz/1e6:.3f} MHz")
                    if self.signal_mixer:
                        self.signal_mixer.set_frequency(freq_hz)

                # Command 0x02: Set sample rate
                elif cmd == 0x02:
                    sample_rate = param
                    print(f"⚙️  Sample rate set to: {sample_rate/1e6:.3f} MHz")
                    if self.signal_mixer:
                        self.signal_mixer.set_sample_rate(sample_rate)

                # Command 0x03: Set gain mode
                elif cmd == 0x03:
                    pass  # Not applicable for IQ playback

                # Command 0x04: Set gain
                elif cmd == 0x04:
                    gain_db = param / 10.0
                    print(f"📊 Gain set to: {gain_db} dB")

                # Command 0x05: Set frequency correction
                elif cmd == 0x05:
                    ppm = param
                    print(f"🔧 Frequency correction: {ppm} ppm")

        except asyncio.CancelledError:
            pass
        except Exception as e:
            print(f"⚠️  Command handler error: {e}")

    async def handle_client(self, reader, writer):
        """Handle GQRX client connection"""
        addr = writer.get_extra_info('peername')
        print(f"✅ GQRX connected: {addr}")

        # Send dongle info
        writer.write(self.create_dongle_info())
        await writer.drain()

        self.clients.append(writer)
        self.client_readers[writer] = reader

        # Start command handler for this client
        command_task = asyncio.create_task(self.handle_client_commands(reader, writer))

        try:
            # Wait for command task to complete (client disconnect)
            await command_task
        except:
            pass
        finally:
            if writer in self.clients:
                self.clients.remove(writer)
            if writer in self.client_readers:
                del self.client_readers[writer]
            writer.close()
            print(f"❌ GQRX disconnected: {addr}")

    async def broadcast_samples(self, iq_chunk):
        """Send IQ samples to all connected clients (non-blocking)"""
        if not self.clients or iq_chunk is None:
            return

        # Clip to prevent saturation/wrapping (important when jamming is mixed in)
        iq_chunk = np.clip(iq_chunk.real, -1.0, 1.0) + 1j * np.clip(iq_chunk.imag, -1.0, 1.0)

        # Convert complex64 to uint8 I/Q pairs (RTL-TCP format)
        i = ((iq_chunk.real * 127.5) + 127.5).astype(np.uint8)
        q = ((iq_chunk.imag * 127.5) + 127.5).astype(np.uint8)

        # Interleave
        iq_bytes = np.empty(len(iq_chunk) * 2, dtype=np.uint8)
        iq_bytes[0::2] = i
        iq_bytes[1::2] = q

        # Broadcast to all clients WITHOUT blocking
        # Just write to buffers, let OS TCP handle backpressure
        bytes_data = iq_bytes.tobytes()

        for client in self.clients[:]:
            try:
                # Write to buffer without waiting for drain
                # This prevents slow clients from blocking fast clients (like GQRX)
                client.write(bytes_data)
            except Exception as e:
                print(f"⚠️  Client write error: {e}")
                if client in self.clients:
                    self.clients.remove(client)

    async def start(self):
        """Start RTL-TCP server"""
        server = await asyncio.start_server(
            self.handle_client, self.host, self.port
        )

        print(f"📡 RTL-TCP server listening on {self.host}:{self.port}")
        print(f"🎯 Connect GQRX to: {self.host}:{self.port}")

        async with server:
            await server.serve_forever()
