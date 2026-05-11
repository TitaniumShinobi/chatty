# Retrieval and RAG

Source of truth:
- `/Users/devonwoodson/Documents/GitHub/chatty/src/lib`
- `/Users/devonwoodson/Documents/GitHub/chatty/server/routes/files.js`
- `/Users/devonwoodson/Documents/GitHub/chatty/server/routes/search.js`

Supersedes:
- the older consolidated RAG writeups that mixed implementation detail, verification snippets, and product positioning

## Scope

This page is the live feature entrypoint for:

- retrieval-augmented generation
- searchable file context
- chunked document understanding
- document-aware answer generation

## Current Reading

- RAG is a durable Chatty capability, not a one-off experiment.
- Older docs overstated exact implementation details in places; the runtime should be treated as authoritative for current retrieval behavior.
- Verification detail and dated implementation notes belong in reports or archive, not in the live feature surface.

## See Also

- [file-intelligence.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/features/file-intelligence.md)
- [../reference/model-providers.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/reference/model-providers.md)
