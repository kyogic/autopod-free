# AutoPod Free - Build and Package Script for Windows
# Creates distribution packages

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$BuildDir = Join-Path $ProjectRoot "dist"
$PackageJson = Get-Content (Join-Path $ProjectRoot "package.json") | ConvertFrom-Json
$Version = $PackageJson.version

Write-Host "========================================"
Write-Host "AutoPod Free Build Script v$Version"
Write-Host "========================================"

# Clean previous build
Write-Host ""
Write-Host "[1/6] Cleaning previous build..."
if (Test-Path $BuildDir) {
    Remove-Item -Recurse -Force $BuildDir
}
New-Item -ItemType Directory -Path $BuildDir | Out-Null
New-Item -ItemType Directory -Path (Join-Path $BuildDir "autopod-free") | Out-Null

# Run tests
Write-Host ""
Write-Host "[2/6] Running tests..."
Push-Location (Join-Path $ProjectRoot "backend")
npm test
if ($LASTEXITCODE -ne 0) {
    Write-Host "Tests failed!" -ForegroundColor Red
    exit 1
}
Pop-Location

# Copy panel files
Write-Host ""
Write-Host "[3/6] Copying panel files..."
$PanelDest = Join-Path $BuildDir "autopod-free\panel"
New-Item -ItemType Directory -Path $PanelDest | Out-Null
Copy-Item -Recurse (Join-Path $ProjectRoot "panel\src") $PanelDest
Copy-Item -Recurse (Join-Path $ProjectRoot "panel\icons") $PanelDest
Copy-Item (Join-Path $ProjectRoot "panel\manifest.json") $PanelDest
Copy-Item (Join-Path $ProjectRoot "panel\package.json") $PanelDest

# Copy backend files
Write-Host ""
Write-Host "[4/6] Copying backend files..."
$BackendDest = Join-Path $BuildDir "autopod-free\backend"
New-Item -ItemType Directory -Path $BackendDest | Out-Null
Copy-Item -Recurse (Join-Path $ProjectRoot "backend\src") $BackendDest
Copy-Item -Recurse (Join-Path $ProjectRoot "backend\python") $BackendDest
Copy-Item (Join-Path $ProjectRoot "backend\package.json") $BackendDest

# Copy shared files
Write-Host ""
Write-Host "[5/6] Copying shared and root files..."
$SharedDest = Join-Path $BuildDir "autopod-free\shared"
New-Item -ItemType Directory -Path $SharedDest | Out-Null
Copy-Item -Recurse (Join-Path $ProjectRoot "shared\src") $SharedDest
Copy-Item (Join-Path $ProjectRoot "shared\package.json") $SharedDest

# Copy scripts
$ScriptsDest = Join-Path $BuildDir "autopod-free\scripts"
New-Item -ItemType Directory -Path $ScriptsDest | Out-Null
Copy-Item (Join-Path $ProjectRoot "scripts\install.sh") $ScriptsDest
Copy-Item (Join-Path $ProjectRoot "scripts\install.ps1") $ScriptsDest

# Copy docs
$DocsDest = Join-Path $BuildDir "autopod-free\docs"
New-Item -ItemType Directory -Path $DocsDest | Out-Null
Copy-Item (Join-Path $ProjectRoot "docs\INSTALL.md") $DocsDest
$ApiDoc = Join-Path $ProjectRoot "docs\API.md"
if (Test-Path $ApiDoc) { Copy-Item $ApiDoc $DocsDest }
$UserGuide = Join-Path $ProjectRoot "docs\USER_GUIDE.md"
if (Test-Path $UserGuide) { Copy-Item $UserGuide $DocsDest }

# Copy root files
$DistRoot = Join-Path $BuildDir "autopod-free"
Copy-Item (Join-Path $ProjectRoot "package.json") $DistRoot
Copy-Item (Join-Path $ProjectRoot "README.md") $DistRoot
Copy-Item (Join-Path $ProjectRoot "LICENSE") $DistRoot
Copy-Item (Join-Path $ProjectRoot "CAPABILITIES.md") $DistRoot
$Changelog = Join-Path $ProjectRoot "CHANGELOG.md"
if (Test-Path $Changelog) { Copy-Item $Changelog $DistRoot }

# Create archive
Write-Host ""
Write-Host "[6/6] Creating distribution archive..."
$ZipPath = Join-Path $BuildDir "autopod-free-v$Version.zip"
Compress-Archive -Path (Join-Path $BuildDir "autopod-free") -DestinationPath $ZipPath

# Calculate checksum
Write-Host ""
Write-Host "Generating checksum..."
$Hash = Get-FileHash -Path $ZipPath -Algorithm SHA256
$HashFile = Join-Path $BuildDir "autopod-free-v$Version.zip.sha256"
"$($Hash.Hash)  autopod-free-v$Version.zip" | Out-File -FilePath $HashFile -Encoding ASCII

Write-Host ""
Write-Host "========================================"
Write-Host "Build complete!"
Write-Host "========================================"
Write-Host ""
Write-Host "Distribution files created in: $BuildDir"
Write-Host ""
Get-ChildItem $BuildDir -Filter "*.zip" | Format-Table Name, Length
Write-Host ""
Write-Host "Checksum:"
Get-Content $HashFile
