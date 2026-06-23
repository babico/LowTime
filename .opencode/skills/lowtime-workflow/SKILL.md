---
name: lowtime-workflow
description: Use when implementing any feature or bugfix in the LowTime repo. The project follows a strict TDD + lint + push + PR + CI-check workflow. This skill is the canonical order of operations.
---

# LowTime Workflow

## Inputs
- The picked issue (from `lowtime-issue-picker` or user-specified)
- The existing tests in the workspace (Vitest-style `node:test` for the web side, same runner for the server)

## Order
1. **Branch**. `git checkout -b feature/<slug>` (or `fix/<slug>`, `chore/<slug>`). One issue per branch.
2. **TDD**. Write the failing test first. For web code, pure helpers in `apps/web/src/<file>.ts` with sibling `<file>.test.ts`. For server code, top-level test file in `apps/server/src/<file>.test.ts` because the test runner only matches `src/*.test.ts`.
3. **GREEN**. Implement the smallest thing that makes the test pass.
4. **LINT + TYPECHECK**. `npm run check` from the repo root. Fix every warning. The web side and the server side each have their own ESLint config.
5. **COVERAGE**. Add more cases until the new behavior is fully covered.
6. **DOCS**. Update the matching source-of-truth doc in `docs/`. Update `TODO.md` row for the issue.
7. **COMMIT**. Conventional commits, one sentence, with the issue number at the end (e.g. `feat: short-lived TURN credentials (closes #116)`).
8. **PUSH**. `git push -u origin feature/<slug>`. Confirm the push.
9. **PR**. `gh pr create --base main --head feature/<slug> --title "..." --body-file <body.md>`. The body file describes the scope, the tests, and the out-of-scope items.
10. **CI WATCH**. `gh pr checks <number>` immediately, then once more a minute later. If FAILURE, fix on the same branch and push again. Do not open a new PR.
11. **MEMORY**. Append the in-flight state to `lowtime_open_work` so the next session can pick up.

## Test Conventions
- Web: pure helpers go in `apps/web/src/*.ts` with sibling `*.test.ts` using `node:test` + `node:assert/strict`. No React Testing Library. React components get covered by manual smoke tests.
- Server: top-level `apps/server/src/<file>.test.ts` (the runner only matches `src/*.test.ts`, not `src/domain/*`). Use `node:test`.
- Redis slices: ioredis-mock for tests, `ioredis` for live smoke tests.
- PG slices: `pg` for live smoke tests against the real PG at `192.168.21.2:5432` (database `lowtime`, user `lowtime`, password `123456789bA+lowtime`).
- Live tests auto-skip when the host is unreachable so `npm test` does not flake on offline machines.

## PR Conventions
- One issue per PR. The body uses `closes #N` so the issue closes on merge.
- The body lists: Summary, Why, What changed, Tests, Docs, Out of scope (deferred).
- Vendoring is OK when a PR would otherwise depend on a sibling PR that is still open. The dedup PR is a follow-up.

## Anti-patterns
- Do not use `any`. Do not use `// @ts-ignore` without a comment that explains the upstream type gap.
- Do not skip the live smoke test even if the unit tests pass. The whole point of the live tests is to catch wiring bugs.
- Do not add a new dep without first checking that a slice of the same dep already exists in the workspace. If the dep is already in `package.json` you can use it directly.
- Do not open a PR with `--no-verify`. The local hooks and the CI checks both exist for a reason.
