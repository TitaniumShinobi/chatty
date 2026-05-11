# Running Chatty persistently

This repository includes a small launcher to start Chatty from anywhere and keep it running.

Files:
- `bin/chatty` — operator launcher command.
- `bin/chatty-cli` — operator CLI wrapper for terminal-first use from any directory.
- `scripts/open-chatty-standalone.sh` — `code`-style local launcher: reuses an existing listener on `5173` or starts `npm run dev:full` detached, opens the browser, and prints `Chatty is running at http://localhost:5173`.
- `scripts/open-chatty-cli.sh` — CLI launcher: boots the repo Node runtime, preserves the caller directory for file ops, and stores CLI state under `~/.chatty-cli/`.
- `scripts/keep-running.sh` — lightweight supervisor already in repo.
- `launchd/com.chatty.keep-running.plist` — launchd agent (macOS) installed by the assistant.
- `docs/how-to/local-startup.md` — live browser launcher runbook.
- `docs/how-to/chatty-cli.md` — live Chatty CLI runbook.

Install a global `chatty` command (optional):

1. Make the launcher executable:

```bash
chmod +x "/Users/devonwoodson/Documents/GitHub/chatty/bin/chatty"
```

2. Symlink into a directory on your PATH (example uses `/usr/local/bin`):

```bash
ln -sf "/Users/devonwoodson/Documents/GitHub/chatty/bin/chatty" /usr/local/bin/chatty
```

After that, running `chatty` from any folder will reuse the existing local app or start `npm run dev:full` in the background, open the browser, and print the success line.

Install a global `chatty-cli` command (optional):

1. Make the wrapper executable:

```bash
chmod +x "/Users/devonwoodson/Documents/GitHub/chatty/bin/chatty-cli"
```

2. Symlink it into a directory on your PATH. On this machine, `~/.local/bin` is already on PATH:

```bash
ln -sf "/Users/devonwoodson/Documents/GitHub/chatty/bin/chatty-cli" ~/.local/bin/chatty-cli
```

If you prefer a system-wide location and have permission, `/usr/local/bin/chatty-cli` also works.

3. Or expose the same wrapper as a shell function:

```bash
unalias chatty-cli 2>/dev/null || true
chatty-cli() {
  /bin/bash "/Users/devonwoodson/Documents/GitHub/chatty/scripts/open-chatty-cli.sh" "$@"
}
```

Notes:
- The operator launcher intentionally reuses the repo's existing raw startup path, `npm run dev:full`, instead of introducing a second dev stack.
- For raw terminal-first development, keep using `npm run dev` or `npm run dev:full` directly.
- For raw Chatty CLI development, keep using `npm run cli` or `npm run terminal` directly.
- `chatty-cli` stores its settings, conversations, and local CLI database under `~/.chatty-cli/` instead of the caller directory.
- If you prefer system-level persistence, use the included `launchd` plist (macOS) or `pm2`.
- If `chatty` still resolves to the old repo alias and drops you into raw logs, reload your shell with `source ~/.zshrc` or open a fresh terminal window.
- If `chatty-cli` does not resolve to the intended wrapper, verify with `type chatty-cli` or `zsh -ic 'type chatty-cli'`.
