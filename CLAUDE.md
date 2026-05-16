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
        tasks.js
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
        tasks.js
      components/
        eventCard.js
        timeGrid.js
        modalEditor.js
        datePicker.js
        taskItem.js
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

## Configuration

All config via `.env`. Settings can also be changed through the in-app settings UI, which writes to `/config/settings.json` at runtime (this overrides `.env` values without requiring a restart).

    # CalDAV — %u is replaced with CALDAV_USERNAME at runtime (Radicale path convention)
    CALDAV_BASEURL=http://host.docker.internal:5232/%u
    CALDAV_USERNAME=youruser
    CALDAV_PASSWORD=yourpassword

    # Tasks CalDAV (separate Radicale collection for VTODO)
    CALDAV_TASKS_URL=http://host.docker.internal:5232/youruser/tasks/

    # App
    SITE_TITLE=Nodecal
    DEFAULT_VIEW=day         # day | week | month | agenda
    TIMEZONE=Europe/Oslo
    TIME_FORMAT=24h          # 24h | 12h
    WEEK_START=monday        # monday | sunday

    # Debug
    DEBUG_SYNC=false         # true = verbose sync logging to console

Volumes:
- `/config` — optional `settings.json` runtime override
- `/cache` — persisted event + task cache (`events.json`), survives container restarts

docker-compose.yml:

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

## Core Features

**Calendar Views:** Day (primary mobile), Week, Month, Agenda

**Navigation:** Max 5 visible tabs. User selects which views are shown via Settings (options: Day, Week, Month, Agenda, Tasks). Tasks tab is hidden unless explicitly enabled.

**Multiple Calendars:** Radicale exposes multiple calendars per user. All are fetched, displayed with per-calendar color coding, and individually toggle-able. Calendar list is shown in a sidebar/drawer.

**Event Management:** Create / edit / delete, drag-and-drop (desktop), long-press drag (mobile), timezone-aware

**Natural Language Input** (Phase 5):
- "Meeting with John tomorrow 14:00"
- "Gym every Monday at 19"
- "Dinner Friday 18-21"
- Parsed into: title, start/end time, recurrence rule
- NLP-resolved times always override default-time logic — if NLP sets a time, use it as-is, never clamped or rounded

**Recurring Events:** Full RRULE via `rrule` package — daily/weekly/monthly/yearly, exceptions (EXDATE), edit single / this+future / entire series

**CalDAV Sync:** Incremental via etag/last-modified, last-write-wins conflict strategy, manual + auto sync triggers

**PWA:** Installable, offline UI shell showing cached events, fast startup

**Tasks** (Phase 10, opt-in via Settings):
- Stored as VTODO in a dedicated Radicale CalDAV collection
- Separate tasks view (To Do-style list), toggled on via Settings
- Optional: show tasks on calendar views (separate toggle)
- See [Tasks](#tasks) section for full data model and rules

## Tasks

### Overview

Tasks use VTODO in a separate CalDAV collection (configured in Settings). They are first-class objects — not converted to VEVENT. The task feature is off by default; users enable it in Settings.

### Settings (tasks-related)

| Setting | Default | Description |
|---|---|---|
| Tasks CalDAV URL | _(empty)_ | URL of the Radicale VTODO collection (supports multiple — see Task Sources) |
| Default task source | _(first configured)_ | Which source new tasks are written to |
| Enable tasks view | Off | Adds Tasks tab to navigation |
| Show tasks on calendar | Off | Renders tasks in Day/Week/Month/Agenda from DUE date |
| Sort tasks by | Due date | Due date / Creation date / Alphabetical / Starred first |
| Hidden categories | _(empty)_ | Category names suppressed from view (not deleted from data) |

### Data Model (VTODO)

Minimal strict subset stored per task:

    UID
    SUMMARY              // title
    DESCRIPTION          // notes (optional)
    STATUS               // NEEDS-ACTION | COMPLETED
    DUE                  // date only (no time in UI, full datetime supported on backend)
    COMPLETED            // timestamp, set on completion
    CATEGORIES           // tags — multi-select, free text; also drives "important" star
    RRULE                // standard recurring (optional, set by backend — never exposed by name in UI)
    X-RECURRING-TYPE     // after-completion (optional, set by backend — never exposed by name in UI)
    X-RECURRING-INTERVAL // weekly | 3d | 2w
    X-UPDATED            // optional, for sync/debug

`DUE` is stored as a date on the backend. Time is intentionally excluded from the creation UI but the backend handles datetime should that change.

### Task Categories

Categories are stored in the standard `CATEGORIES` CalDAV field. They are free-text tags with no global registry — created on use, discovered from existing tasks.

**Behavior:**
- A task can have 0–n categories (multi-select)
- Categories are created on first use — no pre-registration needed
- Autocomplete in the UI is sourced from categories already present across all tasks
- `#tag` syntax in the quick-add bar is parsed as a category (e.g. "Buy milk #groceries"); `#tag` tokens are stripped from `SUMMARY` before saving
- The `important` category is reserved — it drives the star/favorite indicator

**Hiding categories (client-side only):**
- "Hide Category" suppresses a category from view locally. The category is NOT deleted from CalDAV data
- Stored in `state.config.hiddenCategories: string[]`, persisted to `settings.json`
- Hidden categories excluded from autocomplete suggestions and from grouped/filtered views
- Each hidden category can be un-hidden individually via Settings → Categories

**UI:**
- Categories shown as chips/pills on task items and in the edit view
- In quick-add bar: `#` triggers autocomplete dropdown for existing categories
- "Group by category" is a view option in the tasks list toolbar (replaces date grouping when selected)
- Category filter available in the tasks list toolbar

### Recurring Rules

**The user never sees "RRULE" or "X-RECURRING".** The UI presents four simple presets:

- **Daily** → RRULE:FREQ=DAILY
- **Weekly** → RRULE:FREQ=WEEKLY;BYDAY=\<day\> (day derived from DUE date)
- **Monthly** → RRULE:FREQ=MONTHLY;BYMONTHDAY=\<day\> (day derived from DUE date)
- **__ days/weeks after completion** → X-RECURRING-TYPE:after-completion + X-RECURRING-INTERVAL

No complex rule builder. These four presets are the full UI surface for task recurrence.

`X-RECURRING-*` always overrides `RRULE` if both exist on the same task.

**RRULE (repeat from due date)**

Next due is always calculated from the previous DUE date, not from the completion date. This preserves the fixed schedule even if the task was completed late.

Example: task due on the 1st, completed on the 4th → next due is the 1st of next month.

    RRULE:FREQ=MONTHLY;BYMONTHDAY=1

**X-RECURRING (repeat after completion)**

Next due is calculated from the COMPLETED timestamp. Being late resets the clock forward from today, not from the original due date.

Example: task due Monday, completed Thursday → next due is Thursday + interval.

    X-RECURRING-TYPE:after-completion
    X-RECURRING-INTERVAL:5d

Supported intervals: `daily`, `weekly`, `Nd`, `Nw` (e.g. `3d`, `2w`).

### Completion Behavior

Tasks are mutated, never duplicated.

On complete:
1. Set STATUS:COMPLETED and COMPLETED:now
2. If recurring — call computeNextDue(task, completionDate), then update the same VTODO:
   - STATUS → NEEDS-ACTION
   - DUE → new date
   - COMPLETED → cleared

computeNextDue logic:
- If X-RECURRING → next = completionDate + interval
- If RRULE → next = rrule.after(previousDUE) — ignores completion date entirely
- If both → X-RECURRING wins

Completed tasks can be toggled back to NEEDS-ACTION from both the task list and the edit view.

No history is stored. Last-write-wins (same as events).

### Task Sources

- Multiple task CalDAV URLs can be configured (each is a separate VTODO collection)
- One source is designated as the **default** — new tasks without explicit source go there
- Each source shown as a filter option in the tasks view toolbar
- No cross-source logic (no merging, no moving tasks between sources)
- Source selector in quick-add bar is a secondary option, hidden when only one source is configured

### Task Creation UI

Mobile-first, To Do-style — not the event modal. Quick-add bar sits at the bottom of the tasks view, above the nav bar (thumb-reachable):

- Text input for title (required) — full width, tapping focuses keyboard
- `#tag` inline in the title input creates a category on submission
- Inline row of due date shortcuts: **Today** · **Tomorrow** · **Pick date**
- Submit on enter or tap → VTODO created immediately (optimistic), written to default source
- No time picker — date only
- Advanced options (recurrence, notes, categories, source) accessible after creation by tapping into the task

### Task List UI

- Tasks grouped by due date: **Overdue → Today → Tomorrow → [individual date header per future date] → No due date**
  - No "Later" bucket — each future date gets its own header
- Sort options (persisted): **Due date** / **Creation date** / **Alphabetical** / **Starred first**
- "Group by category" replaces date grouping when selected
- Show/hide completed tasks toggle; completed tasks can be re-checked to revert to active
- Star icon on each task → toggles `important` in `CATEGORIES`
- Notes preview: first 1–2 lines of `DESCRIPTION`, truncated with ellipsis
- Tap task → **direct edit** (no read-only mode for tasks)
- Edit view includes: title, notes, due date, recurrence preset, categories (chips), completed checkbox, source indicator

### Calendar Rendering (when "show tasks on calendar" is enabled)

- Tasks render from DUE date as all-day items (no time slot)
- Only STATUS != COMPLETED tasks are shown
- Visually distinct from events (icon or colour variant)
- Clicking a task in any calendar view opens the task edit view directly
- If many tasks share a due date, collapse to "N tasks" in month view to avoid noise
- Tasks without DUE are excluded from calendar views

### Edge Cases

| Scenario | Behaviour |
|---|---|
| RRULE task completed late | Next due = rrule.after(previousDUE) — schedule is preserved |
| X-RECURRING task completed late | Next due = completionDate + interval — clock resets from today |
| Manual due date edit | Treated as new base date for both recurrence types |
| Both RRULE + X-RECURRING present | X-RECURRING wins |
| Removing recurring | Delete both RRULE and all X-RECURRING-* fields |
| Task has no DUE | List view only, excluded from calendar |
| Tasks CalDAV URL not configured | All task UI hidden silently — no errors surfaced |
| Hidden category | Excluded from view and autocomplete; data unchanged on server |
| Multiple task sources | Filter shown in toolbar; default source used for new tasks |

### Cache Migration

/cache/events.json is migrated on first start to a mixed format:

    {
      "events": [],
      "tasks": []
    }

Migration is non-destructive: existing events are moved into the events array. If the file is already in the new format it is left untouched.

## Events

### Read-Only vs Edit

- Events open in **read-only mode** by default — shows title, time, location, description, recurrence info
- An explicit **Edit** button switches to edit mode
- This prevents accidental edits from taps/swipes on mobile
- Tasks open in **direct edit mode** (no read-only step) — simpler objects, lower risk of accidental change

### Event Creation

**Default time logic:**
- New events default to the nearest future 15-minute slot relative to current time (e.g. if it's 17:48, default start is 18:00)
- If the selected date is in the future (not today), default to a configurable time in Settings (default: 09:00)
- NLP-resolved times always override default-time logic — if NLP sets a time, it is used as-is, never clamped or rounded

**Location field:**
- V1: plain text only, no search or autocomplete
- Stored as LOCATION in VEVENT
- Shown in read-only view and edit view

**Duplicate event:**
- Available as an action in the event edit view
- Creates a new event with all fields copied; opens in edit mode for adjustment before save

## Calendar UX

**Long-press to create:**
- Long-press on blank space in Day or Week view → creates a new event at that time/date
- Long-press on a date cell in Month view → creates a new event on that date
- Default duration for new events created this way is configurable in Settings (default: 60 minutes)

**Quick add:**
- Available in all calendar views (Day, Week, Month, Agenda) — same NLP input bar pattern
- Respects default time logic and NLP override rules

**Swipe navigation:**
- Month view: swipe left/right to navigate months
- Week view: swipe left/right to navigate weeks
- Day view: swipe left/right to navigate days
- Agenda view: scroll is sufficient — no swipe nav needed

**Day view date header:**
- Tapping the date in the Day view header opens the date picker / calendar modal

**Time scroll wheel:**
- Only visible when the user taps/clicks directly on a time field in the event edit view
- Not shown on read-only view or on initial modal open

## Week Numbers

- ISO 8601 standard (default), configurable in Settings
- **Week view:** always shown (e.g. "W20")
- **Month view:** optional column, off by default, toggleable in Settings
- **Day / Agenda:** optional, off by default
- Format: W52 — short form only
- Single setting: "Show week numbers" (on/off); applies to all views that support it

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

**Radicale-optimized:** Assume a well-behaved CalDAV server. Skip enterprise-grade edge cases.

**Single container:** No internal auth. Trust the reverse proxy. No multi-user logic.

## Internal API

    GET    /events?from=ISO&to=ISO
    POST   /events
    PUT    /events/:id
    DELETE /events/:id
    GET    /calendars
    POST   /sync
    GET    /health

    GET    /tasks
    POST   /tasks
    PUT    /tasks/:id
    DELETE /tasks/:id
    POST   /tasks/:id/complete

## Testing

No tests in Phases 0–3. Unit tests for recurrence logic in Phase 4 (RRULE edge cases are where bugs live). Integration tests for sync engine in Phase 6. Unit tests for task recurrence edge cases in Phase 10.

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

## Phase 0 — Code Health Audit ✓ COMPLETE

Audit done. Four extractions performed (commit `43fbe6f`):
- `timePicker.js` — scroll wheel picker (from `modalEditor.js`)
- `recurrenceUI.js` — repeat presets (from `modalEditor.js`)
- `taskModal.js` — task edit modal (from `tasks.js`)
- `taskQuickAdd.js` — quick add bar (from `tasks.js`)
- `esc()` moved to `utils.js` (was duplicated in `modalEditor.js` and `tasks.js`)

---

## Phase 7 — UI Polish & Event Categories

### 7.1 After-completion mode toggle layout shift
- [x] Switching between "Fixed" and "After done" in the task modal changes the button sizes,
  pushing the Reminder field out of its column. The two buttons should stay fixed-size
  regardless of which mode is active. Fix: set equal `flex: 1` or explicit `min-width` on both
  toggle buttons, and ensure the adjacent Reminder column doesn't reflow.

### 7.2 Location / URL: collapsed state cannot be re-collapsed
- [x] Once expanded via the `+ Location / URL` button, there is no way to collapse the fields
  again. Add a collapse button (e.g. `−` or `▲`) when the fields are expanded and empty, so
  the user can hide them again.

### 7.3 Location / URL positioning
- [x] **Events:** the collapsed `+ Location / URL` button sits too close to the Description
  field below it, and the gap above it (between the Remind me / Repeat row and the button) is
  too large. It should have even vertical spacing relative to both neighbours.
- [x] **Tasks:** the collapsed button is too close to the Notes field. It should sit squarely
  between the Due date row and the Notes field with equal padding on both sides.

### 7.4 Remind me / Repeat collapse when unused
- [x] For both events and tasks: if no reminder and no repeat are currently set, collapse the
  Remind me and Repeat fields by default (similar to the Location / URL collapse pattern).
  Show a single `+ Reminder / Repeat` expand button in their place. If either field has a
  value, expand both automatically on open. Tapping the button expands both fields so the user
  can configure them.

### 7.5 Event categories
A new first-class feature: events can be tagged with one or more free-text categories
(separate from task categories and calendar names).

**Use case:** Tag a set of events with "Workout". When sick or on vacation, select the
"Workout" category and shift all matching events forward by N days/weeks — without manually
moving each one. Particularly useful for structured recurring plans (e.g. a 4-week training
program with 2–4 sessions per week).

**Data model:**
- Stored as `CATEGORIES` in VEVENT ICS (already a valid iCalendar property)
- Free-text tags, multi-value, comma-separated in the ICS
- Separate namespace from task categories — never mixed in the same UI

**UI — event modal:**
- Category chips (same visual pattern as task categories)
- `#tag` input or chip selector inline in the event edit form
- Autocomplete from categories already present on existing events

**UI — calendar views:**
- Optional: show a small category chip/dot on event cards
- Category filter in Agenda view toolbar (similar to task source filter)

**Batch operations (the main value):**
- A "Category actions" panel (accessible from settings or a long-press on a category chip)
- Actions: **Shift all events in category by N days/weeks** — moves every non-recurring
  matching event forward or backward by the specified offset; for recurring series, asks
  whether to shift the next occurrence only or the entire series
- Also add a: hide/show all events in a category (toggle visibility without deleting)

**Implementation notes:**
- `CATEGORIES` is already parsed and serialized for VEVENT in `server/caldav/parser.js`
  (lines 152, 200) — backend support exists
- Client needs: category state in `state.js`, autocomplete utility in `taskUtils.js` or a new
  `eventUtils.js`, and the batch-shift endpoint in `server/routes/events.js`

## Remember
Update CLAUDE.md roadmap each time you finish a phase to track current progress.
Also push and build new docker image when finishing.

## Non-Goals
- Multi-user support
- Email or notification integration
- Enterprise CalDAV compatibility (Exchange, iCloud edge cases)
- Any external cloud dependency (save for weather API)