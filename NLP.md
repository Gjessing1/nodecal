# NLP Quick-Add Reference

Natural language input works in the event quick-add bar, the new-event title field, and the task quick-add bar. English and Norwegian are supported. Unrecognised input opens the full editor with the text pre-filled as the title.

---

## Events

### Dates — English

| Input | Resolves to |
|---|---|
| today, tomorrow | current / next day |
| Monday … Sunday | next occurrence of that weekday |
| next Monday, last Friday | relative weekday |
| next week, next month, next year | start of that period |
| January 15, Jan 15, 15 January | specific date |
| 2025-01-15 | ISO date |

### Dates — Norwegian

| Input | Resolves to |
|---|---|
| i dag / idag | today |
| i morgen / imorgen | tomorrow |
| mandag … søndag | next occurrence of that weekday |
| neste mandag | next monday |
| forrige fredag | last friday |
| neste uke | next week |
| neste måned | next month |
| neste år | next year |
| jan/januar … des/desember | month names |

### Times

| Input | Resolves to |
|---|---|
| 14:00, 9:30 | 24h time |
| 2pm, 2:30pm | 12h time |
| 18-21 | time range 18:00–21:00 |
| kl. 14 / kl 14 / klokken 14 | 14:00 (Norwegian clock prefix) |

### Recurrence — English

| Input | Rule |
|---|---|
| every day / daily | FREQ=DAILY |
| every week / weekly | FREQ=WEEKLY |
| every month / monthly | FREQ=MONTHLY |
| every year / yearly / annually | FREQ=YEARLY |
| every Monday (…Sunday) | FREQ=WEEKLY;BYDAY=MO (etc.) |

### Recurrence — Norwegian

| Input | Rule |
|---|---|
| hver dag / daglig | FREQ=DAILY |
| hver uke / ukentlig | FREQ=WEEKLY |
| hver måned / månedlig | FREQ=MONTHLY |
| hvert år / årlig | FREQ=YEARLY |
| hver mandag (…søndag) | FREQ=WEEKLY;BYDAY=MO (etc.) |

### Example event phrases

```
Team meeting tomorrow 14:00
Dinner Friday 18-21
Doctor next Monday at 9
Gym every Wednesday 19
Møte neste tirsdag 10:00
Middag fredag 18-21
Trening hver mandag 19
Kafe neste uke
```

---

## Tasks

Task NLP works the same way for dates/days, with additional recurrence patterns:

### Recurrence — English (tasks only)

| Input | Rule |
|---|---|
| every 3 days | FREQ=DAILY;INTERVAL=3 |
| every 2 weeks | FREQ=WEEKLY;INTERVAL=2 |
| every N days after completion | X-RECURRING-TYPE:after-completion, interval Nd |
| every N weeks after completion | X-RECURRING-TYPE:after-completion, interval Nw |
| after completion every day/week | X-RECURRING-TYPE:after-completion, interval daily/weekly |

### Recurrence — Norwegian (tasks only)

| Input | Translates to |
|---|---|
| etter fullføring | after completion |
| etter gjennomføring | after completion |
| hvert 3. dag | every 3 days |
| hver / hvert | every |
| dager | days |
| uker | weeks |
| måneder | months |

### Example task phrases

```
Buy milk tomorrow
Dentist next Friday
Pay rent monthly
Water plants every 3 days after completion
Kjøp melk mandag
Betal regning neste måned
Vann planter etter fullføring hver 5 dag
```

---

## Known gaps

| Pattern | Status |
|---|---|
| "om 2 dager" (in 2 days) | Not supported — "om" not translated |
| "overmorgen" (day after tomorrow) | Not supported |
| "in an hour" / "in 30 minutes" | Not supported |
| "the 3rd of next month" | Not reliable |
| Season references ("next summer") | Not supported |
| NLP highlight in blue | Shows for English matches; Norwegian text highlighted after translation so may not align with original input |
