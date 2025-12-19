#!/bin/bash
# Kitchen Recipe Manager - Mac/Linux Launcher
# Run this script to start the server

echo "========================================"
echo "Kitchen Recipe Manager - Starting..."
echo "========================================"
echo ""

# Check if Python 3 is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ ERROR: Python 3 is not installed!"
    echo ""
    echo "Please install Python 3:"
    echo "  Mac: brew install python3"
    echo "  Linux: sudo apt install python3"
    echo ""
    exit 1
fi

echo "✅ Python 3 found! Starting server..."
echo ""

# Start the Python server
python3 start_server.py
