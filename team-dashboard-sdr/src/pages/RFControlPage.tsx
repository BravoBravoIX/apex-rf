import { useState, useEffect } from 'react';
import { useInjects } from '../contexts/InjectContext';
import { useMqtt } from '../hooks/useMqtt';
import {
  Radio,
  Activity,
  Settings,
  Play,
  Pause,
  Square,
  Zap,
  Target,
  Waves,
  BarChart3,
  FileAudio
} from 'lucide-react';

interface SDRStatus {
  timestamp: number;
  playback: {
    running: boolean;
    paused: boolean;
    file: string;
  };
  jamming: {
    enabled: boolean;
    type: string;
    power: number;
    jamming_freq_mhz: number;
    current_freq_mhz: number;
    sample_rate_mhz: number;
    in_bandwidth: boolean;
    freq_offset_khz: number | null;
  };
  gqrx_connected: boolean;
}

export const RFControlPage = () => {
  const { publishInject } = useInjects();

  // Debug: Log URL parameters
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    console.log('📍 URL Params:', {
      team: urlParams.get('team'),
      exercise: urlParams.get('exercise'),
      fullURL: window.location.href
    });
  }, []);

  const [jammingPower, setJammingPower] = useState(0.1);
  const [jammingEnabled, setJammingEnabled] = useState(false);
  const [jammingType, setJammingType] = useState('barrage');
  const [jammingFrequency, setJammingFrequency] = useState(103.3);
  const [playbackState, setPlaybackState] = useState<'play' | 'pause' | 'stop'>('stop');
  const [sdrStatus, setSdrStatus] = useState<SDRStatus | null>(null);
  const [iqFiles, setIqFiles] = useState<any[]>([]);
  const [selectedIqFile, setSelectedIqFile] = useState<string>('');

  const { messages } = useMqtt('ws://localhost:9001', 'apex/team/sdr-rf/status');

  useEffect(() => {
    if (messages.length > 0) {
      try {
        const latestMessage = messages[messages.length - 1];
        console.log('📥 Received status message:', latestMessage.substring(0, 200));
        const status = JSON.parse(latestMessage);
        console.log('📊 Parsed status:', status);
        setSdrStatus(status);

        if (status.playback) {
          if (status.playback.running && !status.playback.paused) {
            setPlaybackState('play');
          } else if (status.playback.paused) {
            setPlaybackState('pause');
          } else {
            setPlaybackState('stop');
          }
        }

        if (status.jamming) {
          console.log('🔴 Updating jamming state from status:', {
            enabled: status.jamming.enabled,
            type: status.jamming.type,
            power: status.jamming.power
          });
          setJammingEnabled(status.jamming.enabled);
          setJammingType(status.jamming.type);
          setJammingPower(status.jamming.power);
          setJammingFrequency(status.jamming.jamming_freq_mhz);
        }
      } catch (err) {
        console.error('Failed to parse status:', err);
      }
    }
  }, [messages]);

  useEffect(() => {
    fetch('/api/v1/iq-library')
      .then(res => res.json())
      .then(data => {
        setIqFiles(data.iq_files || []);
        if (data.iq_files?.length > 0) {
          setSelectedIqFile(data.iq_files[0].filename);
        }
      })
      .catch(err => console.error('Failed to load IQ files:', err));
  }, []);

  const sendCommand = (command: string, parameters?: Record<string, any>) => {
    const payload = {
      type: 'trigger',
      content: { command, parameters }
    };
    console.log('🎮 Sending command:', command, parameters);
    console.log('📤 MQTT Payload:', payload);
    publishInject(payload);

    // Optimistically update playback state for immediate UI feedback
    if (command === 'play') setPlaybackState('play');
    else if (command === 'pause') setPlaybackState('pause');
    else if (command === 'stop') setPlaybackState('stop');
  };

  const switchIqFile = () => {
    if (selectedIqFile) {
      sendCommand('switch_iq', { file: `/iq_library/${selectedIqFile}` });
    }
  };

  const toggleJamming = () => {
    const newState = !jammingEnabled;
    setJammingEnabled(newState);
    sendCommand(newState ? 'enable_jamming' : 'disable_jamming');
  };

  const updateJammingType = (type: string) => {
    setJammingType(type);
    sendCommand('set_jam_type', { type });
    // Do NOT enable/disable jamming - just change the type
  };

  const updateJammingPower = (power: number) => {
    setJammingPower(power);
    sendCommand('set_jam_power', { power });
  };

  const updateJammingFrequency = () => {
    sendCommand('set_jam_frequency', { frequency: jammingFrequency * 1e6 });
  };

  const setPresetFrequency = (freq: number) => {
    setJammingFrequency(freq);
    sendCommand('set_jam_frequency', { frequency: freq * 1e6 });
  };

  const jammingTypes = [
    { value: 'barrage', label: 'Barrage', description: 'Wideband Noise', icon: Waves },
    { value: 'spot', label: 'Spot', description: 'Single Frequency Tone', icon: Target },
    { value: 'sweep', label: 'Sweep', description: 'Frequency Hopping', icon: Activity },
    { value: 'pulse', label: 'Pulse', description: 'Intermittent Bursts', icon: Zap },
    { value: 'chirp', label: 'Chirp', description: 'Linear FM', icon: BarChart3 },
    { value: 'fhss', label: 'FHSS', description: 'Freq Hopping Spread', icon: Radio },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Radio className="w-10 h-10 text-blue-400" />
        <h1 className="text-4xl font-bold text-text-primary">RF Jamming Demonstrator</h1>
      </div>

      {/* IQ File Selection */}
      <div className="card">
        <div className="card-header">
          <div className="flex items-center gap-3 px-6 py-4">
            <FileAudio className="w-6 h-6 text-blue-400" />
            <h2 className="text-xl font-semibold text-text-primary">IQ File Selection</h2>
          </div>
        </div>
        <div className="card-content p-6">
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-text-primary mb-2">
                Select IQ File:
              </label>
              <select
                value={selectedIqFile}
                onChange={(e) => setSelectedIqFile(e.target.value)}
                className="w-full bg-surface-dark text-text-primary border border-surface-light rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500"
              >
                {iqFiles.map((file) => (
                  <option key={file.filename} value={file.filename}>
                    {file.display_name || file.filename}
                    {file.center_frequency_mhz && ` - ${file.center_frequency_mhz} MHz`}
                    {' '}({file.size_mb} MB, {Math.round(file.duration_seconds / 60)}m)
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={switchIqFile}
              className="btn btn-primary px-8 py-3"
              disabled={!selectedIqFile}
            >
              Load File
            </button>
          </div>
          {selectedIqFile && iqFiles.find(f => f.filename === selectedIqFile)?.center_frequency_mhz && (
            <div className="mt-3 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
              <p className="text-sm text-blue-400">
                <strong>Tune GQRX to: {iqFiles.find(f => f.filename === selectedIqFile)?.center_frequency_mhz} MHz</strong>
                {' '}to see this signal
              </p>
            </div>
          )}
          <p className="text-sm text-text-muted mt-3">
            <strong>Note:</strong> Switching files will briefly disconnect GQRX. Reconnect after loading.
          </p>
        </div>
      </div>

      {/* Jamming Control and Target Frequency - Side by Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Jamming Control */}
        <div className="card">
          <div className="card-header">
            <div className="flex items-center gap-3 px-6 py-4">
              <Target className="w-6 h-6 text-blue-400" />
              <h2 className="text-xl font-semibold text-text-primary">Jamming Control</h2>
            </div>
          </div>
          <div className="card-content p-8">
            {/* Enable/Disable Toggle */}
            <div className="flex items-center justify-center">
              <button
                onClick={toggleJamming}
                className={`px-16 py-5 rounded-lg text-xl font-bold transition-all ${
                  jammingEnabled
                    ? 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/30'
                    : 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/30'
                }`}
              >
                {jammingEnabled ? 'Disable Jamming' : 'Enable Jamming'}
              </button>
            </div>
          </div>
        </div>

        {/* Target Frequency */}
        <div className="card">
          <div className="card-header">
            <div className="flex items-center gap-3 px-6 py-4">
              <Activity className="w-6 h-6 text-blue-400" />
              <h2 className="text-xl font-semibold text-text-primary">Target Frequency</h2>
            </div>
          </div>
          <div className="card-content p-6 space-y-4">
            <label className="block text-sm font-medium text-text-primary mb-2">
              Jamming Frequency:
            </label>
            <div className="flex gap-3">
              <input
                type="number"
                step="0.1"
                min="88"
                max="500"
                value={jammingFrequency}
                onChange={(e) => setJammingFrequency(Number(e.target.value))}
                className="flex-1 bg-surface-dark text-text-primary border border-surface-light rounded-lg px-4 py-3 font-mono text-lg focus:outline-none focus:border-blue-500"
              />
              <span className="flex items-center text-text-muted font-semibold text-lg px-2">MHz</span>
              <button
                onClick={updateJammingFrequency}
                className="btn btn-primary px-8 py-3 whitespace-nowrap"
              >
                Set Frequency
              </button>
            </div>

            {/* Preset Buttons */}
            <div className="grid grid-cols-2 gap-3 mt-4">
              <button
                onClick={() => setPresetFrequency(103.3)}
                className="btn btn-secondary text-sm py-3"
              >
                FM Radio (103.3)
              </button>
              <button
                onClick={() => setPresetFrequency(462.6125)}
                className="btn btn-secondary text-sm py-3"
              >
                FRS/GMRS (462.6)
              </button>
              <button
                onClick={() => setPresetFrequency(145.0)}
                className="btn btn-secondary text-sm py-3"
              >
                2m Ham (145.0)
              </button>
              <button
                onClick={() => setPresetFrequency(446.0)}
                className="btn btn-secondary text-sm py-3"
              >
                PMR446 (446.0)
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Jamming Parameters and Playback Controls - Side by Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Jamming Parameters */}
        <div className="card">
          <div className="card-header">
            <div className="flex items-center gap-3 px-6 py-4">
              <Zap className="w-6 h-6 text-blue-400" />
              <h2 className="text-xl font-semibold text-text-primary">Jamming Parameters</h2>
            </div>
          </div>
          <div className="card-content p-6 space-y-6">
            {/* Power Slider */}
            <div className="bg-surface-dark p-6 rounded-lg">
              <label className="block text-sm font-medium text-text-primary mb-3">
                Jamming Power: <span className="text-blue-400 font-bold">{Math.round(jammingPower * 100)}%</span>
              </label>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={jammingPower * 100}
                onChange={(e) => updateJammingPower(Number(e.target.value) / 100)}
                className="w-full h-2 bg-surface-light rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
              <div className="flex justify-between text-xs text-text-muted mt-2">
                <span>0% (Weak)</span>
                <span>100% (Strong)</span>
              </div>
            </div>

            {/* Jamming Technique */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-3">
                Jamming Technique:
              </label>
              <div className="grid grid-cols-2 gap-3">
                {jammingTypes.map((type) => {
                  const Icon = type.icon;
                  const isActive = jammingType === type.value;
                  return (
                    <button
                      key={type.value}
                      onClick={() => updateJammingType(type.value)}
                      className={`p-4 rounded-lg border-2 transition-all text-left ${
                        isActive
                          ? 'border-blue-500 bg-blue-500/10 shadow-lg shadow-blue-500/20'
                          : 'border-surface-light bg-surface-dark hover:border-surface-light/50'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Icon className={`w-5 h-5 ${isActive ? 'text-blue-400' : 'text-text-muted'}`} />
                        <div className="font-semibold text-text-primary text-sm">{type.label}</div>
                      </div>
                      <div className="text-xs text-text-muted">{type.description}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Playback Controls */}
        <div className="card">
          <div className="card-header">
            <div className="flex items-center gap-3 px-6 py-4">
              <Play className="w-6 h-6 text-blue-400" />
              <h2 className="text-xl font-semibold text-text-primary">Playback Controls</h2>
            </div>
          </div>
          <div className="card-content p-6">
            <div className="grid grid-cols-3 gap-4">
              <button
                onClick={() => sendCommand('play')}
                className={`flex items-center justify-center gap-2 py-4 px-6 rounded-lg font-semibold transition-all ${
                  playbackState === 'play'
                    ? 'bg-green-600 text-white shadow-lg shadow-green-600/30'
                    : 'bg-surface-dark text-text-primary hover:bg-surface-light border border-surface-light'
                }`}
              >
                <Play className="w-5 h-5" />
                Play
              </button>
              <button
                onClick={() => sendCommand('pause')}
                className={`flex items-center justify-center gap-2 py-4 px-6 rounded-lg font-semibold transition-all ${
                  playbackState === 'pause'
                    ? 'bg-yellow-600 text-white shadow-lg shadow-yellow-600/30'
                    : 'bg-surface-dark text-text-primary hover:bg-surface-light border border-surface-light'
                }`}
              >
                <Pause className="w-5 h-5" />
                Pause
              </button>
              <button
                onClick={() => sendCommand('stop')}
                className={`flex items-center justify-center gap-2 py-4 px-6 rounded-lg font-semibold transition-all ${
                  playbackState === 'stop'
                    ? 'bg-gray-600 text-white shadow-lg shadow-gray-600/30'
                    : 'bg-surface-dark text-text-primary hover:bg-surface-light border border-surface-light'
                }`}
              >
                <Square className="w-5 h-5" />
                Stop
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Real-Time Status */}
      {sdrStatus && (
        <div className="card">
          <div className="card-header">
            <div className="flex items-center gap-3 px-6 py-4">
              <BarChart3 className="w-6 h-6 text-blue-400" />
              <h2 className="text-xl font-semibold text-text-primary">Real-Time Status</h2>
            </div>
          </div>
          <div className="card-content p-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-surface-dark p-5 rounded-lg">
                <div className="text-xs text-text-muted mb-2">GQRX Frequency</div>
                <div className="text-xl font-bold text-text-primary font-mono">
                  {sdrStatus.jamming.current_freq_mhz.toFixed(3)} MHz
                </div>
              </div>
              <div className="bg-surface-dark p-5 rounded-lg">
                <div className="text-xs text-text-muted mb-2">Sample Rate</div>
                <div className="text-xl font-bold text-text-primary font-mono">
                  {sdrStatus.jamming.sample_rate_mhz.toFixed(1)} MHz
                </div>
              </div>
              <div className="bg-surface-dark p-5 rounded-lg">
                <div className="text-xs text-text-muted mb-2">Jammer Status</div>
                <div className={`text-xl font-bold ${
                  sdrStatus.jamming.enabled && sdrStatus.jamming.in_bandwidth
                    ? 'text-red-400'
                    : sdrStatus.jamming.enabled
                      ? 'text-yellow-400'
                      : 'text-gray-500'
                }`}>
                  {sdrStatus.jamming.enabled
                    ? (sdrStatus.jamming.in_bandwidth ? 'ACTIVE' : 'Out of Range')
                    : 'Disabled'}
                </div>
              </div>
              <div className="bg-surface-dark p-5 rounded-lg">
                <div className="text-xs text-text-muted mb-2">Frequency Offset</div>
                <div className="text-xl font-bold text-text-primary font-mono">
                  {sdrStatus.jamming.in_bandwidth && sdrStatus.jamming.freq_offset_khz !== null
                    ? `${sdrStatus.jamming.freq_offset_khz.toFixed(1)} kHz`
                    : '-'}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* GQRX Connection Instructions */}
      <div className="card">
        <div className="card-header">
          <div className="flex items-center gap-3 px-6 py-4">
            <Settings className="w-6 h-6 text-blue-400" />
            <h2 className="text-xl font-semibold text-text-primary">Quick Start Instructions</h2>
          </div>
        </div>
        <div className="card-content p-6">
          <ol className="list-decimal list-inside space-y-2 text-text-muted leading-relaxed">
            <li>Open GQRX and connect to <code className="bg-surface-dark px-2 py-1 rounded text-blue-400 font-mono">localhost:1234</code> (RTL-TCP)</li>
            <li>Select an IQ file above and tune GQRX to the frequency shown (e.g., 249.1 MHz for UHF-FO, 1692.14 MHz for COMS-1)</li>
            <li>Click "Enable Jamming" to see interference on the signal</li>
            <li>Tune away from the jammer frequency - interference disappears!</li>
            <li>Try different jamming techniques and power levels</li>
          </ol>
        </div>
      </div>
    </div>
  );
};
