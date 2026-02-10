#!/bin/bash
# Start ChromaDB server for Chatty

# Check if ChromaDB is already running
if curl -s http://localhost:8000/api/v1/heartbeat > /dev/null 2>&1; then
    echo "✅ ChromaDB is already running on http://localhost:8000"
    exit 0
fi

# Try to find chroma command
CHROMA_CMD=""
if command -v chroma &> /dev/null; then
    CHROMA_CMD="chroma"
elif [ -f ~/.local/bin/chroma ]; then
    CHROMA_CMD="~/.local/bin/chroma"
elif [ -f /tmp/chromadb-venv/bin/chroma ]; then
    CHROMA_CMD="/tmp/chromadb-venv/bin/chroma"
else
    echo "❌ ChromaDB not found. Installing..."
    
    # Try Python 3.11 first (better compatibility), fallback to python3
    PYTHON_CMD=""
    if command -v python3.11 &> /dev/null; then
        PYTHON_CMD="python3.11"
    elif command -v python3 &> /dev/null; then
        PYTHON_CMD="python3"
    else
        echo "❌ Python not found"
        exit 1
    fi
    
    # Create venv and install
    $PYTHON_CMD -m venv /tmp/chromadb-venv
    /tmp/chromadb-venv/bin/pip install --upgrade pip --quiet
    /tmp/chromadb-venv/bin/pip install chromadb --quiet
    
    if [ -f /tmp/chromadb-venv/bin/chroma ]; then
        CHROMA_CMD="/tmp/chromadb-venv/bin/chroma"
        echo "✅ ChromaDB installed in /tmp/chromadb-venv"
    else
        echo "❌ Failed to install ChromaDB"
        echo "💡 Try manually: $PYTHON_CMD -m pip install chromadb"
        exit 1
    fi
fi

echo "🚀 Starting ChromaDB server on http://localhost:8000..."
$CHROMA_CMD run --host localhost --port 8000

