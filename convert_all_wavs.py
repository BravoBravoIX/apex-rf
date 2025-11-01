#!/usr/bin/env python3
"""
Convert all WAV files to IQ format for the RF monitoring scenario
"""

import numpy as np
import wave
import sys
import os

def convert_wav_to_iq(wav_file, output_file, description=""):
    """Convert WAV to IQ (complex64) format"""

    print(f"\n{'='*70}")
    print(f"📖 Converting: {os.path.basename(wav_file)}")
    if description:
        print(f"   Description: {description}")
    print('='*70)

    # Open WAV file
    with wave.open(wav_file, 'rb') as wav:
        # Get parameters
        n_channels = wav.getnchannels()
        sample_width = wav.getsampwidth()
        framerate = wav.getframerate()
        n_frames = wav.getnframes()

        print(f"   Channels: {n_channels}")
        print(f"   Sample Rate: {framerate} Hz ({framerate/1e6:.3f} MHz)")
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

    else:
        raise ValueError(f"Unsupported number of channels: {n_channels}")

    # Create complex IQ signal
    iq_signal = i_channel + 1j * q_channel

    # Convert to complex64
    iq_complex64 = iq_signal.astype(np.complex64)

    # Save to file
    iq_complex64.tofile(output_file)

    file_size_mb = len(iq_complex64) * 8 / 1024 / 1024

    print(f"\n✅ Converted to IQ format: {os.path.basename(output_file)}")
    print(f"   Samples: {len(iq_complex64):,}")
    print(f"   Sample Rate: {framerate} Hz ({framerate/1e6:.3f} MHz)")
    print(f"   Duration: {len(iq_complex64)/framerate:.2f} seconds")
    print(f"   File Size: {file_size_mb:.2f} MB")
    print(f"   Format: complex64 (4 bytes I + 4 bytes Q)")

if __name__ == "__main__":
    # Define conversions with metadata
    conversions = [
        {
            "input": "SDRSharp_20200210_074503Z_249095068Hz_IQ_UHF-FO.wav",
            "output": "scenarios/iq_library/uhf-fo.iq",
            "description": "UHF Follow-On (UFO) Military Transponders at 249.095 MHz"
        },
        {
            "input": "SDRSharp_20200728_093524Z_1544500000Hz_NOAA-15_SARP-3_PDS (1).wav",
            "output": "scenarios/iq_library/noaa-15-sarsat.iq",
            "description": "NOAA-15 SARSAT-3 PDS (Personal Distress Signal) at 1544.5 MHz"
        },
        {
            "input": "sat-iq.wav",
            "output": "scenarios/iq_library/sat-iq.iq",
            "description": "Generic satellite IQ recording at 250 kHz"
        }
    ]

    print("\n" + "="*70)
    print("RF Signal WAV to IQ Converter")
    print("="*70)
    print(f"Converting {len(conversions)} files...")

    errors = []
    for conv in conversions:
        try:
            convert_wav_to_iq(conv["input"], conv["output"], conv["description"])
        except Exception as e:
            error_msg = f"❌ Error converting {conv['input']}: {e}"
            print(error_msg)
            errors.append(error_msg)
            import traceback
            traceback.print_exc()

    print("\n" + "="*70)
    print("Conversion Summary")
    print("="*70)

    if errors:
        print(f"❌ {len(errors)} file(s) failed to convert:")
        for error in errors:
            print(f"   {error}")
        sys.exit(1)
    else:
        print(f"✅ All {len(conversions)} files converted successfully!")
        print("\nAvailable IQ files in library:")
        for conv in conversions:
            print(f"   • {os.path.basename(conv['output'])} - {conv['description']}")
