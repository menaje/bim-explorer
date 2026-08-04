import assert from "node:assert/strict";
import test from "node:test";

import {
  qualifyViewerCoreRelease,
} from "../../scripts/qualify-viewer-core-release.mjs";

test("public Viewer Core release mounts the actual BIM 3D stack", async () => {
  const report = await qualifyViewerCoreRelease();
  assert.equal(report.status, "passed-public-preview");
  assert.equal(
    report.release.tagCommit,
    "fb25718468f1f0b1a9bac666035a0c8277f51a19",
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
});
