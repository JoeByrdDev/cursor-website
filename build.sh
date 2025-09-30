#!/bin/bash

# Build script for Unix/Linux/macOS
# This script installs dependencies and runs the build process

echo "🚀 Starting build process for Cursor Website..."

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install Node.js and npm first."
    echo "   Visit: https://nodejs.org/"
    exit 1
fi

echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo ""
echo "🔧 Running build process..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed"
    exit 1
fi

echo ""
echo "🎉 Build completed successfully!"
echo "📁 Check the 'dist' folder for optimized files"
echo "💡 To run the production version: cd dist && node server.js"
