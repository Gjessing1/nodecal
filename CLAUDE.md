# CLAUDE.md — Nodecal

Nodecal is a self-hosted, mobile-first CalDAV calendar client. Single-user focused, Radicale-optimized, no external cloud dependencies.

- **Repo:** https://github.com/Gjessing1/nodecal
- **Image:** `ghcr.io/gjessing1/nodecal:latest`

## Documentation

Detailed docs live under `docs/` (gitignored — local working notes, not committed):

- **[docs/VISION.md](docs/VISION.md)** — product overview, core features, design principles, non-goals
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — tech stack, project structure, configuration, Tasks/Events data models, Calendar UX, internal API, testing
- **[docs/ROADMAP.md](docs/ROADMAP.md)** — bugs, phases, clarifications, in-progress work

Read these before working on a feature. This file holds only the rules Claude must follow while writing code.

## Engineering Rules

**Boring code:**
- `for...of` over `.reduce()`
- Named functions over anonymous callbacks
- Explicit `if/else` over nested ternaries
- No barrel/index re-export files
- Comments explain *why*, not *what*
- No abstractions until you need the same pattern a second time

**Timezone rules:**
- All datetimes are stored and processed in UTC internally (T00:00:00Z for all-day, full ISO for timed)
- Convert to local time only at the render/display layer — never before or during storage/comparison
- All-day events are stored as UTC midnight; in views compare them by date string (ev.start.slice(0,10) vs localDateStr(day)) — never via new Date(ev.start) which shifts by browser offset
- Never mix UTC and floating times in the same code path; never serialize all-day dates with local getDate() — use getUTCDate()
- When debugging a timezone off-by-one: check whether an all-day Date was constructed with T00:00:00 (local, wrong) vs T00:00:00Z (UTC, correct) — that is almost always the cause

**Frontend state:**
- `state.js` is the single source of truth for events, tasks, and UI state
- All views read from `state.js` only — no component holds its own copy of events or tasks
- Updates flow in one direction: user action → state update → render

## Instructions for Claude

- Complete one phase at a time. Do not start the next phase until confirmed.
- Ask before modifying this file, except for checking off completed roadmap items.
- After each task: brief summary of what changed, what was left alone, any risks.
- Keep files small and focused. Split when a file exceeds ~150 lines.
- Use Conventional Commits: `feat:`, `fix:`, `chore:`, `refactor:`
- Do not add npm dependencies without flagging it first.
- **Current approved deps (server):** `express`, `rrule`, `chrono-node`, `dotenv`, `node-fetch` (or built-in fetch), CalDAV via custom HTTP client.
- **rrule ESM** is served to the client at `/rrule` via a static route in `server/app.js` — no bundling needed.
- Plain CSS only — no Tailwind, no CSS-in-JS, no preprocessors.
- No TypeScript. Plain JS with JSDoc where types matter.
- The `RecurrenceConfig` typedef lives in `client/components/rruleParser.js`.
- Event categories are separate from task categories — never mix them in the same UI or utility function.

## Remember

- Roadmap lives in [docs/ROADMAP.md](docs/ROADMAP.md). Update it each time you finish a phase to track current progress.
- Also push and build new docker image when finishing.
- Don't credit Claude when doing commits.
