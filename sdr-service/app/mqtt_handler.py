import paho.mqtt.client as mqtt
import json
import time
import threading

class MQTTHandler:
    def __init__(self, iq_player, signal_mixer, rtl_tcp=None):
        self.iq_player = iq_player
        self.signal_mixer = signal_mixer
        self.rtl_tcp = rtl_tcp
        self.client = mqtt.Client()
        self.status_thread = None
        self.running = False

    def on_connect(self, client, userdata, flags, rc):
        print(f"📨 Connected to MQTT broker")
        # Subscribe to control commands
        client.subscribe("apex/team/sdr-rf/injects")
        client.subscribe("apex/team/sdr-rf/control")

    def on_message(self, client, userdata, msg):
        """Handle inject and control commands"""
        try:
            data = json.loads(msg.payload.decode())

            # Handle legacy inject format
            if data.get("type") == "trigger":
                command = data["content"]["command"]
                params = data["content"].get("parameters", {})
                self._handle_command(command, params)

            # Handle direct control format
            elif "command" in data:
                command = data["command"]
                params = data.get("parameters", {})
                self._handle_command(command, params)

        except Exception as e:
            print(f"❌ Error handling message: {e}")

    def _handle_command(self, command, params):
        """Process control commands"""

        # Playback controls
        if command == "play":
            self.iq_player.play()
            self.publish_status()

        elif command == "pause":
            self.iq_player.pause()
            self.publish_status()

        elif command == "stop":
            self.iq_player.stop()
            self.publish_status()

        # New jamming controls
        elif command == "enable_jamming":
            self.signal_mixer.enable_jamming()
            self.publish_status()

        elif command == "disable_jamming":
            self.signal_mixer.disable_jamming()
            self.publish_status()

        elif command == "set_jam_type":
            jam_type = params.get("type", "barrage")
            self.signal_mixer.set_jamming_type(jam_type)
            # If switching to non-barrage type, ensure jamming freq is set to center freq
            if jam_type != "barrage" and self.signal_mixer.jamming_frequency == 100e6:
                self.signal_mixer.set_jamming_frequency(self.signal_mixer.current_freq)
            self.publish_status()

        elif command == "set_jam_power":
            power = params.get("power", 0.1)  # Linear 0.0 to 1.0
            self.signal_mixer.set_jamming_power(power)
            self.publish_status()

        elif command == "set_jam_frequency":
            frequency = params.get("frequency", 100e6)  # Hz
            self.signal_mixer.set_jamming_frequency(frequency)
            self.publish_status()

        # Legacy jamming commands (for backwards compatibility)
        elif command == "jamming_cw":
            self.signal_mixer.set_jamming_type("spot")
            self.signal_mixer.enable_jamming()
            self.publish_status()

        elif command == "jamming_noise":
            self.signal_mixer.set_jamming_type("barrage")
            self.signal_mixer.enable_jamming()
            self.publish_status()

        elif command == "jamming_sweep":
            self.signal_mixer.set_jamming_type("sweep")
            self.signal_mixer.enable_jamming()
            self.publish_status()

        elif command == "jamming_pulse":
            self.signal_mixer.set_jamming_type("pulse")
            self.signal_mixer.enable_jamming()
            self.publish_status()

        elif command == "jamming_chirp":
            self.signal_mixer.set_jamming_type("chirp")
            self.signal_mixer.enable_jamming()
            self.publish_status()

        elif command == "jamming_clear":
            self.signal_mixer.disable_jamming()
            self.publish_status()

        # IQ file switching
        elif command == "switch_iq":
            file_path = params.get("file")
            if file_path:
                self.iq_player.switch_file(file_path)
                self.publish_status()
            else:
                print("❌ No file path provided for switch_iq")

    def publish_status(self):
        """Publish current status to MQTT"""
        try:
            status = {
                "timestamp": time.time(),
                "playback": {
                    "running": self.iq_player.running,
                    "paused": self.iq_player.paused,
                    "file": self.iq_player.file_path
                },
                "jamming": self.signal_mixer.get_status(),
                "gqrx_connected": len(self.rtl_tcp.clients) > 0 if self.rtl_tcp else False
            }

            self.client.publish(
                "apex/team/sdr-rf/status",
                json.dumps(status),
                retain=True
            )

        except Exception as e:
            print(f"❌ Error publishing status: {e}")

    def _status_loop(self):
        """Periodic status publishing"""
        while self.running:
            self.publish_status()
            time.sleep(2)  # Publish every 2 seconds

    def start(self, mqtt_host='mqtt', mqtt_port=1883):
        """Start MQTT client"""
        self.client.on_connect = self.on_connect
        self.client.on_message = self.on_message
        self.client.connect(mqtt_host, mqtt_port)
        self.client.loop_start()

        # Start status publishing thread
        self.running = True
        self.status_thread = threading.Thread(target=self._status_loop, daemon=True)
        self.status_thread.start()

    def stop(self):
        """Stop MQTT client"""
        self.running = False
        if self.status_thread:
            self.status_thread.join()
        self.client.loop_stop()
        self.client.disconnect()
