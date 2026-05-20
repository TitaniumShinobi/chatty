# Chatty Terminal Interface

Chatty can run as a terminal-only chatbot! This gives you a command-line interface to interact with Chatty's AI capabilities without needing a web browser.

## 🚀 Quick Start

```bash
npm run cli
# or
npm run terminal
# or
node chatty-cli.js
```

## 🎯 Features

### Full AI Integration
- **Complete AI system** - Uses the same AI services as the web version
- **Memory system** - Persistent conversation memory
- **File processing** - Load and analyze files
- **Reasoning engine** - Complex problem solving
- **Context awareness** - Understands conversation flow
- **File management** - Save/load conversations
- **Interactive terminal** - Clean, colorized interface
- **Command system** - Built-in commands for help, history, etc.
- **Conversation history** - Remembers your chat session

## 💻 Available Commands

- `/help` - Show help message
- `/clear` - Clear conversation history
- `/history` - Show conversation history
- `/memory` - Show memory status
- `/settings` - Show current settings
- `/load <file>` - Load and analyze a file
- `/save <file>` - Save conversation to file
- `/exit` or `/quit` - Exit Chatty

## 🎨 Terminal Features

### Colorized Output
- **Green** - Chatty responses and success messages
- **Cyan** - System information and help text
- **Yellow** - Warnings and commands
- **Red** - Errors and important alerts
- **Magenta** - Headers and titles
- **Gray** - Secondary information

### Interactive Interface
- **Real-time typing** - Shows "thinking..." indicator
- **Command completion** - Tab completion for commands
- **History navigation** - Arrow keys for command history
- **Graceful exit** - Ctrl+C handling

## 🔧 Usage Examples

### Basic Chat
```bash
$ npm run cli
Chatty> Hello! How are you?
Chatty: Hello! I'm Chatty, your AI assistant. How can I help you today?

Chatty> What can you do?
Chatty: I'm Chatty, a terminal-based AI assistant. Here's what I can do:
        • Answer questions - Ask me anything!
        • Help with coding - I can assist with programming problems
        • General conversation - Let's chat about anything
        • File processing - I can help analyze files
```

### Advanced Features
```bash
$ npm run cli
Chatty> /load myfile.txt
✅ Loaded file: myfile.txt
  • Lines: 150
  • Size: 4.32 KB
  • Content preview: This is the content of my file...

Chatty> /memory
Memory Status:
  • Conversations stored: 5
  • Memory enabled: Yes
  • Max history: 50
```

## 🏗️ Architecture

- **AI Integration** - Uses existing `AIService` from web version
- **Memory System** - Persistent conversation memory
- **File Processing** - Can load and analyze files
- **Fallback Mode** - Falls back to simple AI if services unavailable
- **Fast startup** - Immediate response with full capabilities

## 🚀 Integration with Web Version

The terminal version shares the same AI services as the web version:

- **Same AI Service** - Uses `src/lib/aiService.ts`
- **Same Memory System** - Uses `src/lib/memoryManager.ts`
- **Same Reasoning** - Uses `src/lib/symbolicReasoning.ts`
- **Same File Processing** - Uses `src/lib/largeFileIntelligence.ts`

## 📁 File Structure

```
chatty/
├── chatty-cli.js              # Terminal interface with full AI
├── src/lib/aiService.ts       # Shared AI services
├── src/lib/memoryManager.ts   # Shared memory system
└── package.json               # npm scripts for terminal access
```

## 🎯 Use Cases

### Development
- **Quick AI assistance** - Get help while coding
- **File analysis** - Analyze code files and documents
- **Problem solving** - Work through complex problems step by step

### System Administration
- **Terminal-based AI** - AI assistance in server environments
- **Script integration** - Embed AI in shell scripts
- **Automation** - AI-powered terminal automation

### Learning
- **Interactive learning** - Learn programming concepts
- **Code review** - Get AI feedback on code
- **Documentation** - Generate and analyze documentation

## 🔧 Customization

### Adding New Commands
Edit `chatty-advanced-cli.js` and add new cases to the `handleCommand` method:

```javascript
case '/mycommand':
  // Your command logic here
  log('Custom command executed!');
  break;
```

### Modifying AI Responses
Edit the `generateFallbackResponse` method to customize how Chatty responds to different types of messages.

### Adding File Types
Extend the `loadFile` method to handle different file types and formats.

## 🚀 Getting Started

1. **Install dependencies** (if not already done):
   ```bash
   npm install
   ```

2. **Run terminal version**:
   ```bash
   npm run cli
   ```

3. **Start chatting**:
   - Type your message and press Enter
   - Use `/help` to see available commands
   - Use `/exit` to quit

## 🎉 Enjoy Terminal Chatty!

Chatty's terminal interface gives you the full power of the AI system in a clean, fast, terminal environment. Perfect for developers, system administrators, and anyone who prefers command-line interfaces!
