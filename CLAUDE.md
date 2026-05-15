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

`modalEditor.js`: 610 → 431 lines. `tasks.js`: 864 → 350 lines.

**Primary focus areas:**

- `client/components/modalEditor.js` — already large. It currently handles event creation/editing, NLP feedback, the time scroll wheel, repeat option rendering, alarm logic, recurring scope selection, and the duplicate action all in one file. Phases 5 and 6 will add the new time picker and the entire recurrence overhaul to this file, making it significantly larger. Assess whether it should be split before that work begins, and if so, where the natural split points are.
- `client/views/tasks.js` — handles the task list, filter toolbar, quick-add bar, task edit modal, and recurring task UI in one file. Adding LOCATION/URL fields (Phase 4) and the after-completion recurrence toggle (Phase 6) will grow this further.

**Output:** A short list of suggested splits/refactors with file names and proposed module boundaries. No implementation — just the recommendation so it can be decided before Phases 5 and 6 begin.

---

## Phase 1 — Bug Fixes

Small, self-contained fixes. No architectural changes. Can be done in any order within this phase.

### 1.1 Weather initial-load trigger

**Problem:** Weather does not fetch when opening the app for the first time if coordinates are already saved in settings. The hourly refresh loop in `main.js` only covers subsequent refreshes, not the initial load.

**Fix:** On app startup, after settings are loaded, check if `state.config.weatherLat` and `state.config.weatherLon` are already set. If they are, call `loadWeather()` immediately — do not wait for the geolocation API to resolve.

**File:** `client/app/main.js`

---

### 1.2 Tapping active view tab returns to today + current time

**Problem:** Tapping a view tab in the bottom navbar when that view is already active does nothing. Expected: navigating to another week/month and tapping the active tab should snap back.

**Fix:** In `switchView()` in `main.js`: if the tapped view equals `state.activeView`, reset `state.selectedDate` to today and re-render. For day and week views, also scroll the time grid to the current hour after render.

**Applies to:** All views — day, week, month, agenda. For agenda, scroll to top is sufficient (no time grid).

**Files:** `client/app/main.js`, `client/views/day.js`, `client/views/week.js`

---

### 1.3 Quick add bar fixed positioning

**Problem:** The quick add bar (present in calendar views and task view) can scroll behind the bottom navbar after a PWA page refresh. The layout shift occurs because the bar is positioned in the normal document flow.

**Fix:** Apply `position: fixed; bottom: <nav-height>` to all quick add bars, matching the approach used for the navbar fix. Update layout padding on the scroll container to account for both the navbar and the quick add bar height so content is never obscured.

**Applies to:** All views that have a quick add bar — day, week, month, agenda, and tasks.

**Files:** `client/styles/main.css`, `client/styles/tasks.css`

---

### 1.4 Task filter logic: cross-type = AND, same-type = OR

**Problem:** Enabling both "done" and "starred" filters in the task list shows all done tasks regardless of star (OR behavior). Expected: both filters active should show only tasks that are done AND starred.

**Rule:**
- Cross-type filters (e.g. done × starred) → AND: task must satisfy all active filters
- Same-type filters (e.g. source A × source B) → OR: task must match any selected source

This matches the standard behavior of task apps like Todoist and Things.

**File:** `client/views/tasks.js`

---

## Phase 2 — Settings & Modal Layout

UI reshuffling — no business logic changes.

### 2.1 Clear cache and logout: move to top of settings modal

**Current state:** Both buttons sit at the bottom of the settings modal alongside Save and Cancel, which is confusing — they appear to be part of the save flow.

**Fix:** Move clear cache and logout to the top of the settings modal as a distinct row, visually separated from the settings fields below. These are destructive/session actions and should not be grouped with Save/Cancel.

---

### 2.2 Settings view order matches navbar order

**Current state:** The "visible views" checkboxes in settings may not match the fixed order of tabs in the bottom navbar.

**Fix:** The navbar order is fixed: **Agenda → Day → Week → Month → Tasks**. The visible views section in settings must reflect this exact order so the user sees them in the same sequence as the navbar. No drag-to-reorder needed — fixed order is fine.

---

### 2.3 Task edit modal layout: repeat + reminder on same row

Move the repeat selector and the reminder selector to share one row in the task edit modal. They are both short selectors and the current layout wastes vertical space by placing them on separate rows.

**File:** `client/views/tasks.js`

---

### 2.4 Event modal: duplicate button — new icon, move beside title

**Current state:** The duplicate button is in the action row at the bottom of the event edit modal.

**Fix:**
- Change the icon to a copy/duplicate icon (distinct from the edit pencil)
- Move it to sit beside the event title in the modal header
- Remove the bottom-row duplicate button entirely (replace, do not coexist)

**File:** `client/components/modalEditor.js`

---

## Phase 3 — NLP Enhancement

### 3.1 Full Norwegian + English support, order-independent parsing

**Current state:** `server/nlp/parser.js` normalizes some Norwegian expressions before passing to chrono-node (e.g. "om 3 dager" → "in 3 days", "hver mandag" → "every monday"), but Norwegian month names are missing from the normalization map entirely.

**Requirements:**
- Full Norwegian month names must be normalized: januar, februar, mars, april, mai, juni, juli, august, september, oktober, november, desember
- Full Norwegian weekday names must be covered (check existing map for gaps): mandag, tirsdag, onsdag, torsdag, fredag, lørdag, søndag
- Word order must not matter. "Noe 14:00 juni", "juni 14:00 noe", and "møte juni 14:00" must all parse to the same result
- Position in sentence must not matter — a month name or time in the middle of a title string must still be detected
- Context-dependent relative expressions like "om 3 dager" (meaning depends on word order/sentence structure) remain handled separately and are not affected by this change

**Applies to:** Both `server/nlp/parser.js` (events) and `server/nlp/taskParser.js` (tasks)

**Validation test cases:**
- `"Noe 14:00 juni"` → time: 14:00, month: June (current year)
- `"Møte fredag 10:00"` → Friday 10:00
- `"Treningsøkt hver mandag 19:00"` → every Monday 19:00
- `"Middag 18. juni"` → June 18th
- `"Meeting tomorrow 14:00 june"` → English still works
- `"Lunsj 12:30 neste onsdag"` → next Wednesday 12:30

---

## Phase 4 — Task Location and URL Fields

### 4.1 Add LOCATION and URL to VTODO backend

**Current state:** `LOCATION` and `URL` are parsed and serialized for VEVENT (`caldav/parser.js` lines 152–153, 200–201) but the VTODO parser and serializer have neither field. Both are valid VTODO properties per the CalDAV/iCalendar spec.

**Fix:**
- Add `location` and `url` extraction to the VTODO parser in `server/caldav/parser.js`
- Add `LOCATION:` and `URL:` lines to the VTODO ICS serializer in the same file (only if value is non-empty)

**File:** `server/caldav/parser.js`

---

### 4.2 Add location and URL to task edit modal

- Add two input fields to the task edit modal: Location (text) and URL (text/url)
- Fields sit side-by-side in one row, positioned above the notes/description field
- Fields are optional — if both are empty, the row can be collapsed or shown as placeholder only
- URL field should use `type="url"` for appropriate mobile keyboard

**File:** `client/views/tasks.js`

---

## Phase 5 — Picker Overhaul

**This phase must be completed before Phase 6.** Both phases touch `modalEditor.js` heavily, and settling on the final picker implementations first avoids conflicts during the recurrence overhaul.

### 5.1 Date picker: extend existing custom picker to all modals

**Current state:** `client/components/datePicker.js` has a custom mini-calendar that correctly respects `state.config.weekStart`. It is used for month/year selection in month view but not for date inputs in the event modal or task edit modal, which still use native `<input type="date">` (which ignores week start configuration).

**Fix:** Wire the existing custom mini-calendar to all date input fields in the event modal and the task edit modal, replacing native `<input type="date">` throughout. One date picker style everywhere in the app.

**Files:** `client/components/datePicker.js`, `client/components/modalEditor.js`, `client/views/tasks.js`

---

### 5.2 Time picker: hybrid dial with 24h display

**Current state:** Mobile uses a custom vertical scroll-wheel picker (`buildTimeWheel()` in `modalEditor.js`). Desktop uses native `<input type="time">`. Placement and visual design of the current mobile implementation are not satisfactory.

**New design: hybrid dial picker (replace current wheel on all platforms)**

The picker consists of two parts:

1. **Time display at top** — shows the current selected time as large tappable segments (e.g. `14 : 30`). Tapping the hour segment activates hour selection on the dial; tapping the minutes segment activates minute selection.

2. **24h dial below** — a circular clock face showing all 24 hours. Inner ring: 13–00 (the "night" hours). Outer ring: 1–12. The active hand snaps to the nearest hour/minute as the user drags or taps. After selecting an hour, the picker automatically switches to minute selection.

This is a single implementation used on all platforms (mobile and desktop), replacing both the current scroll wheel and the native input. The design is modern, thumb-friendly, and naturally communicates 24h format.

**Files:** `client/components/modalEditor.js`, plus a new `client/components/timePicker.js` if the implementation warrants it

---

## Phase 6 — Recurrence Overhaul

This is the largest phase. The architecture must be reviewed and agreed on before any code is written. Do not start this phase while any other phase that touches `modalEditor.js` is in progress.

---

### 6.1 Architecture: RecurrenceConfig

Introduce a `RecurrenceConfig` JSDoc typedef as the single internal representation for standard recurrence. The UI edits this object; a serializer generates RRULE strings from it; a parser reconstructs it from existing RRULE strings.

```js
/**
 * @typedef {Object} RecurrenceConfig
 * @property {"daily"|"weekly"|"monthly"|"yearly"} freq
 * @property {number} interval                  - default 1
 * @property {number[]} [byWeekdays]            - 0=Mon … 6=Sun (rrule.js convention)
 * @property {number} [byMonthDay]              - e.g. 15 → "15th of each month"
 * @property {number} [bySetPos]                - e.g. 3 → "3rd weekday of month"
 * @property {Date} [until]                     - maps to UNTIL=
 * @property {number} [count]                   - maps to COUNT=
 * @property {Date[]} [exceptions]              - maps to EXDATE entries
 */
```

`RecurrenceConfig` is for **standard RRULE only** — shared between events and tasks. Task after-completion recurrence (`X-RECURRING-*`) is a separate code path (see 6.6).

---

### 6.2 Preset list

Replace the current modal's recurrence options with:

```
None
Daily
Weekdays         → FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR
Weekly           → reveals day chips + interval row
Monthly          → reveals day-of-month vs nth-weekday radio
Yearly
Custom           → reveals full interval spinner
```

"Every 2 weeks" is **not** a standalone preset. It is the natural output of Weekly with interval=2. When "Weekly" is selected, an interval row is always shown ("Repeat every [1] week(s)"). Setting it to 2 gives "every 2 weeks", confirmed by the human-readable preview.

---

### 6.3 Weekly sub-UI

When "Weekly" is selected:
- Interval row: "Repeat every [1] week(s)" — number input, min 1
- Day-of-week chips: [Mon] [Tue] [Wed] [Thu] [Fri] [Sat] [Sun] (order respects `state.config.weekStart`)
- The DTSTART weekday is pre-selected; user can add or remove days
- Maps to: `RRULE:FREQ=WEEKLY;INTERVAL=N;BYDAY=<selected>`

---

### 6.4 Monthly sub-UI

When "Monthly" is selected, show a radio between two options — both derived from DTSTART:

```
(*) Day 15 of every month           → BYMONTHDAY=15
( ) Third Monday of every month     → BYDAY=MO;BYSETPOS=3
```

**Date-change behavior:** If the user changes the event's start date, both options update their day/ordinal values automatically. If the user has explicitly clicked to switch between the two radio options (not just accepted the default), preserve the mode choice but update the value.

---

### 6.5 End conditions

Below the preset and sub-UI, always show:

```
Ends:
(*) Never
( ) On date  [date picker]
( ) After [N] occurrences
```

Maps to: no UNTIL/COUNT, `UNTIL=<date>`, `COUNT=<n>`.

---

### 6.6 Human-readable preview (required)

Always visible once any recurrence is selected. Updates live as any option changes. Shown as a single plain-text line above the visual preview:

> Repeats every 2 weeks on Monday and Thursday · Ends after 12 occurrences

This is mandatory — it is the primary tool for preventing user mistakes with complex rules.

---

### 6.7 Visual mini-calendar preview (required)

A small inline calendar showing upcoming occurrence dates marked with a dot or highlight:

```
May 2026
Mo Tu We Th Fr Sa Su
             •     •
 •             
```

**Rules:**
- Show the next **6 occurrences**, capped at **24 months ahead**
- For rules with UNTIL or COUNT, show all remaining occurrences up to 6
- Updates live as any recurrence option changes
- Implemented via `rrule.js` `.all({ limit: 6 })` — already available in the project
- For yearly rules 6 occurrences = 6 years — this is informative, not a problem

---

### 6.8 Task after-completion recurrence

The task edit modal recurrence section gains a top-level mode toggle:

```
[ Fixed schedule ]  [ After completion ]
```

- **Fixed schedule** — uses RecurrenceConfig + preset UI (6.2–6.5), same as events. The "Weekdays" preset is hidden for tasks (tasks have no time slot, weekday frequency is less meaningful).
- **After completion** — uses `xRecurringType: 'after-completion'` + `xRecurringInterval`. Shows only: "Repeat [N] [days / weeks] after completion". No day chips, no end conditions, no visual preview.

These modes are mutually exclusive. `X-RECURRING-*` wins if both are present on a VTODO (existing behavior, unchanged). The toggle makes mutual exclusivity explicit to the user.

**After-completion mode is task-only and must not appear anywhere in the event modal.**

---

### 6.9 Advanced options (collapsible, hidden by default)

A collapsible section at the bottom of the recurrence UI for power users:

- **Custom RRULE editor** — raw text input. Pre-populated with the current rule when the user expands it.
- **Exclude dates** — UI to add/remove EXDATE entries on the master event

Explicitly deferred from this phase:
- "Business days only" — covered by the Weekdays preset for the common case; monthly/yearly business-day rules require `BYSETPOS` and are too niche for the initial overhaul
- Timezone behavior and first weekday — defer

---

### 6.10 RRULE → RecurrenceConfig parser (CalDAV compatibility)

Events and tasks imported from other CalDAV clients (Thunderbird, Apple Calendar, etc.) can carry RRULEs that don't map to any preset. The parser must not silently corrupt these.

**Behavior:**
1. Attempt best-effort mapping of the existing RRULE string to RecurrenceConfig
2. If it maps cleanly → show the structured UI normally with the correct preset pre-selected
3. If it cannot map (unrecognised combination, e.g. `FREQ=WEEKLY;INTERVAL=3;BYDAY=MO,WE`) → open the Advanced section automatically, show the raw RRULE in the custom RRULE editor, display a notice: *"Complex recurrence rule — edit with care"*, and hide the structured preset controls
4. On save: if the user did not touch the raw RRULE editor, pass it through unchanged. Only serialize from RecurrenceConfig if the user interacted with the structured UI.

This preserves CalDAV data integrity for events created by other clients.
---

## Remember
Update CLAUDE.md roadmap each time you finish a phase to track current progress.
Also push and build new docker image when finishing.

## Non-Goals
- Multi-user support
- Email or notification integration
- Enterprise CalDAV compatibility (Exchange, iCloud edge cases)
- Any external cloud dependency (save for weather API)