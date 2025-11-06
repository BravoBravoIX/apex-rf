import { useState, useEffect, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Radio, Activity, Signal, AlertTriangle } from 'lucide-react';

interface FileInfo {
  filename: string;
  duration_seconds: number;
  sample_rate: number;
  total_samples: number;
}

interface Metrics {
  timestamp: number;
  snr_db: number;
  signal_strength_dbm: number;
  ber: number;
  packet_success_rate: number;
  bandwidth_occupancy: number;
  jamming_enabled: boolean;
  jamming_power: number;
  jamming_type: string;
}

interface ChartDataPoint {
  time: string;
  snr: number;
  signalStrength: number;
  ber: number;
  packetSuccess: number;
}

export function MetricsPage() {
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [currentMetrics, setCurrentMetrics] = useState<Metrics | null>(null);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [statusMessage, setStatusMessage] = useState<string>('Connecting to decode service...');
  const wsRef = useRef<WebSocket | null>(null);
  const startTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    // Connect to WebSocket
    const hostname = window.location.hostname === 'localhost' ? '127.0.0.1' : window.location.hostname;
    const wsUrl = `ws://${hostname}:8002/ws/metrics`;

    console.log('Connecting to metrics service:', wsUrl);
    setConnectionStatus('connecting');

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
      setConnectionStatus('connected');
      setStatusMessage('Connected to metrics analyzer');
      startTimeRef.current = Date.now();
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case 'file_info':
            setFileInfo(data.data);
            setStatusMessage(`Analyzing: ${data.data.filename}`);
            // Reset chart on new file
            setChartData([]);
            startTimeRef.current = Date.now();
            break;

          case 'metrics':
            const metrics: Metrics = data.data;
            setCurrentMetrics(metrics);

            // Add to chart data
            const elapsedSeconds = Math.floor((Date.now() - startTimeRef.current) / 1000);
            const timeLabel = `${Math.floor(elapsedSeconds / 60)}:${String(elapsedSeconds % 60).padStart(2, '0')}`;

            setChartData(prev => {
              const newData = [...prev, {
                time: timeLabel,
                snr: metrics.snr_db,
                signalStrength: metrics.signal_strength_dbm,
                ber: metrics.ber * 100, // Convert to percentage
                packetSuccess: metrics.packet_success_rate * 100, // Convert to percentage
              }];
              // Keep last 60 data points (about 1 minute)
              return newData.slice(-60);
            });
            break;

          case 'status':
            setStatusMessage(data.message);
            break;

          case 'error':
            setStatusMessage(`Error: ${data.message}`);
            console.error('Analysis error:', data.message);
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
      setStatusMessage('Disconnected from metrics service');
    };

    return () => {
      ws.close();
    };
  }, []);

  // Helper to get color based on value quality
  const getQualityColor = (value: number, thresholds: { good: number; warning: number }) => {
    if (value >= thresholds.good) return 'text-green-500';
    if (value >= thresholds.warning) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getSNRQuality = (snr: number) => {
    if (snr > 15) return { text: 'Excellent', color: 'text-green-500' };
    if (snr > 10) return { text: 'Good', color: 'text-yellow-500' };
    if (snr > 5) return { text: 'Fair', color: 'text-orange-500' };
    return { text: 'Poor', color: 'text-red-500' };
  };

  return (
    <div className="text-text-primary space-y-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Activity className="w-8 h-8 text-primary" />
          <h1 className="text-3xl font-bold">Signal Metrics</h1>
        </div>
        <p className="text-text-secondary">Real-time RF signal quality measurements from IQ samples</p>
      </div>

        {/* Connection Status */}
        <div className="card mb-6">
          <div className="card-header">
            <div className="flex items-center gap-3 px-6 py-4">
              <Signal className="w-5 h-5" />
              <h2 className="text-lg font-semibold">Analyzer Status</h2>
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
                    <span className="text-text-secondary">Sample Rate:</span>
                    <span className="ml-2 text-text-primary">{(fileInfo.sample_rate / 1000).toFixed(0)} kHz</span>
                  </div>
                  <div>
                    <span className="text-text-secondary">Duration:</span>
                    <span className="ml-2 text-text-primary">{fileInfo.duration_seconds.toFixed(1)}s</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Current Metrics Cards */}
        {currentMetrics && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {/* SNR */}
            <div className="card">
              <div className="card-body">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-text-secondary">SNR</span>
                  <Signal className="w-4 h-4 text-primary" />
                </div>
                <div className="text-3xl font-bold">{currentMetrics.snr_db.toFixed(1)} dB</div>
                <div className={`text-xs mt-1 ${getSNRQuality(currentMetrics.snr_db).color}`}>
                  {getSNRQuality(currentMetrics.snr_db).text}
                </div>
              </div>
            </div>

            {/* Signal Strength */}
            <div className="card">
              <div className="card-body">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-text-secondary">Signal Strength</span>
                  <Activity className="w-4 h-4 text-primary" />
                </div>
                <div className="text-3xl font-bold">{currentMetrics.signal_strength_dbm.toFixed(1)} dBm</div>
                <div className="text-xs mt-1 text-text-secondary">RF Power</div>
              </div>
            </div>

            {/* BER */}
            <div className="card">
              <div className="card-body">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-text-secondary">Bit Error Rate</span>
                  <AlertTriangle className="w-4 h-4 text-yellow-500" />
                </div>
                <div className="text-3xl font-bold">{(currentMetrics.ber * 100).toFixed(2)}%</div>
                <div className={`text-xs mt-1 ${getQualityColor(100 - currentMetrics.ber * 100, { good: 95, warning: 80 })}`}>
                  {currentMetrics.ber < 0.05 ? 'Good' : currentMetrics.ber < 0.2 ? 'Fair' : 'Poor'}
                </div>
              </div>
            </div>

            {/* Packet Success */}
            <div className="card">
              <div className="card-body">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-text-secondary">Packet Success</span>
                  <Radio className="w-4 h-4 text-primary" />
                </div>
                <div className="text-3xl font-bold">{(currentMetrics.packet_success_rate * 100).toFixed(0)}%</div>
                <div className={`text-xs mt-1 ${getQualityColor(currentMetrics.packet_success_rate * 100, { good: 90, warning: 70 })}`}>
                  {currentMetrics.packet_success_rate > 0.9 ? 'Excellent' : currentMetrics.packet_success_rate > 0.7 ? 'Good' : 'Poor'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Jamming Status */}
        {currentMetrics && currentMetrics.jamming_enabled && (
          <div className="card mb-6 border-2 border-red-500">
            <div className="card-body">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-500" />
                <span className="text-red-500 font-semibold">JAMMING ACTIVE</span>
                <span className="text-text-secondary ml-auto">
                  Type: {currentMetrics.jamming_type} | Power: {(currentMetrics.jamming_power * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Charts - Only show when we have data */}
        {currentMetrics && chartData.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* SNR Chart */}
            <div className="card">
              <div className="card-header">
                <div className="flex items-center gap-3 px-6 py-4">
                  <Signal className="w-5 h-5" />
                  <h2 className="text-lg font-semibold">Signal-to-Noise Ratio</h2>
                </div>
              </div>
              <div className="card-body">
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="time" stroke="#9CA3AF" style={{ fontSize: 12 }} />
                  <YAxis stroke="#9CA3AF" style={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151' }}
                    labelStyle={{ color: '#9CA3AF' }}
                  />
                  <Line type="monotone" dataKey="snr" stroke="#10B981" strokeWidth={2} dot={false} name="SNR (dB)" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Packet Success Chart */}
          <div className="card">
            <div className="card-header">
              <div className="flex items-center gap-3 px-6 py-4">
                <Radio className="w-5 h-5" />
                <h2 className="text-lg font-semibold">Packet Success Rate</h2>
              </div>
            </div>
            <div className="card-body">
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="time" stroke="#9CA3AF" style={{ fontSize: 12 }} />
                  <YAxis stroke="#9CA3AF" style={{ fontSize: 12 }} domain={[0, 100]} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151' }}
                    labelStyle={{ color: '#9CA3AF' }}
                  />
                  <Line type="monotone" dataKey="packetSuccess" stroke="#3B82F6" strokeWidth={2} dot={false} name="Success (%)" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Signal Strength Chart */}
          <div className="card">
            <div className="card-header">
              <div className="flex items-center gap-3 px-6 py-4">
                <Activity className="w-5 h-5" />
                <h2 className="text-lg font-semibold">Signal Strength</h2>
              </div>
            </div>
            <div className="card-body">
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="time" stroke="#9CA3AF" style={{ fontSize: 12 }} />
                  <YAxis stroke="#9CA3AF" style={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151' }}
                    labelStyle={{ color: '#9CA3AF' }}
                  />
                  <Line type="monotone" dataKey="signalStrength" stroke="#F59E0B" strokeWidth={2} dot={false} name="Power (dBm)" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* BER Chart */}
          <div className="card">
            <div className="card-header">
              <div className="flex items-center gap-3 px-6 py-4">
                <AlertTriangle className="w-5 h-5" />
                <h2 className="text-lg font-semibold">Bit Error Rate</h2>
              </div>
            </div>
            <div className="card-body">
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="time" stroke="#9CA3AF" style={{ fontSize: 12 }} />
                  <YAxis stroke="#9CA3AF" style={{ fontSize: 12 }} domain={[0, 100]} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151' }}
                    labelStyle={{ color: '#9CA3AF' }}
                  />
                  <Line type="monotone" dataKey="ber" stroke="#EF4444" strokeWidth={2} dot={false} name="BER (%)" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          </div>
        )}

        {/* No Data Message */}
        {!currentMetrics && connectionStatus === 'connected' && (
          <div className="card">
            <div className="card-body">
              <div className="flex flex-col items-center justify-center py-12 text-text-secondary">
                <Activity className="w-16 h-16 mb-4 opacity-50" />
                <p>Waiting for signal data...</p>
                <p className="text-xs mt-2">
                  Load an IQ file in the RF Control dashboard to begin analysis
                </p>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}
