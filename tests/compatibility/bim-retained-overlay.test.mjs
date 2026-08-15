import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  validateBimRetainedOverlayCompatibility,
} from "../../scripts/check-bim-retained-overlay-compatibility.mjs";

async function inputs() {
  return await Promise.all([
    readFile("compatibility/bim-retained-overlay.json", "utf8")
      .then(JSON.parse),
    readFile(
      "compatibility/evidence/" +
        "bim-retained-overlay-browser-2026-08-15.json",
      "utf8",
    ).then(JSON.parse),
    readFile(
      "compatibility/evidence/" +
        "bim-retained-overlay-vscode-2026-08-15.json",
      "utf8",
    ).then(JSON.parse),
    readFile(
      "compatibility/evidence/" +
        "bim-retained-overlay-viewer-core-2026-08-15.json",
      "utf8",
    ).then(JSON.parse),
  ]);
}

test("retained overlay pins actual Browser, VS Code, and Viewer Core source evidence", async () => {
  assert.deepEqual(
    validateBimRetainedOverlayCompatibility(...await inputs()),
    {
      status: "experimental",
      passedGates: 16,
      heldGates: 4,
      blockers: 3,
    },
  );
});

test("retained overlay cannot claim an unpublished Viewer Core artifact", async () => {
  const values = await inputs();
  values[0].gates.publishedViewerCore013Artifact = true;
  values[0].policy.claimPublishedViewerCore013Artifact = true;
  assert.throws(
    () => validateBimRetainedOverlayCompatibility(...values),
    /manifest is invalid|overclaims/u,
  );
});

test("retained overlay rejects non-atomic Browser evidence", async () => {
  const values = await inputs();
  values[1].transaction.atomic = false;
  assert.throws(
    () => validateBimRetainedOverlayCompatibility(...values),
    /Browser evidence is invalid/u,
  );
});

test("retained overlay rejects a changed Viewer Core source commit", async () => {
  const values = await inputs();
  values[3].viewerCore.sourceCommit = "0".repeat(40);
  assert.throws(
    () => validateBimRetainedOverlayCompatibility(...values),
    /Viewer Core evidence is invalid/u,
  );
});
