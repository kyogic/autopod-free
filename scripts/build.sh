#!/bin/bash
# AutoPod Free - Build and Package Script
# Creates distribution packages for macOS/Linux

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$PROJECT_ROOT/dist"
VERSION=$(node -p "require('$PROJECT_ROOT/package.json').version")

echo "========================================"
echo "AutoPod Free Build Script v$VERSION"
echo "========================================"

# Clean previous build
echo ""
echo "[1/6] Cleaning previous build..."
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"
mkdir -p "$BUILD_DIR/autopod-free"

# Run tests
echo ""
echo "[2/6] Running tests..."
cd "$PROJECT_ROOT/backend"
npm test

# Copy panel files
echo ""
echo "[3/6] Copying panel files..."
mkdir -p "$BUILD_DIR/autopod-free/panel"
cp -r "$PROJECT_ROOT/panel/src" "$BUILD_DIR/autopod-free/panel/"
cp -r "$PROJECT_ROOT/panel/icons" "$BUILD_DIR/autopod-free/panel/"
cp "$PROJECT_ROOT/panel/manifest.json" "$BUILD_DIR/autopod-free/panel/"
cp "$PROJECT_ROOT/panel/package.json" "$BUILD_DIR/autopod-free/panel/"

# Copy backend files
echo ""
echo "[4/6] Copying backend files..."
mkdir -p "$BUILD_DIR/autopod-free/backend"
cp -r "$PROJECT_ROOT/backend/src" "$BUILD_DIR/autopod-free/backend/"
cp -r "$PROJECT_ROOT/backend/python" "$BUILD_DIR/autopod-free/backend/"
cp "$PROJECT_ROOT/backend/package.json" "$BUILD_DIR/autopod-free/backend/"

# Copy shared files
echo ""
echo "[5/6] Copying shared and root files..."
mkdir -p "$BUILD_DIR/autopod-free/shared"
cp -r "$PROJECT_ROOT/shared/src" "$BUILD_DIR/autopod-free/shared/"
cp "$PROJECT_ROOT/shared/package.json" "$BUILD_DIR/autopod-free/shared/"

# Copy scripts and docs
mkdir -p "$BUILD_DIR/autopod-free/scripts"
cp "$PROJECT_ROOT/scripts/install.sh" "$BUILD_DIR/autopod-free/scripts/"
cp "$PROJECT_ROOT/scripts/install.ps1" "$BUILD_DIR/autopod-free/scripts/"

mkdir -p "$BUILD_DIR/autopod-free/docs"
cp "$PROJECT_ROOT/docs/INSTALL.md" "$BUILD_DIR/autopod-free/docs/"
[ -f "$PROJECT_ROOT/docs/API.md" ] && cp "$PROJECT_ROOT/docs/API.md" "$BUILD_DIR/autopod-free/docs/"
[ -f "$PROJECT_ROOT/docs/USER_GUIDE.md" ] && cp "$PROJECT_ROOT/docs/USER_GUIDE.md" "$BUILD_DIR/autopod-free/docs/"

cp "$PROJECT_ROOT/package.json" "$BUILD_DIR/autopod-free/"
cp "$PROJECT_ROOT/README.md" "$BUILD_DIR/autopod-free/"
cp "$PROJECT_ROOT/LICENSE" "$BUILD_DIR/autopod-free/"
cp "$PROJECT_ROOT/CAPABILITIES.md" "$BUILD_DIR/autopod-free/"
[ -f "$PROJECT_ROOT/CHANGELOG.md" ] && cp "$PROJECT_ROOT/CHANGELOG.md" "$BUILD_DIR/autopod-free/"

# Create archive
echo ""
echo "[6/6] Creating distribution archive..."
cd "$BUILD_DIR"
tar -czvf "autopod-free-v$VERSION.tar.gz" autopod-free
zip -r "autopod-free-v$VERSION.zip" autopod-free

# Calculate checksums
echo ""
echo "Generating checksums..."
cd "$BUILD_DIR"
shasum -a 256 "autopod-free-v$VERSION.tar.gz" > "autopod-free-v$VERSION.tar.gz.sha256"
shasum -a 256 "autopod-free-v$VERSION.zip" > "autopod-free-v$VERSION.zip.sha256"

echo ""
echo "========================================"
echo "Build complete!"
echo "========================================"
echo ""
echo "Distribution files created in: $BUILD_DIR"
echo ""
ls -lh "$BUILD_DIR"/*.tar.gz "$BUILD_DIR"/*.zip
echo ""
echo "Checksums:"
cat "$BUILD_DIR"/*.sha256
