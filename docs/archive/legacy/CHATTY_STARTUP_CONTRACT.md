# Chatty Startup Contract

This document defines the canonical startup behavior for launching Chatty in a browser during local development.

If shell behavior, launcher scripts, and product docs disagree, this file is the contract.

## Canonical operator behavior

Typing `chatty` in a terminal should:

1. start Chatty on `http://localhost:5173` if it is not already reachable
2. reuse the existing local Chatty process if the app is already live
3. ensure the paired backend on `5050` is healthy before reporting success
4. open the default browser to `http://localhost:5173`
5. print:

```text
Chatty is running at http://localhost:5173
```

It should not dump the raw dev-server log into the user shell as the primary behavior of the `chatty` command.

Raw repo commands stay terminal-first:

```bash
npm run dev
npm run dev:full
```

## Canonical launcher chain

The expected local launcher chain is:

1. shell command `chatty`
2. shell function in [`~/.zshrc`](/Users/devonwoodson/.zshrc)
3. launcher script [`scripts/open-chatty-standalone.sh`](../scripts/open-chatty-standalone.sh)
4. background runtime command `npm run runtime:up`
5. supervisor [`scripts/keep-running.sh`](../scripts/keep-running.sh)
6. raw repo processes `npm run dev` and `npm run server`

Recommended shell function:

```zsh
chatty() {
  /bin/bash "/Users/devonwoodson/Library/Mobile Documents/com~apple~CloudDocs/Documents/GitHub/chatty/scripts/open-chatty-standalone.sh" "$@"
}
```

## Required port contract

- `5173` = Chatty frontend
- `5050` = Chatty backend API

The operator-facing `chatty` command is about the browser entrypoint on `5173`, but it should only report success once the backend is healthy too.

## Anti-regression rules

The following are regressions:

- `chatty` resolves to the auto-generated `repo_up "chatty"` alias instead of the launcher function
- typing `chatty` drops into raw `npm run dev:full` logs as the primary UX
- typing `chatty` does not open the browser
- typing `chatty` does not print `Chatty is running at http://localhost:5173`
- the launcher stops checking or reusing the existing app on `5173`
- the launcher script is invoked from zsh instead of bash and emits a `BASH_SOURCE[0]: parameter not set` warning

## Known shell failure mode

[`~/.zshrc`](/Users/devonwoodson/.zshrc) auto-generates repo aliases via `repo_make_aliases`.

If that alias layer is still what your current shell has loaded, `chatty` can resolve to:

```zsh
alias chatty='repo_up "chatty"'
```

That is not the operator contract. It causes the exact wrong UX: raw `npm run dev:full` output in the terminal, no browser-open behavior, and no success line.

The launcher function defined later in `~/.zshrc` must win.

## Recovery rule

If `chatty` still behaves like the raw repo alias:

1. reload your shell with `source ~/.zshrc` or open a fresh terminal window
2. confirm with `type chatty`
3. use the direct fallback command if needed:

```bash
/bin/bash "/Users/devonwoodson/Library/Mobile Documents/com~apple~CloudDocs/Documents/GitHub/chatty/scripts/open-chatty-standalone.sh"
```

## Developer checklist

If you change local startup behavior, verify:

1. `chatty` from a fresh shell opens `http://localhost:5173`
2. `chatty` prints `Chatty is running at http://localhost:5173`
3. running `chatty` again reuses the existing app instead of spawning duplicates
4. `type chatty` reports a shell function from `~/.zshrc`, not a repo alias
5. `npm run dev` still works as the raw frontend path
6. `npm run dev:full` still works as the raw full-stack path
7. docs in `README.md`, `README-PERSIST.md`, this file, and the launcher rubric stay aligned
