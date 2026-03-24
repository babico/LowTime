# Issue, Branch, And Pull Request Workflow

- Purpose: Give contributors a clear, repeatable path for turning an issue into a branch, a pull request, and a merged change.
- Audience: All contributors and reviewers.
- Status: Baseline
- Last Updated: 2026-03-24
- Related Docs: [Contributing](../CONTRIBUTING.md), [Implementation Tracker](../TODO.md), [Roadmap And Release Phases](12-roadmap-and-release-phases.md), [ADR Index](adr/README.md)

## Overview
LowTime should be built through small, traceable changes. Every meaningful code change should start from an issue, move through a short-lived branch, and land through a pull request that updates code, tests, docs, and tracker status together.

## 1. Start With An Issue
- Create or select an issue before writing code.
- Keep one main outcome per issue.
- Use the issue to define:
  - the problem
  - the expected behavior
  - the affected docs or subsystems
  - acceptance notes if they are already known
- Link the issue to the matching source-of-truth doc and to the related row in [TODO.md](../TODO.md) when possible.

## 2. Check The Source Of Truth
- Read the relevant product and system docs before implementation.
- Confirm whether the work changes:
  - user-visible behavior
  - API contracts
  - data model or lifecycle
  - transport or quality rules
  - deployment assumptions
- If the change affects a long-lived design decision, plan an ADR update in the same branch.

## 3. Create A Branch
- Branch from `main`.
- Use a short-lived branch.
- Recommended naming:
  - `feature/<topic>`
  - `fix/<topic>`
  - `docs/<topic>`
  - `chore/<topic>`
- Prefer issue-linked names when useful, for example:
  - `feature/12-room-create-api`
  - `fix/27-reconnect-timeout`
  - `docs/31-pr-workflow-guide`

## 4. Implement In Small Steps
- Keep the branch focused on one main issue.
- Update code, tests, and docs together.
- Update [TODO.md](../TODO.md) when feature status changes to `in_progress`, `blocked`, or `done`.
- If scope grows beyond the original issue, split the work into another issue and branch instead of hiding extra work in the same PR.

## 5. Keep The Branch Healthy
- Rebase or merge from `main` regularly if the branch lives more than a short time.
- Resolve conflicts in docs as carefully as code because the docs are part of the product.
- Avoid unrelated cleanup unless it is required for the issue.

## 6. Prepare The Pull Request
- Open the PR when the branch is reviewable, not only when it is perfect.
- Keep the pull request scoped to one main concern.
- The PR description should include:
  - what changed
  - why it changed
  - linked issue
  - tests performed
  - docs changed
  - ADR changed or added, if applicable
  - rollout or migration notes, if applicable

## 7. Pull Request Checklist
- The branch addresses a real issue or clearly documented task.
- The change matches the current product and architecture docs.
- Tests were added or updated where needed.
- [TODO.md](../TODO.md) reflects the current feature status.
- Source-of-truth docs were updated if behavior changed.
- API or event contract changes are reflected in [05-api-and-realtime-contracts.md](05-api-and-realtime-contracts.md).
- Data or lifecycle changes are reflected in [06-data-model-and-lifecycle.md](06-data-model-and-lifecycle.md).
- Deployment-path changes are reflected in [02-system-architecture.md](02-system-architecture.md).
- ADRs were updated if a long-lived design decision changed.

## 8. Review Expectations
- Reviewers should prioritize correctness, regressions, missing tests, and docs drift.
- Authors should respond with follow-up commits instead of force-pushing away useful review history unless cleanup is explicitly needed.
- If a reviewer finds a product or architecture mismatch, update the docs or revise the implementation before merge.

## 9. Merge And Follow-Up
- Merge only after review comments are resolved and required checks pass.
- After merge:
  - confirm `main` reflects the final docs state
  - confirm [TODO.md](../TODO.md) shows the right completion state
  - close or update the linked issue
  - create follow-up issues for intentionally deferred work

## Example Flow
1. Open issue: `Add room creation endpoint`.
2. Read [05-api-and-realtime-contracts.md](05-api-and-realtime-contracts.md) and [03-room-and-user-flows.md](03-room-and-user-flows.md).
3. Create branch: `feature/room-create-api`.
4. Implement endpoint, tests, and docs updates.
5. Update [TODO.md](../TODO.md) to mark the feature `in_progress` and then `done`.
6. Open PR with linked issue, summary, tests, and changed docs.
7. Merge after review and close the issue.

## Failure Modes To Avoid
- Coding without an issue or clear task owner.
- Mixing unrelated features in one branch.
- Merging code without updating the matching docs.
- Marking a feature `done` in [TODO.md](../TODO.md) before tests and docs are complete.
- Changing architecture without an ADR.
