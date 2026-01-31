# AutoPod Free - User Guide

A comprehensive guide to using AutoPod Free for automatic podcast and multi-camera editing in Adobe Premiere Pro.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Preparing Your Project](#preparing-your-project)
3. [Running Analysis](#running-analysis)
4. [Mapping Speakers to Cameras](#mapping-speakers-to-cameras)
5. [Configuring Settings](#configuring-settings)
6. [Previewing Edits](#previewing-edits)
7. [Applying Edits](#applying-edits)
8. [Fine-Tuning Results](#fine-tuning-results)
9. [Best Practices](#best-practices)
10. [Troubleshooting](#troubleshooting)

---

## Quick Start

1. **Start the backend server:**
   ```bash
   cd autopod-free/backend
   npm start
   ```

2. **Open your project in Premiere Pro**

3. **Open the AutoPod Free panel:**
   - Window > Extensions > AutoPod Free

4. **Select your sequence with synced audio/video**

5. **Click "Analyze" and wait for processing**

6. **Map speakers to cameras**

7. **Click "Apply" to generate the edited sequence**

---

## Preparing Your Project

### Sequence Setup

For best results, your Premiere Pro sequence should have:

- **Synced audio and video** - All cameras synced to the same audio source
- **Clear audio tracks** - Dialogue on dedicated tracks
- **Labeled clips** - Optional but helps identify cameras

### Recommended Timeline Structure

```
Video Track 1: Camera 1 (Host)
Video Track 2: Camera 2 (Guest)
Video Track 3: Wide shot (optional)
Audio Track 1: Main mixed audio
Audio Track 2: Host mic (optional)
Audio Track 3: Guest mic (optional)
```

### Audio Requirements

- **Sample rate:** 44.1kHz or 48kHz
- **Format:** Uncompressed or high-quality compressed
- **Quality:** Clear dialogue, minimal background noise
- **Levels:** Consistent levels across speakers

---

## Running Analysis

### Starting Analysis

1. Select your sequence in the timeline
2. Open the AutoPod Free panel
3. Click **"Analyze Audio"**

### What Gets Analyzed

The analysis process detects:

- **Speaker segments** - Who is speaking and when
- **Silence regions** - Pauses and dead air
- **Audio levels** - Overall loudness (LUFS)

### Analysis Progress

Watch the progress bar for status updates:

- **Extracting audio** (10%) - Pulling audio from sequence
- **Diarizing speakers** (10-70%) - Identifying who speaks when
- **Detecting silence** (70-85%) - Finding pauses
- **Analyzing levels** (85-100%) - Measuring loudness

Analysis typically takes 1-3 minutes for a 30-minute recording.

---

## Mapping Speakers to Cameras

After analysis completes, you'll see detected speakers listed (e.g., "Speaker 1", "Speaker 2").

### Assigning Cameras

1. For each speaker, select the corresponding camera from the dropdown
2. Camera options are based on your video tracks
3. You can assign multiple speakers to the same camera
4. Optionally set a "wide shot" camera for uncertain moments

### Tips for Mapping

- **Listen to preview** - Click the speaker label to hear a sample
- **Check confidence** - Higher confidence = more reliable detection
- **Consider content** - Think about who's the main speaker

---

## Configuring Settings

### Cut Settings

| Setting | Description | Recommended |
|---------|-------------|-------------|
| Min Cut Duration | Shortest allowed cut | 2.0 seconds |
| Camera Hold Time | Delay before switching | 1.5 seconds |
| Confidence Threshold | Speaker detection confidence | 0.7 (70%) |

**Min Cut Duration** prevents jarring rapid cuts. Increase for a calmer edit, decrease for more dynamic pacing.

**Camera Hold Time** adds stability by waiting before switching cameras. Helps avoid cuts during brief interruptions.

### Silence Removal

| Setting | Description | Recommended |
|---------|-------------|-------------|
| Enable | Toggle silence removal | On for podcasts |
| Threshold | Volume level considered silence | -40 dB |
| Min Duration | Minimum silence length to remove | 0.4 seconds |
| Padding | Audio to preserve at edges | 0.1 seconds |

**Threshold** - Lower values (e.g., -50 dB) remove only very quiet sections. Higher values (e.g., -30 dB) are more aggressive.

**Padding** - Preserves natural breathing room. Increase if edits feel too tight.

### Audio Leveling

| Setting | Description | Recommended |
|---------|-------------|-------------|
| Enable | Toggle audio leveling | On |
| Target Loudness | Target LUFS level | -16 LUFS (YouTube) |
| Apply Limiter | Prevent clipping | On |
| Limiter Ceiling | Maximum peak level | -1.0 dB |

**Target Loudness** recommendations:
- YouTube/Podcasts: -14 to -16 LUFS
- Broadcast TV: -24 LUFS
- Streaming: -14 LUFS

### Advanced Options

| Setting | Description |
|---------|-------------|
| Use Wide Shot on Low Confidence | Cut to wide when unsure |
| Enable Reaction Shots | Insert periodic reaction cuts |
| Reaction Frequency | Seconds between reactions |
| Per-Track Leveling | Adjust tracks independently |

---

## Previewing Edits

Before applying edits, preview what will change:

### Preview Mode

1. Click **"Preview"** button
2. Markers appear on your timeline:
   - **Green markers**: Camera cut points
   - **Red markers**: Silence regions to remove

### Review the Preview

- Scrub through timeline to see marker placement
- Check if cut points align with speaker changes
- Verify silence markers don't cut important content

### Clearing Preview

Click **"Clear Preview"** to remove markers without making changes.

---

## Applying Edits

### Creating the Edit

1. Review your settings and mappings
2. Click **"Apply Edits"**
3. Wait for processing (usually 10-30 seconds)

### What Happens

AutoPod Free creates a **new sequence** named "[Original] - AutoPod Edit" containing:

- Camera switches at detected speaker changes
- Silence regions removed (if enabled)
- Audio levels adjusted (if enabled)

**Your original sequence is untouched** - this is non-destructive editing.

### After Applying

1. Review the new sequence
2. Make manual adjustments as needed
3. Keep or delete the original sequence

---

## Fine-Tuning Results

### Manual Adjustments

AutoPod Free gets you 80-90% of the way there. You may want to:

- **Adjust specific cuts** - Slip/slide edits for better timing
- **Add B-roll** - Insert cutaways over jump cuts
- **Fix audio** - Address any remaining level issues
- **Add transitions** - Optional dissolves or wipes

### Re-running Analysis

If results aren't satisfactory:

1. Adjust settings (especially confidence threshold)
2. Click "Analyze" again
3. Review new speaker detection
4. Apply with updated settings

---

## Best Practices

### For Best Speaker Detection

1. **Record quality audio** - Use lavalier or shotgun mics
2. **Minimize crosstalk** - Avoid overlapping speech
3. **Consistent levels** - Keep speakers at similar volumes
4. **Reduce noise** - Clean recordings improve accuracy

### For Efficient Workflow

1. **Rough sync first** - Align all cameras before analyzing
2. **Set expectations** - AutoPod handles ~80% automatically
3. **Review before finalizing** - Always watch the result
4. **Keep originals** - Non-destructive editing means easy recovery

### For Best Results

1. **Two speakers** - Ideal for diarization accuracy
2. **Clear turn-taking** - Less crosstalk = better detection
3. **Longer recordings** - Algorithm improves with more data
4. **Test settings** - Try different thresholds on short clips first

---

## Troubleshooting

### "Backend not connected"

The backend server isn't running.

**Fix:**
```bash
cd autopod-free/backend
npm start
```

### "Analysis failed"

Common causes:
- Audio file is corrupt or unsupported
- Not enough memory
- Python dependencies missing

**Fix:**
1. Check backend console for error details
2. Try exporting audio as WAV and analyzing that
3. Verify Python environment is set up

### "No speakers detected"

The audio might be:
- Too quiet
- Too noisy
- Non-speech content

**Fix:**
1. Normalize audio levels first
2. Check audio actually contains speech
3. Try manually setting number of speakers

### "Cuts are in wrong places"

Speaker detection confidence may be low.

**Fix:**
1. Increase confidence threshold
2. Enable "Use wide shot on low confidence"
3. Reduce camera hold time for quicker switches

### "Silence removal too aggressive"

**Fix:**
1. Lower the threshold (e.g., -50 dB)
2. Increase minimum duration (e.g., 0.8s)
3. Increase padding (e.g., 0.2s)

### "Audio too quiet/loud after leveling"

**Fix:**
1. Check the original LUFS in analysis results
2. Adjust target loudness setting
3. Try per-track leveling for unbalanced sources

---

## Keyboard Shortcuts

The panel doesn't have dedicated shortcuts, but use standard Premiere shortcuts:

| Action | Windows | Mac |
|--------|---------|-----|
| Undo | Ctrl+Z | Cmd+Z |
| Play/Stop | Space | Space |
| Previous edit | Up Arrow | Up Arrow |
| Next edit | Down Arrow | Down Arrow |

---

## Getting Help

- **GitHub Issues**: Report bugs and request features
- **Documentation**: Check docs folder for detailed guides
- **Logs**: Backend logs in terminal show detailed errors

---

## Version Information

- **AutoPod Free**: v1.0.0
- **Premiere Pro**: 2025+ (v25.0)
- **UXP**: Manifest v6

For the latest updates, check the CHANGELOG.md file.
