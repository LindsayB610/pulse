export type PulseDefinitionInput = { id?: string; title: string; day: string; time: string; repeat: string; timezone: string; active?: boolean };

export function pulseDefinitionFromForm(input: PulseDefinitionInput): Record<string, unknown> {
  const title = input.title.trim();
  if (!title) throw new Error("Enter a reminder name.");
  if (!/^\d{2}:\d{2}$/.test(input.time)) throw new Error("Enter a valid reminder time.");
  const repeatEveryMinutes = Number(input.repeat);
  if (!Number.isInteger(repeatEveryMinutes) || repeatEveryMinutes < 1) throw new Error("Repeat must be a whole number of minutes.");
  const id = input.id ?? title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (!id) throw new Error("Enter a reminder name.");
  return { id, title, active: input.active ?? true, schedule: { type: "weekly", daysOfWeek: [input.day], time: input.time, timezone: input.timezone }, notificationPolicy: { channels: ["ntfy"], repeatEveryMinutes } };
}
