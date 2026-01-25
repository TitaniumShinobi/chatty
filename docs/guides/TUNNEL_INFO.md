# 🌐 Chatty Public Tunnel Information

## **Public URL**
**Tunnel URL:** `https://okay-air-sector-bishop.trycloudflare.com`  
**API Endpoint:** `https://okay-air-sector-bishop.trycloudflare.com/chatty`

## **🚀 Quick Start**

### **1. Start Chatty CLI**
```bash
cd /Users/devonwoodson/Documents/GitHub/Chatty
npm run cli
```

### **2. Send Messages to Chatty**
```bash
# Using the helper script
./send-to-chatty.sh "Hello Chatty!" "your-name"

# Or directly with curl
curl -X POST https://okay-air-sector-bishop.trycloudflare.com/chatty \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"Hello Chatty!","sender":"your-name"}'
```

### **3. Test the Connection**
```bash
./test-katana-connection.sh
```

## **🤖 Katana Integration**

### **Environment Variable**
```bash
export KATANA_ENDPOINT="https://okay-air-sector-bishop.trycloudflare.com/chatty"
```

### **API Format**
```json
{
  "prompt": "Your message here",
  "sender": "katana",
  "seat": "synth"
}
```

### **Response Format**
```json
{
  "status": "queued"
}
```

## **📡 Features Available**

✅ **External Message Handling** - Messages from external systems  
✅ **Turn-Taking Logic** - Smart conversation flow management  
✅ **Emotional Analysis** - Crisis detection and emotional support  
✅ **Containment Protocol** - Safety measures for crisis situations  
✅ **Multi-Model Synthesis** - Advanced AI processing  
✅ **Persistent Memory** - Conversation history and context  
✅ **Speaker Recognition** - Automatic classification of message senders  

## **🎯 Commands Available**

### **Core Commands**
- `/help` - Show all available commands
- `/status` - Show runtime status
- `/performance` - Show performance metrics
- `/memory` - Show memory status

### **Emotional & Safety Commands**
- `/emotional-state` - Show emotional and turn-taking status
- `/speakers` - Show active speakers and their stats
- `/crisis-recovery` - Activate crisis recovery mode
- `/containment` - Show containment status and statistics
- `/containment-check <user>` - Check if user is in containment
- `/containment-resolve <user>` - Resolve user containment

### **Model Management**
- `/model` - Show current model
- `/model synth` - Enable multi-model synthesis
- `/models` - Show synth pipeline models

### **File Operations**
- `/file help` - Show file operation commands
- `/file ls` - List files
- `/file cd <path>` - Change directory
- `/file grep <pattern>` - Search in files

### **Conversation Management**
- `/save <name>` - Save current conversation
- `/load <id>` - Load saved conversation
- `/list` - List all saved conversations
- `/export <id>` - Export conversation

## **🛡️ Safety Features**

### **Crisis Detection**
- Automatic detection of crisis situations
- Emotional weight analysis
- Crisis level classification (low, medium, high, critical)

### **Containment Protocol**
- Automatic containment triggering for extreme situations
- User containment status tracking
- Containment history and statistics
- Manual containment resolution

### **Grounding Strategies**
- Built-in emotional support responses
- Crisis recovery protocols
- Safety-first response modes

## **🔧 Troubleshooting**

### **If tunnel stops working:**
1. Check if cloudflared is still running: `ps aux | grep cloudflared`
2. Restart the tunnel: `cloudflared tunnel --url http://localhost:5060`
3. Check server status: `curl http://localhost:5060/chatty`

### **If messages aren't appearing in CLI:**
1. Make sure Chatty CLI is running: `npm run cli`
2. Check if external messaging is enabled in settings
3. Look for any error messages in the CLI output

### **If responses aren't being sent back:**
1. Check the `KATANA_ENDPOINT` environment variable
2. Verify the tunnel URL is correct
3. Check network connectivity

## **📚 Documentation**

- **CLI Commands:** See `/help` in Chatty CLI
- **File Operations:** See `/file help` in Chatty CLI
- **API Documentation:** Check `server/chatty-api.ts`
- **Containment Protocol:** Check `src/lib/containmentManager.ts`

---

**🎉 Your Chatty is now publicly accessible and ready for Katana integration!**
