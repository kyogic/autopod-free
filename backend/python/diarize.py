#!/usr/bin/env python3
"""
AutoPod Free - Speaker Diarization Script
Uses pyannote.audio for speaker detection and segmentation

Output format:
- Progress updates: PROGRESS:{"progress": N, "message": "..."}
- Final result: RESULT:{...json...}
"""

import argparse
import json
import sys
import os
from pathlib import Path

def print_progress(progress: int, message: str):
    """Print progress update in parseable format"""
    data = {"progress": progress, "message": message}
    print(f"PROGRESS:{json.dumps(data)}", flush=True)

def print_result(result: dict):
    """Print final result in parseable format"""
    print(f"RESULT:{json.dumps(result)}", flush=True)

def detect_silences(audio_path: str, threshold_db: float = -40, min_duration: float = 0.4):
    """
    Detect silent regions in audio using energy-based detection.
    """
    import numpy as np
    import librosa

    print_progress(60, "Detecting silences...")

    # Load audio
    y, sr = librosa.load(audio_path, sr=16000, mono=True)

    # Calculate RMS energy in windows
    frame_length = int(sr * 0.05)  # 50ms windows
    hop_length = frame_length // 2

    rms = librosa.feature.rms(y=y, frame_length=frame_length, hop_length=hop_length)[0]

    # Convert to dB
    rms_db = 20 * np.log10(rms + 1e-10)

    # Find silent regions
    is_silent = rms_db < threshold_db

    # Group consecutive silent frames
    silences = []
    in_silence = False
    silence_start = 0

    for i, silent in enumerate(is_silent):
        time = i * hop_length / sr

        if silent and not in_silence:
            in_silence = True
            silence_start = time
        elif not silent and in_silence:
            in_silence = False
            duration = time - silence_start
            if duration >= min_duration:
                silences.append({
                    "start": round(silence_start, 3),
                    "end": round(time, 3),
                    "duration": round(duration, 3)
                })

    # Handle silence at end
    if in_silence:
        end_time = len(y) / sr
        duration = end_time - silence_start
        if duration >= min_duration:
            silences.append({
                "start": round(silence_start, 3),
                "end": round(end_time, 3),
                "duration": round(duration, 3)
            })

    return silences

def analyze_audio_levels(audio_path: str):
    """
    Analyze audio levels for normalization.
    """
    import numpy as np
    import librosa

    print_progress(70, "Analyzing audio levels...")

    # Load audio
    y, sr = librosa.load(audio_path, sr=None, mono=True)

    # Calculate peak
    peak = np.max(np.abs(y))
    peak_db = 20 * np.log10(peak + 1e-10)

    # Calculate RMS (approximation of loudness)
    rms = np.sqrt(np.mean(y ** 2))
    rms_db = 20 * np.log10(rms + 1e-10)

    # Estimate LUFS (simplified - actual LUFS requires K-weighting)
    # This is a rough approximation
    lufs_estimate = rms_db - 0.691

    return {
        "peakDb": round(float(peak_db), 2),
        "rmsDb": round(float(rms_db), 2),
        "integratedLufs": round(float(lufs_estimate), 2),
        "truePeak": round(float(peak_db), 2),
        "loudnessRange": 0  # Would need more complex analysis
    }

def run_diarization(audio_path: str, num_speakers: int = None, use_auth_token: str = None):
    """
    Run speaker diarization using pyannote.audio
    """
    print_progress(10, "Loading diarization model...")

    try:
        from pyannote.audio import Pipeline
        import torch

        # Check for GPU
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        print_progress(15, f"Using device: {device}")

        # Load the pipeline
        # Note: Users need to accept the model terms on HuggingFace and provide auth token
        # For testing without auth, we'll use a fallback approach

        try:
            pipeline = Pipeline.from_pretrained(
                "pyannote/speaker-diarization-3.1",
                use_auth_token=use_auth_token
            )
            pipeline.to(device)
            print_progress(25, "Model loaded successfully")
        except Exception as e:
            print_progress(25, f"Could not load pyannote model: {e}")
            print_progress(25, "Using fallback diarization...")
            return run_fallback_diarization(audio_path, num_speakers)

        print_progress(30, "Running diarization...")

        # Run diarization
        if num_speakers:
            diarization = pipeline(audio_path, num_speakers=num_speakers)
        else:
            diarization = pipeline(audio_path)

        print_progress(50, "Processing results...")

        # Convert to our format
        segments = []
        for turn, _, speaker in diarization.itertracks(yield_label=True):
            segments.append({
                "speakerId": speaker,
                "start": round(turn.start, 3),
                "end": round(turn.end, 3),
                "confidence": 0.9  # pyannote doesn't provide per-segment confidence
            })

        # Sort by start time
        segments.sort(key=lambda x: x["start"])

        return segments

    except ImportError as e:
        print_progress(20, f"pyannote.audio not available: {e}")
        print_progress(20, "Using fallback diarization...")
        return run_fallback_diarization(audio_path, num_speakers)

def run_fallback_diarization(audio_path: str, num_speakers: int = 2):
    """
    Fallback diarization using speechbrain embeddings and clustering.
    Less accurate but doesn't require HuggingFace auth.
    """
    print_progress(25, "Loading fallback model (SpeechBrain)...")

    try:
        import numpy as np
        import librosa
        from scipy.cluster.hierarchy import fcluster, linkage

        # Try to use speechbrain for embeddings
        try:
            from speechbrain.inference.speaker import EncoderClassifier

            classifier = EncoderClassifier.from_hparams(
                source="speechbrain/spkrec-ecapa-voxceleb",
                run_opts={"device": "cpu"}
            )
            use_speechbrain = True
            print_progress(35, "SpeechBrain model loaded")
        except Exception as e:
            print(f"SpeechBrain not available: {e}", file=sys.stderr)
            use_speechbrain = False

        print_progress(40, "Loading audio...")

        # Load audio
        y, sr = librosa.load(audio_path, sr=16000, mono=True)
        duration = len(y) / sr

        print_progress(45, "Segmenting audio...")

        # Simple VAD using energy
        frame_length = int(sr * 0.025)  # 25ms
        hop_length = int(sr * 0.010)    # 10ms

        rms = librosa.feature.rms(y=y, frame_length=frame_length, hop_length=hop_length)[0]
        threshold = np.percentile(rms, 30)  # Adaptive threshold

        is_speech = rms > threshold

        # Find speech segments
        speech_segments = []
        in_speech = False
        segment_start = 0
        min_segment = 0.5  # Minimum segment duration

        for i, speech in enumerate(is_speech):
            time = i * hop_length / sr

            if speech and not in_speech:
                in_speech = True
                segment_start = time
            elif not speech and in_speech:
                in_speech = False
                if time - segment_start >= min_segment:
                    speech_segments.append((segment_start, time))

        if in_speech and duration - segment_start >= min_segment:
            speech_segments.append((segment_start, duration))

        print_progress(55, f"Found {len(speech_segments)} speech segments")

        if len(speech_segments) == 0:
            # No speech detected, return empty
            return []

        # Extract embeddings for each segment
        embeddings = []

        if use_speechbrain:
            print_progress(60, "Extracting speaker embeddings...")

            for start, end in speech_segments:
                start_sample = int(start * sr)
                end_sample = int(end * sr)
                segment_audio = y[start_sample:end_sample]

                # SpeechBrain expects tensor
                import torch
                audio_tensor = torch.tensor(segment_audio).unsqueeze(0)

                try:
                    embedding = classifier.encode_batch(audio_tensor)
                    embeddings.append(embedding.squeeze().numpy())
                except Exception:
                    # Use zero embedding as fallback
                    embeddings.append(np.zeros(192))
        else:
            # Use simple MFCC-based features as fallback
            print_progress(60, "Extracting audio features...")

            for start, end in speech_segments:
                start_sample = int(start * sr)
                end_sample = int(end * sr)
                segment_audio = y[start_sample:end_sample]

                if len(segment_audio) > 0:
                    mfcc = librosa.feature.mfcc(y=segment_audio, sr=sr, n_mfcc=20)
                    embedding = np.mean(mfcc, axis=1)
                else:
                    embedding = np.zeros(20)

                embeddings.append(embedding)

        embeddings = np.array(embeddings)

        print_progress(75, "Clustering speakers...")

        # Cluster embeddings
        if len(embeddings) >= num_speakers:
            # Hierarchical clustering
            linkage_matrix = linkage(embeddings, method='ward')
            cluster_labels = fcluster(linkage_matrix, t=num_speakers, criterion='maxclust')
        else:
            # Not enough segments, assign each to different speaker
            cluster_labels = list(range(1, len(embeddings) + 1))

        # Build segments with speaker labels
        segments = []
        for i, (start, end) in enumerate(speech_segments):
            speaker_id = f"SPEAKER_{cluster_labels[i] - 1:02d}"
            segments.append({
                "speakerId": speaker_id,
                "start": round(start, 3),
                "end": round(end, 3),
                "confidence": 0.7  # Lower confidence for fallback method
            })

        print_progress(85, "Merging adjacent segments...")

        # Merge adjacent segments with same speaker
        merged = []
        for segment in segments:
            if merged and merged[-1]["speakerId"] == segment["speakerId"]:
                # Check if gap is small enough to merge
                gap = segment["start"] - merged[-1]["end"]
                if gap < 0.3:  # 300ms gap tolerance
                    merged[-1]["end"] = segment["end"]
                    continue
            merged.append(segment)

        return merged

    except Exception as e:
        print(f"Fallback diarization failed: {e}", file=sys.stderr)
        raise

def main():
    parser = argparse.ArgumentParser(description="Speaker diarization for AutoPod Free")
    parser.add_argument("--audio", required=True, help="Path to audio file")
    parser.add_argument("--num-speakers", type=int, default=None, help="Expected number of speakers")
    parser.add_argument("--output-format", choices=["json", "rttm"], default="json", help="Output format")
    parser.add_argument("--silence-threshold", type=float, default=-40, help="Silence threshold in dB")
    parser.add_argument("--min-silence-duration", type=float, default=0.4, help="Minimum silence duration")
    parser.add_argument("--auth-token", default=None, help="HuggingFace auth token for pyannote models")

    args = parser.parse_args()

    # Validate input
    if not os.path.exists(args.audio):
        print(f"Error: Audio file not found: {args.audio}", file=sys.stderr)
        sys.exit(1)

    print_progress(0, "Starting analysis...")

    try:
        # Run diarization
        segments = run_diarization(
            args.audio,
            num_speakers=args.num_speakers,
            use_auth_token=args.auth_token
        )

        # Detect silences
        silences = detect_silences(
            args.audio,
            threshold_db=args.silence_threshold,
            min_duration=args.min_silence_duration
        )

        # Analyze audio levels
        audio_analysis = analyze_audio_levels(args.audio)

        print_progress(90, "Finalizing results...")

        # Get duration
        import librosa
        y, sr = librosa.load(args.audio, sr=16000, mono=True)
        duration = len(y) / sr

        # Build result
        result = {
            "segments": segments,
            "silences": silences,
            "audioAnalysis": audio_analysis,
            "duration": round(duration, 3),
            "numSpeakers": len(set(s["speakerId"] for s in segments))
        }

        print_progress(100, "Complete!")
        print_result(result)

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
