# Debug Backups (dev-only)

These endpoints are dev-only helpers to save/list/load JSON backups of a user's client state. They are gated by `NODE_ENV !== 'production'` and require an authenticated session cookie.

Endpoints (dev-only)
- POST /api/debug/save-backup
  - Body: { backup: <object>, ts?: <number>, note?: <string> }
  - Saves a JSON file under `server/debug_backups/<safeUid>-<ts>.json`.
  - Requires authentication (cookie). Response: { ok: true, file: <filename>, path: <path> }
- GET /api/debug/list-backups
  - Lists backup filenames for the authenticated user.
- GET /api/debug/load-backup/:file
  - Returns the saved backup payload for the given filename (user-scoped).

Browser usage (quick)
1) Save current conversation from the Console (runs in the page context):

```
(async () => {
  const keys = Object.keys(localStorage).filter(k => k.includes('chatty:') || k.includes('conversation') || k.includes('threads') || k.includes('chat'));
  let payload = {};
  if (keys.length) {
    keys.forEach(k => { try { payload[k] = JSON.parse(localStorage.getItem(k)); } catch (e) { payload[k] = localStorage.getItem(k); } });
  } else {
    const msgs = Array.from(document.querySelectorAll('[role="log"], .message, .chat-message, .msg, .bubble')).map(el => el.innerText || el.textContent).filter(Boolean);
    payload['dom_messages'] = msgs;
  }
  const resp = await fetch('http://localhost:5000/api/debug/save-backup', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ backup: payload, ts: Date.now(), note: 'manual-save' }), credentials: 'include'
  });
  console.log(await resp.json());
})();
```

2) List backups (curl):

```
# assumes cookie jar with session cookie set
curl -b cookieA.txt http://localhost:5000/api/debug/list-backups
```

3) Load a backup (curl):

```
curl -b cookieA.txt http://localhost:5000/api/debug/load-backup/<filename>
```

Security notes
- These endpoints are strictly dev-only and tied to the authenticated session. Do NOT enable them in production.
- Files are stored under `server/debug_backups` and should be treated as sensitive local artifacts.
