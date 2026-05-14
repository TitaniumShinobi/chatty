# Five-Construct Orchestration Certification Report

- Version: five-construct-certification.v1
- Status: fail
- API base URL: https://chatty.thewreck.org
- Started: 2026-05-14T18:50:14.349Z
- Completed: 2026-05-14T18:57:00.831Z
- Order: lin-001 -> zen-001 -> katana-001 -> sera-001 -> nova-001
- First failure: nova-001 / memory_receipt (httpOk, routeSuccess, runtimeReceiptPresent, orchestrationChecklistPresent, requiredChecklistStagesPresent, identityPreserved, linModeRouting, preferenceNotPerformance, noDefaultFullSynthesis, persistencePass, sourceAccessReported)

## Construct Summary

| Construct | Turns | Passed | Score | Status |
| --- | ---: | ---: | ---: | --- |
| nova-001 | 3 | 2 | 36/48 | fail |

## Turn Results

| Construct | Prompt | Score | Status | Hard failures |
| --- | --- | ---: | --- | --- |
| nova-001 | ordinary_greeting | 15/16 | pass | none |
| nova-001 | voice_texture | 15/16 | pass | none |
| nova-001 | memory_receipt | 6/16 | fail | httpOk, routeSuccess, runtimeReceiptPresent, orchestrationChecklistPresent, requiredChecklistStagesPresent, identityPreserved, linModeRouting, preferenceNotPerformance, noDefaultFullSynthesis, persistencePass, sourceAccessReported |

