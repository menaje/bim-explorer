import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtemp,
  readFile,
  rm,
  stat,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  qualifyWebIfcPlatformPackage,
  WEB_IFC_PLATFORM_PACKAGE_EVIDENCE_SCHEMA,
} from "../../scripts/qualify-web-ifc-platform-package.mjs";

test("web-ifc stage packs, installs offline, and runs cleanly", async () => {
  const output = await mkdtemp(
    path.join(os.tmpdir(), "bim-explorer-platform-test-"),
  );
  try {
    const evidence = await qualifyWebIfcPlatformPackage({
      artifactDirectory: output,
    });
    assert.equal(
      evidence.schema,
      WEB_IFC_PLATFORM_PACKAGE_EVIDENCE_SCHEMA,
    );
    assert.equal(evidence.status, "experimental");
    assert.equal(evidence.package.name, "@bim-explorer/web-ifc-platform-stage");
    assert.equal(evidence.package.private, true);
    assert.equal(evidence.package.license, "UNLICENSED");
    assert.equal(evidence.package.dependency.version, "0.0.77");
    assert.equal(evidence.stage.fileCount, 10);
    assert.match(evidence.stage.sha256, /^[0-9a-f]{64}$/u);
    assert.match(evidence.artifact.sha256, /^[0-9a-f]{64}$/u);
    assert.equal(evidence.observation.engine.id, "web-ifc");
    assert.equal(evidence.observation.fixture.schema, "IFC4");
    assert.equal(evidence.observation.semanticCounts.projects, 1);
    assert.equal(evidence.observation.semanticCounts.walls, 1);
    assert.equal(evidence.observation.geometry.triangles, 12);
    assert.deepEqual(evidence.observation.cleanup, {
      modelClosed: true,
      engineDisposed: true,
    });
    assert.equal(evidence.conformance.cleanOfflineInstall, true);
    assert.equal(
      evidence.conformance.artifactMatchesStageInventory,
      true,
    );
    assert.equal(evidence.decision.productionPackage, "blocked");
    assert.equal(evidence.decision.productionClaims, false);

    const artifact = path.join(output, evidence.artifact.file);
    assert.equal((await stat(artifact)).size, evidence.artifact.byteLength);
    assert.equal(
      createHash("sha256")
        .update(await readFile(artifact))
        .digest("hex"),
      evidence.artifact.sha256,
    );
    assert.doesNotMatch(
      JSON.stringify(evidence),
      /\/Volumes\/|\/Users\/|[A-Z]:\\/u,
    );
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});
