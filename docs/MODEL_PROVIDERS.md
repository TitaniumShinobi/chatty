# Model Providers Setup Guide

Chatty supports two model providers that can be used together for a hybrid cloud/self-hosted architecture.

## Overview

| Provider | Type | Cost Model | Best For |
|----------|------|------------|----------|
| **OpenRouter** | Cloud API | Pay-per-token | Quick setup, no infrastructure |
| **Ollama** | Self-hosted | Fixed (server cost) | High volume, full control |

---

## OpenRouter Setup (Cloud)

OpenRouter provides access to 100+ AI models via a single API. No infrastructure needed.

### 1. Get an API Key
1. Go to [openrouter.ai](https://openrouter.ai)
2. Sign up and get your API key
3. Add credits to your account

### 2. Configure Environment Variables

**For Replit:**
The Replit AI Integration handles this automatically. Just enable the OpenRouter integration.

**For other deployments (GitHub/Cloudflare/etc):**
```bash
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxx
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
```

### 3. Available Models
See `src/lib/modelProviders.ts` for the full list. Key models include:
- `openrouter:meta-llama/llama-3.1-70b-instruct` - General purpose
- `openrouter:deepseek/deepseek-coder-33b-instruct` - Coding
- `openrouter:mistralai/mistral-7b-instruct` - Creative/chat
- `openrouter:microsoft/phi-3-mini-128k-instruct` - Fast/small

---

## Ollama Setup (Self-Hosted)

Ollama runs models on your own hardware. Requires a server with sufficient RAM/VRAM.

### 1. Choose a VM Provider

| Provider | GPU Options | Starting Price |
|----------|-------------|----------------|
| [RunPod](https://runpod.io) | RTX 4090, A100 | ~$0.40/hr |
| [Vast.ai](https://vast.ai) | Various | ~$0.20/hr |
| [Lambda Labs](https://lambdalabs.com) | A100, H100 | ~$1.10/hr |
| [DigitalOcean](https://digitalocean.com) | CPU only | ~$50/mo |

### 2. Install Ollama on Your Server

```bash
# SSH into your server
ssh user@your-server-ip

# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Start Ollama server (binds to all interfaces)
OLLAMA_HOST=0.0.0.0 ollama serve
```

### 3. Pull Models You Want

```bash
# Pull commonly used models
ollama pull phi3:latest
ollama pull mistral:7b
ollama pull deepseek-coder:33b
ollama pull llama3:8b

# Verify
ollama list
```

### 4. Configure Chatty to Use Your Server

Set these environment variables in your Chatty deployment:

```bash
OLLAMA_HOST=https://your-ollama-server.com  # or http://IP:11434
OLLAMA_PORT=11434
```

### 5. Security Considerations

- Use HTTPS with a reverse proxy (nginx/caddy)
- Add authentication (basic auth or API key middleware)
- Firewall: Only allow connections from your app servers
- Consider a VPN for internal-only access

---

## Hybrid Architecture (Recommended for Production)

Combine both providers for best results:

```
┌─────────────────┐
│   User Request  │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────┐
│      Model Router               │
│  (src/lib/modelProviders.ts)    │
└────────┬──────────┬─────────────┘
         │          │
         ▼          ▼
┌────────────┐  ┌──────────────────┐
│ OpenRouter │  │ Your Ollama Pool │
│ (fallback) │  │ (primary)        │
└────────────┘  └──────────────────┘
```

### Routing Logic

Models are prefixed with their provider:
- `openrouter:model-name` → Routes to OpenRouter API
- `ollama:model-name` → Routes to your Ollama server

The router in `server/routes/linChat.js` handles this automatically.

---

## Model Naming Convention

### OpenRouter Format
```
openrouter:{provider}/{model-name}
```
Examples:
- `openrouter:meta-llama/llama-3.1-8b-instruct`
- `openrouter:mistralai/mistral-7b-instruct`

### Ollama Format
```
ollama:{model}:{size}
```
Examples:
- `ollama:phi3:latest`
- `ollama:llama3:70b`

---

## Adding New Models

### To add an OpenRouter model:
1. Check availability at [openrouter.ai/models](https://openrouter.ai/models)
2. Add to `OPENROUTER_MODELS` array in `src/lib/modelProviders.ts`

### To add an Ollama model:
1. Verify it exists at [ollama.com/library](https://ollama.com/library)
2. Pull it to your server: `ollama pull model:size`
3. Add to `OLLAMA_MODELS` array in `src/lib/modelProviders.ts`

---

## Troubleshooting

### OpenRouter Issues
- **401 Unauthorized**: Check API key is set correctly
- **429 Rate Limited**: Add credits or reduce request rate
- **Model not found**: Verify model name matches OpenRouter's naming

### Ollama Issues
- **Connection refused**: Ensure Ollama server is running and accessible
- **Model not found**: Run `ollama pull model:size` on your server
- **Slow responses**: Check server resources, consider smaller model
- **Out of memory**: Model too large for your server's RAM/VRAM

---

## Cost Optimization Tips

1. **Use OpenRouter for occasional/diverse models** - No fixed cost
2. **Self-host high-volume models** - Fixed cost beats per-token at scale
3. **Use smaller models for simple tasks** - Phi-3 for smalltalk, Mistral for creative
4. **Cache common responses** - Reduce API calls for repeated queries
5. **Batch requests** - Some providers offer batch discounts

---

## Related Files

- `src/lib/modelProviders.ts` - Model constants and routing utilities
- `server/routes/linChat.js` - API endpoint that routes to providers
- `src/lib/browserSeatRunner.ts` - Browser-side seat runner
- `src/engine/seatRunner.ts` - Server-side Ollama seat runner
