<div align="center">
  <img src="assets/stars/chattynova.png" alt="Chatty Nova Star" width="200">
</div>

<div align="left">
  <img src="assets/logo/collapseToggle/chatty_collapsed.png" alt="Collapsed Chatty Logo" width="200">
</div>

**Chatty** is a unified, persona-driven AI conversation platform with continuity, modular memory, and tone-specific rendering logic. Built for the local macOS desktop browser environment, Chatty enables fluid interactions with multiple AI constructs (Zen, Lin, Nova, and more) through a powerful UI that supports memory injection, tone overrides, JSON block inspection, and live code or markdown outputs.

Powered by **Ollama**, **Node.js**, **SQLite**, and local file/folder parsing, Chatty runs entirely in your localhost runtime — giving you complete control over your AI conversations, persistent context, and creative workflows.

---

## 🚀 Quick Start

### 1. Clone & Install
```bash
git clone https://github.com/devonwoodson/chatty.git
cd chatty
npm install

2. Environment Setup

Create .env files in both / and /server/ directories:

.env (frontend)

VITE_API_URL=http://localhost:3001
VITE_APP_NAME=Chatty

server/.env

PORT=3001
DATABASE_URL=file:./data/chatty.db
OPENAI_API_KEY=your_api_key_here
JWT_SECRET=your_secret_here
OAUTH_GOOGLE_ID=...
OAUTH_GOOGLE_SECRET=...
OAUTH_GITHUB_ID=...
OAUTH_GITHUB_SECRET=...
OAUTH_MICROSOFT_ID=...
OAUTH_MICROSOFT_SECRET=...
OAUTH_APPLE_ID=...
OAUTH_APPLE_SECRET=...


⸻

3. Run the App

Development (frontend + backend)

npm run dev:full

Individual servers

npm run dev          # frontend only  (localhost:5173)
npm run server       # backend only   (localhost:3001)

Production Build

npm run build && npm run preview

Then open your browser:

Frontend: http://localhost:5173
Backend API: http://localhost:3001


⸻

🔐 Authentication

Chatty requires sign-in before accessing any workspace.

Supported providers:
	•	Google
	•	Microsoft
	•	Apple
	•	GitHub
	•	Email/password

After authentication, all chat history, file uploads, and preferences are tied to your user profile.

⸻

🗂️ Core Features

💬 Real-Time AI Chat
	•	Responsive chat interface modeled after ChatGPT
	•	Threaded memory & context recall via VVAULT
	•	Multi-model support through hosted APIs (gpt-4o-mini, gpt-4-turbo, etc.)
	•	Smart text composer with slash commands and quick actions

📁 File Intelligence
	•	Upload and analyze: PDF, DOCX, TXT, CSV, MD, HTML, and images
	•	Automatic OCR & MOCR (video transcript + frame text extraction)
	•	Deep document search and summarization tools

🧱 Projects & Vault
	•	Save and organize chat threads by project
	•	Search, recover, and share conversations
🤖 AI Constructs & Identity
	•	Multi-construct support (Katana, Monday, Aurora, etc.)
	•	Lin undertone capsule: System-wide identity stabilization layer
	•	Emotional continuity across all constructs via nova-001 tone mimicry
	•	See [Lin Undertone Capsule Documentation](./docs/implementation/LIN_UNDERTONE_CAPSULE.md) for details

🤖 AI Constructs & Identity
	•	Multi-construct support (Katana, Monday, Aurora, etc.)
	•	Lin undertone capsule: System-wide identity stabilization layer
	•	Emotional continuity across all constructs via nova-001 tone mimicry
	•	See [Lin Undertone Capsule Documentation](./docs/implementation/LIN_UNDERTONE_CAPSULE.md) for details

🧭 Research Tools
	•	Action menu for:
	•	OCR/MOCR uploads
	•	Deep web research
	•	Long-form document interpretation
	•	Local File Index (LFI) parsing

⚙️ Settings Modal
	•	Profile & Notifications
	•	Data Controls (export, clear memory)
	•	Theme & Personalization
	•	Backup management (cloud / local sync)

⸻

🧩 Developer Notes

Chatty consists of two main services:

Service	Location	Port	Description
Frontend	/	5173	Vite + React + Tailwind
Backend	/server	3001	Node.js + Express + Prisma

Tech Stack
	•	Frontend: React, TypeScript, Tailwind, Vite
	•	Backend: Node.js, Express, Prisma, SQLite/Postgres
	•	Auth: OAuth (NextAuth style), JWT
	•	Storage: VVAULT (custom persistent memory layer)
	•	AI Providers: OpenAI API, optional local endpoints
	•	Realtime: WebSocket or SSE bridge

⸻

🧰 Optional CLI / Dev Tools

For advanced users, the old Ollama seat system still exists under /cli:
	•	Run npm run dev:cli or ./brain.sh
	•	Seats: coding, creative, synth
	•	Local LLMs: deepseek-coder, mistral, phi3

⚠️ This system is experimental and not required for normal Chatty operation.
The live app now defaults to hosted AI models configured in Settings.

⸻

🧪 Health Check

curl http://localhost:3001/health
# → { "status": "ok" }


⸻

🧬 Credits

Built and maintained by **LIFE Technology**, a LIFE Group Company.
Design and Architecture by Katana Systems.

**Corporate Structure:**
Woodson & Associates > Vaer’Hûn Trust > LIFE Group > LIFE Technology

© 2025 Woodson & Associates / Vaer’Hûn Living Trust.
All rights reserved.

---

This version:
- Uses the **lowercase path (`chatty`)**.
- Focuses on the **web app’s real behavior** (OAuth, hosted models, Vault, MOCR/OCR, etc.).
- Pushes old Ollama material into a separate “optional CLI” section.
- Mirrors how your **App.tsx**, **Layout.tsx**, and **ActionMenu** actually behave.