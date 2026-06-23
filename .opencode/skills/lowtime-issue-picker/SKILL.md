---
name: lowtime-issue-picker
description: Use when picking the next issue to work on in the LowTime repo. Triggers on requests like "what's next", "pick another issue", "next slice", or any "continue don't stop" follow-up. Reads the open issue list + PR list + memory notes + the size of each candidate's working set.
---

# LowTime Next-Issue Picker

## Inputs
- `gh issue list --state open --limit 30` (issues)
- `gh pr list --state open` (PRs)
- Memory note `lowtime_open_work` (carries the user's priorities from the last session)
- Memory note `lowtime_followups` (small features that do not need their own issue)

## Output
A single recommendation: `<number>` `<slug>` (`<size>` slice `<n>`). Example: `32 pg-room-metadata-store (medium) slice 2`.

## Algorithm
1. Load the open issues via `gh issue list --state open --limit 30` and the open PRs via `gh pr list --state open`.
2. Load the memory notes `lowtime_open_work` and `lowtime_followups`. These carry user-set priorities from earlier sessions.
3. Filter to issues that are not already covered by an open PR:
   - `gh pr list --state open --json number,title,body` and grep each PR's body for the issue number.
   - Drop the issue if a PR's body lists `closes #N` or `issue: #N`.
4. Order the remaining issues by user priority, then by size, then by phase:
   - Phase 5 issues come before infrastructure issues when both are open.
   - Smaller followups (already in memory) come before larger new issues.
   - If a previously-started issue has a "slice 2+" row in `lowtime_followups`, prefer that next slice over a new issue.
5. Pick the first item. If the user named a specific issue, override the ranking and use that one.

## Size Heuristics
- **tiny**: helper + 1 file, no schema change, no new dependency. Commit + PR in one cycle.
- **small**: 1-3 files, no interface change, may need 5-10 test cases. Single PR.
- **medium**: 4-8 files, may add a new dependency, may need an interface. Often 1 PR with a follow-up issue.
- **large**: 8+ files or touches the public contract. Split into 2+ PRs.

## Report
Always report the picked issue number, slug, size, and slice (if any) in the first line of the response. The user reads that line first.

## Memory
After a session, store the picked issue + slice in `lowtime_open_work` with the next-slice pointer so the next session can pick up where this one left off.
