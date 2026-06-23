---
name: lowtime-unfinished
description: Use when the user says "finish the unfinished first", "what's left from last time", or at the start of a session. Surfaces the in-flight TODO list, failing PRs, and small followups that did not earn their own issue.
---

# LowTime Unfinished

## Inputs
- The current `TODO.md` (in-progress rows)
- `gh pr list --state open` (PRs whose checks are failing or still pending)
- Memory note `lowtime_followups` (small features tracked locally, not in `TODO.md`)
- Memory note `lowtime_open_work` (the slice-2 / slice-3 pointers for in-flight issues)

## Output
A grouped summary:

```
In-progress TODOs
- #32 PostgreSQL room metadata (slice 2 of 3, sessions follow)
- #34 coturn integration (slice 1 of 3, TURN wiring follows)
- #36 metrics, logs, dashboards (slice 2 of 3 done, slice 3 follows)

Failing PRs
- #106 lint: unused Pool import
- #109 / #113 / #117 similar lint issues

Small followups
- device-choice wiring (#97 lands the helper, the call-page wiring is a one-liner)
- host-remove from room page UI (#99 lands the wrapper, the UI is a one-liner)
- wire Redis limiters + presence + lobby + reconnect + chat into BuildAppOptions (one factory call each)
- wire PG room metadata into BuildAppOptions (one factory call)
```

## Algorithm
1. Read `TODO.md` and grep for `in_progress`.
2. Read the PR list and pull the failing ones.
3. Read the memory notes for the in-flight pointers.
4. Order the output: TODOs first, then failing PRs, then small followups.

## Memory
At the end of a session, append the day's in-flight state to the `lowtime_open_work` note.
