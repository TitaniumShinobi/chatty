# Contradictions

## Open Conflicts

- `instances/` vs `constructs/` is still mixed across docs and storage-path logic
- archived docs still contain older navigation and backend assumptions that are preserved for history, not canon
- some docs describe VVAULT file structure differently than the active path resolution code
- auth docs and auth code disagree on how much of Google, Apple, GitHub, and Microsoft support is canonical versus optional
- provider defaults and routing strategy are still mixed across model-provider docs, browser seat logic, and backend Lin routing; the critical Lin conflict is stale saved provider/model fields overriding Lin mode unless the resolver and GPT Creator normalize them to the fixed local triad

## Duplicate Surface That Must Be Reduced

- Exact duplicate docs exist in `architecture/`, `guides/`, `features/`, `debugging/`, and `infrastructure/`
- several clusters are functionally the same topic but split across guide, implementation, report, and rubric forms

## High-Risk Drift

- the archive intentionally preserves superseded docs that still contain stale local links and assumptions
- `instances/` vs `constructs/` remains the main unresolved storage-path conflict
