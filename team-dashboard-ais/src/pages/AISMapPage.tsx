import { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { Radio, Ship, Signal } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for default marker icons in react-leaflet
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

L.Marker.prototype.options.icon = DefaultIcon;

interface FileInfo {
  filename: string;
  duration_seconds: number;
  channel: string;
}

interface AISMessage {
  message_id: number;
  mmsi: number;
  ship_name: string;
  vessel_type: string;
  latitude: number;
  longitude: number;
  speed_knots: number;
  heading_degrees: number;
  length_meters: number;
  timestamp: number;
  signal_quality: string;
}

// Component to auto-center map on ships
function MapAutoCenter({ ships }: { ships: AISMessage[] }) {
  const map = useMap();

  useEffect(() => {
    if (ships.length > 0) {
      const bounds = L.latLngBounds(ships.map(s => [s.latitude, s.longitude]));
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [ships, map]);

  return null;
}

export function AISMapPage() {
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [ships, setShips] = useState<Map<number, AISMessage>>(new Map());
  const [messageLog, setMessageLog] = useState<AISMessage[]>([]);
  const [statusMessage, setStatusMessage] = useState<string>('Connecting to decode service...');
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Connect to WebSocket
    const hostname = window.location.hostname === 'localhost' ? '127.0.0.1' : window.location.hostname;
    const wsUrl = `ws://${hostname}:8002/ws/ais`;

    console.log('Connecting to AIS decode service:', wsUrl);
    setConnectionStatus('connecting');

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
      setConnectionStatus('connected');
      setStatusMessage('Connected to AIS decoder');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case 'file_info':
            setFileInfo(data.data);
            setStatusMessage(`Decoding: ${data.data.filename}`);
            // Reset ships on new file
            setShips(new Map());
            setMessageLog([]);
            break;

          case 'ais_message':
            const msg: AISMessage = data.data;
            setShips(prev => {
              const newMap = new Map(prev);
              newMap.set(msg.mmsi, msg);
              return newMap;
            });
            setMessageLog(prev => [msg, ...prev].slice(0, 50)); // Keep last 50 messages
            break;

          case 'status':
            setStatusMessage(data.message);
            break;

          case 'error':
            setStatusMessage(`Error: ${data.message}`);
            console.error('Decode error:', data.message);
            break;
        }
      } catch (e) {
        console.error('Failed to parse message:', e);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setConnectionStatus('disconnected');
      setStatusMessage('Connection error');
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setConnectionStatus('disconnected');
      setStatusMessage('Disconnected from decode service');
    };

    return () => {
      ws.close();
    };
  }, []);

  const shipsArray = Array.from(ships.values());

  return (
    <div className="min-h-screen bg-background text-text-primary p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <Ship className="w-8 h-8 text-primary" />
            <h1 className="text-3xl font-bold">AIS Maritime Tracking</h1>
          </div>
          <p className="text-text-secondary">Real-time vessel tracking decoded from VHF AIS signals</p>
        </div>

        {/* Connection Status */}
        <div className="card mb-6">
          <div className="card-header">
            <div className="flex items-center gap-3 px-6 py-4">
              <Signal className="w-5 h-5" />
              <h2 className="text-lg font-semibold">Decoder Status</h2>
            </div>
          </div>
          <div className="card-body">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`inline-block w-2 h-2 rounded-full ${
                  connectionStatus === 'connected' ? 'bg-green-500 animate-pulse' :
                  connectionStatus === 'connecting' ? 'bg-yellow-500 animate-pulse' :
                  'bg-red-500'
                }`}></span>
                <span className={`text-sm ${
                  connectionStatus === 'connected' ? 'text-green-500' :
                  connectionStatus === 'connecting' ? 'text-yellow-500' :
                  'text-red-500'
                }`}>
                  {connectionStatus === 'connected' ? 'Connected' :
                   connectionStatus === 'connecting' ? 'Connecting...' :
                   'Disconnected'}
                </span>
              </div>
              <div className="text-sm text-text-secondary">{statusMessage}</div>
            </div>

            {fileInfo && (
              <div className="mt-4 p-3 bg-background rounded border border-gray-700">
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <span className="text-text-secondary">File:</span>
                    <span className="ml-2 text-text-primary font-mono">{fileInfo.filename}</span>
                  </div>
                  <div>
                    <span className="text-text-secondary">Channel:</span>
                    <span className="ml-2 text-primary">{fileInfo.channel}</span>
                  </div>
                  <div>
                    <span className="text-text-secondary">Vessels Tracked:</span>
                    <span className="ml-2 text-text-primary">{ships.size}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Map */}
          <div className="lg:col-span-2 card">
            <div className="card-header">
              <div className="flex items-center gap-3 px-6 py-4">
                <Radio className="w-5 h-5" />
                <h2 className="text-lg font-semibold">Vessel Map</h2>
              </div>
            </div>
            <div className="card-body p-0">
              <div className="h-[600px] rounded-b-lg overflow-hidden">
                {shipsArray.length > 0 ? (
                  <MapContainer
                    center={[-33.8688, 151.2093]}
                    zoom={10}
                    style={{ height: '100%', width: '100%' }}
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    {shipsArray.map(ship => (
                      <Marker key={ship.mmsi} position={[ship.latitude, ship.longitude]}>
                        <Popup>
                          <div className="text-sm">
                            <div className="font-bold mb-1">{ship.ship_name}</div>
                            <div>MMSI: {ship.mmsi}</div>
                            <div>Type: {ship.vessel_type}</div>
                            <div>Speed: {ship.speed_knots} kn</div>
                            <div>Heading: {ship.heading_degrees}°</div>
                            <div>Length: {ship.length_meters}m</div>
                          </div>
                        </Popup>
                      </Marker>
                    ))}
                    <MapAutoCenter ships={shipsArray} />
                  </MapContainer>
                ) : (
                  <div className="flex items-center justify-center h-full bg-gray-800">
                    <div className="text-center text-text-secondary">
                      <Ship className="w-16 h-16 mx-auto mb-4 opacity-50" />
                      <p>Waiting for AIS messages...</p>
                      <p className="text-xs mt-2">
                        Load an AIS IQ file in the RF Control dashboard to begin tracking
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Message Log */}
          <div className="card">
            <div className="card-header">
              <div className="flex items-center gap-3 px-6 py-4">
                <Ship className="w-5 h-5" />
                <h2 className="text-lg font-semibold">Message Log</h2>
              </div>
            </div>
            <div className="card-body">
              <div className="space-y-2 max-h-[540px] overflow-y-auto">
                {messageLog.map((msg, idx) => (
                  <div key={idx} className="p-3 bg-background rounded border border-gray-700 text-xs">
                    <div className="font-semibold text-primary mb-1">{msg.ship_name}</div>
                    <div className="text-text-secondary space-y-0.5">
                      <div>MMSI: {msg.mmsi}</div>
                      <div>Pos: {msg.latitude.toFixed(4)}, {msg.longitude.toFixed(4)}</div>
                      <div>Speed: {msg.speed_knots} kn | Hdg: {msg.heading_degrees}°</div>
                      <div className="text-xs text-green-500">{msg.signal_quality}</div>
                    </div>
                  </div>
                ))}
                {messageLog.length === 0 && (
                  <div className="text-center py-8 text-text-secondary">
                    <p>No messages received</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
