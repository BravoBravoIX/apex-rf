import asyncio
import os
from iq_player import IQPlayer
from signal_mixer import SignalMixer
from rtl_tcp import RTLTCPServer
from mqtt_handler import MQTTHandler

async def stream_loop(iq_player, signal_mixer, rtl_tcp):
    """Main streaming loop"""
    while True:
        # Get chunk from player
        chunk = await iq_player.get_chunk()

        if chunk is not None:
            # Mix in jamming if active
            mixed_chunk = signal_mixer.mix_signals(chunk)

            # Broadcast to GQRX clients
            await rtl_tcp.broadcast_samples(mixed_chunk)

async def main():
    # Configuration from environment
    IQ_FILE = os.getenv('IQ_FILE_PATH', '/iq_files/demo.iq')
    SAMPLE_RATE = int(os.getenv('SAMPLE_RATE', '1024000'))

    print("=" * 60)
    print("SDR/GQRX Streaming Service with RF Jamming")
    print("=" * 60)
    print(f"IQ File: {IQ_FILE}")
    print(f"Sample Rate: {SAMPLE_RATE} Hz")
    print(f"RTL-TCP Port: 1234")
    print(f"MQTT Control: apex/team/sdr-rf/control")
    print(f"MQTT Status: apex/team/sdr-rf/status")

    # Initialize components with proper linking
    iq_player = IQPlayer(IQ_FILE, SAMPLE_RATE)
    signal_mixer = SignalMixer(sample_rate=SAMPLE_RATE)
    rtl_tcp = RTLTCPServer(signal_mixer=signal_mixer)
    mqtt = MQTTHandler(iq_player, signal_mixer, rtl_tcp)

    # Start MQTT
    mqtt.start()

    # Don't auto-start playback - wait for user to press play
    # iq_player.play()

    print("✅ Service ready - waiting for playback command")
    print("=" * 60)
    print("\n📋 Available Commands (publish to apex/team/sdr-rf/control):")
    print("  Playback: play, pause, stop")
    print("  Jamming: enable_jamming, disable_jamming")
    print("  Jamming Config: set_jam_type, set_jam_power, set_jam_frequency")
    print("  Types: barrage, spot, sweep, pulse, chirp, fhss")
    print("=" * 60)

    # Run server and streaming loop
    try:
        await asyncio.gather(
            rtl_tcp.start(),
            stream_loop(iq_player, signal_mixer, rtl_tcp)
        )
    except KeyboardInterrupt:
        print("\n🛑 Shutting down...")
        mqtt.stop()

if __name__ == "__main__":
    asyncio.run(main())
