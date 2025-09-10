# Chatty

A modern AI chat application with beautiful interface and powerful features.

## Quick Start

### Option 1: Single Command (Recommended)
```bash
cd "/Users/devonwoodson/Documents/GitHub/Chatty"
./brain.sh
```

### Option 2: Using npm start
```bash
cd "/Users/devonwoodson/Documents/GitHub/Chatty"
npm start
```

### Option 3: Different Modes
```bash
# Development (both servers)
npm run dev:full

# Server only
npm run server

# Frontend only  
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Access the Application

Once started, open your browser to:
```
http://localhost:5173
```

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3001
- **Health Check**: http://localhost:3001/health

## Features

- **File Upload & Parsing**: Upload PDF, DOCX, TXT, MD, CSV, HTML files
- **Real-time Chat**: Modern chat interface with AI responses
- **File Analysis**: AI can analyze and discuss uploaded file contents
- **Multiple AI Models**: Support for different AI personalities
- **Modern UI**: Clean, responsive interface built with React and Tailwind CSS
