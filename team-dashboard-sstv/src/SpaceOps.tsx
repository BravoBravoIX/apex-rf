import { useState, useEffect } from 'react';
import { useMqtt } from './hooks/useMqtt';

export const SpaceOpsDashboard = () => {
  const urlParams = new URLSearchParams(window.location.search);
  const teamId = urlParams.get('team') || 'spaceops';
  const exerciseName = urlParams.get('exercise') || 'satcom-disruption-scenario';

  const { messages, connectionStatus } = useMqtt(
    `ws://${window.location.hostname}:9001`,
    [
      `/exercise/${exerciseName}/team/${teamId}/feed`,
      `/exercise/${exerciseName}/timer`,
      `/exercise/${exerciseName}/control`
    ]
  );

  const [satellites, setSatellites] = useState<Map<string, any>>(new Map());
  const [groundStations, setGroundStations] = useState<Map<string, any>>(new Map());
  const [timer, setTimer] = useState('T+00:00');

  useEffect(() => {
    if (messages.length > 0) {
      const latestMessage = messages[messages.length - 1];
      try {
        const data = JSON.parse(latestMessage);
        
        // Handle timer updates
        if (data.formatted) {
          setTimer(data.formatted);
          return;
        }

        // Handle triggers
        if (data.type === 'trigger' && data.content?.command) {
          handleCommand(data.content.command, data.content.parameters);
        }
      } catch (e) {
        console.error('Error parsing message:', e);
      }
    }
  }, [messages]);

  const handleCommand = (command: string, params: any) => {
    switch (command) {
      case 'initialize_satellites':
        const newSats = new Map();
        params.satellites.forEach((sat: any) => {
          newSats.set(sat.name, sat);
        });
        setSatellites(newSats);
        break;
      
      case 'update_satellite_status':
        setSatellites(prev => {
          const updated = new Map(prev);
          const existing = updated.get(params.satellite) || {};
          updated.set(params.satellite, { ...existing, ...params });
          return updated;
        });
        break;

      case 'update_ground_stations':
        const newStations = new Map();
        params.stations.forEach((station: any) => {
          newStations.set(station.name, station);
        });
        setGroundStations(newStations);
        break;
    }
  };

  const getSignalClass = (strength: number) => {
    if (strength >= 70) return 'bg-green-500';
    if (strength >= 40) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getStatusClass = (status: string) => {
    const s = status.toLowerCase();
    if (s.includes('nominal')) return 'bg-green-500/20 text-green-400';
    if (s.includes('degraded')) return 'bg-yellow-500/20 text-yellow-400';
    return 'bg-red-500/20 text-red-400';
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      {/* Header */}
      <header className="bg-gray-800 border-b-2 border-blue-500 p-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Space Operations Center</h1>
            <p className="text-sm text-gray-400">SATCOM Network Monitoring</p>
          </div>
          <div className="flex gap-6">
            <div className="text-right">
              <div className="text-xs text-gray-400 uppercase">Exercise Timer</div>
              <div className="text-xl font-mono text-blue-400">{timer}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-400 uppercase">UTC Time</div>
              <div className="text-xl font-mono">{new Date().toISOString().substr(11, 8)}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-400 uppercase">Connection</div>
              <div className={`text-sm font-semibold ${connectionStatus === 'connected' ? 'text-green-400' : 'text-red-400'}`}>
                {connectionStatus === 'connected' ? 'Connected' : 'Disconnected'}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-6">
        {/* Satellites */}
        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-4">Satellite Status</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from(satellites.entries()).map(([name, sat]) => (
              <div key={name} className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <div className="flex justify-between items-start mb-3">
                  <h3 className="text-lg font-bold text-blue-400">{name}</h3>
                  <span className={`px-2 py-1 rounded text-xs font-semibold ${getStatusClass(sat.status)}`}>
                    {sat.status}
                  </span>
                </div>
                <div className="space-y-2">
                  <div>
                    <div className="text-xs text-gray-400">Signal Strength</div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-6 bg-gray-700 rounded overflow-hidden">
                        <div 
                          className={`h-full ${getSignalClass(sat.signal_strength)} transition-all flex items-center justify-end pr-2 text-xs font-bold`}
                          style={{ width: `${sat.signal_strength}%` }}
                        >
                          {sat.signal_strength}%
                        </div>
                      </div>
                    </div>
                  </div>
                  {sat.trend && (
                    <div className="text-sm">
                      <span className={sat.trend === 'declining' ? 'text-red-400' : 'text-green-400'}>
                        {sat.trend === 'declining' ? '↓' : '↑'} {sat.trend}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Ground Stations */}
        {groundStations.size > 0 && (
          <section className="mb-6">
            <h2 className="text-xl font-semibold mb-4">Ground Station Status</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {Array.from(groundStations.entries()).map(([name, station]) => (
                <div key={name} className="bg-gray-800 rounded-lg p-4 border-l-4 border-blue-500">
                  <div className="flex justify-between items-center">
                    <h3 className="font-semibold">{name}</h3>
                    <span className={`px-2 py-1 rounded text-xs ${getStatusClass(station.status)}`}>
                      {station.status}
                    </span>
                  </div>
                  <div className="mt-2 text-sm text-gray-400">
                    Link Quality: {station.link_quality}%
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
};
