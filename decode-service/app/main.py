"""
Decode Service - Real-time signal decoding from IQ files
Provides WebSocket endpoints for SSTV, AIS, and metrics data
"""
import asyncio
import json
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import paho.mqtt.client as mqtt
from typing import Dict, Set
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Decode Service")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Active WebSocket connections
connections: Dict[str, Set[WebSocket]] = {
    "sstv": set(),
    "ais": set(),
    "metrics": set()
}

# Current state from MQTT
current_state = {
    "iq_file": None,
    "playing": False,
    "paused": False,
    "jamming_enabled": False,
    "jamming_power": 0.0,
    "jamming_type": "barrage"
}

# MQTT Client
mqtt_client = None

def on_mqtt_connect(client, userdata, flags, rc):
    logger.info(f"Connected to MQTT broker with result code {rc}")
    # Subscribe to SDR status
    client.subscribe("apex/team/sdr-rf/status")

def on_mqtt_message(client, userdata, msg):
    """Handle MQTT messages with current state"""
    try:
        if msg.topic == "apex/team/sdr-rf/status":
            status = json.loads(msg.payload.decode())
            playback = status.get("playback", {})
            current_state["playing"] = playback.get("running", False) and not playback.get("paused", False)
            current_state["paused"] = playback.get("paused", False)
            current_state["iq_file"] = playback.get("file", None)
            current_state["jamming_enabled"] = status.get("jamming", {}).get("enabled", False)
            current_state["jamming_power"] = status.get("jamming", {}).get("power", 0.0)
            current_state["jamming_type"] = status.get("jamming", {}).get("type", "barrage")
            logger.info(f"Updated state: playing={current_state['playing']}, jamming={current_state['jamming_enabled']}, file={current_state['iq_file']}")
    except Exception as e:
        logger.error(f"Error processing MQTT message: {e}")

@app.on_event("startup")
async def startup_event():
    """Initialize MQTT connection on startup"""
    global mqtt_client
    mqtt_client = mqtt.Client()
    mqtt_client.on_connect = on_mqtt_connect
    mqtt_client.on_message = on_mqtt_message

    try:
        mqtt_client.connect("mqtt", 1883, 60)
        mqtt_client.loop_start()
        logger.info("MQTT client started")
    except Exception as e:
        logger.error(f"Failed to connect to MQTT: {e}")

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    if mqtt_client:
        mqtt_client.loop_stop()
        mqtt_client.disconnect()

@app.get("/")
async def root():
    return {
        "service": "Decode Service",
        "version": "1.0.0",
        "decoders": ["sstv", "ais", "metrics"],
        "current_state": current_state
    }

@app.websocket("/ws/sstv")
async def websocket_sstv(websocket: WebSocket):
    """WebSocket endpoint for SSTV decoder"""
    await websocket.accept()
    connections["sstv"].add(websocket)
    logger.info(f"SSTV client connected. Total: {len(connections['sstv'])}")

    try:
        # Import here to avoid loading if not used
        from decoders.sstv_decoder import SSTVDecoder

        decoder = SSTVDecoder()

        # Send initial state
        await websocket.send_json({
            "type": "state",
            "data": current_state
        })

        # Start decoding task
        decode_task = asyncio.create_task(decoder.decode_stream(websocket, current_state))

        # Keep connection alive and handle incoming messages
        while True:
            data = await websocket.receive_text()
            # Handle any client commands if needed

    except WebSocketDisconnect:
        logger.info("SSTV client disconnected")
    except Exception as e:
        logger.error(f"Error in SSTV websocket: {e}")
    finally:
        connections["sstv"].discard(websocket)

@app.websocket("/ws/ais")
async def websocket_ais(websocket: WebSocket):
    """WebSocket endpoint for AIS decoder"""
    await websocket.accept()
    connections["ais"].add(websocket)
    logger.info(f"AIS client connected. Total: {len(connections['ais'])}")

    try:
        from decoders.ais_decoder import AISDecoder

        decoder = AISDecoder()

        await websocket.send_json({
            "type": "state",
            "data": current_state
        })

        decode_task = asyncio.create_task(decoder.decode_stream(websocket, current_state))

        while True:
            data = await websocket.receive_text()

    except WebSocketDisconnect:
        logger.info("AIS client disconnected")
    except Exception as e:
        logger.error(f"Error in AIS websocket: {e}")
    finally:
        connections["ais"].discard(websocket)

@app.websocket("/ws/metrics")
async def websocket_metrics(websocket: WebSocket):
    """WebSocket endpoint for signal metrics"""
    await websocket.accept()
    connections["metrics"].add(websocket)
    logger.info(f"Metrics client connected. Total: {len(connections['metrics'])}")

    try:
        from decoders.metrics_analyzer import MetricsAnalyzer

        analyzer = MetricsAnalyzer()

        await websocket.send_json({
            "type": "state",
            "data": current_state
        })

        analyze_task = asyncio.create_task(analyzer.analyze_stream(websocket, current_state))

        while True:
            data = await websocket.receive_text()

    except WebSocketDisconnect:
        logger.info("Metrics client disconnected")
    except Exception as e:
        logger.error(f"Error in Metrics websocket: {e}")
    finally:
        connections["metrics"].discard(websocket)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002)
