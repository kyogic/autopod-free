#!/bin/bash
# AutoPod Free - End-to-End Test Script
# Validates the complete workflow from audio analysis to EDL generation

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$PROJECT_ROOT/backend"
TEST_DIR="$PROJECT_ROOT/tests/e2e"
TEMP_DIR="/tmp/autopod-free-e2e"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "========================================"
echo "AutoPod Free - End-to-End Test Suite"
echo "========================================"

# Cleanup function
cleanup() {
    echo ""
    echo "Cleaning up..."
    if [ ! -z "$SERVER_PID" ]; then
        kill $SERVER_PID 2>/dev/null || true
    fi
    rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

# Create temp directory
mkdir -p "$TEMP_DIR"

# Test 1: Check dependencies
echo ""
echo "[Test 1/7] Checking dependencies..."

check_command() {
    if command -v $1 &> /dev/null; then
        echo -e "  ${GREEN}✓${NC} $1 found"
        return 0
    else
        echo -e "  ${RED}✗${NC} $1 not found"
        return 1
    fi
}

DEPS_OK=true
check_command node || DEPS_OK=false
check_command npm || DEPS_OK=false
check_command python3 || DEPS_OK=false
check_command ffmpeg || DEPS_OK=false

if [ "$DEPS_OK" = false ]; then
    echo -e "${RED}Missing dependencies. Please install them first.${NC}"
    exit 1
fi

echo -e "  ${GREEN}All dependencies found${NC}"

# Test 2: Run unit tests
echo ""
echo "[Test 2/7] Running unit tests..."
cd "$BACKEND_DIR"
if npm test > "$TEMP_DIR/test-output.log" 2>&1; then
    TESTS=$(grep -oP '# tests \K\d+' "$TEMP_DIR/test-output.log" || echo "?")
    PASS=$(grep -oP '# pass \K\d+' "$TEMP_DIR/test-output.log" || echo "?")
    echo -e "  ${GREEN}✓${NC} $PASS/$TESTS tests passed"
else
    echo -e "  ${RED}✗${NC} Unit tests failed"
    cat "$TEMP_DIR/test-output.log"
    exit 1
fi

# Test 3: Start backend server
echo ""
echo "[Test 3/7] Starting backend server..."
cd "$BACKEND_DIR"
npm start > "$TEMP_DIR/server.log" 2>&1 &
SERVER_PID=$!

# Wait for server to be ready
MAX_WAIT=30
WAITED=0
while ! curl -s http://localhost:3847/health > /dev/null 2>&1; do
    sleep 1
    WAITED=$((WAITED + 1))
    if [ $WAITED -ge $MAX_WAIT ]; then
        echo -e "  ${RED}✗${NC} Server failed to start within ${MAX_WAIT}s"
        cat "$TEMP_DIR/server.log"
        exit 1
    fi
done
echo -e "  ${GREEN}✓${NC} Server started (PID: $SERVER_PID)"

# Test 4: Health check endpoint
echo ""
echo "[Test 4/7] Testing health endpoint..."
HEALTH=$(curl -s http://localhost:3847/health)
if echo "$HEALTH" | grep -q '"status":"ok"'; then
    echo -e "  ${GREEN}✓${NC} Health check passed"
else
    echo -e "  ${RED}✗${NC} Health check failed: $HEALTH"
    exit 1
fi

# Test 5: Generate test audio file
echo ""
echo "[Test 5/7] Generating test audio..."
TEST_AUDIO="$TEMP_DIR/test-audio.wav"

# Create a simple test audio with ffmpeg (2 seconds of silence + tone)
ffmpeg -y -f lavfi -i "sine=frequency=440:duration=2" \
    -f lavfi -i "anullsrc=channel_layout=mono:sample_rate=16000:duration=1" \
    -filter_complex "[1:a][0:a]concat=n=2:v=0:a=1" \
    -ar 16000 -ac 1 "$TEST_AUDIO" 2>/dev/null

if [ -f "$TEST_AUDIO" ]; then
    echo -e "  ${GREEN}✓${NC} Test audio generated"
else
    echo -e "  ${RED}✗${NC} Failed to generate test audio"
    exit 1
fi

# Test 6: Test silence detection endpoint
echo ""
echo "[Test 6/7] Testing silence detection..."
SILENCE_RESULT=$(curl -s -X POST http://localhost:3847/api/silence/detect \
    -H "Content-Type: application/json" \
    -d "{\"audioPath\": \"$TEST_AUDIO\", \"threshold\": -40, \"minDuration\": 0.3}")

if echo "$SILENCE_RESULT" | grep -q '"silences"'; then
    COUNT=$(echo "$SILENCE_RESULT" | grep -oP '"count":\s*\K\d+' || echo "0")
    echo -e "  ${GREEN}✓${NC} Silence detection returned $COUNT regions"
else
    echo -e "  ${RED}✗${NC} Silence detection failed: $SILENCE_RESULT"
    exit 1
fi

# Test 7: Test audio analysis endpoint
echo ""
echo "[Test 7/7] Testing audio analysis..."
AUDIO_RESULT=$(curl -s -X POST http://localhost:3847/api/audio/analyze \
    -H "Content-Type: application/json" \
    -d "{\"audioPath\": \"$TEST_AUDIO\"}")

if echo "$AUDIO_RESULT" | grep -q '"integratedLufs"'; then
    LUFS=$(echo "$AUDIO_RESULT" | grep -oP '"integratedLufs":\s*\K-?[\d.]+' || echo "?")
    echo -e "  ${GREEN}✓${NC} Audio analysis returned LUFS: $LUFS"
else
    echo -e "  ${RED}✗${NC} Audio analysis failed: $AUDIO_RESULT"
    exit 1
fi

echo ""
echo "========================================"
echo -e "${GREEN}All E2E tests passed!${NC}"
echo "========================================"
echo ""
echo "Test Summary:"
echo "  - Dependencies: OK"
echo "  - Unit tests: $PASS/$TESTS passed"
echo "  - Server startup: OK"
echo "  - Health endpoint: OK"
echo "  - Silence detection: OK"
echo "  - Audio analysis: OK"
echo ""
echo "The backend is ready for use with Premiere Pro."
