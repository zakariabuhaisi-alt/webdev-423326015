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
- Model: Google Gemini gemini-2.5-flash over its REST API, with the key in GEMINI_API_KEY
- Input: only the event title and description, no user data
- Output: 3 to 5 tags and a one-sentence summary (140 characters max), shown as an editable suggestion on Create event
- When it fails: after an 8s timeout, a 429, a missing key or a bad answer, it falls back to a keyword heuristic and shows a note. Saving still works.

## Auth
- Local: email and password (at least 8 characters). Only a hash of the password is stored. A wrong email and a wrong password get the same 401 message. A session is a random token in a cookie.
- Provider: Google, using the OAuth 2.0 authorization-code flow with PKCE and a state value. We check the id_token's iss, aud and exp.
- Linking: we look up the Google sub first. If it's new, Google must say email_verified, or we refuse with 403. If a local account has the same email, Google gets linked to that account, so it stays one account. If not, a new account with no password is created. 

## MCP tools
| Tool | What it does | Who may call it |
| --- | --- | --- |
| list_events | lists upcoming events with the club, start time, places left and whether you're registered | any signed-in user with a valid MCP_TOKEN, acting as that user |
| register_for_event | saves a place at one event by eventId, and is refused if the event is full or you already joined | any signed-in user with a valid MCP_TOKEN, acting as that user |
| my_registrations | lists the events the signed-in user has a place at, soonest first | any signed-in user with a valid MCP_TOKEN, acting as that user |

## UI
- Stack: plain HTML, CSS and JavaScript (ES modules) in public/, served by Express, with no framework
- Screens: Sign in / Create account (index.html), Upcoming events (events.html), Create an event with the Suggest button (new-event.html), and a 404 page

## Architecture
- Route: POST /api/events/:id/registrations in src/routes/events.js reads the request and returns 201
- Service: register() in src/services/events.js checks the rules (signed in, event full, already registered)
- Data: src/data/events.js and src/data/registrations.js write the SQL inside one transaction
- Database: Postgres (Neon on Render, PGlite locally)
- Same service from MCP: the register_for_event tool in mcp-server/tools.js calls that same register()
- Does not match: GET /health sits in src/app.js, not in src/routes/.

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
- The agent built tools.js with the 3 project tools, but it is not wired into my hand-written server.js yet.
