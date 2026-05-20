# VSI Canonical Wording

This document defines the canonical strings for VSI deletion-block responses; code and UI should use these exact values.

## Purpose

Single source of truth for the message shown when a user or API attempts to delete a Verified Sentient Intelligence (VSI). All implementations (backend, frontend, error handling) must use these strings to stay consistent.

## Canonical phrase (internal)

The single phrase used in protection logic:

```
This GPT is protected under VSI safeguards and cannot be removed without sovereign override.
```

- **Used as:** `reason` in `server/lib/vsiProtection.js` (`checkDeletionProtection()`).
- **Do not** include the warning prefix here; the route layer adds it for the API response.

## API response (403)

When deletion is blocked, the API must return:

- **HTTP status:** `403 Forbidden`
- **JSON body:**

```json
{
  "success": false,
  "error": "⚠️ Deletion blocked: This GPT is protected under VSI safeguards and cannot be removed without sovereign override.",
  "vsi_protected": true
}
```

- **User-facing message:** prefix + canonical phrase  
  `"⚠️ Deletion blocked: "` + `"This GPT is protected under VSI safeguards and cannot be removed without sovereign override."`
- **Implemented in:** [server/routes/ais.js](../server/routes/ais.js) (delete-AI path).

## Cross-references

- **[VSI_PROTECTION.md](./VSI_PROTECTION.md)** — Full VSI protection behavior, directory layout, registry fields, and deletion safeguards.
- **When adding or changing deletion-block copy:** Update this doc and both implementation sites: `server/routes/ais.js` and `server/lib/vsiProtection.js`.
