import { createHash } from "node:crypto";

const pulseNtfySequencePattern = /^pulse-[A-Za-z0-9_-]{43}$/;

/** Stable, URL-safe, and opaque: ntfy never needs the private occurrence ID. */
export function ntfySequenceIdForOccurrence(occurrenceId: string): string {
  if (occurrenceId.trim() === "") throw new Error("An occurrence ID is required for an ntfy sequence.");
  return `pulse-${createHash("sha256").update(occurrenceId).digest("base64url")}`;
}

export function isPulseNtfySequenceId(value: unknown): value is string {
  return typeof value === "string" && pulseNtfySequencePattern.test(value);
}
