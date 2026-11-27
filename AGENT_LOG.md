# Agent log

One entry per agent session, newest at the bottom. Be honest: what went wrong is the useful part.

<!-- Copy this block for each session:

## YYYY-MM-DD · <short title>
- Goal:
- Delegated:
- Checkpoints:
- Went wrong:
- Changed by hand:

-->
## 2026-11-16 · ClubHub app built by Claude on branch clubhub-app
- Goal: build the app from my approved plan (data, services, API, UI, Google sign-in, model feature, MCP tools, tests)
- Delegated: Claude wrote the code and 65 tests on clubhub-app (PR #1)
- Checkpoints: I approved the plan first; merged PR #1 on 27 Nov after checking it had no conflicts
- Went wrong: tools.js was not wired into my hand-written server.js
- Changed by hand: I wrote server.js (MCP protocol) and the SPEC sections myself