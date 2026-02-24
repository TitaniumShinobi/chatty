# Agent rules for Click

- Never invoke TUI programs (`vim`, `top`, `less`, etc.).
- All long-running commands **must** be background=true.
- Abort any command that runs longer than 5 min without output.
- Pass secrets via environment variables or `.env` files rather than interactive prompts.
