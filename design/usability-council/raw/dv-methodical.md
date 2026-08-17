# DV-M — developer, methodical

Outcome: failed the release gate. The happy-path story is strong, but four P1
interaction defects make the prototype materially less truthful than its copy.

## Findings

1. **P1 · functional / false proof · invalid runner origins connect**
   - `http://localhost:1234/api/pulse` advances to Runner connected. Enter does
     nothing because the input is not in a form and native validation is absent.

2. **P1 · functional completeness · existing-Pulse flow cannot accept pairing code**

3. **P1 · recovery / state · failed-delivery retry returns to phone setup**

4. **P1 · accessibility / consequential action · restart modal does not contain focus**
   - Shift+Tab moves from the dialog to background Continue connecting. Escape
     and focus restoration work.

5. **P2 · instruction / completeness · advanced runner path is descriptive, not actionable**
   - It omits the usable compatibility/protocol contract and implementation
     instructions available in the repository plan.

6. **P2 · prototype fidelity / truth · promised persistence is not simulated**
   - Edited values and progress disappear across navigation; no state store exists.

7. **P2 · interaction / state loss · “Use a different address” triggers an error**

8. **P2 · misleading recovery · provider project action returns to Pairing**

9. **P2 · accessibility · external handoffs create duplicate live announcements**

10. **P3 · error taxonomy · invalid-address copy collapses syntax, HTTPS, path,
    reachability, and compatibility failures**

## Test gaps

- Static route/axe audits do not submit invalid inputs or verify transitions.
- Existing-installation tests check a link, not pairing-code entry.
- Recovery tests check controls, not label/destination truth.
- Modal tests omit Tab containment.
- External-action tests omit live-announcement count.

## Successful moments

- Purpose, ownership, cost, phone instructions, topic/token safety, Back controls,
  routed focus, locked future stages, provider-vs-phone proof, human confirmation,
  desktop composition, and simulated-handoff labeling work well.
