# Contributing To LowTime

- Purpose: Define how contributors work in the repository and how docs and design decisions must be maintained with code changes.
- Audience: Engineers, technical writers, and reviewers.
- Status: Baseline
- Last Updated: 2026-03-24
- Related Docs: [README](README.md), [Docs Map](docs/00-docs-map.md), [Workflow Guide](docs/13-issue-branch-pr-workflow.md), [ADR Index](docs/adr/README.md)

## Working Agreement
- Treat the docs in this repository as part of the product, not as after-the-fact notes.
- Keep behavior docs and code changes in the same pull request whenever the change affects user flows, contracts, or operational expectations.
- Prefer small, reviewable changes over large mixed-scope branches.

## Branch And PR Conventions
- Use short-lived feature branches named `feature/<topic>`, `fix/<topic>`, or `docs/<topic>`.
- Push branches to GitHub before requesting review.
- Keep pull requests scoped to one main concern.
- Include a short summary, changed docs or ADRs, testing performed, and rollout or migration notes if needed.
- Reference any impacted source-of-truth doc directly in the pull request description.
- Use the GitHub issue and PR templates in `.github/` to keep issue and review context consistent.
- The baseline CI workflow in `.github/workflows/ci.yml` runs lint, typecheck, and build checks on pull requests and pushes to `main`.
- Issues default to assignee `babico`, and PRs are auto-routed to `babico` plus reviewer `codex` through the repository workflow.
- The repository workflow also adds an `@codex review` comment automatically when a PR opens or receives new commits.
- Follow the full issue -> branch -> pull request process in [docs/13-issue-branch-pr-workflow.md](docs/13-issue-branch-pr-workflow.md).

## Required Documentation Updates
- Update [TODO.md](TODO.md) whenever a tracked feature changes status.
- Update the relevant file in `docs/` whenever you change:
  - user-visible behavior
  - API contracts
  - data storage or lifecycle
  - media selection or quality rules
  - operational alerts, dashboards, or KPIs
- Add or update an ADR when a change alters a long-lived architecture decision.
- Do not duplicate the same decision across multiple docs; link to the source-of-truth doc or ADR instead.

## ADR Rule
- Create a new ADR when changing the default transport model, access model, persistence model, install surface, or any major quality-control policy.
- Update an existing ADR only when the original decision is still valid and needs clarified consequences or implementation notes.
- Mark superseded ADRs clearly and link the replacement.

## Review Checklist
- Confirm [TODO.md](TODO.md) reflects the current implementation status for the feature.
- Confirm the change matches the product and architecture docs.
- Confirm the branch has been pushed and the PR targets `main`.
- Confirm baseline CI checks pass unless the change is docs-only and intentionally bypasses application validation.
- Confirm review has been requested, including `@codex review` when that integration is available.
- Confirm any new public contract is documented in [docs/05-api-and-realtime-contracts.md](docs/05-api-and-realtime-contracts.md).
- Confirm any lifecycle or persistence change is documented in [docs/06-data-model-and-lifecycle.md](docs/06-data-model-and-lifecycle.md).
- Confirm any operational change is reflected in [docs/10-observability-and-operations.md](docs/10-observability-and-operations.md).
- Confirm the relevant ADR is present when architecture changed.

## Definition Of Done
- Code changes are implemented.
- Tests for the affected area are added or updated.
- [TODO.md](TODO.md) reflects the correct feature status.
- The correct source-of-truth docs are updated.
- Any necessary ADR is added or revised.
- The docs still match the real implementation.
