![Chatty Nova](./assets/chattynova.png)

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

## Model & Seat System

Chatty CLI runs multiple local models (seats) under Ollama and blends them:

| Seat       | Model Tag              | Role                                      |
|------------|------------------------|-------------------------------------------|
| smalltalk  | `phi3:latest`          | General chat + final synthesis voice      |
| coding     | `deepseek-coder:latest`| Technical reasoning, code explanations    |
| creative   | `mistral:latest`       | Imaginative language, storytelling        |

`models.json` controls this mapping. You can override per seat with env vars e.g.
`export OLLAMA_MODEL_CODING=my-coder`.

### Slash Commands
```
/model             – show active model or "synth"
/model list        – list installed Ollama models
/model <tag>       – switch to single-model mode (e.g., deepseek)
/model synth       – enable multi-model blending (default)
```

### How Synthesis Works
1. User message is sent to the coding & creative seats in parallel.
2. Their answers are fed into a synthesis prompt for the smalltalk seat (phi-3).
3. Phi-3 returns a single cohesive reply — helper outputs are not shown to the user.

Ensure all three models are loaded:
```
ollama run phi3
ollama run deepseek-coder
ollama run mistral
```
