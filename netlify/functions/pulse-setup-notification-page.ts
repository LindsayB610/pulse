import type { Config } from "@netlify/functions";
import { runnerNotificationSecretPage } from "./_shared/pulse.js";

export default async () => runnerNotificationSecretPage();

export const config: Config = { path: "/setup/notification", method: "GET" };
