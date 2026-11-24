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

## 2026-11-24 · Agent writes the Exercise 1 MCP server (with the instructor's permission)
- Goal: finish `mcp-server/server.js` (tools/call, error answers) so the MCP self-check and the CI `mcp` job pass.
- Delegated: Exercise 1 asks students to type the protocol code by hand. ZAK reported on 24 Nov 2026 that Prof. Kotov allowed the agent (Claude) to write it. So, openly: ZAK wrote step 1 (initialize, silence on notifications) and the tools/list answer; the agent wrote `find_lecture` and `search_lectures` handling, tools/call, the -32602 / -32601 / -32700 / -32603 error replies, `ping`, and wired in the ClubHub tools from `mcp-server/tools.js`. Every line carries a plain comment so ZAK can explain it at the defence.
- Checkpoints: `node mcp-server/check.mjs -- npm run --silent mcp` gives 12/12; `npm test` gives 65/65; checked by hand that bad JSON gets -32700 and that `list_events` without `MCP_TOKEN` is an `isError` result, not a crash.
- Went wrong: nothing broke. The CI `spec` job stays red because SPEC.md's goals, non-goals, constraints and acceptance criteria are still ZAK's to write.
- Changed by hand: (ZAK fills in after reading the file.)
