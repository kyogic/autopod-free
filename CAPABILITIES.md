# Capabilities vs Limitations

This document provides an honest assessment of what AutoPod Free can and cannot do, compared to the commercial AutoPod plugin.

## Feature Comparison

| Feature | AutoPod (Commercial) | AutoPod Free | Notes |
|---------|---------------------|--------------|-------|
| Speaker detection | Yes | Yes | Uses pyannote.audio |
| Multi-speaker support | 2-10 speakers | 2-6 speakers | Accuracy decreases with more speakers |
| Automatic camera switching | Yes | Yes | Different implementation (see below) |
| Silence removal | Yes | Yes | RMS/energy-based detection |
| Audio leveling | Yes | Partial | Volume effect, not true normalization |
| Multicam sequence editing | Yes | No | Uses flattened clips instead |
| Social media presets | Yes | No | Manual settings only |
| Jump cut mode | Yes | No | Not implemented |
| Waveform analysis | Yes | Partial | Uses ffmpeg analysis |
| GPU acceleration | Yes | Partial | PyTorch uses GPU if available |
| Cloud processing | No | No | Both are local |
| License | Commercial | MIT (Free) | |

## What Works Well

### Speaker Diarization
- Accurately detects 2-4 speakers in good audio conditions
- Works with podcast-style content (minimal overlap)
- Provides confidence scores for each detection

### Camera Switching
- Correctly maps speakers to cameras
- Respects minimum cut duration settings
- Handles speaker changes with configurable hold times

### Silence Removal
- Accurately detects silent regions
- Configurable threshold and duration
- Preserves natural pauses with padding

## Known Limitations

### Multicam Implementation

**Commercial AutoPod**: Works with Premiere's native multicam sequences, switching angles within the multicam clip.

**AutoPod Free**: Cannot programmatically switch multicam angles via the UXP API. Instead, it places individual camera clips on the timeline as standard edits.

**Impact**:
- Result is a regular sequence, not a multicam sequence
- You cannot use Premiere's multicam controls to adjust angles after
- Individual clips are easier to fine-tune manually

**Workaround**: After editing, you can select the clips and use "Create Multi-Camera Source Sequence" if needed.

### Audio Leveling

**Commercial AutoPod**: May use advanced loudness processing.

**AutoPod Free**:
- Measures loudness using ffmpeg (LUFS measurement)
- Applies Volume effect with calculated gain adjustment
- Does not perform true integrated loudness normalization
- Limiter effect application may vary by Premiere version

**Impact**:
- Results are approximate, not broadcast-precise
- User should verify levels manually
- Complex dynamics may not be properly handled

### Speaker Detection Accuracy

Factors that reduce accuracy:
- Background music or noise
- Speakers with similar voices
- Significant cross-talk or overlapping speech
- Poor microphone quality
- More than 4 speakers

The fallback diarization method (used when pyannote is unavailable) is less accurate than the primary method.

### Real-time Preview

**Not available**: Unlike some commercial tools, there is no real-time preview of the edited sequence. You must apply edits to see the result.

**Workaround**: Use "Preview (Markers Only)" to see cut points as sequence markers before applying.

### Effect Application

Some audio effects may not be available or may behave differently depending on:
- Premiere Pro version
- Installed effect plugins
- System locale (effect names may vary)

The Volume effect should work universally, but the Hard Limiter may not be available in all configurations.

## API Limitations

These are fundamental limitations of the Premiere Pro UXP API:

| What We Wanted | API Reality | Our Solution |
|----------------|-------------|--------------|
| Switch multicam angles | Not exposed in API | Use individual clips |
| Set clip gain (dB value) | Not directly available | Apply Volume effect |
| Create multicam source | Not available | User creates manually |
| Access rendered waveforms | Not available | Extract audio via ffmpeg |
| Batch process effects | Limited | Process clips sequentially |
| True loudness normalization | Not built-in | External measurement + Volume |

## Performance Expectations

| Content Duration | Analysis Time | Notes |
|------------------|---------------|-------|
| 10 minutes | 30-60 seconds | GPU recommended |
| 30 minutes | 1-3 minutes | |
| 1 hour | 3-6 minutes | CPU-only may take longer |
| 2+ hours | 6-15 minutes | Consider splitting |

Analysis time depends on:
- GPU availability (CUDA)
- Number of speakers
- Audio quality
- System specifications

## When to Use Commercial AutoPod Instead

Consider the commercial AutoPod if you:
- Need multicam angle switching (not flattened clips)
- Process many videos and need speed
- Need broadcast-precise loudness
- Want jump cut mode for social content
- Need official support

## When AutoPod Free Works Great

AutoPod Free is ideal if you:
- Edit occasional podcast/interview content
- Want free, open-source software
- Don't mind flattened clips (often easier to edit anyway)
- Are comfortable with some manual adjustment
- Want to modify the code for your workflow

## Roadmap (Potential Future Features)

These are not guaranteed, but are technically feasible:
- [ ] Jump cut mode
- [ ] Reaction shot frequency controls
- [ ] Better crosstalk handling
- [ ] Integration with transcription (WhisperX)
- [ ] Preset management
- [ ] Batch processing multiple sequences
