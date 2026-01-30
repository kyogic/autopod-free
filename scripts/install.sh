#!/bin/bash
# AutoPod Free - Installation Script for macOS/Linux

set -e

echo "========================================"
echo "  AutoPod Free - Installation"
echo "========================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

# Check Node.js
echo "Checking Node.js..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    echo -e "  ${GREEN}Node.js found: $NODE_VERSION${NC}"
else
    echo -e "  ${RED}Node.js not found!${NC}"
    echo "  Please install Node.js 18+ from https://nodejs.org/"
    exit 1
fi

# Check Python
echo "Checking Python..."
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version)
    echo -e "  ${GREEN}Python found: $PYTHON_VERSION${NC}"
    PYTHON_CMD="python3"
elif command -v python &> /dev/null; then
    PYTHON_VERSION=$(python --version)
    echo -e "  ${GREEN}Python found: $PYTHON_VERSION${NC}"
    PYTHON_CMD="python"
else
    echo -e "  ${YELLOW}Python not found. Speaker diarization will not work.${NC}"
    echo "  Install Python 3.8+ from https://www.python.org/downloads/"
    PYTHON_CMD=""
fi

# Check ffmpeg
echo "Checking ffmpeg..."
if command -v ffmpeg &> /dev/null; then
    echo -e "  ${GREEN}ffmpeg found${NC}"
else
    echo -e "  ${YELLOW}ffmpeg not found. Audio processing will not work.${NC}"
    echo "  Install ffmpeg:"
    echo "    macOS: brew install ffmpeg"
    echo "    Linux: sudo apt install ffmpeg"
fi

echo ""
echo "Installing Node.js dependencies..."
npm install

if [ -n "$PYTHON_CMD" ]; then
    echo ""
    echo "Installing Python dependencies..."
    cd backend/python

    # Create virtual environment if it doesn't exist
    if [ ! -d "venv" ]; then
        echo "Creating Python virtual environment..."
        $PYTHON_CMD -m venv venv
    fi

    # Activate and install
    source venv/bin/activate
    pip install --upgrade pip
    pip install -r requirements.txt

    deactivate
    cd "$PROJECT_DIR"
fi

echo ""
echo "========================================"
echo -e "  ${GREEN}Installation Complete!${NC}"
echo "========================================"
echo ""
echo "Next steps:"
echo ""
echo "1. Start the backend server:"
echo "   npm run backend"
echo ""
echo "2. Install the UXP panel in Premiere Pro:"
echo "   - Open Adobe UXP Developer Tool"
echo "   - Click 'Add Plugin'"
echo "   - Select the 'panel' folder"
echo "   - Click 'Load'"
echo ""
echo "3. In Premiere Pro, go to:"
echo "   Window > Extensions > AutoPod Free"
echo ""
echo "For detailed instructions, see docs/INSTALL.md"
echo ""
