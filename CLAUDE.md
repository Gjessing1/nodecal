# CLAUDE.md — Nodecal

Nodecal is a self-hosted, mobile-first CalDAV calendar client. Single-user focused, Radicale-optimized, no external cloud dependencies.

- **Repo:** https://github.com/Gjessing1/nodecal
- **Image:** `ghcr.io/gjessing1/nodecal:latest`
- **Deploy:** automatic on push to main via the Forgejo `.forgejo/workflows/docker.yml` `build-and-deploy` job, which builds, pushes, then runs `docker compose pull && docker compose up -d --remove-orphans` on the host and verifies `/api/health`. Deploy runs inside the build job on purpose — a separate job queues behind other repos on the single capacity-1 runner and can be auto-cancelled. Manual fallback: `cd /home/gjessing/docker/nodecal && docker compose pull && docker compose up -d`.

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
- npm dependencies and a build/bundling step are allowed when they close the gap with maily or replace hand-rolled complexity — keep the count low and mention new deps in the task summary.
- **Current approved deps (server):** `express`, `rrule`, `chrono-node`, `dotenv`, `web-push`, `node-fetch` (or built-in fetch), CalDAV via custom HTTP client. Dev: `typescript` (checkJs only), `eslint`, `prettier`.
- **rrule ESM** is served to the client at `/rrule` via a static route in `server/app.js` — no bundling needed for it today.
- Code is plain JS with JSDoc types, checked by `npm run typecheck` (tsc `--checkJs`); keep new code passing it. A full TypeScript port is an approved future direction (see docs/ROADMAP.md — maily convergence), but don't mix .ts files in before that phase starts.
- CSS is plain CSS built on the design tokens in `client/styles/tokens.css` (Tailwind v4 `@theme`-compatible naming: `--color-*`, `--spacing-*`, `--text-*`, `--radius-*`). Always style through tokens, never hard-coded values. A later Tailwind migration is approved; until it starts, no utility frameworks.
- `npm run lint` / `npm run format` (ESLint + Prettier, configs mirror maily) must pass; both are enforced in the Docker build.
- The `RecurrenceConfig` typedef lives in `client/components/rruleParser.js`.
- Event categories are separate from task categories — never mix them in the same UI or utility function.

## Remember

- Roadmap lives in [docs/ROADMAP.md](docs/ROADMAP.md). Update it each time you finish a phase to track current progress.
- Comit and push when finished.
- Don't credit Claude when doing commits.
