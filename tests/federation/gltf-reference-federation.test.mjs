import assert from "node:assert/strict";
import test from "node:test";

import {
  BIM_SOURCE_PROTOCOL_VERSION,
  createGltfReferenceSource,
} from "../../packages/gltf-reference-source/src/index.mjs";
import {
  createBimFederation,
  createUnalignedSource,
} from "../../packages/bim-federation/src/index.mjs";
import {
  syntheticGlbBytes,
  syntheticGltfJsonBytes,
} from "../../scripts/generate-synthetic-gltf.mjs";

async function sourceFixture(bytes) {
  const source = await createGltfReferenceSource(bytes);
  const session = await source.open({
    protocolVersion: BIM_SOURCE_PROTOCOL_VERSION,
  });
  return {
    source,
    session,
    snapshot: await session.getSnapshot(),
  };
}

function selectionItem(slot, snapshot, entity) {
  return {
    federationSourceId: slot,
    sourceRevisionId: snapshot.revisionId,
    nativeIdentity: {
      nativeId: entity.nativeId,
      globalId: null,
      externalIdentityToken:
        entity.externalIdentityToken,
    },
  };
}

async function disposeFixture(fixture) {
  await fixture.session.dispose();
  await fixture.source.dispose();
}

test("glTF and GLB remain reference-only federation sources", async () => {
  const glb = await sourceFixture(syntheticGlbBytes());
  const gltf = await sourceFixture(syntheticGltfJsonBytes());
  const federation = createBimFederation({
    federationId: "federation:gltf-reference",
  });
  const glbDescriptor = federation.addReferenceSource({
    format: "glb",
    federationSourceId: "source-slot:glb-reference",
    snapshot: glb.snapshot,
    discipline: "reference",
    owner: "external-reference:glb",
    alignment: createUnalignedSource({
      sourceRevisionId: glb.snapshot.revisionId,
      reason: "reference mesh has no shared coordinate evidence",
    }),
  });
  federation.addReferenceSource({
    format: "gltf",
    federationSourceId: "source-slot:gltf-reference",
    snapshot: gltf.snapshot,
    discipline: "reference",
    owner: "external-reference:gltf",
    alignment: createUnalignedSource({
      sourceRevisionId: gltf.snapshot.revisionId,
      reason: "reference mesh has no shared coordinate evidence",
    }),
    visible: false,
  });

  assert.equal(glbDescriptor.format, "glb");
  assert.equal(
    glbDescriptor.sourceRole,
    "derived-or-reference-mesh",
  );
  assert.equal(
    glbDescriptor.identityPolicy.semanticAuthority,
    "not-bim-authority",
  );
  assert.equal(
    glbDescriptor.nativeDocument.schema,
    "glTF 2.0",
  );
  const glbEntity = glb.snapshot.entities[0];
  const gltfEntity = gltf.snapshot.entities[0];
  const selection = federation.createSelection({
    items: [
      selectionItem(
        "source-slot:glb-reference",
        glb.snapshot,
        glbEntity,
      ),
      selectionItem(
        "source-slot:gltf-reference",
        gltf.snapshot,
        gltfEntity,
      ),
    ],
  });
  assert.equal(selection.items.length, 2);
  assert.notEqual(
    selection.items[0].key,
    selection.items[1].key,
  );
  assert.equal(
    selection.items[0].nativeIdentity.nativeId,
    glbEntity.nativeId,
  );
  assert.equal(
    selection.items[0].nativeIdentity.globalId,
    null,
  );
  assert.equal(
    "expressId" in selection.items[0].nativeIdentity,
    false,
  );
  assert.throws(
    () => federation.createSelection({
      items: [{
        federationSourceId: "source-slot:glb-reference",
        sourceRevisionId: glb.snapshot.revisionId,
        nativeIdentity: {
          expressId: glbEntity.expressId,
          globalId: null,
          externalIdentityToken:
            glbEntity.externalIdentityToken,
        },
      }],
    }),
    /outside its native source/u,
  );
  assert.throws(
    () => federation.transformPoint({
      federationSourceId: "source-slot:glb-reference",
      sourceRevisionId: glb.snapshot.revisionId,
      point: [0, 0, 0],
    }),
    /no shared coordinate/u,
  );
  const descriptor = federation.getDescriptor();
  assert.deepEqual(
    descriptor.sources.map((source) => source.format),
    ["glb", "gltf"],
  );
  assert.equal(
    descriptor.authority.mergeSourceIdentity,
    false,
  );
  assert.equal(
    descriptor.authority.mutateNativeSource,
    false,
  );

  const receipt = await federation.dispose();
  assert.equal(receipt.releasedSources, 2);
  await disposeFixture(glb);
  await disposeFixture(gltf);
});

test("GLB reference refresh invalidates prior native selection", async () => {
  const before = await sourceFixture(syntheticGlbBytes());
  const after = await sourceFixture(
    syntheticGlbBytes({ secondNodeX: 4 }),
  );
  const federation = createBimFederation({
    federationId: "federation:gltf-refresh",
  });
  federation.addReferenceSource({
    format: "glb",
    federationSourceId: "source-slot:reference",
    snapshot: before.snapshot,
    discipline: "reference",
    owner: "external-reference:glb",
    alignment: createUnalignedSource({
      sourceRevisionId: before.snapshot.revisionId,
      reason: "reference mesh has no shared coordinate evidence",
    }),
  });
  const oldSelection = selectionItem(
    "source-slot:reference",
    before.snapshot,
    before.snapshot.entities[0],
  );
  federation.createSelection({ items: [oldSelection] });
  const refreshed = federation.refreshReferenceSource({
    format: "glb",
    federationSourceId: "source-slot:reference",
    expectedRevisionId: before.snapshot.revisionId,
    snapshot: after.snapshot,
    alignment: createUnalignedSource({
      sourceRevisionId: after.snapshot.revisionId,
      reason: "reference mesh has no shared coordinate evidence",
    }),
  });
  assert.equal(refreshed.format, "glb");
  assert.equal(
    refreshed.priorIdentityPolicy,
    "all-prior-source-selections-are-stale",
  );
  assert.throws(
    () => federation.createSelection({
      items: [oldSelection],
    }),
    /revision is stale or unavailable/u,
  );

  const overclaim = structuredClone(after.snapshot);
  overclaim.source.semanticAuthority = true;
  assert.throws(
    () => createBimFederation({
      federationId: "federation:gltf-overclaim",
    }).addReferenceSource({
      format: "glb",
      federationSourceId: "source-slot:overclaim",
      snapshot: overclaim,
      discipline: "reference",
      owner: "external-reference:glb",
      alignment: createUnalignedSource({
        sourceRevisionId: overclaim.revisionId,
        reason: "no shared coordinate evidence",
      }),
    }),
    /identity or authority is invalid/u,
  );

  const wrongProfile = structuredClone(after.snapshot);
  wrongProfile.source.profile =
    "gltf-2.0-unqualified-profile";
  assert.throws(
    () => createBimFederation({
      federationId: "federation:gltf-wrong-profile",
    }).addReferenceSource({
      format: "glb",
      federationSourceId: "source-slot:wrong-profile",
      snapshot: wrongProfile,
      discipline: "reference",
      owner: "external-reference:glb",
      alignment: createUnalignedSource({
        sourceRevisionId: wrongProfile.revisionId,
        reason: "no shared coordinate evidence",
      }),
    }),
    /profile is not qualified/u,
  );

  await federation.dispose();
  await disposeFixture(before);
  await disposeFixture(after);
});
