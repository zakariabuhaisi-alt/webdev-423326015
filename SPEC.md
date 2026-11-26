# ClubHub

<!-- Exercise 2. Write the non-goals first. Every acceptance criterion must be checkable in under a minute.
     Keep these headings exactly as they are: the self-checks look for them by name.
     The full target is on the course site under Resources → The course project. -->

## Project option
Club events (ClubHub): events for university clubs.

## Goals
- Let students discover university club events and register or cancel attendance with seat limits.
- Let club organisers create events.
- Expose club and event operations through a shared service layer used by both the REST API and an MCP server.

## Non-goals
- No payments: all club events are free, so there is no checkout or billing.
- No chat or messaging between members: ClubHub lists events, it is not a social network.
- No native phone app: the website works on a phone browser instead.
- No email or SMS reminders: members see their registrations on the site.
- One university only: no multi-campus or multi-tenant setup.

## Constraints
- Runtime: Node 22 with Express.
- Database: Postgres. PGlite locally, Neon in production.
- Front end: plain HTML/CSS/JavaScript, no framework.
- Hosting: deployed on Render, auto-deploys main after CI passes.
- Secrets: never committed. Only .env.example is in the repo.
- Layering: the REST API and the MCP server call the same service functions.
- Access: must work on a phone screen and with keyboard only.

## The model feature
<!-- Which model, which modality, and what it does for a user.
     Name three things or the check fails: the input it receives, the output it produces,
     and what happens when the model is slow, rate-limited or wrong. -->
- Model:
- Input:
- Output:
- When it fails:

## Auth
<!-- Local sign-in plus at least one provider. Say how an account signing in both ways stays one account. -->
- Local:
- Provider:
- Linking:

## MCP tools
<!-- At least three tools your own MCP server exposes over this project's data.
     Each tool calls the same service functions the HTTP API calls, so the same rules apply.
     A description shorter than 20 characters is not a description. -->
| Tool | What it does | Who may call it |
| --- | --- | --- |
|  |  |  |

## UI
<!-- Stack, and the three or more screens. The graded checklist lives in docs/UI.md. -->

## Architecture
<!-- Exercise 3. One request traced through every layer, naming the file for each one,
     plus one place where your own code does not match this layering. -->

## Acceptance criteria
- [AC-1] New user signs up with email & password: password is stored only as a hash, session starts.
- [AC-2] Same email again → 409, no second user.
- [AC-3] Wrong password or unknown email → same 401 message, no session.
- [AC-4] A signed-out visitor asking for events gets 401.
- [AC-5] A signed-in member sees upcoming events, soonest first, with places left. Past events are hidden.
- [AC-6] Registering with a free place → saved, places left goes down.
- [AC-7] Full event → "This event is full", no new row.
- [AC-8] Registering twice → refused.
- [AC-9] Can't cancel someone else's registration (403). Own, or organiser's → allowed.
- [AC-10] Only a club organiser can create its events. A member gets 403.
- [AC-11] Suggest gives 3–5 tags + a one-line summary, with a fallback if the model fails.
- [AC-12] An unusable model answer is replaced by the fallback.
- [AC-13] A verified Google email matching a local account → same account, linked.
- [AC-14] An unverified Google email → refused.
- [AC-15] MCP tools follow the same rules. No valid token → refused.
- [AC-16] /health → 200 when the DB is up, 503 when it's down.

### Slice 1: sign-in and event list

## Traceability
<!-- Filled in from Exercise 3 onward: each AC id, and the test that names it. -->
| Criterion | Test |
| --- | --- |
| AC-1 |  |

## Spec vs result
<!-- After the agent builds the slice: which criteria passed, which it missed or reinterpreted, and what you changed in this spec because of it. -->
