# MT-S — moderately technical nondeveloper, impatient scanner

Outcome: completed the recommended and compatible-runner paths plus several
recoveries. The prototype fails functional truth around address validation and
recovery routing.

## Findings

1. **P1 · functional / false security · invalid runner address passes verification**
   - `not a url` advances to Delivery and claims verification. The editable URL
     is not consulted.

2. **P1 · functional recovery · “Send one more test” returns to Phone**

3. **P1 · state / interaction · missing-delivery recovery visually erases progress**
   - The rail moves from Test 6/7 to Phone 2/7 beside copy claiming completed work
     remains in place.

4. **P1 · recovery action · “Return to your provider project” returns to Pulse**
   - It shares the Pairing destination with “Enter a different address.”

5. **P2 · interaction · “Use a different address” stages an error before editing**

6. **P2 · interaction ambiguity · fake QR looks actionable**
   - “Production QR preview” and “Scannable during real setup” visually overpower
     the smaller not-scannable caveat. A scanner will try it.

7. **P2 · status / visual · external-handoff toast persists across the journey**
   - It obscures later content and cannot provide fresh confirmation on repeated
     handoffs.

8. **P2 · instruction · supported-device copy assumes a Pixel**

9. **P2 · language · completion leads with “webview” implementation jargon**
   - “Your connection stays protected inside Workshop” would state the useful
     outcome without internal terminology.

## Successful moments

- Entry goal, time, equipment, and primary action scan quickly.
- Phone account/token guidance is concrete.
- Normal Back controls work.
- Netlify recommendation, ownership, quota, and cost boundaries are visible.
- Advanced runner path is fenced and escapable.
- Provider acceptance and Android receipt are distinguished.
- Recovery states say what remains safe.
- Completion creates no fake reminder and opens reminder creation.
