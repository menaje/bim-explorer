import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("qualification harness repeats and validates web-ifc in a process", () => {
  const result = spawnSync(
    process.execPath,
    [
      "scripts/qualify-ifc-engine.mjs",
      "--engine",
      "web-ifc",
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  assert.equal(result.status, 0, result.stderr);
  const evidence = JSON.parse(result.stdout);
  assert.equal(evidence.status, "experimental");
  assert.equal(evidence.engines.length, 1);
  assert.equal(
    evidence.engines[0].deterministicFingerprint,
    true,
  );
  assert.equal(evidence.engines[0].runs.length, 2);
  assert.equal(
    evidence.engines[0].runs[0].process.processExited,
    true,
  );
  assert.equal(evidence.decision.goNoGo, "held");
  assert.doesNotMatch(
    result.stdout,
    /\/Volumes\/|\/Users\/|[A-Z]:\\/u,
  );
});
