const SERVICE_IDENTITY = "pulse-runner";
const API_VERSION = "pulse.service.v1";
const SETUP_VERSION = "pulse.setup.v1";
const CHALLENGE_LIFETIME_MS = 120_000;
const DEVICE_CODE_LIFETIME_MS = 600_000;
const MAX_PROOF_ATTEMPTS = 5;
const CHALLENGE_RATE_WINDOW_MS = 300_000;
const MAX_CHALLENGES_PER_WINDOW = 10;

export type RunnerPairingChallenge = {
  id: string;
  installationId: string;
  nonce: string;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
  failedAttempts: number;
};

export type RunnerClientRecord = {
  id: string;
  installationId: string;
  credentialVerifier: string;
  createdAt: string;
  lastUsedAt: string;
  revokedAt: string | null;
};

export type RunnerAdditionalDeviceCode = {
  id: string;
  codeVerifier: string;
  origin: string;
  installationId: string;
  createdByClientId: string;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
};

export type RunnerSecretSetupSession = {
  id: string;
  capabilityVerifier: string;
  origin: string;
  createdByClientId: string;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
};

export type RunnerSetupState = {
  schemaVersion: "pulse.runner-setup.v1";
  canonicalOrigin: string;
  deployedPublicKey: string;
  deployedPublicKeyFingerprint: string;
  createdAt: string;
  bootstrapRetiredAt: string | null;
  challenges: RunnerPairingChallenge[];
  clients: RunnerClientRecord[];
  additionalDeviceCodes: RunnerAdditionalDeviceCode[];
  secretSetupSessions: RunnerSecretSetupSession[];
  testDeliveries: Array<{
    idempotencyKey: string;
    sentAt: string;
    sequenceId: string;
  }>;
};

export type PublicRunnerClient = {
  id: string;
  installationId: string;
  createdAt: string;
  lastUsedAt: string;
  revokedAt: string | null;
};

export type RunnerManifest = {
  service: typeof SERVICE_IDENTITY;
  apiVersion: typeof API_VERSION;
  setupVersion: typeof SETUP_VERSION;
  canonicalOrigin: string;
  setupState: "awaiting-pairing" | "paired";
  deployedPublicKeyFingerprint: string;
  capabilities: string[];
};

export type RunnerPairingProof = {
  apiVersion: string;
  challengeId: string;
  installationId: string;
  origin: string;
  signature: string;
};

export type PairingProofPayload = {
  apiVersion: string;
  challengeId: string;
  fingerprint: string;
  installationId: string;
  nonce: string;
  origin: string;
};

export type RunnerPairingResult = {
  client: PublicRunnerClient;
  credential: string;
};

export function parseRunnerSetupState(value: unknown): RunnerSetupState {
  try {
    const input = setupRecord(value);
    rejectRecoverableSecrets(input);
    if (input.schemaVersion !== "pulse.runner-setup.v1") throw new Error("schema");
    const canonicalOrigin = normalizePublicHttpsOrigin(setupString(input.canonicalOrigin));
    const state: RunnerSetupState = {
      schemaVersion: "pulse.runner-setup.v1",
      canonicalOrigin,
      deployedPublicKey: setupString(input.deployedPublicKey),
      deployedPublicKeyFingerprint: setupString(input.deployedPublicKeyFingerprint),
      createdAt: setupTimestamp(input.createdAt),
      bootstrapRetiredAt: setupNullableTimestamp(input.bootstrapRetiredAt),
      challenges: setupArray(input.challenges).map((candidate) => {
        const record = setupRecord(candidate);
        return {
          id: setupString(record.id),
          installationId: validatedInstallationId(setupString(record.installationId)),
          nonce: setupString(record.nonce),
          createdAt: setupTimestamp(record.createdAt),
          expiresAt: setupTimestamp(record.expiresAt),
          consumedAt: setupNullableTimestamp(record.consumedAt),
          failedAttempts: setupBoundedInteger(record.failedAttempts, 0, MAX_PROOF_ATTEMPTS),
        };
      }),
      clients: setupArray(input.clients).map((candidate) => {
        const record = setupRecord(candidate);
        const credentialVerifier = setupString(record.credentialVerifier);
        if (!/^[0-9a-f]{64}$/.test(credentialVerifier)) throw new Error("verifier");
        return {
          id: setupString(record.id),
          installationId: validatedInstallationId(setupString(record.installationId)),
          credentialVerifier,
          createdAt: setupTimestamp(record.createdAt),
          lastUsedAt: setupTimestamp(record.lastUsedAt),
          revokedAt: setupNullableTimestamp(record.revokedAt),
        };
      }),
      additionalDeviceCodes: setupArray(input.additionalDeviceCodes).map((candidate) => {
        const record = setupRecord(candidate);
        const codeVerifier = setupString(record.codeVerifier);
        if (!/^[0-9a-f]{64}$/.test(codeVerifier)) throw new Error("verifier");
        return {
          id: setupString(record.id),
          codeVerifier,
          origin: normalizePublicHttpsOrigin(setupString(record.origin)),
          installationId: validatedInstallationId(setupString(record.installationId)),
          createdByClientId: setupString(record.createdByClientId),
          createdAt: setupTimestamp(record.createdAt),
          expiresAt: setupTimestamp(record.expiresAt),
          consumedAt: setupNullableTimestamp(record.consumedAt),
        };
      }),
      secretSetupSessions: (input.secretSetupSessions === undefined ? [] : setupArray(input.secretSetupSessions)).map((candidate) => {
        const record = setupRecord(candidate);
        const capabilityVerifier = setupString(record.capabilityVerifier);
        if (!/^[0-9a-f]{64}$/.test(capabilityVerifier)) throw new Error("verifier");
        return {
          id: setupString(record.id),
          capabilityVerifier,
          origin: normalizePublicHttpsOrigin(setupString(record.origin)),
          createdByClientId: setupString(record.createdByClientId),
          createdAt: setupTimestamp(record.createdAt),
          expiresAt: setupTimestamp(record.expiresAt),
          consumedAt: setupNullableTimestamp(record.consumedAt),
        };
      }),
      testDeliveries: (input.testDeliveries === undefined ? [] : setupArray(input.testDeliveries)).map((candidate) => {
        const record = setupRecord(candidate);
        return {
          idempotencyKey: setupString(record.idempotencyKey),
          sentAt: setupTimestamp(record.sentAt),
          sequenceId: setupString(record.sequenceId),
        };
      }),
    };
    if (state.additionalDeviceCodes.some((code) => code.origin !== state.canonicalOrigin)) throw new Error("origin");
    if (state.secretSetupSessions.some((session) => session.origin !== state.canonicalOrigin)) throw new Error("origin");
    return state;
  } catch {
    throw new Error("Runner setup state is invalid; recovery requires an explicit reset or restore.");
  }
}

export async function bootstrapRunnerSetup(
  existing: unknown,
  input: { canonicalOrigin: string; deployedPublicKey: string; now?: Date },
): Promise<RunnerSetupState> {
  const canonicalOrigin = normalizePublicHttpsOrigin(input.canonicalOrigin);
  const deployedPublicKeyFingerprint = await displayPublicKeyFingerprint(input.deployedPublicKey);
  if (existing !== null) {
    const parsed = parseRunnerSetupState(existing);
    if (
      parsed.canonicalOrigin !== canonicalOrigin ||
      parsed.deployedPublicKey !== input.deployedPublicKey ||
      parsed.deployedPublicKeyFingerprint !== deployedPublicKeyFingerprint
    ) {
      throw new Error("Existing runner bootstrap does not match this origin and public key.");
    }
    return parsed;
  }
  const createdAt = (input.now ?? new Date()).toISOString();
  return {
    schemaVersion: "pulse.runner-setup.v1",
    canonicalOrigin,
    deployedPublicKey: input.deployedPublicKey,
    deployedPublicKeyFingerprint,
    createdAt,
    bootstrapRetiredAt: null,
    challenges: [],
    clients: [],
    additionalDeviceCodes: [],
    secretSetupSessions: [],
    testDeliveries: [],
  };
}

export function readRunnerManifest(state: RunnerSetupState): RunnerManifest {
  return {
    service: SERVICE_IDENTITY,
    apiVersion: API_VERSION,
    setupVersion: SETUP_VERSION,
    canonicalOrigin: state.canonicalOrigin,
    setupState: state.clients.some((client) => client.revokedAt === null) ? "paired" : "awaiting-pairing",
    deployedPublicKeyFingerprint: state.deployedPublicKeyFingerprint,
    capabilities: [
      "pairing",
      "per-client-credentials",
      "notification-secret-capture",
      "test-notification",
      "health",
      "export",
      "delete",
    ],
  };
}

export function createRunnerPairingChallenge(
  state: RunnerSetupState,
  input: { installationId: string; now?: Date },
): RunnerPairingChallenge {
  if (state.bootstrapRetiredAt !== null) throw new Error("First-installation bootstrap is retired.");
  const installationId = validatedInstallationId(input.installationId);
  const now = input.now ?? new Date();
  const recentChallenges = state.challenges.filter(
    (candidate) => Date.parse(candidate.createdAt) > now.getTime() - CHALLENGE_RATE_WINDOW_MS,
  );
  if (recentChallenges.length >= MAX_CHALLENGES_PER_WINDOW) {
    throw new Error("Too many pairing attempts. Try again in a few minutes.");
  }
  const challenge: RunnerPairingChallenge = {
    id: randomValue("challenge", 18),
    installationId,
    nonce: randomValue("nonce", 24),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + CHALLENGE_LIFETIME_MS).toISOString(),
    consumedAt: null,
    failedAttempts: 0,
  };
  state.challenges.push(challenge);
  return structuredClone(challenge);
}

export function pairingProofPayload(input: PairingProofPayload): string {
  return [
    SETUP_VERSION,
    input.apiVersion,
    input.origin,
    input.challengeId,
    input.nonce,
    input.installationId,
    input.fingerprint,
  ].join("\n");
}

export async function pairFirstRunnerClient(
  state: RunnerSetupState,
  proof: RunnerPairingProof,
  options: { now?: Date } = {},
): Promise<RunnerPairingResult> {
  if (state.bootstrapRetiredAt !== null) throw new Error("First-installation bootstrap is retired or already used.");
  const now = options.now ?? new Date();
  const challenge = state.challenges.find((candidate) => candidate.id === proof.challengeId);
  if (challenge === undefined || challenge.consumedAt !== null) throw new Error("Pairing challenge is invalid or already used.");
  if (Date.parse(challenge.expiresAt) < now.getTime()) throw new Error("Pairing challenge expired.");
  if (challenge.failedAttempts >= MAX_PROOF_ATTEMPTS) throw new Error("Pairing challenge is invalid.");
  const origin = normalizePublicHttpsOrigin(proof.origin);
  const installationId = validatedInstallationId(proof.installationId);
  if (
    proof.apiVersion !== API_VERSION ||
    origin !== state.canonicalOrigin ||
    installationId !== challenge.installationId
  ) {
    challenge.failedAttempts += 1;
    throw new Error("Pairing proof does not match the expected origin, installation, or API version.");
  }
  const publicKey = await importEd25519PublicKey(state.deployedPublicKey);
  const signature = decodeBase64Url(proof.signature);
  const valid = await crypto.subtle.verify(
    "Ed25519",
    publicKey,
    signature as unknown as BufferSource,
    new TextEncoder().encode(
      pairingProofPayload({
        apiVersion: proof.apiVersion,
        challengeId: challenge.id,
        fingerprint: state.deployedPublicKeyFingerprint,
        installationId,
        nonce: challenge.nonce,
        origin,
      }),
    ),
  );
  if (!valid) {
    challenge.failedAttempts += 1;
    throw new Error("Pairing proof signature is invalid.");
  }
  challenge.consumedAt = now.toISOString();
  state.bootstrapRetiredAt = now.toISOString();
  return issueClient(state, installationId, now);
}

export async function authenticateRunnerClient(
  state: RunnerSetupState,
  credential: string,
  now: Date = new Date(),
): Promise<string> {
  const verifier = await sha256Hex(credential);
  const client = state.clients.find(
    (candidate) => candidate.revokedAt === null && constantShapeEqual(candidate.credentialVerifier, verifier),
  );
  if (client === undefined) throw new Error("Unauthorized runner client.");
  client.lastUsedAt = now.toISOString();
  return client.id;
}

export async function createAdditionalDeviceCode(
  state: RunnerSetupState,
  credential: string,
  input: { installationId: string; origin: string; now?: Date },
): Promise<{ code: string; expiresAt: string }> {
  const now = input.now ?? new Date();
  const clientId = await authenticateRunnerClient(state, credential, now);
  const origin = normalizePublicHttpsOrigin(input.origin);
  const installationId = validatedInstallationId(input.installationId);
  if (origin !== state.canonicalOrigin) throw new Error("Additional-device origin does not match this runner.");
  const code = `PULSE-${randomBytes(12).toString("hex").toUpperCase()}`;
  const expiresAt = new Date(now.getTime() + DEVICE_CODE_LIFETIME_MS).toISOString();
  state.additionalDeviceCodes.push({
    id: randomValue("invite", 12),
    codeVerifier: await sha256Hex(code),
    origin,
    installationId,
    createdByClientId: clientId,
    createdAt: now.toISOString(),
    expiresAt,
    consumedAt: null,
  });
  return { code, expiresAt };
}

export async function pairAdditionalRunnerClient(
  state: RunnerSetupState,
  input: { code: string; installationId: string; origin: string },
  options: { now?: Date } = {},
): Promise<RunnerPairingResult> {
  const now = options.now ?? new Date();
  const origin = normalizePublicHttpsOrigin(input.origin);
  const codeVerifier = await sha256Hex(input.code);
  const code = state.additionalDeviceCodes.find(
    (candidate) =>
      candidate.consumedAt === null &&
      Date.parse(candidate.expiresAt) >= now.getTime() &&
      candidate.origin === origin &&
      candidate.installationId === input.installationId &&
      constantShapeEqual(candidate.codeVerifier, codeVerifier),
  );
  if (code === undefined || origin !== state.canonicalOrigin) throw new Error("Additional-device code is invalid or expired.");
  const installationId = validatedInstallationId(input.installationId);
  if (state.clients.some((client) => client.installationId === installationId && client.revokedAt === null)) {
    throw new Error("This installation is already connected.");
  }
  code.consumedAt = now.toISOString();
  return issueClient(state, installationId, now);
}

export async function createRunnerSecretSetupSession(
  state: RunnerSetupState,
  credential: string,
  now: Date = new Date(),
): Promise<{ sessionId: string; capability: string; expiresAt: string }> {
  const clientId = await authenticateRunnerClient(state, credential, now);
  const capability = randomValue("pulse_setup", 32);
  const session: RunnerSecretSetupSession = {
    id: randomValue("secret_session", 18),
    capabilityVerifier: await sha256Hex(capability),
    origin: state.canonicalOrigin,
    createdByClientId: clientId,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + DEVICE_CODE_LIFETIME_MS).toISOString(),
    consumedAt: null,
  };
  state.secretSetupSessions.push(session);
  return { sessionId: session.id, capability, expiresAt: session.expiresAt };
}

export async function consumeRunnerSecretSetupSession(
  state: RunnerSetupState,
  input: { sessionId: string; capability: string; origin: string; now?: Date },
): Promise<string> {
  const session = await matchingRunnerSecretSetupSession(state, input);
  session.consumedAt = (input.now ?? new Date()).toISOString();
  return session.createdByClientId;
}

export async function validateRunnerSecretSetupSession(
  state: RunnerSetupState,
  input: { sessionId: string; capability: string; origin: string; now?: Date },
): Promise<string> {
  return (await matchingRunnerSecretSetupSession(state, input)).createdByClientId;
}

async function matchingRunnerSecretSetupSession(
  state: RunnerSetupState,
  input: { sessionId: string; capability: string; origin: string; now?: Date },
): Promise<RunnerSecretSetupSession> {
  const now = input.now ?? new Date();
  const origin = normalizePublicHttpsOrigin(input.origin);
  if (origin !== state.canonicalOrigin) throw new Error("Secret setup origin does not match this runner.");
  const verifier = await sha256Hex(input.capability);
  const session = state.secretSetupSessions.find(
    (candidate) =>
      candidate.id === input.sessionId &&
      candidate.consumedAt === null &&
      Date.parse(candidate.expiresAt) >= now.getTime() &&
      candidate.origin === origin &&
      constantShapeEqual(candidate.capabilityVerifier, verifier),
  );
  if (session === undefined) throw new Error("Secret setup session is invalid or expired.");
  return session;
}

export async function revokeRunnerClient(
  state: RunnerSetupState,
  authorizingCredential: string,
  clientId: string,
  now: Date = new Date(),
): Promise<PublicRunnerClient> {
  await authenticateRunnerClient(state, authorizingCredential, now);
  const client = state.clients.find((candidate) => candidate.id === clientId);
  if (client === undefined) throw new Error("Runner client not found.");
  if (client.revokedAt === null) client.revokedAt = now.toISOString();
  return publicClient(client);
}

export async function displayPublicKeyFingerprint(publicKey: string): Promise<string> {
  await importEd25519PublicKey(publicKey);
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", decodeBase64Url(publicKey) as unknown as BufferSource),
  );
  return [...digest.slice(0, 8)].map((value) => value.toString(16).padStart(2, "0").toUpperCase()).join(":");
}

async function issueClient(state: RunnerSetupState, installationId: string, now: Date): Promise<RunnerPairingResult> {
  const credential = randomValue("pulse_client", 32);
  const client: RunnerClientRecord = {
    id: randomValue("client", 12),
    installationId,
    credentialVerifier: await sha256Hex(credential),
    createdAt: now.toISOString(),
    lastUsedAt: now.toISOString(),
    revokedAt: null,
  };
  state.clients.push(client);
  return { client: publicClient(client), credential };
}

function publicClient(client: RunnerClientRecord): PublicRunnerClient {
  return {
    id: client.id,
    installationId: client.installationId,
    createdAt: client.createdAt,
    lastUsedAt: client.lastUsedAt,
    revokedAt: client.revokedAt,
  };
}

function normalizePublicHttpsOrigin(value: string): string {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "").replace(/\.$/, "");
  const privateIpv4 = /^(?:0\.|10\.|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/;
  const privateIpv6 = /^(?:::|::1$|::ffff:|f[cd][0-9a-f:]*$|fe80:)/i;
  const reservedLocalName =
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".home") ||
    hostname.endsWith(".lan") ||
    hostname === "localtest.me" ||
    hostname.endsWith(".localtest.me");
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !hostname ||
    reservedLocalName ||
    privateIpv4.test(hostname) ||
    privateIpv6.test(hostname) ||
    !["", "/"].includes(url.pathname) ||
    url.search ||
    url.hash
  ) {
    throw new Error("Runner origin must be a public HTTPS origin.");
  }
  return url.origin;
}

function validatedInstallationId(value: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,119}$/.test(normalized)) throw new Error("Installation identifier is invalid.");
  return normalized;
}

async function importEd25519PublicKey(value: string): Promise<CryptoKey> {
  try {
    return await crypto.subtle.importKey(
      "spki",
      decodeBase64Url(value) as unknown as BufferSource,
      "Ed25519",
      false,
      ["verify"],
    );
  } catch {
    throw new Error("Deployed public key is invalid.");
  }
}

function randomValue(prefix: string, size: number): string {
  return `${prefix}_${randomBytes(size).toString("base64url")}`;
}

function randomBytes(size: number): Buffer {
  const value = new Uint8Array(size);
  crypto.getRandomValues(value);
  return Buffer.from(value);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Buffer.from(digest).toString("hex");
}

function constantShapeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function decodeBase64Url(value: string): Uint8Array {
  return Buffer.from(value, "base64url");
}

function setupRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("record");
  return value as Record<string, unknown>;
}

function setupArray(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length > 10_000) throw new Error("array");
  return value;
}

function setupString(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 4_096) throw new Error("string");
  return value;
}

function setupTimestamp(value: unknown): string {
  const timestamp = setupString(value);
  if (!Number.isFinite(Date.parse(timestamp))) throw new Error("timestamp");
  return timestamp;
}

function setupNullableTimestamp(value: unknown): string | null {
  return value === null ? null : setupTimestamp(value);
}

function setupBoundedInteger(value: unknown, minimum: number, maximum: number): number {
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new Error("integer");
  }
  return value as number;
}

function rejectRecoverableSecrets(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(rejectRecoverableSecrets);
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    if (["credential", "token", "code", "privateKey"].includes(key)) throw new Error("recoverable secret");
    rejectRecoverableSecrets(nested);
  }
}
