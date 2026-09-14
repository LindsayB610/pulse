import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const coverage = process.argv.includes("--coverage");
const testDirectory = fileURLToPath(new URL("../test/", import.meta.url));
const isolatedName = "plugin-date-picker.test.mjs";
const remaining = readdirSync(testDirectory)
  .filter((name) => name.endsWith(".test.mjs") && name !== isolatedName)
  .sort()
  .map((name) => `test/${name}`);

run([`test/${isolatedName}`], coverage
  ? [
      "--experimental-test-coverage",
      "--test-coverage-include=plugin/dist/date-picker.js",
      "--test-coverage-lines=95",
      "--test-coverage-branches=90",
      "--test-coverage-functions=100",
    ]
  : []);
run(remaining, coverage ? ["--experimental-test-coverage"] : []);

function run(files, extraArguments) {
  const result = spawnSync(process.execPath, ["--test", "--test-concurrency=1", ...extraArguments, ...files], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
