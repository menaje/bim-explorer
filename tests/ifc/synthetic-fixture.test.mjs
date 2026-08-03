import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  syntheticIfc,
  syntheticMappedIfc,
} from "../../scripts/generate-synthetic-ifc.mjs";

test("synthetic IFC4 fixture is deterministic and path-free", async () => {
  const first = syntheticIfc();
  const second = syntheticIfc();
  assert.equal(first, second);
  assert.match(first, /^ISO-10303-21;\n/u);
  assert.match(first, /FILE_SCHEMA\(\('IFC4'\)\);/u);
  assert.match(first, /IFCWALL\(/u);
  assert.match(first, /IFCEXTRUDEDAREASOLID\(/u);
  assert.doesNotMatch(first, /\/Volumes\/|\/Users\/|[A-Z]:\\/u);
  const globalIds = [...first.matchAll(/'([0-3][0-9A-Za-z_$]{21})'/gu)]
    .map((match) => match[1]);
  assert.equal(globalIds.length, 17);
  assert.equal(new Set(globalIds).size, 17);
  assert.equal(
    createHash("sha256").update(first).digest("hex"),
    createHash("sha256").update(second).digest("hex"),
  );
});

test("mapped IFC4 fixture reuses one representation deterministically", () => {
  const fixture = syntheticMappedIfc();
  assert.match(fixture, /IFCREPRESENTATIONMAP\(/u);
  assert.equal(
    [...fixture.matchAll(/IFCMAPPEDITEM\(/gu)].length,
    2,
  );
  assert.match(fixture, /IFCELEMENTQUANTITY\(/u);
  assert.match(fixture, /IFCRELASSOCIATESCLASSIFICATION\(/u);
  const globalIds = [...fixture.matchAll(
    /'([0-3][0-9A-Za-z_$]{21})'/gu,
  )].map((match) => match[1]);
  assert.equal(globalIds.length, 21);
  assert.equal(new Set(globalIds).size, 21);
  assert.doesNotMatch(fixture, /\/Volumes\/|\/Users\/|[A-Z]:\\/u);
});

test("synthetic fixture manifest separates qualified and held scenarios", async () => {
  const manifest = JSON.parse(
    await readFile(
      "fixtures/ifc/synthetic-small/manifest.json",
      "utf8",
    ),
  );
  assert.equal(manifest.ifc.schema, "IFC4");
  assert.equal(manifest.tracking.artifactCommitted, false);
  assert.equal(manifest.redistribution.thirdPartyContent, false);
  assert.equal(manifest.expected.globalIds.count, 17);
  assert.ok(manifest.qualificationUse.includes("extruded-geometry"));
  assert.ok(manifest.notQualified.includes("large-model-performance"));
  assert.ok(manifest.notQualified.includes("write-roundtrip"));
});

test("mapped fixture manifest declares shared semantic assertions", async () => {
  const manifest = JSON.parse(
    await readFile(
      "fixtures/ifc/synthetic-mapped/manifest.json",
      "utf8",
    ),
  );
  assert.equal(manifest.expected.entities.IfcMappedItem, 2);
  assert.equal(
    manifest.expected.representationSharing.distinctMappingSources,
    1,
  );
  assert.equal(manifest.expected.wall.quantities.Length, 4);
  assert.equal(
    manifest.expected.wall.classifications[0].identification,
    "BE-WALL",
  );
  assert.ok(manifest.qualificationUse.includes("mapped-representation"));
});
