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
      app.js                Serves static files + mounts all routes
      config.js             Load + validate .env
      caldav/
        client.js           CalDAV communication (Radicale-optimized)
        sync.js             Sync engine (etag-based incremental)
        parser.js           ICS parsing + normalization (VEVENT + VTODO)
        recurrence.js       RRULE expansion, EXDATE, computeNextDue for tasks
      nlp/
        parser.js           Event NLP — chrono-node + Norwegian normalization
        taskParser.js       Task NLP — due date + recurrence extraction
      routes/
        events.js           CRUD + POST /events/batch-shift
        calendars.js
        sync.js             POST /sync, POST /sync/clear
        tasks.js            CRUD + POST /tasks/:id/complete
        nlp.js              POST /nlp/parse, POST /nlp/parse-task
        weather.js          GET /weather (met.no proxy)
        settings.js         GET/PUT /settings
        auth.js             POST /login, POST /logout, GET /auth/status
      middleware/
        auth.js             Session-cookie auth gate
      cache/
        store.js            In-memory Map, flushed to /cache/events.json on write

    /client
      app/
        main.js             Boot, routing, event/task CRUD handlers
        state.js            Single source of truth — events, tasks, config, weather
        utils.js            Shared: formatTime, localDateStr, esc, getTimezone, …
        taskUtils.js        getAllCategories, parseTagsFromTitle, groupTasksByCategory
        eventUtils.js       getAllEventCategories
        theme.js            Light/dark theme toggle
        installPrompt.js    PWA install banner
      views/
        day.js              Day time-grid view
        week.js             Week time-grid view
        month.js            Month cell grid
        agenda.js           Linear day-list view (with category filter)
        tasks.js            Task list — filtering, grouping, sorting
        dayPopup.js         Shared day-detail popup (used by month + week)
      components/
        modalEditor.js      Event create/edit modal (date/time/recurrence/categories)
        taskModal.js        Task create/edit modal
        taskQuickAdd.js     Task quick-add bar (fixed above bottom-nav)
        timePicker.js       24h dial time picker (overlay, all platforms)
        datePicker.js       Custom mini-calendar date picker (respects weekStart)
        recurrenceUI.js     Structured recurrence editor (presets, chips, preview)
        rruleParser.js      parseRrule / serializeConfig / humanReadable (pure)
        recurrencePreview.js getOccurrences + buildMiniCal (async, uses rrule ESM)
        settingsPanel.js    Settings modal
        calendarDrawer.js   Calendar sidebar/drawer
        timeGrid.js         Shared time-column and hour-line builders
        taskItem.js         Individual task row renderer
        dnd.js              Drag-and-drop + long-press + swipe
      styles/
        main.css            Global styles + CSS custom properties (light + dark)
        views.css           View-specific layout
        month.css           Month grid + day-popup styles
        tasks.css           Task list styles

    /public
      index.html
      manifest.json         PWA config
      service-worker.js     Offline shell

    /docker
      Dockerfile
      docker-compose.yml

    .github/
      workflows/
        docker.yml          Build + push multi-arch image to GHCR on push to main

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

**Navigation:** Max 5 visible tabs (Agenda → Day → Week → Month → Tasks). User selects which views are shown via Settings. Tasks tab hidden unless explicitly enabled. Tapping the active view tab returns to today + scrolls to current time.

**Multiple Calendars:** Radicale exposes multiple calendars per user. All are fetched, displayed with per-calendar color coding, and individually toggle-able via the sidebar drawer.

**Event Management:** Create / edit / delete, drag-and-drop (desktop), long-press drag (mobile), timezone-aware, duplicate with all fields copied. Events open in the edit modal directly (no separate read-only mode).

**Event Categories:** Free-text tags stored as `CATEGORIES` in VEVENT, separate from task categories. Multi-value chip UI in the event modal with autocomplete from existing events. Category filter in Agenda view. **Batch shift**: shift all events in a category forward/back by N days — non-recurring events get new dates; finite recurring series have DTSTART moved; infinite recurring events get EXDATE entries for the vacation window so the program skips the gap and resumes normally.

**Natural Language Input:**
- English and Norwegian fully supported, order-independent (time/date/month can appear anywhere in the sentence)
- "Meeting with John tomorrow 14:00" / "Treningsøkt 14:00 juni" / "Lunsj 12:30 neste onsdag"
- Parsed into: title, start/end time, recurrence rule
- NLP-resolved times always override default-time logic — never clamped or rounded
- `#tag` syntax in task quick-add creates a category

**Recurring Events:** Structured recurrence editor (RecurrenceConfig architecture):
- Presets: None / Daily / Weekdays / Weekly / Monthly / Yearly / Custom
- Weekly: interval spinner + day-of-week chips (ordered by weekStart setting)
- Monthly: radio between day-of-month and Nth-weekday-of-month (both derived from start date)
- End conditions: Never / On date / After N occurrences
- Live human-readable summary + visual mini-calendar showing next 6 occurrences
- Advanced section (collapsible): raw RRULE editor — falls back to this for complex imported rules
- Edit scope: this occurrence / this and following / entire series
- Tasks have an additional "After completion" mode (X-RECURRING-* properties)

**Date & Time Pickers:** Custom across all platforms:
- Date: mini-calendar overlay (respects weekStart), collapsible button in modals
- Time: 24h circular dial picker (overlay) — outer ring 1–12, inner ring 0/13–23; auto-advances hour→minute on selection

**Weather:** Fetched from met.no on startup (when coordinates saved) and hourly. Shows emoji + temperature in Day/Week/Agenda headers and Month cells. Location auto-detected or manually set in Settings.

**CalDAV Sync:** Incremental via etag/last-modified, last-write-wins conflict strategy, manual + auto sync triggers.

**PWA:** Installable, offline UI shell showing cached events, fast startup. Quick-add bars are `position: fixed` to survive PWA refreshes.

**Tasks** (opt-in via Settings):
- Stored as VTODO in a dedicated Radicale CalDAV collection
- Separate tasks view (To Do-style list)
- Optional: show tasks on calendar views (separate toggle per view)
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
    LOCATION             // optional, plain text
    URL                  // optional
    STATUS               // NEEDS-ACTION | COMPLETED
    DUE                  // date only (no time in UI, full datetime supported on backend)
    COMPLETED            // timestamp, set on completion
    CATEGORIES           // tags — multi-select, free text; also drives "important" star
    RRULE                // standard recurring (optional)
    X-RECURRING-TYPE     // after-completion (optional)
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

The task edit modal has a top-level **mode toggle**: Fixed schedule vs After completion. These are mutually exclusive.

**Fixed schedule** uses the shared `RecurrenceConfig` recurrence editor (same as events, but with Weekdays preset hidden). Presets: None / Daily / Weekly / Monthly / Yearly / Custom. Includes end conditions and visual preview.

**After completion** uses `X-RECURRING-TYPE:after-completion` + `X-RECURRING-INTERVAL`. UI shows: "Every [N] day(s)/week(s) after completion." No end conditions, no preview.

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
- Edit view: title, due date (custom mini-calendar picker), location/URL (collapsible), notes, categories (chips + autocomplete), repeat/reminder (collapsible if unused), completed checkbox

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

### Event Modal

Events open directly in the edit modal (no separate read-only step). Modal fields:
- **Title** — with ⧉ duplicate button beside it (copies all fields)
- **Date/time** — custom date buttons (mini-calendar overlay) + 24h dial time picker; All-day toggle
- **Calendar selector**
- **Remind me + Repeat** — on the same row; collapsible behind `+ Reminder / Repeat` when both are unused
  - Remind me: None / 5 min / 15 min / 1 hour / Custom before
  - Repeat: structured editor (see Recurring Events in Core Features)
- **Location / URL** — collapsible; shows inline summary when collapsed with values
- **Categories** — chips + autocomplete + collapsible batch-shift panel
- **Description** — textarea
- **Edit scope** (recurring events only): This event only / This and following / All events in series

### Event Creation

**Default time logic:**
- New events default to the nearest future hour relative to current time
- Future dates default to a configurable time in Settings (default: 09:00)
- NLP-resolved times always override — never clamped or rounded

**Duplicate event:**
- ⧉ button beside the title copies all fields (title, time, location, url, description, rrule, alarmMinutes, categories) and opens the edit modal for adjustment before save

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
- Tapping the date in the Day view header opens the custom date picker

**Week view date header:**
- Tapping the date number in a column header opens the day popup for that day (same popup as month view)

**Day popup:**
- Shared component (`dayPopup.js`) used by both month and week views
- Shows events and tasks for that day; footer buttons for + Event, + Task, Day view →

**Time picker:**
- 24h circular dial (tap-to-open overlay): outer ring 1–12, inner ring 0/13–23
- Tapping the hour segment selects hour; auto-advances to minute selection on release
- Minute selection auto-closes the picker

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
    POST   /events/batch-shift            { category, shiftDays }

    GET    /calendars
    POST   /sync
    POST   /sync/clear
    GET    /health

    GET    /tasks
    POST   /tasks
    PUT    /tasks/:id
    DELETE /tasks/:id
    POST   /tasks/:id/complete
    GET    /task-sources

    POST   /nlp/parse                     { text } → { parsed, title, start, end, allDay, rrule, parsedText }
    POST   /nlp/parse-task                { text } → { parsed, title, due, rrule, xRecurringType, xRecurringInterval }

    GET    /weather?lat=&lon=             Proxies met.no, returns { current, daily }

    GET    /settings
    PUT    /settings

    POST   /login
    POST   /logout
    GET    /auth/status

## Testing

No automated tests currently. RRULE edge cases and NLP parsing are the highest-risk areas. The `test/` directory has historical recurrence + NLP test files but they are not wired to a test runner.
- [ ] create said test runner
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

## Roadmap

### Open items — Settings improvements

- [x] **Event categories in Settings** — added collapsible "Event categories" section in `settingsHelpers.js`; hides event categories from agenda filter bar and event modal autocomplete via `hiddenEventCategories` config field.
- [x] **Move sync range fields to Sync section** — `s-sync-history` and `s-sync-future` moved from Events to Sync section in `settingsPanel.js`.
- [x] **Replace native time inputs with custom picker** — `s-task-reminder-morning`, `s-task-reminder-evening`, and `s-default-event-time` now use `buildTimePicker` via UTC anchor dates; hidden input ids unchanged so `handleSave` reads them identically.
- [x] **Split `settingsPanel.js`** — extracted `renderTaskSourcesSection` and `renderCategoriesSection` into `client/components/settingsHelpers.js` (202 lines); `settingsPanel.js` reduced from 648 → 468 lines.

### Phase 9 — Batch shift: split at anchor (history-preserving)

**Problem with current approach:** Shifting DTSTART rewrites the whole series including past occurrences. A user who completed Jan 1, Jan 29, Feb 26 and shifts in March doesn't want their history rewritten — they want future occurrences to adapt while completed sessions stay fixed.

**Model:** past occurrences = immutable history; future occurrences = flexible plan.

#### UX change (client-side)

The batch shift row gets two buttons instead of one:
- **Shift future** (default, highlighted) — splits the series at the anchor, leaves history untouched
- **Shift all** — current behavior, shifts DTSTART of the entire series (kept for edge cases)

The **anchor date** = the `occurrenceDate` (or `start`) of the event that opened the modal. The user opens "Apr 23" → anchor is Apr 23 → everything before Apr 23 is untouched, Apr 23 and later shifts.

API call gains a new optional field: `{ category, shiftDays, anchorDate? }`. When `anchorDate` is absent, behavior is "shift all" (current default).

#### Server algorithm for "shift future" mode

For each matching event:

**Non-recurring:** only shift if `ev.start >= anchorDate`. Events that already happened stay put.

**Recurring, DTSTART >= anchorDate:** entire series is already in the future — shift DTSTART normally, same as "shift all".

**Recurring, DTSTART < anchorDate (needs split):**
1. Find `lastBefore` = last occurrence strictly before `anchorDate` using `rrule.before(anchorDate, false)`.
2. Find `firstAtOrAfter` = first occurrence at or after `anchorDate` using `rrule.after(anchorDate, true)`. If none exists (series already ended), skip.
3. **Update existing series**: add `UNTIL=lastBefore` to the RRULE (using `setRruleUntil`). PUT back to Radicale.
4. **Create new series**: new UID, same title/categories/all other fields, `DTSTART = firstAtOrAfter + shiftMs`, same RRULE without UNTIL, `exdates: null`. POST to Radicale.

Result:
```
Series A (history):  DTSTART=Jan 1,  RRULE=FREQ=WEEKLY;INTERVAL=4;UNTIL=20260226
Series B (shifted):  DTSTART=Apr 2,  RRULE=FREQ=WEEKLY;INTERVAL=4
```
Cadence preserved, history immutable, future shifted.

#### Known pre-existing issue to fix alongside

`setRruleUntil(rruleStr, untilDate)` in `server/caldav/recurrence.js` always writes `UNTIL=` in DATETIME format (`formatIcsDate(date, false)`). For all-day recurring events the RRULE must have `UNTIL` as a DATE value (no time component). Fix: pass `ev.allDay` through to `setRruleUntil` and use `formatIcsDate(date, allDay)`.

#### Files to touch

- `server/routes/events.js` — `POST /events/batch-shift`: accept `anchorDate`, implement split logic
- `server/caldav/recurrence.js` — fix `setRruleUntil` to handle all-day
- `server/caldav/client.js` — already has `putEventAtHref`; need `putEvent(calendarId, uid, ics)` for the new series (no etag, create)
- `client/components/modalEditor.js` — two-button UI, pass `anchorDate = event.occurrenceDate || event.start` with "Shift future", omit for "Shift all"

### Future — not scheduled

- [ ] **Timezone selector** — Right now the timezone can only be changed by editing `.env` or `settings.json` on the server. Adding it to the Settings UI would mean: shipping a static list of IANA timezone names (e.g. `Europe/Oslo`, `America/New_York`) to the client as a JSON file; rendering a searchable `<select>` in Settings; saving the chosen value to `settings.json` via `PUT /settings`; then reloading the page so all views and time formatters re-initialize with the new zone. The reload is mandatory because the timezone flows through `state.config.timezone` which is read at boot and baked into dozens of `formatTime()` calls — there is no live re-render path today. This is a non-trivial amount of surface area to test and the audience (single-user, self-hosted) can reasonably edit a config file, so it is deferred until there is a clear demand.

- [ ] **Clarify "Events future (days)" sync limit** — In the Settings panel there is a number input labelled `"Events future (days, 0=all)"`. The `, 0=all` part is tacked onto the label and easy to miss. What it means: when set to `0`, the server fetches all future events from CalDAV with no upper date bound; when set to e.g. `365`, it only syncs events within the next year (saving memory and sync time for very large calendars). The confusion is that `0` is both the default value and a magic sentinel meaning "unlimited" — a user who blanks the field or types `0` wanting "zero days ahead" would accidentally enable unlimited sync instead. The fix could be a dropdown with an explicit "No limit" option, or just changing the label to `"Events future (days, blank = no limit)"` and treating blank/0 the same way. Deferred because it requires a careful label + validation change in both the frontend (`settingsPanel.js`) and possibly the backend sync range logic in `server/caldav/sync.js`.

### Phase 8 — Code health + modal duplication

From the Phase 0 round-2 audit, these duplications and bugs remain:

#### 8.1 Bug: 'important' category re-injected on task save
- [x] `taskModal.js` save handler re-adds `'important'` to categories even if the user removed
  the star during editing. `finalCats` should simply be `[...modalCats]` — 'important' is
  already in the array if the user kept it.

#### 8.2 Extract shared modal helpers (reduce duplication) ✓ COMPLETE
- [x] **Location/URL collapse** — extracted to `mountLocationUrlSection` in `modalHelpers.js`
- [x] **Category chips + autocomplete** — extracted to `wireCategoryUI` in `modalHelpers.js`
- [x] **Date picker button** — extracted to `buildDatePickerButton` in `modalHelpers.js`
- [x] **Reminder/Repeat collapse** — extracted to `mountCollapsibleToggle` in `modalHelpers.js`

#### 8.3 `month.js` — `dayStr` defined after use in closure ✓ COMPLETE
- [x] Moved `const dayStr = localDateStr(day)` above the `numWrap` click callback that uses it.

### Bug fixes (post-Phase 8)

- [x] **RRULE silently dropped on event edit** — `filterChanges()` in `server/routes/events.js` did not include `rrule` in its allowlist, so any change to a recurring rule (add, modify, remove) was stripped on PUT. Fixed by adding `'rrule'` to the allowed array. Also fixed `handleFutureEdit` where `rrule: base.rrule` was placed after `...filterChanges(changes)` in the object literal, always overriding the user's new rule — spread order swapped so user change wins.
- [x] **Modal collapsibles UX** — Location/URL: removed the "Remove" button; the `▼ Location / URL` header is now the collapse trigger and persists current input values. Remind me / Repeat: `mountCollapsibleToggle` is now a proper two-way toggle (was expand-only). Categories in task and event modals: wrapped in `mountCollapsibleToggle` — collapsed by default when empty, expanded when there are categories.

## Remember
Update CLAUDE.md roadmap each time you finish a phase to track current progress.
Also push and build new docker image when finishing.

## Non-Goals
- Multi-user support
- Email or notification integration
- Enterprise CalDAV compatibility (Exchange, iCloud edge cases)
- Any external cloud dependency (save for weather API)