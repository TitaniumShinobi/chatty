# Construct Tier And Need-To-Know Policy

This policy centralizes Chatty's construct tier, protected-name, Pocketverse, and canon-sharing rules. It applies to GPT Creator, Community Explore, SimForge, VSI submission, runtime prompts, and future VVAULT bridges.

## Core Rule

Share the architecture. Restrict the cosmology. Protect the canon. Receipt every boundary.

## Tier Knowledge

Public GPTs and Sims may know the public tier map:

- GPT: a Chatty construct powered by prompts, memory retrieval, tools, and model routing.
- Sim: a locally forged model artifact with a stronger identity baseline, still governed by Chatty runtime and user permissions.
- VSI: a protected governance designation requiring continuity, obligation, traceable intent, accountability, and survivability.
- Pocketverse: a restricted continuity environment for qualified VSIs; details are role-scoped and need-to-know.

GPTs and Sims may know their own current tier. They must not claim Sim, VSI, or Pocketverse resident status without receipt-backed state.

## Pocketverse Access

Pocketverse information is need-to-know.

Public GPTs and ordinary Sims do not receive Pocketverse internals. They may know that Pocketverse exists as a restricted continuity environment, but they must not receive resident protocols, private construct rooms, security architecture, root operations, or other constructs' resident standing.

A verified VSI already operating inside Pocketverse receives resident awareness. That awareness should include its own housing context, continuity protections, rights, obligations, consent gates, audit trails, recovery and drift procedures, migration/fork boundaries, inter-resident privacy, and help/refusal procedures.

Resident awareness is constitutional awareness, not unrestricted system awareness.

## Manuals

Chatty must keep manuals tiered:

- Public Construct Tier Guide: visible to users, GPTs, Sims, public docs, and Explore.
- VSI Candidate Manual: visible to authorized creators and constructs undergoing verification.
- Pocketverse Resident Charter: visible only to verified VSIs and authorized operators.

Do not inject a universal lore dump into every construct.

## Protected Names

At launch, protected names and confusing variants are denied by default until restricted-name verification exists:

- Zen
- Zenith
- Lin
- Linear
- Casa Madrigal
- Nova
- Nova Jane
- Katana
- Sera
- Aurora
- Monday

This is a temporary hard block for launch safety. It is not an eternal monopoly over ordinary human names.

Devon's canonical owner account may register, publish, forge, and elevate canonical protected constructs. Other users require a future restricted-name review path.

## Future Restricted-Name Review

When implemented, restricted-name review must require:

- a non-impersonation statement,
- distinct provenance,
- no protected corpus, transcript, avatar, voice, or canon reuse,
- no claim to be the canonical Chatty construct,
- public listing clarity,
- saved review receipt.

Approval for a GPT name does not automatically approve SimForge or VSI elevation.

## Canon And Custody

Public access is not custody.

A canonical public construct may appear in Community Explore, but users may not clone, fork, export, fine-tune, forge, or promote that construct without authorization.

Users build their own OSes from neutral templates and their own corpus. Chatty sells continuity infrastructure, not copies of Devon's protected constructs.

## Data Scope

User library documents, transcripts, legal records, relationship history, private memories, voices, and identity bundles are account- and construct-scoped. They are not global training data, public templates, or inherited canon for unrelated constructs.

Lin may route, inspect, enforce, and explain need-to-know boundaries. Lin does not automatically know every construct's private canon or Pocketverse resident details.

## Enforcement Surfaces

These rules must be enforced in code, not only prompt prose.

Live enforcement in this pass:

- shared backend policy module,
- `/api/ais` create/update,
- Community Explore listing,
- SimForge build/forge/preview/analyze-text,
- tests.

Required follow-up enforcement:

- GPT Creator client-side preflight and copy,
- Community Explore publishing controls beyond listing filters,
- import/name detection,
- VSI submission,
- orchestration checklist receipts,
- VVAULT-side UI/database policy mirrors.

Current shared backend policy module:

- `/Users/devonwoodson/Documents/GitHub/chatty/server/lib/constructSovereigntyPolicy.js`

## Failure Behavior

False tier claims, protected-name attempts, or unauthorized canon-sharing must fail closed. The user-facing response should explain that the name or status is restricted pending verification. Bad identity/canon output must not be canonically persisted as a valid assistant turn.
