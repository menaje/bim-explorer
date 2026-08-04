import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  qualifyViewerCoreRelease,
} from "../../scripts/qualify-viewer-core-release.mjs";

test("public Viewer Core release mounts the actual BIM 3D stack", async () => {
  const report = await qualifyViewerCoreRelease();
  assert.equal(report.status, "passed-public-preview");
  assert.equal(
    report.release.tagCommit,
    "e225c2c8531e1f5e9677238d85adf6f686203026",
  );
  assert.equal(
    report.packages.viewerCore.package,
    "@menaje/viewer-core",
  );
  assert.equal(
    report.packages.renderProtocol.package,
    "@menaje/viewer-render-protocol",
  );
  assert.equal(
    report.conformance.actualBimRendererHosts.length,
    2,
  );
  assert.ok(
    report.conformance.actualBimRendererHosts.every(
      (host) =>
        host.representation === "3d" &&
        host.renderer.instances === 2 &&
        host.stalePick.rejected &&
        host.cleanup.backendActiveBytes === 0,
    ),
  );
  assert.equal(report.decision.productionClaims, false);
  assert.deepEqual(
    report,
    JSON.parse(
      await readFile(
        "compatibility/evidence/" +
          "viewer-core-release-2026-08-04.json",
        "utf8",
      ),
    ),
  );
});
