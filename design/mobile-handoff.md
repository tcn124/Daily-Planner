# Mobile handoff — Weekly Planner as a PWA

Context for designing the phone version in Claude Design. The desktop app is
built and working; this covers what it is, what it's made of, what breaks at
phone width, and which constraints should shape the design.

Design the **framework**: navigation model, screen layouts, and the component
variants a phone needs. Hand it back as a canvas in `design/` alongside
`Main Page.dc.html` and `Supporting Screens.dc.html`, and it gets implemented
from there.

---

## 1. What the product is

A weekly student planner. Three kinds of thing live on a day:

| | Fields | Notes |
|---|---|---|
| **Assignment** | subject, title, details, time, done | The main object |
| **Event** | same shape, different band | Lectures, meetings |
| **Recurring** | subject, title, start–end date, per-day done | Drawn as a bar spanning days |

Plus **to-dos** (loose text chips, no date) and a free-text **note per day**.

**Title vs details** matters for layout: `description` is a short title
("Reading - Smith 1–20") shown in full; `details` is the specifics ("Smith,
Wealth of Nations Book I ch. 1–3. Bring two questions to section.") shown
smaller and clamped to two lines on a card.

Subjects are user-defined, each carrying one hue. A planner typically has 4–8.

**The phone's job**, in the owner's words: reference due dates, check things
off, add things — synced with the desktop app. It is not where syllabus
importing happens.

---

## 2. Design language

One ink colour at varying alpha over warm off-whites. No shadows beyond very
soft card lifts. Chrome is **DM Sans**; mastheads are **Source Serif 4**.
Weeks start Monday.

The desktop canvas is the source of truth for everything below; values are
taken verbatim from `src/styles/tokens.css`.

### Colour

```
--ink            #37352f      the only text colour, at alpha
--ink-82/70/60/45/40/35/30    rgba(55,53,47, .82 … .30)

--surface        #ffffff      cards, panels
--surface-sunken #f7f7f5      sidebar, notes box, composer fields
--surface-alt    #fcfcfb      alternating day columns, to-do strip
--surface-head   #fafaf8      list-view day group headers
--surface-today  #f6f6f4      today's column
--surface-hover  rgba(55,53,47,0.045)
--surface-active rgba(55,53,47,0.07)

--line-strong    rgba(55,53,47,0.12)   shell border, button outlines
--line           rgba(55,53,47,0.09)   band separators
--line-soft      rgba(55,53,47,0.07)   day column separators
--line-faint     rgba(55,53,47,0.06)   list row separators

--accent-solid   #37352f      primary button fill, today's date pill
--on-accent      #ffffff
--danger         #a13b2f
--missed-dot     #c25a4b
--missed-badge   bg #f7e3e0 / ink #8c352a
```

### Type scale

```
10.5  subject chips
11    section eyebrows, counts, meta
11.5  header eyebrow, day-page meta
12    to-do chips, breadcrumb, secondary buttons
12.5  card title, buttons
13    sidebar rows, list row text
13.5  sidebar nav rows
14    day-page item rows
14.5  weekday names
18    panel titles
21    "List" masthead
29    "August 2026" masthead          (Source Serif 4)
34    "August 25" day-page masthead   (Source Serif 4)
```

**Anything that is a text input on mobile must be ≥16px** or iOS zooms the page
on focus. The 12.5–13px field sizes above cannot carry over to form controls.

### Geometry

```
radius: card/button 6 · panel 10 · chip 4 · sidebar row 5 · to-do pill 14
sidebar 236  ·  collapsed rail 52  ·  topbar 36  ·  band header 30  ·  to-do strip 52
checkbox 13  ·  nav button 30  ·  recurring bar left border 3
card padding 8/9, gap 5
shadow-card       0 1px 2px rgba(15,15,15,0.04)
shadow-card-hover 0 2px 6px rgba(15,15,15,0.07)
shadow-panel      0 12px 32px rgba(15,15,15,0.08)
shadow-pop        0 14px 34px rgba(15,15,15,0.14)
```

### Subject colours — derived, not picked

Each subject stores **one hue (0–359)**; all four of its colours are computed
from it in OKLCH so any new subject fits the system automatically:

| Role | OKLCH |
|---|---|
| Chip background | `L 94.6% · C 0.021 · H` |
| Chip text | `L 41.2% · C 0.089 · H` |
| Dot, recurring bar edge | `L 61.2% · C 0.123 · H` |
| Row hover tint | `L 97% · C 0.012 · H` |

Seeded hues: Economics 225, Political Science 266, Journalism 29, History 139.
A `null` hue is neutral grey (`#eeeeeb` / `#6a6862` / `#9b9a94`).

**Please don't hand-pick new subject colours** — if a surface needs a subject
colour, name which of the four roles it uses and it will be generated.

---

## 3. What exists today (desktop)

| Screen | Shape |
|---|---|
| **Week** | 236px sidebar · top bar · 7 day columns × 3 stacked bands (Assignments / Events / Recurring) · 52px to-do strip. Columns scroll sideways with snap; bands are vertically resizable |
| **List** | Every day that has something, grouped by day or subject, one row per item, no date window |
| **Day page** | One day, serif masthead, flat item rows, notes box at the foot |
| **Composer** | ~300px popover anchored to a cell — subject chips, title, details, time, band |
| **Edit planner** | Right-hand 320px panel — subjects, day count, data actions |
| **Import review** | Wide panel, table of OCR'd rows. Desktop only — will not appear on phone |

Components in play: subject chip, item card, checkbox, ✕ delete, band header,
day header cell, recurring bar, to-do pill, sidebar row, missed-item row.

---

## 4. Measured reality at 393×852

Taken from the running app, iPhone 16 Pro viewport:

| | Value | Consequence |
|---|---|---|
| `.app` min-width | **900px** | Layout is 2.3× the screen |
| Page overflow | **0px — clipped, not scrollable** | Anything past 393px is unreachable |
| Sidebar | **236px = 60% of screen** | 157px left for content |
| Week grid | **1.65 of 7 columns visible** | Week view is meaningless |
| List row | **664px wide, overflows by 271px** | Actions at x=609 |
| Card in Today view | **649px wide** | Right edge unreachable |
| Composer popover | 300px, **77px off-screen** | Band control unreachable |
| Tap targets | checkbox 13 · ✕ 14 · sidebar row 28 · nav 30 | All under the 44pt minimum |

**The headline failure: you cannot check anything off.** Checkbox and delete sit
on the right edge of every row and card, off-screen, with no way to pan there.

**What already reads well:** the List and Day views. Type hierarchy, the
title/details relationship, and the chips all survive at phone width — the rows
just need rearranging. Worth preserving rather than redrawing.

---

## 5. What needs designing

**Target sizes:** 393×852 (iPhone 16 Pro) as primary; 375×667 (SE) must not
break; 430×932 should not look empty. Portrait only. Reserve the top safe area
(59pt Dynamic Island / 47pt notch) and bottom (34pt home indicator).

Screens and states:

1. **Navigation model** — the 236px sidebar has to become something else.
   A bottom tab bar is the obvious candidate (Week · List · Today · more), but
   that's the call to make. Subjects, Missed, Edit planner, and Export need a
   home wherever it lands.
2. **Day / Today** — the single most important screen. One day, its three
   bands, items with title + details + time + subject, checkable.
3. **Week** — at one full-width day with horizontal swipe between days. Needs a
   way to show where you are in the week and to jump days.
4. **List** — row restacked for a narrow column. Checkbox reachable, title and
   details legible, subject and time as supporting meta.
5. **Add / edit item** — the popover becomes a sheet. Subject chips, title,
   details, time, band. Consider what the keyboard covers.
6. **Recurring bars** — spanning bars are a wide-screen idea. They may need a
   different representation entirely on one-day-at-a-time.
7. **To-dos** — currently a 52px strip along the bottom, which collides with
   whatever navigation goes there.
8. **Subjects / settings** — as a sheet or a screen.
9. **Empty, loading, and offline states** — new for mobile; nothing exists.
10. **App icon** (180×180) and launch screen.

Per item, the affordances needed: complete, edit, delete, reschedule.

---

## 6. Hard constraints

- **44×44pt minimum** for anything tappable.
- **No hover.** The `+ Add` button and the card ✕ are hover-revealed today;
  on touch they must be persistent, or swipe actions, or in a menu.
- **Drag-and-drop does not work in iOS Safari.** Dragging a card to another day
  is a desktop-only affordance. Rescheduling needs a different gesture or an
  explicit action.
- **Inputs ≥16px** (see type scale).
- **Safe areas** top and bottom; the status bar overlays the app when installed.
- **No native anything** — no camera-roll OCR, no push, no share extension.
  Screenshot/PDF import stays desktop-only and should not be designed for.
- Installed via Safari → Add to Home Screen: opens full-screen, no browser
  chrome, own app-switcher card, offline-capable.

---

## 7. Build-cost signals

Worth knowing while designing — some things are nearly free, others are new work.

**Cheap (machinery already exists):**
- Horizontal swipe between days — the week view is already a scroll-snap track
- Title/details/time/chip card anatomy
- Subject chips with inline "+ New"
- The list's group-by-day / group-by-subject split
- Anything expressible as a CSS breakpoint on existing markup

**Moderate:**
- Bottom sheets, a tab bar, swipe-to-delete
- Restacking the list row
- New empty/loading/offline states

**Expensive (say so if the design needs it):**
- Touch drag-and-drop of any kind
- Gesture-driven reordering
- Anything requiring per-item animation across screens
- A layout that diverges so far from the desktop components that they fork

---

## 8. Realistic content

Design against this rather than lorem ipsum — the long details string is the
stress case:

```
Economics    Reading - Smith 1–20
             Smith, Wealth of Nations Book I ch. 1–3. Bring two
             questions to section.                       11:59 pm

History      Essay - Hamlet
             1500 words, submit on Canvas                11:59 pm

Journalism   Lecture: Media ethics                        2:00 pm   (event)

Economics    Problem Set 4                                          (done)

History      Read 20 pages          (recurring, Mon–Fri)
```

Subject names run long ("Political Science"). Titles are usually 2–5 words after
import; hand-typed ones can be a sentence. Details are often empty.

---

## 9. What to hand back

A canvas in `design/` covering the screens in §5, with inline styles carrying
real values the way the existing canvases do — those are read directly for exact
sizes and colours at implementation time.

Most useful alongside it:
- The navigation model stated plainly, including where every existing desktop
  affordance ended up
- Which existing components are reused unchanged vs. get a mobile variant
- Any new token values (with a note on what they were measured from)
- The breakpoint where mobile layout takes over

Anything not covered gets built by extrapolating from the desktop canvas, so
it's worth being explicit where that would guess wrong.
