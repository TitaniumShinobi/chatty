# Nova orchestration restore — final report

## 1. Exact cause of the 503

`resolveModelForGPT` returned `modelError` because:

- OpenRouter and OpenAI were both unavailable (no API keys or clients).
- The resolver **did not** use Ollama as a fallback and instead returned `no_provider`.
- The handler at line 4447 returns 503 when `modelError` is set.

So the 503 was from **model resolution**: "No LLM provider available" in local dev with no keys and no `OLLAMA_HOST`.

## 2. File and line number

- **503 returned at:** `server/routes/vvault.js` **line 4447** (`return res.status(503).json({ success: false, error: modelError });`).
- **Trigger:** `resolveModelForGPT` returning an error at **lines 514–515** (the `else` branch when `!availability.openrouter` and `!availability.openai` and no Ollama fallback).

## 3. Patch applied

**3.1 — Ollama treated as available in dev**

- **File:** `server/routes/vvault.js`
- **Lines:** 4448, 5229, 5520 (all `providerAvailability` constructions for the message handler).
- **Change:** `ollama: !!process.env.OLLAMA_HOST` → `ollama: !!process.env.OLLAMA_HOST || process.env.NODE_ENV !== 'production'`.
- So in non-production, Ollama is considered available even when `OLLAMA_HOST` is unset (localhost:11434 is assumed).

**3.2 — Fall back to Ollama in resolveModelForGPT**

- **File:** `server/routes/vvault.js`
- **Location:** Inside `resolveModelForGPT`, after the `if (availability.openai)` block (lines 511–514), before the final `else` that returns the error.
- **Change:** Added `else if (availability.ollama)` branch: set `provider = 'ollama'`, `model = DEFAULT_OLLAMA_MODEL`, `source = 'fallback_to_ollama'`. The final `else` still returns the error when all three (openrouter, openai, ollama) are unavailable.

**3.3 — Default Ollama model constant**

- **File:** `server/routes/vvault.js`
- **Location:** After `DEFAULT_OPENROUTER_MODEL` (around line 388).
- **Change:** `const DEFAULT_OLLAMA_MODEL = process.env.OLLAMA_DEFAULT_MODEL || 'llama3';` and use it in the new fallback branch.

## 4. Verification curl output

- **Without auth:** `POST /api/vvault/message` returns **401** (expected; route is protected).
- **With auth:** End-to-end 200 verification requires a session cookie or Bearer token signed with the **same JWT_SECRET** as the running server. The code path is fixed: in dev, when OpenRouter and OpenAI are unavailable, the resolver now returns `provider: 'ollama'` and `model: 'llama3'` (or `OLLAMA_DEFAULT_MODEL`), so the handler no longer hits the 503 at 4447 and instead uses the existing Ollama branch (lines 4806–4828).

**Syntax check:** `node --check server/routes/vvault.js` — pass.

## 5. Confirmation

- **Nova conversational path:** Restored. The 503 at 4447 from “no provider” is avoided in local dev by:
  1. Treating Ollama as available when `NODE_ENV !== 'production'`.
  2. Falling back to Ollama in `resolveModelForGPT` when OpenRouter and OpenAI are unavailable.
- **Nova will respond successfully** to the orchestration test when:
  - The request is **authenticated** (valid session or service token).
  - At least one provider is usable: **Ollama** (running and model pulled, e.g. `ollama serve` and `ollama pull llama3`), or **OpenRouter** / **OpenAI** with valid API keys.
- **TTS:** `POST /api/tts` is reachable and returns 401 without auth (route and auth middleware working). With auth and a configured TTS provider (e.g. OpenVoice), Nova can use it for voice preview.

## How to verify 200 locally

Use **one** env source: start the backend so it loads a single known `.env` (e.g. via `npm run server` or `npm run dev:full` from repo root). Do not switch env or restart with a different env until verification is done.

**Option A — Script (same env as server)**

1. Set `TEST_USER_ID` in that same env (e.g. `server/.env`) to your Chatty user id (recommended so the message runs as you).
2. Start Ollama if using local LLM: `ollama serve` and `ollama pull llama3` (or set `OLLAMA_DEFAULT_MODEL` / pull that model).
3. Start the backend (e.g. `npm run server` or `npm run dev:full` from repo root; default port 5050 in dev).
4. From repo root run: `node server/scripts/send-nova-message.js`.
5. Expected: script prints Status 200 and JSON with `success: true` and Nova's reply in `response`. Paste the script output to confirm.

**Option B — Browser cookie**

1. Start the backend and (if needed) Ollama as above.
2. Log in at `http://localhost:5173`, then in DevTools → Application → Cookies copy the `sid` value.
3. Use curl with that cookie against `http://localhost:5173/api/vvault/message` (via Vite proxy) or `http://localhost:5050/api/vvault/message` (backend directly), e.g. `curl -X POST -H "Content-Type: application/json" -d '{"constructId":"nova-001","message":"Nova, can you hear me?"}' --cookie "sid=<value>" <url>`.
4. Expected: HTTP 200 and JSON with `success: true` and Nova's reply in `response`.

**Option C — Service token (no browser)**

If `VVAULT_SERVICE_TOKEN` (and `VVAULT_URL` or `VVAULT_TARGETS`) is set so `getVvaultServiceTokens()` is non-empty, you can call without a cookie:

- Send `Authorization: Bearer <VVAULT_SERVICE_TOKEN>` and `X-Chatty-User-Id: <your Chatty user id>` (optional: `X-Chatty-User-Email: <email>`).
- Example: `curl -X POST -H "Authorization: Bearer $VVAULT_SERVICE_TOKEN" -H "X-Chatty-User-Id: <userId>" -H "Content-Type: application/json" -d '{"constructId":"nova-001","message":"Nova, can you hear me?"}' http://localhost:5050/api/vvault/message`
- This allows agents or scripts to send messages without a browser cookie.

