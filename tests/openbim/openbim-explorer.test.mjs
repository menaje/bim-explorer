import assert from "node:assert/strict";
import test from "node:test";

import { zipSync } from "fflate";

import {
  BCF_DOCUMENT_SCHEMA,
  BCF_EXPORT_SCHEMA,
  BCF_VIEWPOINT_RESOLUTION_SCHEMA,
  IDS_DOCUMENT_SCHEMA,
  IDS_RESULT_RESOLUTION_SCHEMA,
  IDS_RESULT_SCHEMA,
  createBsddReference,
  createOpenBimExplorer,
} from "../../packages/openbim-explorer/src/index.mjs";

const FINGERPRINT = `sha256:${"a".repeat(64)}`;
const REVISION = `source-snapshot:${FINGERPRINT}`;
const WALL_1 = "0AAAAAAAAAAAAAAAAAAA16";
const WALL_2 = "0AAAAAAAAAAAAAAAAAAA17";
const MISSING_WALL = "0AAAAAAAAAAAAAAAAAAA18";
const TOPIC_GUID = "11111111-1111-4111-8111-111111111111";
const VIEWPOINT_GUID =
  "22222222-2222-4222-8222-222222222222";

function snapshot({
  fingerprint = FINGERPRINT,
} = {}) {
  return {
    protocolVersion: "bim-explorer-bim-source/0.2",
    revisionId: `source-snapshot:${fingerprint}`,
    source: {
      fingerprint,
    },
    entities: [
      {
        expressId: 40,
        globalId: WALL_1,
        ifcClass: "IFCWALL",
        name: "Mapped Wall-01",
        renderId: "render:bim:40",
        pickId: "pick:bim:40",
        externalIdentityToken: "ifc-global-id:wall-1",
      },
      {
        expressId: 44,
        globalId: WALL_2,
        ifcClass: "IFCWALL",
        name: "Mapped Wall-02",
        renderId: null,
        pickId: null,
        externalIdentityToken: "ifc-global-id:wall-2",
      },
    ],
  };
}

function bcfExportRequest() {
  return {
    topic: {
      guid: TOPIC_GUID,
      type: "Issue",
      status: "Open",
      title: "Check mapped wall",
      creationDate: "2026-08-04T00:00:00.000Z",
      creationAuthor: "reviewer@example.invalid",
      description: "Synthetic offline BCF round-trip",
      labels: ["IDS", "Envelope"],
    },
    viewpoint: {
      guid: VIEWPOINT_GUID,
      camera: {
        projection: "perspective",
        position: [4, 5, 6],
        direction: [-2, -2, -4.5],
        up: [0, 0, 1],
        fieldOfView: 60,
        aspectRatio: 4 / 3,
      },
      selection: [
        {
          globalId: WALL_1,
          originatingSystem: "BIM Explorer",
          authoringToolId: "40",
        },
        {
          globalId: MISSING_WALL,
        },
      ],
      visibility: {
        defaultVisible: false,
        exceptions: [
          {
            globalId: WALL_1,
          },
        ],
      },
      coloring: [
        {
          color: "FF000080",
          components: [
            {
              globalId: WALL_2,
            },
          ],
        },
      ],
      clippingPlanes: [
        {
          location: [0, 0, 1.5],
          direction: [0, 0, 1],
        },
      ],
    },
  };
}

function idsXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<ids:ids
  xmlns:ids="http://standards.buildingsmart.org/IDS"
  xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <ids:info>
    <ids:title>Envelope requirements</ids:title>
    <ids:version>1.0</ids:version>
    <ids:author>reviewer@example.invalid</ids:author>
  </ids:info>
  <ids:specifications>
    <ids:specification
      name="Wall classification"
      identifier="wall-class"
      ifcVersion="IFC4">
      <ids:applicability minOccurs="1" maxOccurs="unbounded">
        <ids:entity>
          <ids:name>
            <ids:simpleValue>IFCWALL</ids:simpleValue>
          </ids:name>
        </ids:entity>
      </ids:applicability>
      <ids:requirements>
        <ids:classification
          uri="https://identifier.buildingsmart.org/uri/buildingsmart/ifc/4.3/class/IfcWall">
          <ids:value>
            <ids:simpleValue>IfcWall</ids:simpleValue>
          </ids:value>
          <ids:system>
            <ids:simpleValue>IFC</ids:simpleValue>
          </ids:system>
        </ids:classification>
        <ids:property
          uri="https://identifier.buildingsmart.org/uri/buildingsmart/ifc/4.3/property/FireRating"
          dataType="IFCLABEL"
          cardinality="required">
          <ids:propertySet>
            <ids:simpleValue>Pset_WallCommon</ids:simpleValue>
          </ids:propertySet>
          <ids:baseName>
            <ids:simpleValue>FireRating</ids:simpleValue>
          </ids:baseName>
        </ids:property>
      </ids:requirements>
    </ids:specification>
  </ids:specifications>
</ids:ids>`;
}

test("BCF XML 3.0 round-trips deterministically and stays source-bound", async () => {
  const explorer = createOpenBimExplorer({
    snapshot: snapshot(),
    fetcher: undefined,
  });
  const first = await explorer.exportBcf(bcfExportRequest());
  const second = await explorer.exportBcf(bcfExportRequest());
  assert.equal(first.schema, BCF_EXPORT_SCHEMA);
  assert.deepEqual(first.bytes, second.bytes);
  assert.equal(first.documentId, second.documentId);

  const document = await explorer.importBcf(first.bytes);
  assert.equal(document.schema, BCF_DOCUMENT_SCHEMA);
  assert.equal(document.profile, "BCF XML 3.0");
  assert.equal(document.topics[0].title, "Check mapped wall");
  assert.equal(
    document.topics[0].viewpoints[0].visualization
      .clippingPlanes.length,
    1,
  );
  assert.equal(document.receipt.networkRequests, 0);

  const resolution = explorer.resolveBcf({
    document,
    topicGuid: TOPIC_GUID,
    viewpointGuid: VIEWPOINT_GUID,
  });
  assert.equal(
    resolution.schema,
    BCF_VIEWPOINT_RESOLUTION_SCHEMA,
  );
  assert.deepEqual(
    resolution.viewpoint.camera.target,
    [2, 3, 1.5],
  );
  assert.equal(
    resolution.viewpoint.selection[0].renderId,
    "render:bim:40",
  );
  assert.equal(
    resolution.viewpoint.visibility.exceptions[0].pickId,
    "pick:bim:40",
  );
  assert.equal(
    resolution.viewpoint.coloring[0].entities[0].globalId,
    WALL_2,
  );
  assert.deepEqual(
    resolution.diagnostics.map((item) => item.code),
    [
      "component-global-id-not-found",
      "component-not-renderable",
    ],
  );
  assert.equal(resolution.canApply, false);
  assert.equal(resolution.source.revisionId, REVISION);

  const stale = structuredClone(document);
  stale.source = {
    ...stale.source,
    fingerprint: `sha256:${"b".repeat(64)}`,
    revisionId: `source-snapshot:sha256:${"b".repeat(64)}`,
  };
  assert.throws(
    () => explorer.resolveBcf({
      document: stale,
      topicGuid: TOPIC_GUID,
      viewpointGuid: VIEWPOINT_GUID,
    }),
    /stale for the active source snapshot/u,
  );
  assert.equal(explorer.dispose(), true);
  assert.equal(explorer.dispose(), false);
});

test("BCF import rejects unsafe and over-budget archives", async () => {
  const explorer = createOpenBimExplorer({
    snapshot: snapshot(),
    fetcher: undefined,
  });
  const unsafe = zipSync({
    "../bcf.version": new TextEncoder().encode(
      "<Version VersionId=\"3.0\"/>",
    ),
  });
  await assert.rejects(
    explorer.importBcf(unsafe),
    /entry path is unsafe/u,
  );
  const exported = await explorer.exportBcf(
    bcfExportRequest(),
  );
  const smallLimitExplorer = createOpenBimExplorer({
    snapshot: snapshot(),
    fetcher: undefined,
    limits: {
      bcf: {
        maximumArchiveBytes: exported.bytes.byteLength - 1,
      },
    },
  });
  await assert.rejects(
    smallLimitExplorer.importBcf(exported.bytes),
    /exceeds its byte limit/u,
  );
  explorer.dispose();
  smallLimitExplorer.dispose();
});

test("IDS 1.0 exposes requirements, tri-state result, and provenance", async () => {
  const explorer = createOpenBimExplorer({
    snapshot: snapshot(),
    fetcher: undefined,
  });
  const document = await explorer.importIds(idsXml());
  assert.equal(document.schema, IDS_DOCUMENT_SCHEMA);
  assert.equal(document.info.title, "Envelope requirements");
  assert.deepEqual(
    document.specifications[0].requirements.map(
      (facet) => facet.kind,
    ),
    ["classification", "property"],
  );
  assert.deepEqual(
    document.vocabularyReferences.map((reference) => [
      reference.kind,
      reference.version,
      reference.code,
    ]),
    [
      ["class", "4.3", "IfcWall"],
      ["property", "4.3", "FireRating"],
    ],
  );
  assert.equal(document.receipt.networkRequests, 0);
  assert.equal(document.validation.schemaValidated, false);
  assert.equal(
    document.validation.evaluatesIfcRequirements,
    false,
  );

  const result = explorer.importIdsResult({
    schema: IDS_RESULT_SCHEMA,
    resultId: "ids-run:external:1",
    idsDocumentId: document.documentId,
    source: {
      protocolVersion: "bim-explorer-bim-source/0.2",
      fingerprint: FINGERPRINT,
      revisionId: REVISION,
    },
    provenance: {
      kind: "external",
      producer: "synthetic-validator/1.0",
      runId: "run:1",
    },
    specifications: [
      {
        specificationId: "wall-class",
        name: "Wall classification",
        status: "fail",
        entities: [
          {
            globalId: WALL_1,
            status: "fail",
            requirementId: "classification",
            message: "classification missing",
          },
          {
            globalId: MISSING_WALL,
            status: "fail",
            requirementId: "property",
            message: "source entity missing",
          },
          {
            globalId: WALL_2,
            status: "pass",
            requirementId: "classification",
          },
          {
            globalId: null,
            status: "not-evaluated",
            requirementId: "property",
          },
        ],
      },
    ],
  });
  const resolution = explorer.resolveIds({
    result,
    document,
    specificationId: "wall-class",
  });
  assert.equal(
    resolution.schema,
    IDS_RESULT_RESOLUTION_SCHEMA,
  );
  assert.equal(resolution.provenance.kind, "external");
  assert.deepEqual(resolution.specification.counts, {
    pass: 1,
    fail: 2,
    "not-evaluated": 1,
  });
  assert.equal(resolution.selection.length, 1);
  assert.equal(resolution.selection[0].globalId, WALL_1);
  assert.equal(resolution.failures.length, 2);
  assert.deepEqual(
    resolution.diagnostics.map((item) => item.code),
    ["failing-entity-global-id-not-found"],
  );
  assert.equal(resolution.completeResolution, false);

  const staleResult = structuredClone(result);
  staleResult.source = {
    protocolVersion: "bim-explorer-bim-source/0.2",
    fingerprint: `sha256:${"b".repeat(64)}`,
    revisionId: `source-snapshot:sha256:${"b".repeat(64)}`,
  };
  assert.throws(
    () => explorer.resolveIds({
      result: staleResult,
      document,
      specificationId: "wall-class",
    }),
    /stale for the active source snapshot/u,
  );
  await assert.rejects(
    explorer.importIds(
      "<?xml version=\"1.0\"?>" +
      "<!DOCTYPE ids [<!ENTITY xxe SYSTEM \"file:///x\">]>" +
      `<ids:ids xmlns:ids="${
        "http://standards.buildingsmart.org/IDS"
      }"><ids:info><ids:title>&xxe;</ids:title></ids:info>` +
      "<ids:specifications/></ids:ids>",
    ),
    /must not contain a DOCTYPE/u,
  );
  explorer.dispose();
});

test("bSDD stays offline until an explicit bounded lookup and caches it", async () => {
  const requests = [];
  const explorer = createOpenBimExplorer({
    snapshot: snapshot(),
    fetcher: async (url, options) => {
      requests.push({
        url: url.toString(),
        options,
      });
      return new Response(JSON.stringify({
        uri: url.searchParams.get("Uri"),
        name: "IfcWall",
      }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      });
    },
  });
  const reference = createBsddReference(
    "https://identifier.buildingsmart.org/uri/" +
    "buildingsmart/ifc/4.3/class/IfcWall",
  );
  const offline = await explorer.lookupBsdd(reference);
  assert.equal(offline.status, "offline-missing");
  assert.equal(requests.length, 0);

  const resolved = await explorer.lookupBsdd(reference, {
    allowNetwork: true,
  });
  assert.equal(resolved.status, "resolved");
  assert.equal(resolved.cacheHit, false);
  assert.equal(requests.length, 1);
  assert.match(
    requests[0].url,
    /^https:\/\/api\.bsdd\.buildingsmart\.org\/api\/Class\/v1\?/u,
  );
  assert.equal(requests[0].options.credentials, "omit");
  const cached = await explorer.lookupBsdd(reference);
  assert.equal(cached.status, "cached");
  assert.equal(cached.cacheHit, true);
  assert.equal(requests.length, 1);
  assert.equal(explorer.state.networkRequests, 1);
  explorer.dispose();
});
