#!/bin/bash

# Export source code for Firefox Add-on submission
# This creates a clean zip with only source files needed for review

set -e

# Get current version from package.json
NAME=$(node -p "require('./package.json').name")
VERSION=$(node -p "require('./package.json').version")
OUTPUT_FILE="${NAME}-source-v${VERSION}.zip"

echo "Exporting source code for ${NAME} v${VERSION}..."

# Remove existing zip if it exists
rm -f "${OUTPUT_FILE}"

# Create the zip file directly with specified files
echo "Creating zip file: ${OUTPUT_FILE}"
zip -r "${OUTPUT_FILE}" \
  src/ \
  bin/ \
  package.json \
  tsup.config.ts \
  tsconfig.json \
  BUILD_README.md \
  $([ -f CHANGELOG.md ] && echo "CHANGELOG.md")

echo "✅ Source code exported to: ${OUTPUT_FILE}"
echo "📋 Submit this zip file to Mozilla. Zip contents:"
unzip -l "${OUTPUT_FILE}"
