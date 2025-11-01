#!/usr/bin/env python3
"""
Convert WAV file to IQ format (complex64)
For stereo: Left channel = I, Right channel = Q
For mono: Duplicate to both I and Q (or I=signal, Q=0)
"""

import numpy as np
import wave
import sys

def convert_wav_to_iq(wav_file, output_file):
    """Convert WAV to IQ (complex64) format"""

    print(f"📖 Reading WAV file: {wav_file}")

    # Open WAV file
    with wave.open(wav_file, 'rb') as wav:
        # Get parameters
        n_channels = wav.getnchannels()
        sample_width = wav.getsampwidth()
        framerate = wav.getframerate()
        n_frames = wav.getnframes()

        print(f"   Channels: {n_channels}")
        print(f"   Sample Rate: {framerate} Hz")
        print(f"   Sample Width: {sample_width} bytes")
        print(f"   Duration: {n_frames/framerate:.2f} seconds")
        print(f"   Total Samples: {n_frames:,}")

        # Read all frames
        frames = wav.readframes(n_frames)

    # Convert bytes to numpy array based on sample width
    if sample_width == 1:
        # 8-bit unsigned
        dtype = np.uint8
        samples = np.frombuffer(frames, dtype=dtype)
        samples = samples.astype(np.float32) / 127.5 - 1.0  # Normalize to [-1, 1]
    elif sample_width == 2:
        # 16-bit signed
        dtype = np.int16
        samples = np.frombuffer(frames, dtype=dtype)
        samples = samples.astype(np.float32) / 32768.0  # Normalize to [-1, 1]
    elif sample_width == 4:
        # 32-bit signed
        dtype = np.int32
        samples = np.frombuffer(frames, dtype=dtype)
        samples = samples.astype(np.float32) / 2147483648.0  # Normalize to [-1, 1]
    else:
        raise ValueError(f"Unsupported sample width: {sample_width}")

    # Reshape if stereo
    if n_channels == 2:
        samples = samples.reshape(-1, 2)
        i_channel = samples[:, 0]
        q_channel = samples[:, 1]
        print("✅ Using stereo: Left=I, Right=Q")

    elif n_channels == 1:
        print("⚠️  Mono file detected - duplicating to both I and Q channels")
        i_channel = samples
        q_channel = samples  # Duplicate to Q channel
        # Alternative: q_channel = np.zeros_like(samples) # Q = 0

    else:
        raise ValueError(f"Unsupported number of channels: {n_channels}")

    # Create complex IQ signal
    iq_signal = i_channel + 1j * q_channel

    # Convert to complex64
    iq_complex64 = iq_signal.astype(np.complex64)

    # Save to file
    iq_complex64.tofile(output_file)

    file_size_mb = len(iq_complex64) * 8 / 1024 / 1024

    print(f"\n✅ Converted to IQ format: {output_file}")
    print(f"   Samples: {len(iq_complex64):,}")
    print(f"   Sample Rate: {framerate} Hz ({framerate/1e6:.3f} MHz)")
    print(f"   Duration: {len(iq_complex64)/framerate:.2f} seconds")
    print(f"   File Size: {file_size_mb:.2f} MB")
    print(f"   Format: complex64 (4 bytes I + 4 bytes Q)")

if __name__ == "__main__":
    wav_file = "SDRuno_20200908_170319Z_14242kHz.wav"
    output_file = "scenarios/iq_library/sstv-20m.iq"

    try:
        convert_wav_to_iq(wav_file, output_file)
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
