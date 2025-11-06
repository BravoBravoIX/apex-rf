import { useState, useEffect, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ScatterChart, Scatter } from 'recharts';
import { Radio, Signal, BarChart3, TrendingUp } from 'lucide-react';

interface IQPlotData {
  constellation: {
    i: number[];
    q: number[];
  };
  time_domain: {
    time: number[];
    i: number[];
    q: number[];
  };
  psd: {
    frequency: number[];
    power: number[];
  };
  spectrogram: {
    data: number[][];
    frequency_bins: number;
    time_rows: number;
  };
}

interface FileInfo {
  filename: string;
  duration_seconds: number;
  sample_rate: number;
  total_samples: number;
}

export function IQAnalysisPage() {
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [plotData, setPlotData] = useState<IQPlotData | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('Connecting to decode service...');
  const wsRef = useRef<WebSocket | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    // Connect to WebSocket
    const hostname = window.location.hostname === 'localhost' ? '127.0.0.1' : window.location.hostname;
    const wsUrl = `ws://${hostname}:8002/ws/metrics`;

    console.log('Connecting to metrics service for IQ plots:', wsUrl);
    setConnectionStatus('connecting');

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
      setConnectionStatus('connected');
      setStatusMessage('Connected to IQ analyzer');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case 'file_info':
            setFileInfo(data.data);
            setStatusMessage(`Analyzing: ${data.data.filename}`);
            break;

          case 'iq_plots':
            setPlotData(data.data);
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
      setStatusMessage('Disconnected from IQ analyzer');
    };

    return () => {
      ws.close();
    };
  }, []);

  // Draw spectrogram on canvas
  useEffect(() => {
    if (!plotData?.spectrogram || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { data, frequency_bins } = plotData.spectrogram;
    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    if (data.length === 0) return;

    // Draw spectrogram (waterfall)
    const rowHeight = height / data.length;
    const colWidth = width / frequency_bins;

    data.forEach((row, timeIdx) => {
      row.forEach((power, freqIdx) => {
        // Normalize power to 0-255 for color mapping
        // Typical range: -100 to 0 dB
        const normalized = Math.max(0, Math.min(255, ((power + 100) / 100) * 255));

        // Create heatmap color (blue -> green -> yellow -> red)
        let r, g, b;
        if (normalized < 64) {
          // Blue to Cyan
          r = 0;
          g = normalized * 4;
          b = 255;
        } else if (normalized < 128) {
          // Cyan to Green
          r = 0;
          g = 255;
          b = 255 - (normalized - 64) * 4;
        } else if (normalized < 192) {
          // Green to Yellow
          r = (normalized - 128) * 4;
          g = 255;
          b = 0;
        } else {
          // Yellow to Red
          r = 255;
          g = 255 - (normalized - 192) * 4;
          b = 0;
        }

        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(freqIdx * colWidth, timeIdx * rowHeight, colWidth + 1, rowHeight + 1);
      });
    });
  }, [plotData?.spectrogram]);

  // Prepare data for charts
  const constellationData = plotData?.constellation
    ? plotData.constellation.i.map((i, idx) => ({
        i,
        q: plotData.constellation.q[idx]
      }))
    : [];

  const timeDomainData = plotData?.time_domain
    ? plotData.time_domain.time.map((t, idx) => ({
        sample: t,
        i: plotData.time_domain.i[idx],
        q: plotData.time_domain.q[idx]
      }))
    : [];

  const psdData = plotData?.psd
    ? plotData.psd.frequency.map((freq, idx) => ({
        frequency: freq,
        power: plotData.psd.power[idx]
      }))
    : [];

  return (
    <div className="text-text-primary space-y-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Radio className="w-8 h-8 text-primary" />
          <h1 className="text-3xl font-bold">IQ Signal Analysis</h1>
        </div>
        <p className="text-text-secondary">Real-time visualization of IQ samples and frequency spectrum</p>
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

      {/* IQ Plots Grid */}
      {plotData && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Constellation Diagram */}
          <div className="card">
            <div className="card-header">
              <div className="flex items-center gap-3 px-6 py-4">
                <Radio className="w-5 h-5 text-blue-400" />
                <h2 className="text-lg font-semibold">Constellation Diagram</h2>
              </div>
            </div>
            <div className="card-body">
              <ResponsiveContainer width="100%" height={300}>
                <ScatterChart margin={{ top: 5, right: 20, bottom: 20, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis
                    dataKey="i"
                    type="number"
                    domain={['auto', 'auto']}
                    stroke="#9CA3AF"
                    label={{ value: 'I (In-Phase)', position: 'bottom', fill: '#9CA3AF' }}
                  />
                  <YAxis
                    dataKey="q"
                    type="number"
                    domain={['auto', 'auto']}
                    stroke="#9CA3AF"
                    label={{ value: 'Q (Quadrature)', angle: -90, position: 'left', fill: '#9CA3AF' }}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151' }}
                    cursor={{ strokeDasharray: '3 3' }}
                  />
                  <Scatter
                    data={constellationData}
                    fill="#3B82F6"
                    fillOpacity={0.6}
                    shape="circle"
                  />
                </ScatterChart>
              </ResponsiveContainer>
              <p className="text-xs text-text-secondary mt-2 px-6">
                IQ samples plotted on complex plane. Tight clusters indicate good modulation quality.
              </p>
            </div>
          </div>

          {/* Power Spectral Density */}
          <div className="card">
            <div className="card-header">
              <div className="flex items-center gap-3 px-6 py-4">
                <BarChart3 className="w-5 h-5 text-red-400" />
                <h2 className="text-lg font-semibold">Power Spectral Density</h2>
              </div>
            </div>
            <div className="card-body">
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={psdData} margin={{ top: 5, right: 20, bottom: 20, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis
                    dataKey="frequency"
                    stroke="#9CA3AF"
                    label={{ value: 'Normalized Frequency', position: 'bottom', fill: '#9CA3AF' }}
                    tickFormatter={(value) => value.toFixed(2)}
                  />
                  <YAxis
                    stroke="#9CA3AF"
                    label={{ value: 'Power (dB)', angle: -90, position: 'left', fill: '#9CA3AF' }}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151' }}
                    labelFormatter={(value) => `Freq: ${Number(value).toFixed(3)}`}
                  />
                  <Line
                    type="monotone"
                    dataKey="power"
                    stroke="#EF4444"
                    strokeWidth={1.5}
                    dot={false}
                    name="Power (dB)"
                  />
                </LineChart>
              </ResponsiveContainer>
              <p className="text-xs text-text-secondary mt-2 px-6">
                Frequency spectrum showing signal energy distribution. Peaks indicate carrier and interference.
              </p>
            </div>
          </div>

          {/* Time-Domain Plot */}
          <div className="card">
            <div className="card-header">
              <div className="flex items-center gap-3 px-6 py-4">
                <TrendingUp className="w-5 h-5 text-green-400" />
                <h2 className="text-lg font-semibold">Time-Domain Waveform</h2>
              </div>
            </div>
            <div className="card-body">
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={timeDomainData} margin={{ top: 5, right: 20, bottom: 20, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis
                    dataKey="sample"
                    stroke="#9CA3AF"
                    label={{ value: 'Sample Index', position: 'bottom', fill: '#9CA3AF' }}
                  />
                  <YAxis
                    stroke="#9CA3AF"
                    label={{ value: 'Amplitude', angle: -90, position: 'left', fill: '#9CA3AF' }}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="i"
                    stroke="#10B981"
                    strokeWidth={1}
                    dot={false}
                    name="I (In-Phase)"
                  />
                  <Line
                    type="monotone"
                    dataKey="q"
                    stroke="#F59E0B"
                    strokeWidth={1}
                    dot={false}
                    name="Q (Quadrature)"
                  />
                </LineChart>
              </ResponsiveContainer>
              <p className="text-xs text-text-secondary mt-2 px-6">
                Raw I and Q samples over time. Useful for detecting clipping, DC offset, or saturation.
              </p>
            </div>
          </div>

          {/* Spectrogram */}
          <div className="card">
            <div className="card-header">
              <div className="flex items-center gap-3 px-6 py-4">
                <Signal className="w-5 h-5 text-purple-400" />
                <h2 className="text-lg font-semibold">Spectrogram (Waterfall)</h2>
              </div>
            </div>
            <div className="card-body">
              <div className="flex justify-center">
                <canvas
                  ref={canvasRef}
                  width={600}
                  height={300}
                  className="border border-gray-700 rounded"
                  style={{ width: '100%', height: 'auto' }}
                />
              </div>
              <p className="text-xs text-text-secondary mt-2 px-6">
                Frequency content over time. Time flows downward. Color shows power (blue=low, red=high).
              </p>
            </div>
          </div>
        </div>
      )}

      {/* No Data Message */}
      {!plotData && connectionStatus === 'connected' && (
        <div className="card">
          <div className="card-body">
            <div className="flex flex-col items-center justify-center py-12 text-text-secondary">
              <Radio className="w-16 h-16 mb-4 opacity-50" />
              <p>Waiting for IQ data...</p>
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
