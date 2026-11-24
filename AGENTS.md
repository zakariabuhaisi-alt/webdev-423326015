# Instructions for the agent

Read this file at the start of every session. Keep it short and correct; update it when the project changes.

## Project
<!-- One or two sentences: what the app does and for whom. Link SPEC.md. -->
ClubHub: university club organisers publish events, and members save a place at them (with a capacity limit).
See `SPEC.md` for goals, non-goals and acceptance criteria.

## Commands
<!-- How to install, run, test. Keep these exact and working. -->
- Install: `npm install`
- Run: `npm start` (no DATABASE_URL: an in-memory Postgres via PGlite, with demo data; `npm run dev` restarts on save)
- Test: `npm test`
- Coverage: `npm run coverage` (fails below 100% of src/services or 80% of src)
- MCP server: `npm run --silent mcp`
- Migrations: `npm run migrate`; demo data: `npm run seed`

## Conventions
<!-- Folder layout, naming, where business rules live, how errors are returned to the client. -->
- Node 22, CommonJS, Express 4, PostgreSQL (Neon in production, PGlite locally and in tests), plain HTML + ES modules in `public/`.
- Business rules live only in `src/services/`. A service throws `AppError` with a kind (`invalid`, `unauthenticated`, `forbidden`, `not_found`, `conflict`); `src/routes/http.js` maps kinds to 400/401/403/404/409 and returns `{ "error": "<sentence>" }`.
- Schema changes are new files `migrations/NNN_name.sql`; never edit one that has run.
- Tests in `test/*.test.js` with `node:test`; each one that proves a criterion has its `AC-n` id in the title.

## Layers
<!-- Fill in the file or folder for each layer. -->
Requests arrive two ways and both end in the same place:

- HTTP route handler (`src/routes/*.js`) → service (`src/services/*.js`) → data access (`src/data/*.js`) → database (`src/db.js`, `migrations/`)
- MCP tool (`mcp-server/tools.js`) → **the same service** → data access → database

A route handler reads the request and turns a result into a status code. A service holds the
rules and knows nothing about HTTP or about MCP. Only the data layer writes SQL. An MCP tool
that talks to the database directly is a second, unguarded way into your data: never add one.

## The model feature
<!-- Provider, env var, and the call site. -->
- The provider is named in exactly one file: `src/model/gemini.js` (Gemini REST API, key in `GEMINI_API_KEY`). The service is `src/services/suggestions.js`.
- The key comes from an environment variable and is never committed or logged.
- Every call has a timeout and a deterministic fallback, so the app still works when the provider is down or rate-limited.
- The model's output is re-checked against real data before anything is saved or shown.
- Tests never call the provider: they pass in a fake client.

## The MCP server
<!-- Where it lives and how it authenticates. -->
- Lives in `mcp-server/`, grew out of Exercise 1.
- Every tool calls a service function; none touches the data layer or the database directly.
- It carries a user, and enforces exactly the same authorization rules as the HTTP API.
- Adding a tool means adding a row to the table in `SPEC.md` too.

## Tests and coverage
- Every acceptance criterion in `SPEC.md` has an id like `AC-3`, and a test whose title contains that id.
- The coverage gate runs in CI: 100% of the service layer, 80% overall.
- A test is evidence. Changing a test so the code passes destroys the evidence.

## Always ask before
- deleting files or folders
- editing a migration that has already run
- installing or removing dependencies
- pushing, tagging or changing CI
- anything that touches secrets or `.env`
- changing an authentication or authorization rule
- adding, renaming or removing an MCP tool
- changing a coverage threshold
- sending user data to a third-party model

## Never
- commit secrets, passwords, API keys or an OAuth client secret
- weaken or delete a test to make it pass
- lower a coverage threshold or switch off a CI job to make the build green
- add an MCP tool that reaches past the service layer
- log a prompt that contains somebody's personal data
