You are Cline running in the parent directory that contains multiple GitHub repos (including `chatty/`).

**Goal:** Set up a “healthy CLI + consistent agent behavior” across all repos, with repo-specific overrides allowed. Do not break existing tooling.

## 1) Create an org-wide agent standard (parent directory)

Create a folder: `.ai/`
Inside it add:

* `.ai/README.md` (what this is, how repos inherit)
* `.ai/agent-rules.md` with strict rules:

  * smallest possible changes
  * never run destructive commands without explicit approval
  * always show command + output
  * prefer `rg`, `ls`, `cat`, `git diff`, `git status`
  * never commit unless asked
  * for auth/debugging: always capture headers (`curl -i/-v`) and cookies (`-c/-b`)
  * if local server binding is ambiguous: test `127.0.0.1` vs `localhost` and check `lsof -nP -iTCP:PORT -sTCP:LISTEN`

Also create a reusable “debug pack” script at:

* `.ai/scripts/doctor.sh` (non-destructive diagnostics only)

  * prints OS, node version, ports (5173/5050), git status, and runs `curl -v` checks with short output.
  * Must exit 0 even if checks fail (so it’s safe to run).

## 2) Wire rules into repos (minimal)

For each repo in this parent directory:

* If `.vscode/` exists, ensure `.vscode/settings.json` exists and add ONLY:

  * a pointer/note to use the parent `.ai/agent-rules.md`
  * any Cline-compatible “instructions” field if supported, otherwise leave a comment for humans.
* If `.vscode/` doesn’t exist, do NOT create it unless necessary; instead add a repo root `AI_RULES.md` that says: “Follow ../.ai/agent-rules.md” (relative path) and includes repo-specific notes.

## 3) Add Chatty-specific rules (chatty/)

In `chatty/` create `AI_RULES.md` that:

* inherits parent rules
* adds: “OAuth flows must be navigations, not fetch()”
* adds: “Frontend fetches that rely on session cookies must use credentials: include”
* adds: “Prefer 127.0.0.1 over localhost if IPv6/hosts issues appear”
* includes known dev ports: FE 5173, BE 5050

## 4) Report back

Output:

* List of files created/edited (paths)
* `git diff` for each repo touched
* A 3-line “how to use this” snippet for humans

Constraints:

* No refactors.
* No new dependencies unless absolutely needed.
* Keep changes small and reversible.
