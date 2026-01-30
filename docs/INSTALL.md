# Installation Guide

This guide walks you through installing AutoPod Free on your system.

## Prerequisites

### Required Software

1. **Adobe Premiere Pro 2025** (version 25.0 or later)
   - Must support UXP extensions
   - Download from [Adobe Creative Cloud](https://www.adobe.com/products/premiere.html)

2. **Node.js 18+**
   - Download from [nodejs.org](https://nodejs.org/)
   - Verify installation: `node --version`

3. **Python 3.8+**
   - Download from [python.org](https://www.python.org/downloads/)
   - Verify installation: `python3 --version` or `python --version`
   - Required for speaker diarization

4. **ffmpeg**
   - **macOS**: `brew install ffmpeg`
   - **Windows**: `winget install ffmpeg` or download from [ffmpeg.org](https://ffmpeg.org/download.html)
   - **Linux**: `sudo apt install ffmpeg`
   - Verify installation: `ffmpeg -version`

5. **Adobe UXP Developer Tool**
   - Download from [Adobe Developer](https://developer.adobe.com/photoshop/uxp/devtool/)
   - Required to load the panel during development

## Installation Steps

### Step 1: Clone or Download the Repository

```bash
git clone https://github.com/your-username/autopod-free.git
cd autopod-free
```

Or download and extract the ZIP file.

### Step 2: Run the Installation Script

**macOS/Linux:**
```bash
chmod +x scripts/install.sh
./scripts/install.sh
```

**Windows (PowerShell as Administrator):**
```powershell
Set-ExecutionPolicy Bypass -Scope Process
.\scripts\install.ps1
```

This script will:
- Check for required dependencies
- Install Node.js packages
- Create a Python virtual environment
- Install Python packages for diarization

### Step 3: Start the Backend Server

Open a terminal and run:

```bash
npm run backend
```

You should see:
```
========================================
  AutoPod Free Backend Service
  Running on http://localhost:3847
  WebSocket on ws://localhost:3847
========================================

Checking dependencies...
  Python: OK
  ffmpeg: OK

Ready for connections.
```

**Keep this terminal open** while using the extension.

### Step 4: Load the UXP Panel

1. Open **Adobe UXP Developer Tool**
2. Click **Add Plugin** (+ button)
3. Navigate to the `panel` folder inside your autopod-free directory
4. Select the folder and click **Open**
5. The plugin should appear in the list
6. Click **Load** to load it into Premiere Pro

### Step 5: Open in Premiere Pro

1. Open Premiere Pro
2. Go to **Window > Extensions > AutoPod Free**
3. The panel should appear

## Verifying Installation

1. The panel should show "Backend Connected" with a green dot
2. If it shows "Backend Offline":
   - Make sure the backend server is running
   - Check the terminal for any error messages
   - Verify firewall isn't blocking port 3847

## Troubleshooting

### "Python not found"

Make sure Python is in your system PATH:
- **Windows**: Check "Add Python to PATH" during installation
- **macOS/Linux**: Python 3 is usually available as `python3`

### "ffmpeg not found"

Add ffmpeg to your system PATH:
- **Windows**: Add the ffmpeg bin folder to your PATH environment variable
- **macOS**: Install via Homebrew: `brew install ffmpeg`

### "Cannot connect to backend"

1. Check if the backend is running: `npm run backend`
2. Check if port 3847 is available: `lsof -i :3847` (macOS/Linux)
3. Temporarily disable firewall to test

### "Model download failed"

Speaker diarization models are downloaded on first use. If this fails:
1. Check your internet connection
2. Try running: `python3 backend/python/diarize.py --help`
3. Models are cached in `~/.cache/huggingface/`

### UXP Panel not appearing

1. Make sure you're using Premiere Pro 2025 or later
2. Check UXP Developer Tool for error messages
3. Try reloading the plugin

## Updating

To update to a new version:

```bash
git pull origin main
npm install
cd backend/python
source venv/bin/activate  # or .\venv\Scripts\Activate.ps1 on Windows
pip install -r requirements.txt
deactivate
```

## Uninstallation

1. Remove the plugin from UXP Developer Tool
2. Stop the backend server (Ctrl+C)
3. Delete the autopod-free folder

Python packages are in a virtual environment (`backend/python/venv`) and will be deleted with the folder.
