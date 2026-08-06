import { existsSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const defaultPublicRoot = fileURLToPath(new URL("../", import.meta.url));
const defaultWorkshopRoot = resolve(defaultPublicRoot, "../workshop");

export function validatePrivateRoot(privateRoot, publicRoot = defaultPublicRoot, additionalPublicRoots = defaultAdditionalPublicRoots()) {
  if (privateRoot === undefined || privateRoot.trim() === "") {
    throw new Error("Set PULSE_PRIVATE_ROOT to an absolute directory outside the public Pulse checkout.");
  }
  if (privateRoot !== privateRoot.trim() || !isAbsolute(privateRoot)) {
    throw new Error("PULSE_PRIVATE_ROOT must be an absolute path without surrounding whitespace.");
  }

  const resolvedPrivateRoot = resolve(privateRoot);
  if (!existsSync(resolvedPrivateRoot) || !statSync(resolvedPrivateRoot).isDirectory()) {
    throw new Error("PULSE_PRIVATE_ROOT must name an existing directory.");
  }
  const canonicalPrivateRoot = realpathSync(resolvedPrivateRoot);
  const publicRoots = [publicRoot, ...additionalPublicRoots]
    .filter((root) => existsSync(resolve(root)))
    .map((root) => realpathSync(resolve(root)));
  if (publicRoots.some((root) => isWithin(root, canonicalPrivateRoot))) {
    throw new Error("PULSE_PRIVATE_ROOT must be outside the public Pulse and Workshop checkouts.");
  }

  return canonicalPrivateRoot;
}

function defaultAdditionalPublicRoots() {
  return existsSync(defaultWorkshopRoot) ? [defaultWorkshopRoot] : [];
}

function isWithin(root, candidate) {
  const relativePath = relative(root, candidate);
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    console.log(validatePrivateRoot(process.env.PULSE_PRIVATE_ROOT));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
