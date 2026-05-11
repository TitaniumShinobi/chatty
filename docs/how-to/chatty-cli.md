# Chatty CLI

Source of truth:
- `/Users/devonwoodson/Documents/GitHub/chatty/bin/chatty-cli`
- `/Users/devonwoodson/Documents/GitHub/chatty/scripts/open-chatty-cli.sh`
- `/Users/devonwoodson/Documents/GitHub/chatty/src/cli/chatty-cli.ts`
- `/Users/devonwoodson/Documents/GitHub/chatty/package.json`

Canon:
- `chatty-cli` is the canonical orchestration and operator surface.
- Backend mode delegates construct-quality turns to the receipt-backed `/api/vvault/message` route.
- Local mode remains an explicit fallback/operator utility path, not the canonical construct-quality turn route.

## When The Prompt Is `orchestration`

Treat the one-word prompt `orchestration` as an execution-proof request, not an architecture discussion.

Required actions:

1. Verify `chatty-cli` backend mode delegates the construct turn to `/api/vvault/message`.
2. Run or add the smallest proof turn that returns `runtime_receipt` and `orchestration_checklist`.
3. Surface construct identity, provider/model truth, memory owner, persistence owner, visible output, and failed stage if any.
4. Patch only the smallest missing seam needed for `chatty-cli` to show the same receipt/checklist truth as the Chatty UI.

Do not use these as construct-quality proof:

- local files as memory truth
- `/api/lin/generate`
- AgentSquad/Python bridge defaults
- local CLI fallback mode

Required worker output:

```txt
STATUS:
ROUTE_USED:
CONSTRUCT_ID:
ORCHESTRATION_MODE:
RECEIPT_PRESENT:
CHECKLIST_PRESENT:
PERSISTENCE_OWNER:
VISIBLE_OUTPUT:
FAILED_STAGE:
FILES_CHANGED:
TESTS_RUN:
FINAL_VERDICT:
```

## Recommended Path

Use `./bin/chatty-cli` when you want the operator-facing terminal command from the repo.

Expected behavior:

1. Boot the repo's expected Node runtime when `.nvmrc` is present
2. Launch the existing Chatty CLI entrypoint
3. Keep file operations rooted to the directory where you ran `chatty-cli`
4. Store CLI settings, conversations, and the local CLI database under `~/.chatty-cli/`

## Global Exposure

You can expose the same wrapper in both supported ways:

```zsh
unalias chatty-cli 2>/dev/null || true
chatty-cli() {
  /bin/bash "/Users/devonwoodson/Documents/GitHub/chatty/scripts/open-chatty-cli.sh" "$@"
}
```

```bash
ln -sf "/Users/devonwoodson/Documents/GitHub/chatty/bin/chatty-cli" ~/.local/bin/chatty-cli
```

If you prefer a system-wide location and have permission, `/usr/local/bin/chatty-cli` is also supported.

## Raw Repo Paths

- `npm run cli`
- `npm run terminal`

These remain the raw repo-local paths and should stay terminal-first.

## Verification

- `type chatty-cli` reports a shell function when the `~/.zshrc` path is active
- `zsh -ic 'type chatty-cli'` is the clean fresh-shell proof for the shell-function path
- `chatty-cli` launched from an arbitrary directory keeps file ops rooted there
- `~/.chatty-cli/settings.json` is created instead of `./chatty-cli-settings.json`
- `~/.chatty-cli/conversations/` is created instead of `./chatty-conversations`
