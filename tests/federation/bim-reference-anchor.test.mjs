import assert from "node:assert/strict";
import test from "node:test";

import {
  BIM_REFERENCE_ANCHOR_AUTHORITY,
  BIM_REFERENCE_ANCHOR_MAXIMUM_OCCURRENCES,
  BIM_REFERENCE_ANCHOR_SCHEMA,
  assertBimReferenceAnchorCurrent,
  createBimReferenceAnchor,
  createBimReferenceAnchorFromFederatedPick,
  evaluateBimReferenceAnchor,
  fingerprintReferenceAnchorContext,
  validateBimReferenceAnchor,
} from "../../packages/bim-reference-anchor/src/index.mjs";

const A = `sha256:${"a".repeat(64)}`;
const B = `sha256:${"b".repeat(64)}`;
const C = `sha256:${"c".repeat(64)}`;
const IDENTITY = Object.freeze([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]);

function anchorInput(overrides = {}) {
  return {
    federationSourceId: "source-slot:architecture",
    nativeDocument: {
      format: "ifc",
      fingerprint: A,
      revisionId: `source-snapshot:${A}`,
      schema: "IFC4",
      profile: "ReferenceView_V1.2",
    },
    nativeIdentity: {
      kind: "ifc-global-id",
      nativeId: "ifc-globalid:0123456789ABCDEFGHIJKL",
      globalId: "0123456789ABCDEFGHIJKL",
      occurrencePath: ["assembly:main", "occurrence:west"],
    },
    hit: {
      coordinateSpace: "source-local",
      point: [12.5, 4.25, 3],
      normal: [0, 0, 4],
    },
    locator: {
      kind: "triangle-barycentric",
      primitiveId: "primitive:42",
      triangleIndex: 7,
      barycentric: [0.2, 0.3, 0.5],
    },
    stability: "derived",
    alignmentFingerprint: B,
    projectionFingerprint: C,
    ...overrides,
  };
}

function currentBinding(anchor) {
  return {
    federationSourceId: anchor.federationSourceId,
    nativeDocument: anchor.nativeDocument,
    nativeIdentity: anchor.nativeIdentity,
    alignmentFingerprint: anchor.alignmentFingerprint,
    projectionFingerprint: anchor.projectionFingerprint,
  };
}

function projectionFixture({
  format,
  nativeIdentity,
  sourceRevisionId,
}) {
  return {
    schema: "bim-explorer-federated-renderer-projection/0.1",
    snapshot: {
      revisionId: `source-snapshot:${C}`,
      source: {
        fingerprint: C,
      },
    },
    identityMap: [{
      pickId: "pick:federated:test:1",
      federationSourceId: `source-slot:${format}`,
      sourceRevisionId,
      sourceProjectionFingerprint: B,
      nativeIdentity,
    }],
  };
}

function sourceFixture({ format, sourceRevisionId }) {
  return {
    schema: "bim-explorer-federation-source/0.1",
    federationSourceId: `source-slot:${format}`,
    format,
    nativeDocument: {
      fingerprint: A,
      revisionId: sourceRevisionId,
      schema: format === "ifc" ? "IFC4" : "glTF 2.0",
      profile: format === "ifc"
        ? "ReferenceView_V1.2"
        : "gltf-2.0-bounded-reference-mesh-v0.1",
    },
    alignment: {
      schema: "bim-explorer-federation-alignment/0.1",
      status: "aligned",
      method: "explicit",
      sourceRevisionId,
      sourceCoordinateSystem: "source-local",
      federationCoordinateSystem: "federation-local",
      federationOrigin: [0, 0, 0],
      sourceToFederation: IDENTITY,
      numericPrecision: "float64",
      datumTransformation: "not-performed",
      provenance: {
        kind: "explicit-user-input",
        reference: "qualification:identity",
      },
    },
  };
}

function pickFixture() {
  return {
    schema: "bim-explorer-bim-renderer-3d-pick-receipt/0.1",
    status: "hit",
    source: {
      fingerprint: C,
      revisionId: `source-snapshot:${C}`,
    },
    identity: {
      pickId: "pick:federated:test:1",
    },
    worldPosition: [1, 2, 3],
  };
}

test("reference anchor is bounded, normalized, immutable, and authority-free", () => {
  const anchor = createBimReferenceAnchor(anchorInput());

  assert.equal(anchor.schema, BIM_REFERENCE_ANCHOR_SCHEMA);
  assert.deepEqual(anchor.hit.normal, [0, 0, 1]);
  assert.deepEqual(anchor.authority, BIM_REFERENCE_ANCHOR_AUTHORITY);
  assert.ok(Object.values(anchor.authority).every((value) => !value));
  assert.equal(Object.isFrozen(anchor), true);
  assert.equal(Object.isFrozen(anchor.nativeIdentity.occurrencePath), true);
  assert.deepEqual(validateBimReferenceAnchor(anchor), anchor);
});

test("reference anchor validation fails closed on every exact binding", () => {
  const anchor = createBimReferenceAnchor(anchorInput());
  const current = currentBinding(anchor);

  assert.equal(
    evaluateBimReferenceAnchor(anchor, current).status,
    "current",
  );
  assert.equal(
    assertBimReferenceAnchorCurrent(anchor, current).status,
    "current",
  );

  const stale = structuredClone(current);
  stale.nativeDocument.fingerprint = B;
  stale.nativeDocument.revisionId = `source-snapshot:${B}`;
  stale.nativeIdentity.nativeId = "ifc-globalid:replacement";
  stale.nativeIdentity.occurrencePath = ["occurrence:east"];
  stale.alignmentFingerprint = C;
  stale.projectionFingerprint = A;
  const result = evaluateBimReferenceAnchor(anchor, stale);

  assert.equal(result.status, "stale");
  assert.deepEqual(result.reasons, [
    "native-fingerprint-changed",
    "native-revision-changed",
    "native-identity-changed",
    "occurrence-path-changed",
    "alignment-changed",
    "projection-changed",
  ]);
  assert.throws(
    () => assertBimReferenceAnchorCurrent(anchor, stale),
    /reference anchor is stale/u,
  );
});

test("reference anchor rejects unsafe coordinates, locators, and payloads", () => {
  assert.throws(
    () => createBimReferenceAnchor(anchorInput({
      hit: {
        coordinateSpace: "federation-world",
        point: [0, 0, 0],
        normal: [0, 0, 1],
      },
    })),
    /source-local/u,
  );
  assert.throws(
    () => createBimReferenceAnchor(anchorInput({
      hit: {
        coordinateSpace: "source-local",
        point: [0, 0, 0],
        normal: [0, 0, 0],
      },
    })),
    /zero vector/u,
  );
  assert.throws(
    () => createBimReferenceAnchor(anchorInput({
      locator: {
        kind: "triangle-barycentric",
        primitiveId: "primitive:42",
        triangleIndex: 7,
        barycentric: [0.2, 0.3, 0.7],
      },
    })),
    /barycentric coordinate is invalid/u,
  );
  assert.throws(
    () => createBimReferenceAnchor(anchorInput({
      stability: "point-only",
    })),
    /cannot carry a topology locator/u,
  );
  assert.throws(
    () => createBimReferenceAnchor(anchorInput({
      nativeIdentity: {
        kind: "gltf-native-id",
        nativeId: "/Users/example/private/model.glb",
        occurrencePath: [],
      },
    })),
    /path-free/u,
  );
  assert.throws(
    () => createBimReferenceAnchor(anchorInput({
      nativeIdentity: {
        kind: "ifc-global-id",
        nativeId: "ifc-globalid:test",
        occurrencePath: new Array(
          BIM_REFERENCE_ANCHOR_MAXIMUM_OCCURRENCES + 1,
        ).fill("occurrence:test"),
      },
    })),
    /occurrence path exceeds its bound/u,
  );
});

test("context fingerprints are deterministic across object key order", async () => {
  assert.equal(
    await fingerprintReferenceAnchorContext({
      method: "explicit",
      matrix: IDENTITY,
    }),
    await fingerprintReferenceAnchorContext({
      matrix: IDENTITY,
      method: "explicit",
    }),
  );
});

test("federated IFC pick resolves to source GlobalId without composite identity", async () => {
  const sourceRevisionId = `source-snapshot:${A}`;
  const source = sourceFixture({
    format: "ifc",
    sourceRevisionId,
  });
  const projection = projectionFixture({
    format: "ifc",
    sourceRevisionId,
    nativeIdentity: {
      expressId: 42,
      globalId: "0123456789ABCDEFGHIJKL",
      externalIdentityToken: "ifc-native:test",
    },
  });
  const anchor = await createBimReferenceAnchorFromFederatedPick({
    pick: pickFixture(),
    projection,
    source,
    sourceLocalHit: {
      coordinateSpace: "source-local",
      point: [1, 2, 3],
      normal: [0, 1, 0],
    },
  });

  assert.equal(anchor.nativeIdentity.kind, "ifc-global-id");
  assert.equal(
    anchor.nativeIdentity.nativeId,
    "ifc-globalid:0123456789ABCDEFGHIJKL",
  );
  assert.equal("pickId" in anchor.nativeIdentity, false);
  assert.equal(anchor.projectionFingerprint, B);
});

test("federated GLB pick preserves reference-native identity and no GlobalId", async () => {
  const sourceRevisionId = `source-snapshot:${A}`;
  const source = sourceFixture({
    format: "glb",
    sourceRevisionId,
  });
  const projection = projectionFixture({
    format: "glb",
    sourceRevisionId,
    nativeIdentity: {
      nativeId: "node:0/mesh:0/primitive:0",
      globalId: null,
      externalIdentityToken: "gltf-native:test",
    },
  });
  const anchor = await createBimReferenceAnchorFromFederatedPick({
    pick: pickFixture(),
    projection,
    source,
    sourceLocalHit: {
      coordinateSpace: "source-local",
      point: [1, 2, 3],
      normal: [1, 0, 0],
    },
    stability: "point-only",
  });

  assert.equal(anchor.nativeIdentity.kind, "glb-native-id");
  assert.equal(
    anchor.nativeIdentity.nativeId,
    "node:0/mesh:0/primitive:0",
  );
  assert.equal("globalId" in anchor.nativeIdentity, false);
  assert.equal(anchor.locator, null);
  assert.equal(anchor.stability, "point-only");
});

test("federated anchor rejects stale projection and mismatched source-local hit", async () => {
  const sourceRevisionId = `source-snapshot:${A}`;
  const source = sourceFixture({
    format: "glb",
    sourceRevisionId,
  });
  const projection = projectionFixture({
    format: "glb",
    sourceRevisionId,
    nativeIdentity: {
      nativeId: "node:0/mesh:0/primitive:0",
    },
  });
  const input = {
    pick: pickFixture(),
    projection,
    source,
    sourceLocalHit: {
      coordinateSpace: "source-local",
      point: [2, 2, 3],
      normal: [0, 0, 1],
    },
  };

  await assert.rejects(
    createBimReferenceAnchorFromFederatedPick(input),
    /does not reproduce/u,
  );
  const stale = structuredClone(projection);
  stale.snapshot.source.fingerprint = B;
  await assert.rejects(
    createBimReferenceAnchorFromFederatedPick({
      ...input,
      sourceLocalHit: {
        ...input.sourceLocalHit,
        point: [1, 2, 3],
      },
      projection: stale,
    }),
    /outside the exact source projection/u,
  );
});
