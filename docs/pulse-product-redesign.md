# Pulse Product Redesign

## Why this exists

The current Workshop view proves that Pulse can connect to its private service,
but it is not a usable product surface. It presents a raw connection form, a
long creation form, and an unstructured list. It does not answer the questions
that matter when someone opens Pulse:

1. What needs my attention?
2. When will the next reminder fire?
3. Is the runner actually alive?
4. How do I add or change a reminder without decoding implementation details?

This redesign applies only to the Pulse plugin. Workshop remains the host and
must not gain Pulse-specific UI or private-service logic.

## Product standard

Pulse is a small control panel for persistent obligations, not a generic task
manager. The UI should make three jobs quick and calm:

| Job | Success condition |
| --- | --- |
| Create a reminder | A person can create a valid schedule and understand its notification behavior without reading docs. |
| Check a reminder | A person can see its next occurrence, status, recurrence, and runner health at a glance. |
| Change a reminder | A person can edit, pause, resume, or delete safely, with destructive choices made explicit. |

The phone owns **Done** and **Snooze** for a due occurrence. The Workshop view
does not duplicate those actions; it owns setup and management.

## Design principles

- **State before decoration.** The first screen shows active reminders and
  runner health, not a giant product title or an empty black field.
- **One clear primary action.** `New reminder` is visible without scrolling.
  Connection setup is shown only when Pulse is not connected.
- **Progressive disclosure.** Creation starts with the human choices: what,
  when, and how often. Timezone and notification timing live in an expandable
  delivery section with legible presets.
- **Plain language.** “Repeats every 30 minutes until done” is better than an
  unexplained integer input. “If untouched, remind again in 1 day” describes
  the unattended path accurately.
- **Make system health actionable.** Healthy, overdue, stale, and unavailable
  have distinct text and a next step. A cryptic `not_available` badge does not.
- **Never pretend Workshop owns Pulse.** Pulse ships namespaced styling and
  components. It may consume Workshop CSS variables with fallbacks, but it
  cannot import Workshop source components or rely on private class names.
- **Accessible by construction.** Native labels, visible focus, keyboard-safe
  dialogs, live status, adequate contrast, and responsive reflow are release
  requirements rather than polish.

## Information architecture

Pulse keeps the existing three plugin routes, but each route has a real job.

| Route | Purpose | Contents |
| --- | --- | --- |
| Reminders | The working home | Summary strip, runner-health state, active/paused reminder cards, `New reminder`. |
| History | Trust and evidence | Completed occurrences, timestamps, snoozes, and an empty state explaining that it fills after completion. |
| Settings | Connection and delivery | Private-root connection, configured endpoint summary, runner health details, and a safe reconnect path. |

The route passed by Workshop must control the rendered content. The current
view ignores `activeRouteId`; that is a defect, not an aesthetic preference.

## Reminders route

### Connected state

1. A compact header: `Pulse`, a one-sentence product promise, and `New
   reminder`.
2. A summary strip with **Active reminders**, **Next due**, and **Runner
   health**. It must have useful empty and unavailable states.
3. A reminder-card list, ordered by next due occurrence, then title.

Each card shows:

- title and active/paused status;
- a readable schedule, such as “Every Sunday at 9:50 AM PT”;
- the next occurrence and its current state (scheduled, due, snoozed, or done
  only where history is relevant);
- delivery summary: “Repeats every 30 min until done; untouched reminders
  return in 1 day”; and
- secondary management actions: Edit, Pause/Resume, Delete.

An empty active list is not a blank page. It says what Pulse does and offers
`Create your first reminder`.

### Disconnected state

This is a setup screen, not a weakened dashboard. It explains that Pulse needs
the selected private folder, shows the folder field and `Connect Pulse`, and
gives a short recovery hint when validation fails. No reminder list or create
form appears until the private service is connected.

## New and edit reminder flow

Use the same form for create and edit. It opens as an in-page panel or modal;
the choice should follow the host’s available dialog primitive, not force a
new dependency.

### Required fields

1. **Reminder name**
2. **Schedule**: initial build supports the existing weekly day + time model
   and displays timezone beside it.
3. **Notification behavior**
   - repeat while due: presets `30 min`, `1 hour`, `4 hours`, `1 day`, plus
     Custom;
   - if unanswered for two minutes: same preset pattern, default `30 min`.

The current raw minute fields remain valid data inputs, but must become the
Custom path rather than the default mental model.

### Future recurrence compatibility

Bounded daily/weekly/monthly recurrence is a separate engine feature. The
form layout reserves a **Repeats** section so that feature can add a cadence,
an end rule, and last-occurrence warning without rebuilding the entire
surface. Do not fake a Google Calendar recurrence picker before the engine and
state model can honor it.

### Safety

- Save is disabled only for invalid required input and explains why.
- Editing preserves the reminder identity and does not silently delete history.
- Delete requires confirmation that names the reminder; it does not delete
  historical occurrences unless the engine contract explicitly says so.
- Pause explains that it prevents future occurrences; it does not present
  phone acknowledgement controls in Workshop.

## Visual system

No shadcn dependency. Shadcn would add a second styling/build system inside an
externally packaged plugin and solve none of the information-design failures.

Pulse should ship a small, local component layer:

- `pulse-shell`, `pulse-card`, `pulse-button`, `pulse-status`, `pulse-field`,
  `pulse-dialog` — all prefixed to avoid host collisions;
- consume host color variables such as `--dark-surface`, `--dark-text`, and
  `--color-pink` only with local fallback values;
- use a readable content column (roughly 960px maximum), modest card density,
  clear typographic scale, and mobile-safe one-column reflow;
- use color as reinforcement, never the only carrier of active/paused/stale
  state; and
- prefer quiet surfaces over oversized branding and ornamental borders.

The plugin can inject or export its own namespaced stylesheet. It must not
require a Workshop source change, Tailwind scan configuration, or imports from
Workshop’s internal component tree.

## Delivery sequence (TDD)

### P0 — Truthful data and route contract

- Type the snapshot data Pulse actually consumes: definitions, occurrences,
  events, and runner health.
- Make `activeRouteId` select Reminders, History, and Settings content.
- Add a view-model layer that derives next due, counts, readable schedule, and
  health state independently of React.
- Tests: snapshot fixtures covering connected, disconnected, empty, active,
  paused, due, snoozed, stale, and unavailable states; route-selection tests.

### P1 — Management dashboard

- Replace raw list/form rendering with the connected and disconnected states
  above.
- Add reminder cards, summary strip, accessible status, empty state, and
  pause/resume/delete confirmation.
- Tests: mounted keyboard/label/status assertions, action requests, failure
  recovery, and no secret appears in rendered markup.

### P2 — Create and edit flow

- Build one accessible create/edit form with preset-to-custom notification
  timing.
- Implement real update behavior using the existing authenticated service;
  do not clone partial pulse records and accidentally discard schedule or
  policy fields.
- Tests: validation, preset mappings, custom values, edit preservation,
  destructive confirmation, and service payloads.

### P3 — History and settings

- Render completion/snooze history from the real event/occurrence model.
- Add runner-health details and the private-root reconnect/recovery surface.
- Tests: chronological ordering, privacy redaction, every health state,
  reconnect outcome, and empty history.

### P4 — Responsive and visual acceptance

- Add browser-level visual/workflow tests at desktop and narrow widths.
- Manually run the three-minute acceptance task against real private test data:
  create, understand next fire, edit, pause/resume, then verify phone delivery.
- Audit keyboard navigation, focus visibility, contrast, text zoom, and
  empty/error states.

## Release gates

The redesign is not complete because it looks less bad in one screenshot. It
is complete only when:

1. A connected person can create a reminder in under three minutes without
   documentation.
2. Every active reminder states its next fire time and notification behavior.
3. The UI accurately reports runner health and failure recovery.
4. The phone remains the only due-occurrence Done/Snooze surface.
5. All private tokens remain outside the webview and repository.
6. Unit, mounted-component, and browser workflow tests cover the states above.
7. Pulse remains a clean external Workshop dependency with no Workshop source
   edits or imports.
