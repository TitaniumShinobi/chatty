# Chatty Local Launcher Rubric

This rubric defines the pass/fail standard for the operator-facing `chatty` command.

## Purpose

`chatty` is an operator command, not a raw dev command.

Its job is to:

1. reuse or start the local app
2. open the browser
3. print the short success line
4. avoid making raw dev logs the primary terminal UX

## Required behavior

### Shell binding

- `chatty` must resolve to a shell function from [`~/.zshrc`](/Users/devonwoodson/.zshrc)
- that function must invoke [`scripts/open-chatty-standalone.sh`](../../scripts/open-chatty-standalone.sh) with `bash`
- `chatty` must not resolve to `repo_up "chatty"`

### Launcher behavior

- if `5173` is already serving Chatty, reuse it
- if Chatty is not already live, start the existing background runtime path
- wait for the frontend on `5173` and backend health on `5050`
- open the default browser to `http://localhost:5173`
- print `Chatty is running at http://localhost:5173`

### Raw dev separation

- `npm run dev`
- `npm run dev:full`

These remain the terminal-first debugging paths.

They are not the reference UX for `chatty`.

## Failure signatures

Any of the following is a rubric violation:

- `chatty` prints `> chatty@1.0.0 dev:full` as the primary terminal UX
- `chatty` never opens the browser
- `chatty` shows raw concurrent Vite/server logs instead of a short success line
- `type chatty` reports an alias instead of a shell function
- the shell shows `BASH_SOURCE[0]: parameter not set`

## Acceptance checklist

- `type chatty` reports a shell function
- `chatty` from a fresh shell opens `http://localhost:5173`
- a second `chatty` run reuses the existing app
- `chatty` prints the success line
- `npm run dev` still behaves as raw frontend startup
- `npm run dev:full` still behaves as raw full-stack startup
