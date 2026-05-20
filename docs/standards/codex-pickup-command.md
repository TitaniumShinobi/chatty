# Codex Pickup Command

`/pickup` is the single-command handoff target for moving the current Codex work back into Chatty.

## End Goal

Typing `/pickup` in the Chatty composer must:

1. Sync the newest non-subagent Codex rollout transcript artifact into VVAULT and require VVAULT readback of that synced file.
2. Treat the verified VVAULT readback content as the pickup source, including its newest completed assistant tail.
3. If the synced file's newest message is not the completed final assistant tail yet, stop with `CODEX_PICKUP_AWAITING_ASSISTANT_TAIL`.
4. Relay the terminal user/assistant pair from that same verified VVAULT readback content into the canonical Zen singleton thread through the existing VVAULT continuity path.
5. Require canonical VVAULT write/readback. Local transcript files are source input only and never count as continuity authority.
6. Mint a resume anchor from the imported assistant tail.
7. Send one validated continuation through `/api/vvault/message`.
8. Reload `zen-001_chat_with_zen-001` from VVAULT so the UI shows the resumed thread.

## Done Means

`/pickup` is done only when the frontend command can recover the latest Codex handoff without Devon copying a prompt, pasting a transcript, or manually constructing a resume URL.

If VVAULT write/readback fails, `/pickup` must fail closed with a visible error. It must not read a local transcript as the source of truth or continue from a local fallback.

If VVAULT sync succeeds but the synced transcript's newest message is still awaiting the assistant final, `/pickup` has done the source-evidence part of the handoff and must wait for the Codex assistant final. It must not invent or infer a tail when no completed assistant answer exists, and it must not reuse an older assistant reply from the same synced file as if it were the newest handoff tail.

## Operator Contract

- The user-facing command is `/pickup`.
- The backend endpoint is `POST /api/codex/pickup`.
- The continuation route remains `/api/vvault/message`.
- The canonical thread remains `zen-001_chat_with_zen-001`.
- The source seat in the resume anchor is `codex`.

## Continuous Sync Contract

`chatty-cli handoff --latest-codex --watch` is the operator process that makes Codex prompts and final assistant replies appear in VVAULT without pressing Force Sync. Each poll must first publish active Codex rollout source transcripts to VVAULT system files with readback proof, including pending user prompts that do not have a completed assistant final yet. Only after that source-evidence sync may the watcher relay completed user/assistant pairs into Zen continuity.

The source transcript sync has `continuityClaim: "none"`. It proves the real Codex prompt/response text is in VVAULT; it does not by itself authorize Chatty continuation.
