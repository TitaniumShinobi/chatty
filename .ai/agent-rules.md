# Agent rules for Click

> Keep the chat reactive: do not let the terminal tool hold the conversation hostage.
> This file is copied to new workspaces at login; you may also maintain `~/.ai/agent-rules.md`
> in your home directory for global application.

- Assume every `run …` command is running a long‑lived process; add `(background=true)` unless
  you specifically need its exit status.
- Never invoke TUI programs (`vim`, `top`, `less`, etc.).
- Abort any command that runs longer than 5 min without output.
- Pass secrets via environment variables or `.env` files rather than interactive prompts.
