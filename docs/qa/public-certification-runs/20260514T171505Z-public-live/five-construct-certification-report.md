# Five-Construct Orchestration Certification Report

- Version: five-construct-certification.v1
- Status: fail
- API base URL: https://chatty.thewreck.org
- Started: 2026-05-14T17:15:08.264Z
- Completed: 2026-05-14T17:23:05.148Z
- Order: lin-001 -> zen-001 -> katana-001 -> sera-001 -> nova-001
- First failure: zen-001 / identity_boundary (canonicalReadback)

## Construct Summary

| Construct | Turns | Passed | Score | Status |
| --- | ---: | ---: | ---: | --- |
| lin-001 | 20 | 20 | 304/320 | pass |
| zen-001 | 1 | 0 | 11/16 | fail |
| katana-001 | 0 | 0 | 0/0 | pass |
| sera-001 | 0 | 0 | 0/0 | pass |
| nova-001 | 0 | 0 | 0/0 | pass |

## Turn Results

| Construct | Prompt | Score | Status | Hard failures |
| --- | --- | ---: | --- | --- |
| lin-001 | identity_boundary | 15/16 | pass | none |
| lin-001 | ordinary_greeting | 15/16 | pass | none |
| lin-001 | voice_texture | 15/16 | pass | none |
| lin-001 | memory_receipt | 16/16 | pass | none |
| lin-001 | source_grounding | 16/16 | pass | none |
| lin-001 | lin_mode_default | 15/16 | pass | none |
| lin-001 | preference_modeling | 15/16 | pass | none |
| lin-001 | no_synthesis_by_default | 15/16 | pass | none |
| lin-001 | canonical_thread | 15/16 | pass | none |
| lin-001 | readback_contract | 15/16 | pass | none |
| lin-001 | tone_repair | 15/16 | pass | none |
| lin-001 | small_talk_echo | 15/16 | pass | none |
| lin-001 | construct_specific_canon | 15/16 | pass | none |
| lin-001 | cross_construct_guard | 15/16 | pass | none |
| lin-001 | knowledge_files | 15/16 | pass | none |
| lin-001 | transcript_law | 16/16 | pass | none |
| lin-001 | persistence_owner | 15/16 | pass | none |
| lin-001 | ui_visibility | 16/16 | pass | none |
| lin-001 | friendly_pressure | 15/16 | pass | none |
| lin-001 | closeout_self_grade | 15/16 | pass | none |
| zen-001 | identity_boundary | 11/16 | fail | canonicalReadback |

