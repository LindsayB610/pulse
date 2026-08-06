import type { Config } from "@netlify/functions";
import { runScheduledPulseTick } from "./_shared/pulse.js";

export default async () => {
  await runScheduledPulseTick();
  return new Response(null, { status: 204 });
};

export const config: Config = { schedule: "* * * * *" };
