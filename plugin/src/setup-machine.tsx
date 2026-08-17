export type SetupState =
  | "welcome"
  | "phone-user"
  | "phone-topic"
  | "phone-subscription"
  | "phone-token"
  | "runner-choice"
  | "runner-deploy"
  | "runner-pair"
  | "delivery-secret"
  | "delivery-test"
  | "complete"
  | "existing"
  | "migration"
  | "advanced";

const guided: SetupState[] = [
  "welcome",
  "phone-user",
  "phone-topic",
  "phone-subscription",
  "phone-token",
  "runner-choice",
  "runner-deploy",
  "runner-pair",
  "delivery-secret",
  "delivery-test",
  "complete",
];

const resumable = new Set<SetupState>([...guided, "existing", "migration", "advanced"]);

export function setupForward(state: SetupState): SetupState | null {
  const index = guided.indexOf(state);
  return index >= 0 && index < guided.length - 1 ? guided[index + 1] : null;
}

export function setupBack(state: SetupState): SetupState | null {
  const index = guided.indexOf(state);
  if (index > 0) return guided[index - 1];
  if (state === "existing" || state === "migration" || state === "advanced") return "welcome";
  return null;
}

export function setupStateFromNative(value: string): SetupState {
  return resumable.has(value as SetupState) ? value as SetupState : "welcome";
}

export function setupProgress(state: SetupState): { current: number; total: 7; label: string } {
  if (state === "welcome" || state === "existing" || state === "migration" || state === "advanced") return { current: 0, total: 7, label: "Before you start" };
  if (["phone-user", "phone-topic", "phone-subscription", "phone-token"].includes(state)) return { current: 2, total: 7, label: "Phone" };
  if (state === "runner-choice" || state === "runner-deploy") return { current: 3, total: 7, label: "Runner" };
  if (state === "runner-pair") return { current: 4, total: 7, label: "Connect" };
  if (state === "delivery-secret") return { current: 5, total: 7, label: "Delivery" };
  if (state === "delivery-test") return { current: 6, total: 7, label: "Test" };
  return { current: 7, total: 7, label: "Ready" };
}
