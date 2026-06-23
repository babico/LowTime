---
name: lowtime-pr-tracker
description: Use when the user asks "what's open", "which PRs are failing", "what's the PR status", or before picking the next issue. Triggers on the keyword "PR" combined with a state question. Reads the open PRs from `gh pr list --state open` and their CI status, then writes a compact summary the user can read in one screen.
---

# LowTime PR Tracker

## Inputs
- `gh pr list --state open --json number,title,statusCheckRollup,headRefName`
- `gh pr view <number> --json statusCheckRollup` (only when the summary is ambiguous)

## Output
A compact table:

```
#   title                                     CI
101 Redis-backed rate limiters                 SUCCESS
106 PostgreSQL client + migration             FAILURE (lint: unused Pool import)
...
```

## Algorithm
1. `gh pr list --state open --json number,title,headRefName` to get the open list.
2. For each PR, `gh pr checks <number>` (or the statusCheckRollup) to get the conclusion.
3. Render one row per PR. Use `SUCCESS` / `FAILURE` / `PENDING` as the CI column. If FAILURE, include a one-line reason from `gh run view --log-failed` for the most recent failed run.
4. Sort: failing first, then pending, then passing. Within each group, oldest first.

## Memory
At the end of a session, write the compact table to the `lowtime_open_prs` memory note so the next session can resume without re-running `gh`.
