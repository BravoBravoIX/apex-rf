import asyncio
import json
import os
import time
import paho.mqtt.client as mqtt
import docker
from redis_manager import RedisManager


class ExerciseExecutor:
    """
    Manages exercise execution with timer, state management, and inject delivery.
    """

    def __init__(self, scenario_name: str):
        """
        Initialize the exercise executor.

        Args:
            scenario_name: Name of the scenario to execute
        """
        self.scenario_name = scenario_name
        self.scenario_data = None
        self.timelines = {}
        self.is_running = False

        # State management
        self.state = "NOT_STARTED"  # NOT_STARTED, RUNNING, PAUSED, STOPPED
        self.start_time = None
        self.pause_time = None
        self.elapsed_at_pause = 0

        # External services
        self.redis_manager = RedisManager()
        self.mqtt_client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
        self.docker_client = docker.from_env()

        # Container management
        self.team_containers = []
        self.service_containers = []
        self.dashboard_urls = {}

        # Turn-based state
        self.turn_based = False
        self.total_turns = None
        self.current_turn = 0
        self.turn_start_elapsed = None      # Elapsed seconds when current turn started
        self.waiting_for_next_turn = False
        self.auto_pause_elapsed = None      # When to auto-pause (absolute elapsed time)
        self.state_lock = asyncio.Lock()    # Thread safety for state transitions

        print(f"Executor for {scenario_name} initialized with Redis support.")

    def _connect_mqtt(self):
        try:
            self.mqtt_client.connect("mqtt", 1883, 60)
            self.mqtt_client.loop_start()
            print(f"MQTT client connected. Client ID: {self.mqtt_client._client_id}")
            # Test publish
            test_result = self.mqtt_client.publish("/test", "connected", qos=1)
            print(f"Test publish result: {test_result.rc}")
        except Exception as e:
            print(f"MQTT connection error: {e}")

    def load_scenario(self):
        """Loads the scenario and its associated timelines."""
        scenario_path = os.path.join("/scenarios", f"{self.scenario_name}.json")
        print(f"Loading scenario from: {scenario_path}")
        with open(scenario_path, 'r') as f:
            self.scenario_data = json.load(f)
        print("Scenario loaded successfully.")

        # Detect turn-based mode
        self.turn_based = self.scenario_data.get('turn_based', False)
        self.total_turns = self.scenario_data.get('total_turns', None)

        if self.turn_based:
            print(f"Scenario is TURN-BASED with {self.total_turns or 'unknown'} turns")
        else:
            print("Scenario is TIME-BASED")

        # Load timelines for each team
        for team in self.scenario_data.get('teams', []):
            timeline_file = team.get('timeline_file')
            if timeline_file:
                timeline_path = os.path.join("/scenarios", timeline_file)
                print(f"Loading timeline for team {team['id']} from {timeline_path}")
                with open(timeline_path, 'r') as f:
                    self.timelines[team['id']] = json.load(f)

    def _deploy_team_dashboards(self):
        for i, team in enumerate(self.scenario_data.get('teams', [])):
            team_id = team['id']

            # Get dashboard image from team config, fallback to scenario level, then default
            dashboard_image = team.get('dashboard_image',
                                       self.scenario_data.get('dashboard_image', 'team-dashboard:latest'))

            # Get port from team config, fallback to base_port + index
            port = team.get('dashboard_port', 3100 + i)

            print(f"Using dashboard image: {dashboard_image} on port {port}")
            container_name = f"team-dashboard-{self.scenario_name}-{team_id}"

            environment = {
                'VITE_TEAM_ID': team_id,
                'VITE_MQTT_TOPIC': f"/exercise/{self.scenario_name}/team/{team_id}/feed"
                # VITE_BROKER_URL not needed - dashboard will use dynamic URL
            }

            print(f"Deploying {container_name} on port {port}")

            # Check if container with this name already exists and remove it
            try:
                existing_container = self.docker_client.containers.get(container_name)
                print(f"Found existing container {container_name}. Stopping and removing...")
                existing_container.stop()
                existing_container.remove()
            except docker.errors.NotFound:
                pass # Container does not exist, safe to proceed

            try:
                container = self.docker_client.containers.run(
                    dashboard_image,
                    name=container_name,
                    detach=True,
                    environment=environment,
                    ports={'80/tcp': port},
                    network=os.getenv('DOCKER_NETWORK', 'scip-network')
                )
                self.team_containers.append(container)
                # Include configuration in URL query parameters
                # Use PUBLIC_HOST env var for AWS deployment, fallback to localhost for local dev
                public_host = os.getenv('PUBLIC_HOST', 'localhost')
                self.dashboard_urls[team_id] = f"http://{public_host}:{port}/?team={team_id}&exercise={self.scenario_name}"

                # Debugging: Print container status and logs
                container.reload()
                print(f"Container {container.name} status: {container.status}")
                print(f"Container {container.name} logs:\n{container.logs().decode('utf-8')}")
            except docker.errors.APIError as e:
                print(f"Error running container {container_name}: {e}")
                import traceback
                traceback.print_exc()
                raise # Re-raise to propagate the error

    def _deploy_sdr_service(self):
        """Deploy SDR service if scenario requires it."""
        # Check if scenario has iq_file configured
        iq_file = self.scenario_data.get('iq_file')
        if not iq_file:
            print("No IQ file configured, skipping SDR service deployment")
            return

        # Get sample rate from scenario config, default to 1024000
        sample_rate = self.scenario_data.get('sample_rate', 1024000)

        container_name = f"sdr-service-{self.scenario_name}"

        # Convert /iq_library/file.iq to absolute host path
        # The orchestration container has the host's scenarios directory mounted at /scenarios
        # But when creating sibling containers, we need to use the actual host path
        if iq_file.startswith('/iq_library/'):
            iq_filename = iq_file[12:]  # Remove /iq_library prefix (12 chars, not 13)
            # Use the actual host path (from the orchestration container's mount)
            iq_file_host_path = f"/Users/brettburford/Development/CyberOps/space-cyber-range/apex-rf/scenarios/iq_library/{iq_filename}"
        else:
            iq_file_host_path = iq_file

        print(f"Deploying SDR service with IQ file: {iq_file}")
        print(f"Sample rate: {sample_rate} Hz")

        # Check if container exists and remove it
        try:
            existing_container = self.docker_client.containers.get(container_name)
            print(f"Found existing SDR service {container_name}. Stopping and removing...")
            existing_container.stop()
            existing_container.remove()
        except docker.errors.NotFound:
            pass

        # Mount the entire IQ library directory to support file switching
        iq_library_host_path = "/Users/brettburford/Development/CyberOps/space-cyber-range/apex-rf/scenarios/iq_library"

        try:
            container = self.docker_client.containers.run(
                'scip-v3-sdr-service:latest',
                name=container_name,
                detach=True,
                environment={
                    'IQ_FILE_PATH': '/iq_library/demo.iq',  # Start with demo.iq
                    'SAMPLE_RATE': str(sample_rate)
                },
                ports={'1234/tcp': 1234},
                volumes={
                    iq_library_host_path: {
                        'bind': '/iq_library',
                        'mode': 'ro'
                    }
                },
                network=os.getenv('DOCKER_NETWORK', 'scip-network')
            )
            self.service_containers.append(container)
            print(f"SDR service deployed: {container.name}")

            container.reload()
            print(f"SDR service status: {container.status}")

        except docker.errors.APIError as e:
            print(f"Error deploying SDR service: {e}")
            import traceback
            traceback.print_exc()

    def _deploy_scenario_services(self):
        """Deploy additional services defined in scenario config."""
        services = self.scenario_data.get('services', [])
        if not services:
            print("No additional services to deploy")
            return

        iq_library_host_path = "/Users/brettburford/Development/CyberOps/space-cyber-range/apex-rf/scenarios/iq_library"

        for service in services:
            service_name = service.get('name')
            image = service.get('image')

            if not service_name or not image:
                print(f"Skipping service with missing name or image: {service}")
                continue

            container_name = f"{service_name}-{self.scenario_name}"
            print(f"Deploying service: {container_name} from image {image}")

            # Check if container exists and remove it
            try:
                existing_container = self.docker_client.containers.get(container_name)
                print(f"Found existing {container_name}. Stopping and removing...")
                existing_container.stop()
                existing_container.remove()
            except docker.errors.NotFound:
                pass

            # Prepare port mappings
            port_mappings = {}
            for port in service.get('ports', []):
                if ':' in port:
                    host_port, container_port = port.split(':')
                    port_mappings[f"{container_port}/tcp"] = int(host_port)

            # Prepare volume mounts
            volume_mappings = {}
            for volume in service.get('volumes', []):
                if ':' in volume:
                    parts = volume.split(':')
                    host_path = parts[0]
                    container_path = parts[1]
                    mode = parts[2] if len(parts) > 2 else 'rw'

                    # Convert relative paths to absolute
                    if host_path.startswith('./'):
                        host_path = f"/Users/brettburford/Development/CyberOps/space-cyber-range/apex-rf/{host_path[2:]}"

                    volume_mappings[host_path] = {
                        'bind': container_path,
                        'mode': mode
                    }

            try:
                container = self.docker_client.containers.run(
                    image,
                    name=container_name,
                    detach=True,
                    environment=service.get('environment', {}),
                    ports=port_mappings,
                    volumes=volume_mappings,
                    network=os.getenv('DOCKER_NETWORK', 'scip-network')
                )
                self.service_containers.append(container)
                print(f"Service deployed: {container.name}")

                container.reload()
                print(f"Service {container.name} status: {container.status}")

            except docker.errors.APIError as e:
                print(f"Error deploying service {service_name}: {e}")
                import traceback
                traceback.print_exc()

    async def start(self):
        """
        Starts the exercise execution with state tracking.

        Returns:
            Dict with status, scenario name, and dashboard URLs
        """
        # Clean any existing Redis data for this scenario first
        await self.redis_manager.cleanup_exercise(self.scenario_name)

        self._connect_mqtt()
        self.load_scenario()
        self._deploy_team_dashboards()
        self._deploy_sdr_service()
        self._deploy_scenario_services()

        # Don't start the timer immediately - wait for explicit start command
        self.state = "NOT_STARTED"
        self.is_running = False

        # Update Redis state
        await self.redis_manager.set_exercise_state(self.scenario_name, "NOT_STARTED")

        print(f"Exercise deployed for scenario: {self.scenario_name} - waiting for start command")

        return {
            "status": "Exercise deployed",
            "scenario": self.scenario_name,
            "dashboard_urls": self.dashboard_urls
        }

    async def schedule_turn_injects(self, turn: int):
        """Schedule all injects for a specific turn."""
        print(f"Scheduling injects for Turn {turn}")

        # Get all injects for this turn across all teams
        turn_injects = []
        for team_id, timeline in self.timelines.items():
            team_injects = [
                inject for inject in timeline.get('injects', [])
                if inject.get('turn') == turn
            ]
            turn_injects.extend([(team_id, inject) for inject in team_injects])

        if not turn_injects:
            print(f"WARNING: No injects found for Turn {turn}")
            # Set auto-pause for 5 seconds from now
            self.auto_pause_elapsed = self.turn_start_elapsed + 5
            return

        # Find latest inject time in this turn
        max_inject_time = max(inject['time'] for _, inject in turn_injects)

        # Calculate when to auto-pause (absolute elapsed time)
        self.auto_pause_elapsed = self.turn_start_elapsed + max_inject_time + 5

        print(f"Turn {turn}: {len(turn_injects)} injects, last at +{max_inject_time}s, auto-pause at T+{int(self.auto_pause_elapsed)}s")

    async def begin(self):
        """
        Actually starts the exercise timer and inject delivery.

        Returns:
            Dict with begin status
        """
        if self.state == "NOT_STARTED":
            self.state = "RUNNING"
            self.start_time = time.time()
            self.is_running = True

            # Update Redis state
            await self.redis_manager.set_exercise_state(self.scenario_name, "RUNNING")

            # Turn-based initialization
            if self.turn_based:
                self.current_turn = 1
                self.turn_start_elapsed = 0  # Turn 1 starts at T+0:00
                print(f"Starting Turn 1 of {self.total_turns or '?'}")

                # Schedule Turn 1 injects
                await self.schedule_turn_injects(1)

            # Start the main exercise loop
            print(f"Creating task for run() method")
            task = asyncio.create_task(self.run())
            print(f"Task created: {task}")

            # Publish start command via MQTT
            start_msg = {"command": "start", "timestamp": self.start_time}
            self.mqtt_client.publish(
                f"/exercise/{self.scenario_name}/control",
                json.dumps(start_msg),
                qos=1
            )

            print(f"Exercise {self.scenario_name} started")
            return {"status": "Exercise started"}

        return {"status": "Exercise already started", "error": "Cannot start - not in NOT_STARTED state"}

    async def pause(self):
        """
        Pause the exercise, maintaining timer state.

        Returns:
            Dict with pause status
        """
        async with self.state_lock:
            if self.state == "RUNNING":
                self.state = "PAUSED"
                self.pause_time = time.time()
                self.elapsed_at_pause += (self.pause_time - self.start_time)

                # Update Redis state
                await self.redis_manager.set_exercise_state(self.scenario_name, "PAUSED")

                # Publish pause command via MQTT
                pause_msg = {"command": "pause", "timestamp": self.pause_time}
                self.mqtt_client.publish(
                    f"/exercise/{self.scenario_name}/control",
                    json.dumps(pause_msg),
                    qos=1
                )

                print(f"Exercise {self.scenario_name} paused at {self.elapsed_at_pause:.1f} seconds")
                return {"status": "Exercise paused", "elapsed": self.elapsed_at_pause}

            return {"status": "Exercise not running", "error": "Cannot pause - not in RUNNING state"}

    async def resume(self):
        """
        Resume the exercise from paused state.

        Returns:
            Dict with resume status
        """
        async with self.state_lock:
            if self.state == "PAUSED":
                self.state = "RUNNING"
                self.start_time = time.time()

                # Update Redis state
                await self.redis_manager.set_exercise_state(self.scenario_name, "RUNNING")

                # Publish resume command via MQTT
                resume_msg = {"command": "resume", "timestamp": self.start_time}
                self.mqtt_client.publish(
                    f"/exercise/{self.scenario_name}/control",
                    json.dumps(resume_msg),
                    qos=1
                )

                print(f"Exercise {self.scenario_name} resumed")
                return {"status": "Exercise resumed"}

            return {"status": "Exercise not paused", "error": "Cannot resume - not in PAUSED state"}

    async def next_turn(self):
        """Advance to the next turn in a turn-based scenario."""
        if not self.turn_based:
            print("WARNING: next_turn called on non-turn-based scenario")
            return {"status": "error", "error": "Not a turn-based scenario"}

        if not self.waiting_for_next_turn:
            print("WARNING: next_turn called but not waiting for next turn")
            return {"status": "error", "error": "Not waiting for next turn"}

        # Check if we've reached the final turn
        if self.current_turn >= self.total_turns:
            print(f"WARNING: Already at final turn ({self.current_turn}/{self.total_turns})")
            return {"status": "error", "error": "Already at final turn"}

        # Advance turn
        self.current_turn += 1

        # When paused, current elapsed is just the paused time
        # (start_time hasn't been reset yet, so we can't use the normal calculation)
        self.turn_start_elapsed = self.elapsed_at_pause

        # Clear waiting flag
        self.waiting_for_next_turn = False

        print(f"Advancing to Turn {self.current_turn} at T+{int(self.elapsed_at_pause)}s")

        # Resume exercise if paused (resume has its own lock)
        if self.state == 'PAUSED':
            await self.resume()

        # Schedule injects for new turn
        await self.schedule_turn_injects(self.current_turn)

        # Publish turn started event
        self.mqtt_client.publish(
            f"/exercise/{self.scenario_name}/control",
            json.dumps({
                'event': 'turn_started',
                'turn': self.current_turn,
                'total_turns': self.total_turns
            }),
            qos=1
        )

        return {"status": "Turn advanced", "turn": self.current_turn}

    async def run(self):
        """
        The main exercise loop with timer broadcasting and inject tracking.
        """
        published_injects = set()
        last_elapsed = -1  # Track last elapsed second to update only on change
        print(f"Starting run loop for {self.scenario_name}, is_running={self.is_running}")

        while self.is_running:
            if self.state == "RUNNING":
                # Calculate elapsed time considering pauses
                now = time.time()
                current_elapsed = self.elapsed_at_pause + (now - self.start_time)
                elapsed_seconds = int(current_elapsed)

                # Check for auto-pause (turn-based mode)
                if self.turn_based and self.auto_pause_elapsed is not None:
                    if current_elapsed >= self.auto_pause_elapsed and not self.waiting_for_next_turn:
                        # Check if this is the final turn
                        is_final_turn = self.current_turn >= self.total_turns

                        if is_final_turn:
                            print(f"Final turn complete (Turn {self.current_turn}/{self.total_turns}) at T+{elapsed_seconds}s - Exercise Complete")
                        else:
                            print(f"Auto-pausing after Turn {self.current_turn} at T+{elapsed_seconds}s")
                            # Set flag BEFORE pausing (only if not final turn)
                            self.waiting_for_next_turn = True

                        # Pause the exercise
                        await self.pause()

                        # Publish turn complete event
                        self.mqtt_client.publish(
                            f"/exercise/{self.scenario_name}/control",
                            json.dumps({
                                "event": "turn_complete" if not is_final_turn else "exercise_complete",
                                "turn": self.current_turn,
                                "waiting_for_next_turn": not is_final_turn,
                                "exercise_complete": is_final_turn
                            }),
                            qos=1
                        )

                        # Clear auto-pause time to prevent repeated pausing
                        self.auto_pause_elapsed = None

                        continue  # Skip rest of loop iteration

                # Debug every second change
                if elapsed_seconds != last_elapsed:
                    print(f"DEBUG: now={now:.3f}, start={self.start_time:.3f}, diff={now-self.start_time:.3f}, elapsed_at_pause={self.elapsed_at_pause}, current_elapsed={current_elapsed:.3f}, elapsed_seconds={elapsed_seconds}")

                # Only update timer if the second has changed
                if elapsed_seconds != last_elapsed:
                    last_elapsed = elapsed_seconds

                    # Format timer for display
                    minutes = elapsed_seconds // 60
                    seconds = elapsed_seconds % 60
                    formatted_timer = f"T+{minutes:02d}:{seconds:02d}"

                    # Debug: log time calculation
                    print(f"Timer update: elapsed={elapsed_seconds}, current_elapsed={current_elapsed:.2f}, start_time={self.start_time:.2f}, now={time.time():.2f}, elapsed_at_pause={self.elapsed_at_pause}")

                    # Publish timer update via MQTT
                    timer_topic = f"/exercise/{self.scenario_name}/timer"
                    timer_payload = {
                        "elapsed": elapsed_seconds,
                        "formatted": formatted_timer,
                        "timestamp": time.time()
                    }
                    result = self.mqtt_client.publish(timer_topic, json.dumps(timer_payload), qos=0)
                    if elapsed_seconds % 10 == 0:  # Log every 10 seconds
                        print(f"Published timer to {timer_topic}: {formatted_timer}, result={result.rc}")

                    # Update timer in Redis
                    await self.redis_manager.update_timer(self.scenario_name, elapsed_seconds)
                else:
                    # Format timer for inject checking even if not publishing
                    minutes = elapsed_seconds // 60
                    seconds = elapsed_seconds % 60
                    formatted_timer = f"T+{minutes:02d}:{seconds:02d}"

                # Check and publish injects
                if self.turn_based:
                    # Turn-based: check injects for current turn only
                    for team_id, timeline in self.timelines.items():
                        for inject in timeline.get('injects', []):
                            inject_id = inject.get('id')

                            # Skip if not current turn
                            if inject.get('turn') != self.current_turn:
                                continue

                            # Calculate time since turn started
                            time_since_turn_start = int(current_elapsed - self.turn_start_elapsed)
                            inject_time = inject.get('time')

                            # Check if time to deliver
                            if inject_time == time_since_turn_start and (team_id, inject_id) not in published_injects:
                                topic = f"/exercise/{self.scenario_name}/team/{team_id}/feed"

                                inject_with_metadata = {
                                    **inject,
                                    "delivered_at": elapsed_seconds,
                                    "team_id": team_id,
                                    "exercise_id": self.scenario_name,
                                    "turn": self.current_turn,
                                    "media": inject.get("media", []),
                                    "action": inject.get("action", None)
                                }

                                print(f"[Turn {self.current_turn}] Delivering inject {inject_id} at T+{elapsed_seconds}s (turn time +{time_since_turn_start}s)")
                                self.mqtt_client.publish(topic, json.dumps(inject_with_metadata), qos=1)
                                published_injects.add((team_id, inject_id))

                                await self.redis_manager.record_inject_delivery(
                                    self.scenario_name, team_id, inject_id, "delivered"
                                )
                else:
                    # Time-based: existing logic (absolute time)
                    for team_id, timeline in self.timelines.items():
                        for inject in timeline.get('injects', []):
                            inject_id = inject.get('id')
                            inject_time = inject.get('time')

                            if inject_time == elapsed_seconds and (team_id, inject_id) not in published_injects:
                                topic = f"/exercise/{self.scenario_name}/team/{team_id}/feed"

                                inject_with_metadata = {
                                    **inject,
                                    "delivered_at": elapsed_seconds,
                                    "team_id": team_id,
                                    "exercise_id": self.scenario_name,
                                    "media": inject.get("media", []),
                                    "action": inject.get("action", None)
                                }

                                print(f"Publishing inject {inject_id} to team {team_id} at {formatted_timer}")
                                self.mqtt_client.publish(topic, json.dumps(inject_with_metadata), qos=1)
                                published_injects.add((team_id, inject_id))

                                await self.redis_manager.record_inject_delivery(
                                    self.scenario_name, team_id, inject_id, "delivered"
                                )

                # Debug output every 5 seconds
                if elapsed_seconds % 5 == 0:
                    print(f"Exercise timer: {formatted_timer}, State: {self.state}")

            elif self.state == "PAUSED":
                # While paused, just maintain state but don't advance timer
                await asyncio.sleep(0.1)
                continue

            # Sleep for 100ms to check timer more frequently
            await asyncio.sleep(0.1)

    async def stop(self):
        """
        Stops the exercise execution and cleans up resources.

        Returns:
            Dict with stop status
        """
        self.is_running = False
        self.state = "STOPPED"

        # Update Redis state
        await self.redis_manager.set_exercise_state(self.scenario_name, "STOPPED")

        # Publish stop command via MQTT
        stop_msg = {"command": "stop", "timestamp": time.time()}
        self.mqtt_client.publish(
            f"/exercise/{self.scenario_name}/control",
            json.dumps(stop_msg),
            qos=1
        )

        # Disconnect MQTT
        self.mqtt_client.loop_stop()
        self.mqtt_client.disconnect()

        print(f"Stopping exercise for scenario: {self.scenario_name}")

        # Stop and remove team containers
        for container in self.team_containers:
            try:
                print(f"Stopping and removing container {container.name}")
                container.stop()
                container.remove()
            except Exception as e:
                print(f"Error stopping container {container.name}: {e}")

        # Stop and remove service containers
        for container in self.service_containers:
            try:
                print(f"Stopping and removing service container {container.name}")
                container.stop()
                container.remove()
            except Exception as e:
                print(f"Error stopping service container {container.name}: {e}")

        # Clean up Redis keys to prevent stale data in next exercise
        await self.redis_manager.cleanup_exercise(self.scenario_name)

        return {"status": "Exercise stopped", "scenario": self.scenario_name}
