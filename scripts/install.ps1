# AutoPod Free - Installation Script for Windows
# Run with: powershell -ExecutionPolicy Bypass -File install.ps1

$ErrorActionPreference = "Stop"

Write-Host "========================================"
Write-Host "  AutoPod Free - Installation"
Write-Host "========================================"
Write-Host ""

# Get script directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Split-Path -Parent $ScriptDir

Set-Location $ProjectDir

# Check Node.js
Write-Host "Checking Node.js..."
try {
    $NodeVersion = node -v
    Write-Host "  Node.js found: $NodeVersion" -ForegroundColor Green
} catch {
    Write-Host "  Node.js not found!" -ForegroundColor Red
    Write-Host "  Please install Node.js 18+ from https://nodejs.org/"
    exit 1
}

# Check Python
Write-Host "Checking Python..."
$PythonCmd = $null
try {
    $PythonVersion = python --version 2>&1
    Write-Host "  Python found: $PythonVersion" -ForegroundColor Green
    $PythonCmd = "python"
} catch {
    try {
        $PythonVersion = python3 --version 2>&1
        Write-Host "  Python found: $PythonVersion" -ForegroundColor Green
        $PythonCmd = "python3"
    } catch {
        Write-Host "  Python not found. Speaker diarization will not work." -ForegroundColor Yellow
        Write-Host "  Install Python 3.8+ from https://www.python.org/downloads/"
    }
}

# Check ffmpeg
Write-Host "Checking ffmpeg..."
try {
    ffmpeg -version 2>&1 | Out-Null
    Write-Host "  ffmpeg found" -ForegroundColor Green
} catch {
    Write-Host "  ffmpeg not found. Audio processing will not work." -ForegroundColor Yellow
    Write-Host "  Install ffmpeg from https://ffmpeg.org/download.html"
    Write-Host "  Or use: winget install ffmpeg"
}

Write-Host ""
Write-Host "Installing Node.js dependencies..."
npm install

if ($PythonCmd) {
    Write-Host ""
    Write-Host "Installing Python dependencies..."
    Set-Location backend\python

    # Create virtual environment if it doesn't exist
    if (-not (Test-Path "venv")) {
        Write-Host "Creating Python virtual environment..."
        & $PythonCmd -m venv venv
    }

    # Activate and install
    & .\venv\Scripts\Activate.ps1
    pip install --upgrade pip
    pip install -r requirements.txt
    deactivate

    Set-Location $ProjectDir
}

Write-Host ""
Write-Host "========================================"
Write-Host "  Installation Complete!" -ForegroundColor Green
Write-Host "========================================"
Write-Host ""
Write-Host "Next steps:"
Write-Host ""
Write-Host "1. Start the backend server:"
Write-Host "   npm run backend"
Write-Host ""
Write-Host "2. Install the UXP panel in Premiere Pro:"
Write-Host "   - Open Adobe UXP Developer Tool"
Write-Host "   - Click 'Add Plugin'"
Write-Host "   - Select the 'panel' folder"
Write-Host "   - Click 'Load'"
Write-Host ""
Write-Host "3. In Premiere Pro, go to:"
Write-Host "   Window > Extensions > AutoPod Free"
Write-Host ""
Write-Host "For detailed instructions, see docs\INSTALL.md"
Write-Host ""
