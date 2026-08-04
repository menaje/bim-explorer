import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { zipSync } from "fflate";

import {
  createWebIfcSourceArtifact,
} from "../adapters/web-ifc/src/create-source-artifact.mjs";
import {
  BIM_SOURCE_PROTOCOL_VERSION,
  createBimModelSource,
} from "../packages/bim-model-source/src/index.mjs";
import {
  IDS_RESULT_SCHEMA,
  OPENBIM_EXPLORER_CONTRACT,
  createOpenBimExplorer,
} from "../packages/openbim-explorer/src/index.mjs";
import {
  syntheticMappedIfc,
} from "./generate-synthetic-ifc.mjs";

const SOURCE_SHA256 =
  "400071d0a99f14ef37c46560bde1651965a378e0586b5f470be3fda81e585243";
const WALL = "0AAAAAAAAAAAAAAAAAAA16";
const MISSING_WALL = "0AAAAAAAAAAAAAAAAAAA18";
const TOPIC_GUID = "11111111-1111-4111-8111-111111111111";
const VIEWPOINT_GUID =
  "22222222-2222-4222-8222-222222222222";

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

function bcfRequest() {
  return {
    topic: {
      guid: TOPIC_GUID,
      type: "Issue",
      status: "Open",
      title: "Check mapped wall",
      creationDate: "2026-08-04T00:00:00.000Z",
      creationAuthor: "reviewer@example.invalid",
      description: "Synthetic openBIM qualification",
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
          globalId: WALL,
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
            globalId: WALL,
          },
        ],
      },
      coloring: [],
      clippingPlanes: [
        {
          location: [0, 0, 1.5],
          direction: [0, 0, 1],
        },
      ],
    },
  };
}

async function rejects(operation, pattern) {
  await assert.rejects(
    Promise.resolve().then(operation),
    pattern,
  );
  return true;
}

export async function qualifyOpenBimExplorer() {
  const artifact = await createWebIfcSourceArtifact(
    new TextEncoder().encode(syntheticMappedIfc()),
    { profile: "ReferenceView_V1.2" },
  );
  assert.equal(artifact.source.sha256, SOURCE_SHA256);
  const source = createBimModelSource(artifact);
  const session = await source.open({
    protocolVersion: BIM_SOURCE_PROTOCOL_VERSION,
  });
  const snapshot = await session.getSnapshot();
  const network = [];
  const explorer = createOpenBimExplorer({
    snapshot,
    fetcher: async (url, options) => {
      network.push({
        url: url.toString(),
        credentials: options.credentials,
        accept: options.headers.accept,
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

  const firstExport = await explorer.exportBcf(bcfRequest());
  const secondExport = await explorer.exportBcf(bcfRequest());
  const deterministicExport =
    firstExport.documentId === secondExport.documentId &&
    Buffer.from(firstExport.bytes).equals(
      Buffer.from(secondExport.bytes),
    );
  assert.equal(deterministicExport, true);
  const bcf = await explorer.importBcf(firstExport.bytes);
  const viewpoint = explorer.resolveBcf({
    document: bcf,
    topicGuid: TOPIC_GUID,
    viewpointGuid: VIEWPOINT_GUID,
  });
  const staleBcf = structuredClone(bcf);
  staleBcf.source = {
    protocolVersion: BIM_SOURCE_PROTOCOL_VERSION,
    fingerprint: `sha256:${"f".repeat(64)}`,
    revisionId: `source-snapshot:sha256:${"f".repeat(64)}`,
  };
  const staleBcfRejected = await rejects(
    () => explorer.resolveBcf({
      document: staleBcf,
      topicGuid: TOPIC_GUID,
      viewpointGuid: VIEWPOINT_GUID,
    }),
    /stale for the active source snapshot/u,
  );
  const unsafeArchiveRejected = await rejects(
    () => explorer.importBcf(zipSync({
      "../bcf.version": new TextEncoder().encode(
        "<Version VersionId=\"3.0\"/>",
      ),
    })),
    /entry path is unsafe/u,
  );

  const ids = await explorer.importIds(idsXml());
  const idsResult = explorer.importIdsResult({
    schema: IDS_RESULT_SCHEMA,
    resultId: "ids-run:external:1",
    idsDocumentId: ids.documentId,
    source: {
      protocolVersion: BIM_SOURCE_PROTOCOL_VERSION,
      fingerprint: snapshot.source.fingerprint,
      revisionId: snapshot.revisionId,
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
            globalId: WALL,
            status: "fail",
            requirementId: "classification",
          },
          {
            globalId: MISSING_WALL,
            status: "fail",
            requirementId: "property",
          },
          {
            globalId: WALL,
            status: "pass",
            requirementId: "property",
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
  const idsResolution = explorer.resolveIds({
    result: idsResult,
    document: ids,
    specificationId: "wall-class",
  });
  const staleIds = structuredClone(idsResult);
  staleIds.source = staleBcf.source;
  const staleIdsRejected = await rejects(
    () => explorer.resolveIds({
      result: staleIds,
      document: ids,
      specificationId: "wall-class",
    }),
    /stale for the active source snapshot/u,
  );
  const doctypeRejected = await rejects(
    () => explorer.importIds(
      "<?xml version=\"1.0\"?>" +
      "<!DOCTYPE ids [<!ENTITY xxe SYSTEM \"file:///x\">]>" +
      "<ids:ids xmlns:ids=\"" +
      "http://standards.buildingsmart.org/IDS\">" +
      "<ids:info><ids:title>&xxe;</ids:title></ids:info>" +
      "<ids:specifications/></ids:ids>",
    ),
    /must not contain a DOCTYPE/u,
  );

  const reference = ids.vocabularyReferences[0];
  const offline = await explorer.lookupBsdd(reference);
  assert.equal(network.length, 0);
  const online = await explorer.lookupBsdd(reference, {
    allowNetwork: true,
  });
  const cached = await explorer.lookupBsdd(reference);
  assert.equal(network.length, 1);

  const beforeDispose = explorer.state;
  const explorerDisposed = explorer.dispose();
  const sessionDisposed = await session.dispose();
  const sourceDisposed = await source.dispose();
  const report = {
    schema: "bim-explorer-openbim-qualification/1",
    status: "passed-experimental",
    asOf: "2026-08-04",
    contract: {
      explorer: OPENBIM_EXPLORER_CONTRACT,
      bcfDocument: "bim-explorer-bcf-document/0.1",
      bcfResolution:
        "bim-explorer-bcf-viewpoint-resolution/0.1",
      idsDocument: "bim-explorer-ids-document/0.1",
      idsResult: IDS_RESULT_SCHEMA,
      idsResolution:
        "bim-explorer-ids-result-resolution/0.1",
      bsddReference: "bim-explorer-bsdd-reference/0.1",
      bsddLookup: "bim-explorer-bsdd-lookup/0.1",
      sourceProtocol: BIM_SOURCE_PROTOCOL_VERSION,
    },
    standards: {
      bcf: {
        profile: "BCF XML 3.0",
        buildingSmartBranch: "release_3_0",
        buildingSmartCommit:
          "bc48611d0d7a1587f028a2b69677a1aafd5cd0a8",
      },
      ids: {
        profile: "IDS 1.0",
        buildingSmartRelease: "v1.0.0",
        publishedAt: "2024-06-03T15:52:52Z",
      },
      bsdd: {
        apiHost: "api.bsdd.buildingsmart.org",
        identifierHost:
          "identifier.buildingsmart.org",
        apiProfile: "Class/Property REST v1",
      },
    },
    dependencies: {
      fflate: {
        version: "0.8.3",
        license: "MIT",
      },
      saxes: {
        version: "6.0.0",
        license: "ISC",
      },
    },
    source: {
      fingerprint: snapshot.source.fingerprint,
      revisionId: snapshot.revisionId,
      schema: snapshot.source.ifcSchema,
      profile: snapshot.source.profile,
      products: snapshot.entities.length,
    },
    bcf: {
      documentId: bcf.documentId,
      archiveBytes: firstExport.byteLength,
      entries: bcf.receipt.entryCount,
      uncompressedBytes:
        bcf.receipt.uncompressedBytes,
      topics: bcf.receipt.topics,
      viewpoints: bcf.receipt.viewpoints,
      deterministicExport,
      camera: {
        projection: viewpoint.viewpoint.projection,
        position: viewpoint.viewpoint.camera.position,
        target: viewpoint.viewpoint.camera.target,
        fieldOfView:
          viewpoint.viewpoint.camera.fieldOfView,
      },
      clippingPlanes:
        viewpoint.viewpoint.clippingPlanes.length,
      selected: viewpoint.viewpoint.selection.map(
        (entity) => entity.expressId,
      ),
      visibilityExceptions:
        viewpoint.viewpoint.visibility.exceptions.map(
          (entity) => entity.expressId,
        ),
      diagnostics: viewpoint.diagnostics.map(
        (diagnostic) => diagnostic.code,
      ),
      canApply: viewpoint.canApply,
      networkRequests: bcf.receipt.networkRequests,
      staleSourceRejected: staleBcfRejected,
      unsafeArchiveRejected,
    },
    ids: {
      documentId: ids.documentId,
      title: ids.info.title,
      specifications: ids.receipt.specifications,
      applicability: ids.specifications[0]
        .applicability.facets.map((facet) => facet.kind),
      requirements: ids.specifications[0]
        .requirements.map((facet) => facet.kind),
      vocabularyReferences:
        ids.vocabularyReferences.map((item) => ({
          kind: item.kind,
          version: item.version,
          code: item.code,
        })),
      schemaValidated: ids.validation.schemaValidated,
      evaluatesIfcRequirements:
        ids.validation.evaluatesIfcRequirements,
      resultStatus:
        idsResolution.specification.status,
      resultCounts:
        idsResolution.specification.counts,
      provenance: idsResolution.provenance,
      selected: idsResolution.selection.map(
        (entity) => entity.expressId,
      ),
      diagnostics: idsResolution.diagnostics.map(
        (diagnostic) => diagnostic.code,
      ),
      completeResolution:
        idsResolution.completeResolution,
      networkRequests: ids.receipt.networkRequests,
      staleSourceRejected: staleIdsRejected,
      doctypeRejected,
    },
    bsdd: {
      reference: {
        uri: reference.uri,
        kind: reference.kind,
        dictionary: reference.dictionary,
        version: reference.version,
        code: reference.code,
      },
      offlineStatus: offline.status,
      explicitLookupStatus: online.status,
      cachedStatus: cached.status,
      endpoint: online.endpoint,
      responseBytes: online.responseBytes,
      request: network[0],
      networkRequests:
        beforeDispose.bsdd.networkRequests,
      cacheEntries: beforeDispose.bsdd.cacheEntries,
    },
    lifecycle: {
      beforeDispose: {
        bcfImports: beforeDispose.bcfImports,
        bcfExports: beforeDispose.bcfExports,
        idsImports: beforeDispose.idsImports,
        idsResultImports:
          beforeDispose.idsResultImports,
      },
      explorerDisposed,
      sessionDisposed,
      sourceDisposed,
    },
    authority: beforeDispose.authority,
    decision: {
      localReadOnlyExploration:
        "passed-synthetic-source",
      fullBcfSchemaValidation: "held",
      nativeIdsValidation: "held",
      automaticBsddLookup: "prohibited",
      spatialRevisionDiagnosticLinkage:
        "held-spatial-owned",
      publicPackage: "held-community-release",
      productionClaims: false,
    },
  };
  assert.doesNotMatch(
    JSON.stringify(report),
    /\/Users\/|\/Volumes\/|[A-Z]:\\/u,
  );
  return Object.freeze(report);
}

async function main() {
  process.stdout.write(
    `${
      JSON.stringify(
        await qualifyOpenBimExplorer(),
        null,
        2,
      )
    }\n`,
  );
}

if (
  process.argv[1] &&
  import.meta.url ===
    pathToFileURL(path.resolve(process.argv[1])).href
) {
  await main();
}
