#!/bin/bash
set -euo pipefail

# Build the .mcpb extension bundle for Claude Desktop distribution
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
STAGE_DIR="$PROJECT_DIR/.mcpb-stage"
OUTPUT_DIR="$PROJECT_DIR/dist"

echo "Building flighty-mcp-server extension..."

# 1. Compile TypeScript
echo "Compiling TypeScript..."
cd "$PROJECT_DIR"
npm run build

# 2. Clean and create staging directory
rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR/server"

# 3. Copy manifest
cp "$PROJECT_DIR/manifest.json" "$STAGE_DIR/"

# 4. Copy compiled server files
cp "$PROJECT_DIR/build/index.js" "$STAGE_DIR/server/"
cp "$PROJECT_DIR/build/constants.js" "$STAGE_DIR/server/"
cp "$PROJECT_DIR/build/types.js" "$STAGE_DIR/server/"
cp -r "$PROJECT_DIR/build/services" "$STAGE_DIR/server/services"
cp -r "$PROJECT_DIR/build/tools" "$STAGE_DIR/server/tools"

# 5. Install production dependencies in staging using the lockfile for reproducibility
cp "$PROJECT_DIR/package.json" "$STAGE_DIR/"
cp "$PROJECT_DIR/package-lock.json" "$STAGE_DIR/"

echo "Installing production dependencies (includes native better-sqlite3)..."
cd "$STAGE_DIR"
npm ci --omit=dev 2>&1 | tail -3

# 6. Pack the extension
mkdir -p "$OUTPUT_DIR"
cd "$PROJECT_DIR"
echo "Packing extension..."
mcpb pack "$STAGE_DIR" "$OUTPUT_DIR/flighty-mcp-server.mcpb"

# 7. Clean up staging
rm -rf "$STAGE_DIR"

echo ""
echo "Extension built: $OUTPUT_DIR/flighty-mcp-server.mcpb"
echo "Distribute this file to users — they double-click to install in Claude Desktop."
