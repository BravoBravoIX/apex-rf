import { useState, useEffect } from 'react';
import { useMqtt } from './hooks/useMqtt';

export const EWIntelDashboard = () => {
  const urlParams = new URLSearchParams(window.location.search);
  const teamId = urlParams.get('team') || 'ew-intel';
  const exerciseName = urlParams.get('exercise') || 'satcom-disruption-scenario';

  const { messages, connectionStatus } = useMqtt(
    `ws://${window.location.hostname}:9001`,
    [
      `/exercise/${exerciseName}/team/${teamId}/feed`,
      `/exercise/${exerciseName}/timer`,
      `/exercise/${exerciseName}/control`
    ]
  );

  const [timer, setTimer] = useState('T+00:00');
  const [threatData, setThreatData] = useState<any>({});

  useEffect(() => {
    if (messages.length > 0) {
      const latestMessage = messages[messages.length - 1];
      try {
        const data = JSON.parse(latestMessage);

        if (data.formatted) {
          setTimer(data.formatted);
          return;
        }

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
      case 'classify_emitter':
      case 'geolocation_update':
      case 'geolocation_refined':
        setThreatData((prev: any) => ({ ...prev, ...params }));
        break;
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      <header className="bg-gray-800 border-b-2 border-purple-500 p-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Electronic Warfare Intelligence</h1>
            <p className="text-sm text-gray-400">RF Spectrum Analysis & Threat Characterization</p>
          </div>
          <div className="flex gap-6">
            <div className="text-right">
              <div className="text-xs text-gray-400 uppercase">Exercise Timer</div>
              <div className="text-xl font-mono text-purple-400">{timer}</div>
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

      <main className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <h2 className="text-xl font-semibold mb-4">Threat Classification</h2>
            <div className="space-y-4">
              <div>
                <div className="text-xs text-gray-400 uppercase">Emitter Type</div>
                <div className="text-lg font-semibold">{threatData.emitter_type || 'Unknown'}</div>
              </div>
              <div>
                <div className="text-xs text-gray-400 uppercase">Threat Category</div>
                <div className={`text-lg font-semibold ${threatData.threat_category === 'HOSTILE' ? 'text-red-400' : 'text-yellow-400'}`}>
                  {threatData.threat_category || 'Unknown'}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-400 uppercase">Confidence</div>
                <div className="text-lg font-semibold">{threatData.confidence || 0}%</div>
              </div>
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <h2 className="text-xl font-semibold mb-4">Geolocation</h2>
            <div className="space-y-4">
              <div>
                <div className="text-xs text-gray-400 uppercase">Coordinates</div>
                <div className="text-lg font-mono">
                  {threatData.latitude?.toFixed(4) || '--'}, {threatData.longitude?.toFixed(4) || '--'}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-400 uppercase">Method</div>
                <div className="text-lg">{threatData.method || 'N/A'}</div>
              </div>
              <div>
                <div className="text-xs text-gray-400 uppercase">Error Radius</div>
                <div className="text-lg">{threatData.error_radius_km || '--'} km</div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
