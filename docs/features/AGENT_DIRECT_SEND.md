# Agent Direct Send

Source of truth:
- `/Users/devonwoodson/Documents/GitHub/chatty/server/routes/vvault.js`
- `/Users/devonwoodson/Documents/GitHub/chatty/server/server.js`

Supersedes:
- the earlier dated working note that captured a one-off manual verification run

## Scope

External agents can inject messages into Chatty conversation threads through backend routes without going through the browser UI.

## Current Reading

- Treat this as a real integration capability, but verify the exact route and persistence behavior against the current backend before using it operationally.
- Historical curl transcripts and one-time confirmations belong in reports or archive, not in the live feature doc.

## Operator Note

If you need a repeatable usage recipe, prefer a runbook in `docs/how-to/` tied to the active backend route surface rather than embedding dated local-session evidence in the feature page.
