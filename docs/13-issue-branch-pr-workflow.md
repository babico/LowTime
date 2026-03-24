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
- Use the GitHub issue templates when opening new work:
  - feature work: `.github/ISSUE_TEMPLATE/feature.yml`
  - defects and regressions: `.github/ISSUE_TEMPLATE/bug.yml`
- Issue templates default new issues to assignee `babico`.
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
- Push the branch to GitHub before opening the pull request.
- Set upstream tracking on first push so follow-up pushes are simple.
- Open the PR when the branch is reviewable, not only when it is perfect.
- Keep the pull request scoped to one main concern.
- Start from the GitHub pull request template so the required summary, docs, testing, and workflow checks are not skipped.
- The PR description should include:
  - what changed
  - why it changed
  - linked issue
  - tests performed
  - docs changed
  - ADR changed or added, if applicable
  - rollout or migration notes, if applicable

## 7. Push And Open The Pull Request
- Push the branch:
  - `git push -u origin <branch-name>`
- Open a PR against `main`.
- Link the issue in the PR description.
- Keep the PR title aligned with the branch scope and commit intent.
- Because `main` is protected, normal feature work should land through PRs instead of direct pushes.

## 8. Request Review
- Ask for human review through the normal GitHub review flow.
- PRs are automatically assigned to `babico` by the repository workflow.
- PRs automatically request `codex` as a reviewer through the repository workflow when GitHub accepts that reviewer account.
- If Codex GitHub review is enabled for the repository, add a PR comment:
  - `@codex review`
- Use the Codex review comment after the branch is pushed and the PR exists, so the bot can see the complete diff.
- Treat bot review as additional feedback, not a replacement for checking docs, tests, and scope yourself.

## 9. Pull Request Checklist
- The branch addresses a real issue or clearly documented task.
- The change matches the current product and architecture docs.
- Tests were added or updated where needed.
- [TODO.md](../TODO.md) reflects the current feature status.
- Source-of-truth docs were updated if behavior changed.
- API or event contract changes are reflected in [05-api-and-realtime-contracts.md](05-api-and-realtime-contracts.md).
- Data or lifecycle changes are reflected in [06-data-model-and-lifecycle.md](06-data-model-and-lifecycle.md).
- Deployment-path changes are reflected in [02-system-architecture.md](02-system-architecture.md).
- ADRs were updated if a long-lived design decision changed.
- The branch has been pushed to GitHub.
- The PR is open against `main`.
- Review has been requested, including `@codex review` when that integration is available.

## 10. Review Expectations
- Reviewers should prioritize correctness, regressions, missing tests, and docs drift.
- Authors should respond with follow-up commits instead of force-pushing away useful review history unless cleanup is explicitly needed.
- If a reviewer finds a product or architecture mismatch, update the docs or revise the implementation before merge.
- Bot comments should be triaged the same way as teammate comments: fix the problem, explain why it is safe, or document a follow-up.

## 11. Merge And Follow-Up
- Merge only after review comments are resolved and required checks pass.
- After merge:
  - confirm `main` reflects the final docs state
  - confirm [TODO.md](../TODO.md) shows the right completion state
  - close or update the linked issue
  - create follow-up issues for intentionally deferred work

## Example Flow
1. Open issue: `Add room creation endpoint`.
   Use the feature issue template in `.github/ISSUE_TEMPLATE/feature.yml`.
2. Read [05-api-and-realtime-contracts.md](05-api-and-realtime-contracts.md) and [03-room-and-user-flows.md](03-room-and-user-flows.md).
3. Create branch: `feature/room-create-api`.
4. Implement endpoint, tests, and docs updates.
5. Update [TODO.md](../TODO.md) to mark the feature `in_progress` and then `done`.
6. Push the branch to GitHub.
7. Open PR with linked issue, summary, tests, and changed docs using `.github/PULL_REQUEST_TEMPLATE.md`.
8. Comment `@codex review` if the repository has Codex review enabled.
9. Merge after review and close the issue.

## Failure Modes To Avoid
- Coding without an issue or clear task owner.
- Ignoring the GitHub issue or PR templates and leaving out required context.
- Mixing unrelated features in one branch.
- Forgetting to push the branch before asking for PR review.
- Merging code without updating the matching docs.
- Marking a feature `done` in [TODO.md](../TODO.md) before tests and docs are complete.
- Changing architecture without an ADR.
