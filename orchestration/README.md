# Agent Squad Orchestration Framework Integration

This directory contains the integration layer for the Agent Squad orchestration framework (via `orchestration-framework` Python package) into Chatty's TypeScript/JavaScript codebase.

## Overview

The orchestration framework provides a bridge layer that allows Chatty to optionally route messages through a Python-based multi-agent orchestration system. This enables coordination between zen and lin constructs without replacing existing processors.

## Architecture

```
User Message
    ↓
AIService.processMessage() / Conversations API
    ↓
Orchestration Bridge (TypeScript)
    ↓
Node.js Bridge Service
    ↓
Python CLI (orchestration/cli.py)
    ↓
agent_squad_manager.py
    ↓
Route to zen/lin agents
```

## Components

### Python Module

- **`agent_squad_manager.py`**: Core orchestration manager with placeholder agents for zen and lin
- **`cli.py`**: CLI entry point for Node.js bridge to call Python orchestration

### Node.js Bridge

- **`server/services/orchestrationBridge.js`**: Spawns Python subprocesses to call orchestration framework
  - `routeViaOrchestration(agentId, message, context)`: Main routing function
  - `isOrchestrationEnabled()`: Check if orchestration is enabled
  - `routeMessageWithFallback()`: Route with fallback to direct routing

### TypeScript Wrapper

- **`src/lib/orchestrationBridge.ts`**: Type-safe TypeScript interface
  - `routeMessage()`: Route message via HTTP API
  - `routeMessageWithFallback()`: Route with fallback handler
  - `isOrchestrationEnabled()`: Check orchestration status

### API Routes

- **`server/routes/orchestration.js`**: Express routes for orchestration
  - `POST /api/orchestration/route`: Route a message
  - `GET /api/orchestration/status`: Check orchestration status

## Configuration

### Enabling Orchestration

Orchestration is **disabled by default** to maintain backward compatibility. To enable:

**Environment Variable:**
```bash
export ENABLE_ORCHESTRATION=true
```

**Or in `.env` file:**
```
ENABLE_ORCHESTRATION=true
```

**Browser-side (localStorage):**
```javascript
localStorage.setItem('ENABLE_ORCHESTRATION', 'true');
```

### Per-Request Control

You can also control orchestration per-request:

**In API calls:**
```javascript
// Enable orchestration for this request
fetch('/api/conversations/thread-id/messages', {
  method: 'POST',
  body: JSON.stringify({
    message: 'Hello',
    useOrchestration: true  // Explicitly enable
  })
});

// Disable orchestration for this request
fetch('/api/conversations/thread-id/messages', {
  method: 'POST',
  body: JSON.stringify({
    message: 'Hello',
    useOrchestration: false  // Explicitly disable
  })
});
```

**In AIService:**
```typescript
await aiService.processMessage('Hello', [], {
  constructId: 'zen-001',
  useOrchestration: true  // Enable for this call
});
```

## Usage

### Basic Routing

```python
from orchestration.agent_squad_manager import route_message

# Route to zen agent
result = route_message('zen', 'Hello, how are you?')
print(result['response'])

# Route to lin agent
result = route_message('lin', 'Help me create a GPT')
print(result['response'])
```

### With Context

```python
result = route_message('zen', 'Hello', {
    'user_id': 'user123',
    'thread_id': 'thread456',
    'construct_id': 'zen-001'
})
```

### From TypeScript

```typescript
import { routeMessage } from './lib/orchestrationBridge';

const result = await routeMessage('zen', 'Hello', {
  user_id: 'user123',
  thread_id: 'thread456'
});

console.log(result.response);
```

## Integration Points

### AIService Integration

The `AIService.processMessage()` method automatically uses orchestration when:
- Orchestration is enabled (via environment variable or option)
- `constructId` is 'zen', 'zen-001', 'lin', or 'lin-001'
- Falls back to direct routing if orchestration fails or is disabled

### Conversations API Integration

The `/api/conversations/:id/messages` endpoint automatically uses orchestration when:
- Orchestration is enabled
- `constructId` in request body is zen or lin
- Falls back to direct GPT runtime processing if orchestration fails

## Fallback Behavior

The integration is designed to be **non-breaking**:

1. **When orchestration is disabled**: All requests use existing routing (zen → OptimizedZenProcessor, lin → UnifiedLinOrchestrator)

2. **When orchestration fails**: Automatically falls back to direct routing

3. **When orchestration returns error status**: Falls back to direct routing

4. **When Python bridge unavailable**: Falls back to direct routing with warning log

## Current Status

The orchestration framework currently uses **placeholder agents** that return simple responses. To fully integrate:

1. Replace `PlaceholderAgent` with actual Agent Gateway agents (requires Snowflake connection)
2. Connect orchestration responses to Chatty's existing processors
3. Add coordination logic for multi-agent scenarios

## Testing

### Test Python CLI

```bash
cd chatty
python3 -m orchestration.cli zen "test message"
```

### Test Node.js Bridge

```bash
node -e "
import('./server/services/orchestrationBridge.js').then(m => {
  m.routeViaOrchestration('zen', 'test').then(r => console.log(r));
});
"
```

### Test API Endpoint

```bash
curl -X POST http://localhost:5000/api/orchestration/route \
  -H "Content-Type: application/json" \
  -H "Cookie: auth=..." \
  -d '{"agent_id": "zen", "message": "test"}'
```

## Performance Considerations

- **Python subprocess overhead**: ~50-100ms per call
- **Timeout protection**: 5 second default timeout
- **Caching**: Not yet implemented (future enhancement)
- **Concurrent requests**: Each spawns separate Python process

## Troubleshooting

### Orchestration Not Working

1. Check if enabled: `GET /api/orchestration/status`
2. Check Python installation: `python3 --version`
3. Check package installation: `pip3 list | grep orchestration-framework`
4. Check logs for Python subprocess errors

### Python Import Errors

If you see import errors, ensure:
- Python path includes chatty root directory
- `orchestration-framework` package is installed
- Virtual environment is activated (if using one)

### Timeout Errors

If orchestration times out:
- Check Python process isn't hanging
- Increase timeout in `orchestrationBridge.js` (default: 5000ms)
- Check system resources

## Future Enhancements

- [ ] Replace placeholder agents with full Agent Gateway integration
- [ ] Add caching layer for orchestration responses
- [ ] Implement async/await for Agent Gateway agents
- [ ] Add metrics and monitoring
- [ ] Support for additional agents beyond zen/lin
- [ ] Coordination logic for multi-agent scenarios

## Related Files

- `server/services/orchestrationBridge.js` - Node.js bridge
- `src/lib/orchestrationBridge.ts` - TypeScript wrapper
- `server/routes/orchestration.js` - API routes
- `src/lib/aiService.ts` - AIService integration
- `server/routes/conversations.js` - Conversations API integration

