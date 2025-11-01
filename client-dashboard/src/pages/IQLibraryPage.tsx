import React, { useState, useEffect } from 'react';
import { Upload, Trash2, FileAudio, Clock, HardDrive } from 'lucide-react';
import { API_BASE_URL } from '../config';

interface IQFile {
  filename: string;
  path: string;
  size: number;
  size_mb: number;
  duration_seconds: number;
  num_samples: number;
  modified: number;
  format: string;
}

const IQLibraryPage: React.FC = () => {
  // Demo mode toggle - set to false to enable upload
  const DEMO_MODE = false;

  const [iqFiles, setIqFiles] = useState<IQFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    loadIQFiles();
  }, []);

  const loadIQFiles = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/iq-library`);
      const data = await response.json();
      setIqFiles(data.iq_files);
    } catch (error) {
      console.error('Failed to load IQ files:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    const formData = new FormData();

    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/iq-library/upload`, {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (result.success) {
        alert(`Successfully uploaded ${result.successful} file(s)`);
        loadIQFiles();
      } else if (result.errors && result.errors.length > 0) {
        const errorMessages = result.errors.map((e: any) => `${e.filename}: ${e.error}`).join('\n');
        alert(`Upload errors:\n${errorMessages}`);
        if (result.successful > 0) {
          loadIQFiles();
        }
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert('Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDelete = async (path: string, filename: string) => {
    if (!confirm(`Delete ${filename}?`)) return;

    try {
      const response = await fetch(
        `/api/v1/iq-library?path=${encodeURIComponent(path)}`,
        { method: 'DELETE' }
      );

      if (response.ok) {
        alert('File deleted');
        loadIQFiles();
      } else {
        alert('Delete failed');
      }
    } catch (error) {
      console.error('Delete error:', error);
      alert('Delete failed');
    }
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}m ${secs}s`;
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-primary mb-2">IQ File Library</h1>
            <p className="text-text-secondary">
              Manage IQ files for SDR scenarios
            </p>
          </div>
          <label className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
            DEMO_MODE
              ? 'bg-surface text-text-muted cursor-not-allowed opacity-50 pointer-events-none'
              : 'bg-primary text-white hover:bg-primary/80 cursor-pointer'
          }`}>
            <Upload size={18} />
            {uploading ? 'Uploading...' : 'Upload IQ Files'}
            <input
              type="file"
              multiple
              accept=".iq,.dat,.raw,.cfile"
              onChange={handleUpload}
              disabled={uploading || DEMO_MODE}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* IQ Files List */}
      <div className="card p-6 mb-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">
          IQ Files ({iqFiles.length})
        </h2>
        {loading ? (
          <div className="text-center py-8 text-text-secondary">Loading...</div>
        ) : iqFiles.length === 0 ? (
          <div className="text-center py-8 text-text-secondary">
            No IQ files uploaded yet. Upload .iq, .dat, .raw, or .cfile files to get started.
          </div>
        ) : (
          <div className="space-y-3">
            {iqFiles.map((file) => (
              <div
                key={file.path}
                className="flex items-center justify-between p-4 bg-surface rounded-lg hover:bg-surface-light transition-colors"
              >
                <div className="flex items-center gap-4 flex-1">
                  <FileAudio className="w-8 h-8 text-primary" />
                  <div className="flex-1">
                    <div className="font-medium text-text-primary">{file.filename}</div>
                    <div className="flex gap-4 text-xs text-text-secondary mt-1">
                      <span className="flex items-center gap-1">
                        <HardDrive className="w-3 h-3" />
                        {file.size_mb} MB
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDuration(file.duration_seconds)}
                      </span>
                      <span>{file.num_samples.toLocaleString()} samples</span>
                      <span className="uppercase">{file.format}</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => handleDelete(file.path, file.filename)}
                  className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm inline-flex items-center gap-2 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Supported Formats Info */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Supported Formats</h2>
        <ul className="list-disc list-inside text-sm text-text-secondary space-y-2">
          <li><strong className="text-text-primary">.iq</strong> - Complex64 IQ samples (I/Q interleaved, 32-bit float)</li>
          <li><strong className="text-text-primary">.dat</strong> - Raw binary IQ data</li>
          <li><strong className="text-text-primary">.raw</strong> - Raw IQ samples</li>
          <li><strong className="text-text-primary">.cfile</strong> - GNU Radio complex float format</li>
        </ul>
        <p className="text-sm text-text-secondary mt-4">
          All files should contain complex64 samples (8 bytes per sample).
          Sample rate is assumed to be 1.024 MHz for duration calculation.
        </p>
      </div>
    </div>
  );
};

export default IQLibraryPage;
