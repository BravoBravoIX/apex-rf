import { useState, useEffect, useRef } from 'react';
import { Radio, Image as ImageIcon, Signal } from 'lucide-react';

interface FileInfo {
  filename: string;
  duration_seconds: number;
  mode: string;
  expected_width: number;
  expected_height: number;
}

interface ScanLineData {
  line_number: number;
  total_lines: number;
  progress: number;
}

interface ImageData {
  image_base64: string;
  width: number;
  height: number;
  mode: string;
}

export function SSTVDecodePage() {
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [scanProgress, setScanProgress] = useState<ScanLineData | null>(null);
  const [decodedImage, setDecodedImage] = useState<ImageData | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('Connecting to decode service...');
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Connect to WebSocket
    const hostname = window.location.hostname === 'localhost' ? '127.0.0.1' : window.location.hostname;
    const wsUrl = `ws://${hostname}:8002/ws/sstv`;

    console.log('Connecting to SSTV decode service:', wsUrl);
    setConnectionStatus('connecting');

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
      setConnectionStatus('connected');
      setStatusMessage('Connected to SSTV decoder');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('Received:', data.type);

        switch (data.type) {
          case 'file_info':
            setFileInfo(data.data);
            setStatusMessage(`Decoding: ${data.data.filename}`);
            break;

          case 'scan_line':
            setScanProgress(data.data);
            break;

          case 'image_complete':
            setDecodedImage(data.data);
            setStatusMessage('Image decode complete!');
            setScanProgress(null);
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

  return (
    <div className="min-h-screen bg-background text-text-primary p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <Radio className="w-8 h-8 text-primary" />
            <h1 className="text-3xl font-bold">SSTV Image Decoder</h1>
          </div>
          <p className="text-text-secondary">Real-time Slow Scan TV image decoding from IQ samples</p>
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
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-text-secondary">File:</span>
                    <span className="ml-2 text-text-primary font-mono">{fileInfo.filename}</span>
                  </div>
                  <div>
                    <span className="text-text-secondary">Mode:</span>
                    <span className="ml-2 text-primary">{fileInfo.mode}</span>
                  </div>
                  <div>
                    <span className="text-text-secondary">Resolution:</span>
                    <span className="ml-2 text-text-primary">{fileInfo.expected_width}x{fileInfo.expected_height}</span>
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

        {/* Decode Progress */}
        {scanProgress && (
          <div className="card mb-6">
            <div className="card-header">
              <div className="flex items-center gap-3 px-6 py-4">
                <ImageIcon className="w-5 h-5" />
                <h2 className="text-lg font-semibold">Decoding Progress</h2>
              </div>
            </div>
            <div className="card-body">
              <div className="mb-2 flex justify-between text-sm">
                <span className="text-text-secondary">
                  Line {scanProgress.line_number + 1} of {scanProgress.total_lines}
                </span>
                <span className="text-primary font-semibold">
                  {(scanProgress.progress * 100).toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-primary h-full transition-all duration-300 rounded-full"
                  style={{ width: `${scanProgress.progress * 100}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Decoded Image */}
        <div className="card">
          <div className="card-header">
            <div className="flex items-center gap-3 px-6 py-4">
              <ImageIcon className="w-5 h-5" />
              <h2 className="text-lg font-semibold">Decoded Image</h2>
            </div>
          </div>
          <div className="card-body">
            {decodedImage ? (
              <div className="flex flex-col items-center">
                <img
                  src={`data:image/png;base64,${decodedImage.image_base64}`}
                  alt="Decoded SSTV"
                  className="max-w-full h-auto border border-gray-700 rounded"
                  style={{ imageRendering: 'pixelated' }}
                />
                <div className="mt-4 text-sm text-text-secondary">
                  {decodedImage.width}x{decodedImage.height} - {decodedImage.mode}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-text-secondary">
                <ImageIcon className="w-16 h-16 mb-4 opacity-50" />
                <p>Waiting for SSTV image...</p>
                <p className="text-xs mt-2">
                  Load an SSTV IQ file in the RF Control dashboard to begin decoding
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
