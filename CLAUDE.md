# CLAUDE.md — Nodecal

## Project Overview

Nodecal is a self-hosted, mobile-first CalDAV calendar client. Single-user focused, Radicale-optimized, no external cloud dependencies.

- **Repo:** https://github.com/Gjessing1/nodecal
- **Image:** `ghcr.io/gjessing1/nodecal:latest`
- **Target:** Daily use on mobile (PWA), works on tablet/desktop too

## Tech Stack

**Backend:** Node.js + Express, custom CalDAV client layer, `rrule` for recurrence, `chrono-node` for NLP, `dotenv` for config

**Frontend:** Vanilla JS + plain CSS (no framework, no build step)

**Deployment:** Single Docker container, multi-arch (`amd64` + `arm64`), reverse proxy friendly

## Project Structure

```
/server
  app.js
  config.js             Load + validate .env
  caldav/
    client.js           CalDAV communication (Radicale-optimized)
    sync.js             Sync engine (etag-based incremental)
    parser.js           ICS parsing + normalization
    recurrence.js       RRULE handling via rrule.js
  nlp/
    parser.js           Natural language → structured event (chrono-node)
  routes/
    events.js
    calendars.js
    sync.js
  cache/
    store.js            In-memory store, flushed to /cache/events.json on write

/client
  app/
    main.js
    state.js            Selected date, active view, loaded calendars
  views/
    day.js
    week.js
    month.js
    agenda.js
  components/
    eventCard.js
    timeGrid.js
    modalEditor.js
    datePicker.js
  styles/
    main.css            CSS custom properties for theming (light + dark)

/public
  index.html
  manifest.json         PWA config (wired from Phase 1)
  service-worker.js     Offline shell (implemented Phase 7)

/docker
  Dockerfile
  docker-compose.yml

.github/
  workflows/
    docker.yml          Build + push to GHCR on push to main
```

## Configuration

All config via `.env`. Settings can also be changed through the in-app settings UI, which writes to `/config/settings.json` at runtime (this overrides `.env` values without requiring a restart).

```dotenv
# CalDAV — %u is replaced with CALDAV_USERNAME at runtime (Radicale path convention)
CALDAV_BASEURL=http://host.docker.internal:5232/%u
CALDAV_USERNAME=youruser
CALDAV_PASSWORD=yourpassword

# App
SITE_TITLE=Nodecal
DEFAULT_VIEW=day         # day | week | month | agenda
TIMEZONE=Europe/Oslo
TIME_FORMAT=24h          # 24h | 12h
WEEK_START=monday        # monday | sunday
```

Volumes:
- `/config` — optional `settings.json` runtime override
- `/cache` — persisted event cache (`events.json`), survives container restarts

`docker-compose.yml`:
```yaml
services:
  nodecal:
    image: ghcr.io/gjessing1/nodecal:latest
    restart: unless-stopped
    ports:
      - "3000:3000"
    env_file: .env
    volumes:
      - /mnt/data/nodecal/config:/config
      - /mnt/data/nodecal/cache:/cache
```

## Core Features

**Calendar Views:** Day (primary mobile), Week, Month, Agenda

**Multiple Calendars:** Radicale exposes multiple calendars per user. All are fetched, displayed with per-calendar color coding, and individually toggle-able. Calendar list is shown in a sidebar/drawer.

**Event Management:** Create / edit / delete, drag-and-drop (desktop), long-press drag (mobile), timezone-aware

**Natural Language Input** (Phase 5):
- "Meeting with John tomorrow 14:00"
- "Gym every Monday at 19"
- "Dinner Friday 18-21"
- Parsed into: title, start/end time, recurrence rule

**Recurring Events:** Full RRULE via `rrule` package — daily/weekly/monthly/yearly, exceptions (EXDATE), edit single / this+future / entire series

**CalDAV Sync:** Incremental via etag/last-modified, last-write-wins conflict strategy, manual + auto sync triggers

**PWA:** Installable, offline UI shell showing cached events, fast startup

## Error Handling

If CalDAV is unreachable: show last cached state, surface a non-blocking sync error banner. Never crash or blank the UI. Retry on next manual or auto sync trigger. Log errors to console only.

## Design Principles

**Mobile first:** Thumb-friendly, large hit zones, bottom navigation, no hover-dependent interactions.

**Speed:** Optimistic UI updates, sync in background, instant perceived response.

**Boring code:**
- `for...of` over `.reduce()`
- Named functions over anonymous callbacks
- Explicit `if/else` over nested ternaries
- No barrel/index re-export files
- Comments explain *why*, not *what*
- No abstractions until you need the same pattern a second time

**Radicale-optimized:** Assume a well-behaved CalDAV server. Skip enterprise-grade edge cases.

**Single container:** No internal auth. Trust the reverse proxy. No multi-user logic.

## Internal API

```
GET    /events?from=ISO&to=ISO
POST   /events
PUT    /events/:id
DELETE /events/:id
GET    /calendars
POST   /sync
GET    /health
```

## Testing

No tests in Phases 0–3. Unit tests for recurrence logic in Phase 4 (RRULE edge cases are where bugs live). Integration tests for sync engine in Phase 6.

## Instructions for Claude

- Complete one phase at a time. Do not start the next phase until confirmed.
- Ask before modifying this file, except for checking off completed roadmap items.
- After each task: brief summary of what changed, what was left alone, any risks.
- Keep files small and focused. Split when a file exceeds ~150 lines.
- Use Conventional Commits: `feat:`, `fix:`, `chore:`, `refactor:`
- Do not add npm dependencies without flagging it first.
- **Approved deps:** `express`, `rrule`, `chrono-node`, `dotenv`, and one CalDAV library (evaluate `tsdav` vs `dav` at Phase 1, flag recommendation).
- Plain CSS only — no Tailwind, no CSS-in-JS, no preprocessors.
- No TypeScript. Plain JS with JSDoc where types matter.

## Roadmap

### Phase 0 — Bootstrap ✓ (commit this to unblock CI)
- [ ] Repo structure + `.gitignore`
- [ ] `package.json` with approved deps
- [ ] Minimal Express server (`/health` endpoint + static serving)
- [ ] `Dockerfile` (multi-stage, non-root user)
- [ ] `docker-compose.yml`
- [ ] `.env.example`
- [ ] GitHub Actions workflow → builds + pushes to GHCR on push to `main`
- [ ] `public/index.html` placeholder
- [ ] `public/manifest.json` (PWA stub)

### Phase 1 — Foundation
- [ ] `.env` config loading + validation (`server/config.js`)
- [ ] CSS custom properties for theming — define all color/spacing tokens as variables, include `prefers-color-scheme` dark variant
- [ ] CalDAV connection — fetch all calendars for the configured user
- [ ] Fetch and display events in Agenda view
- [ ] Basic event CRUD (create, edit, delete)
- [ ] In-memory cache with `/cache/events.json` persistence

### Phase 2 — Core UI
- [ ] Day view (mobile-optimized)
- [ ] Week view
- [ ] Event modal editor
- [ ] Calendar list with color coding + toggle visibility

### Phase 3 — Interaction
- [ ] Drag-and-drop (desktop)
- [ ] Long-press drag (mobile)
- [ ] Resize events
- [ ] Swipe navigation (horizontal = day/week, vertical = scroll)

### Phase 4 — Recurrence
- [ ] RRULE parsing + rendering via `rrule`
- [ ] Recurring event editing (single / this+future / all)
- [ ] Exception handling (EXDATE)
- [ ] Unit tests for recurrence logic

### Phase 5 — Natural Language Input
- [ ] `chrono-node` integration
- [ ] Inline parse feedback in quick-create modal
- [ ] Recurring phrase support ("every Monday")

### Phase 6 — Sync Engine
- [ ] Incremental sync (etag/last-modified)
- [ ] Background auto-sync
- [ ] Conflict handling (last-write-wins)
- [ ] Retry on failure + integration tests

### Phase 7 — PWA
- [ ] Service worker with offline shell
- [ ] Install prompt
- [ ] Serve cached events when offline

### Phase 8 — Polish
- [ ] Dark mode toggle UI + system preference detection (`prefers-color-scheme`)
- [ ] Subtle animations (view transitions, modal open/close)
- [ ] Performance pass (render, sync, startup)
- [ ] Edge-case fixes

## Non-Goals

- Multi-user support
- Email or notification integration
- Enterprise CalDAV compatibility (Exchange, iCloud edge cases)
- Any external cloud dependency
