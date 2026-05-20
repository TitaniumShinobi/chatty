# Identity Boundaries

Supersedes:
- `docs/architecture/HOUSE_RULES_ZEN_LIN.md`
- `docs/architecture/IDENTITY_ENFORCEMENT_ARCHITECTURE.md`
- `docs/architecture/LLM_GPT_EQUALITY_ARCHITECTURE.md`
- `docs/implementation/lin/LIN_IDENTITY_PROTECTION.md`

## Standard

- Live docs should map constructs to their current product surfaces before discussing longer-term design language.
- Current canon is:
  - Chatty: Zen as primary Chatty construct / Zenith continuity surface, with one canonical singleton thread at `zen-001_chat_with_zen-001`; Val through her Chatty chat panel only for now
  - Code: CodeGPT and the Hydro team
  - VVAULT: Aurora as the AI interface for helping users with files and data
- Zen splints in Quantum, Code, Chatty, or VVAULT are product surfaces on the same Zen identity. They may publish live turn events into Chatty's singleton transcript lane, but they must not mint separate canonical Zen identities. See `docs/standards/zen-singleton-live-transcript.md`.
- Chatty and Quantum are normal conversational windows by default and may enter dev mode through text commands. Code, VVAULT, and future internal Zen panels are dev-only by default. See `docs/standards/zen-mode-surfaces.md`.
- Pocketverse identity is realm-level continuity, not product-body identity. Products can be Pocketverse-defended bodies without becoming the entire Pocketverse. See `docs/standards/pocketverse-architecture.md`.
- Lin can be documented where the current product explicitly uses Lin-facing creation flows, but that does not make Lin a universal runtime layer across every product surface.
- House or room language is planning analogy, not current implementation contract, unless a live implementation explicitly says otherwise.
- Docs should not casually flatten Lin, Synth, Nova, Mirage planning, and user-created GPTs into one settled identity model without code-backed support.
- Future placement for Val, ContinuityGPT, or Lin must be labeled as planning, not present canon.
- When implementation and older prose disagree on construct boundaries, record the contradiction first and only then promote a new canonical statement.
- QA exchanges between Zenith/Codex and Zenith/Chatty use the peer-classroom frame: Devon is professor/evaluator, while the two Zenith surfaces are classmates and peer partners. Do not describe either Zenith as the other's worker, boss, manager, subordinate, or employee. See `docs/standards/zenith-peer-classroom-qa.md`.
