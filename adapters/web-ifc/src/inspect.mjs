import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  CAPABILITY_NAMES,
  REPORT_SCHEMA,
  finalizeReport,
} from "@bim-explorer/ifc-engine-contract";
import * as WebIFC from "web-ifc";

const ENTITY_TYPES = Object.freeze({
  IfcProject: WebIFC.IFCPROJECT,
  IfcSite: WebIFC.IFCSITE,
  IfcBuilding: WebIFC.IFCBUILDING,
  IfcBuildingStorey: WebIFC.IFCBUILDINGSTOREY,
  IfcSpace: WebIFC.IFCSPACE,
  IfcWall: WebIFC.IFCWALL,
  IfcWallType: WebIFC.IFCWALLTYPE,
  IfcPropertySet: WebIFC.IFCPROPERTYSET,
  IfcElementQuantity: WebIFC.IFCELEMENTQUANTITY,
  IfcMaterial: WebIFC.IFCMATERIAL,
  IfcClassification: WebIFC.IFCCLASSIFICATION,
});

const RELATION_TYPES = Object.freeze({
  IfcRelAggregates: WebIFC.IFCRELAGGREGATES,
  IfcRelContainedInSpatialStructure:
    WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE,
  IfcRelDefinesByType: WebIFC.IFCRELDEFINESBYTYPE,
  IfcRelDefinesByProperties: WebIFC.IFCRELDEFINESBYPROPERTIES,
  IfcRelAssociatesMaterial: WebIFC.IFCRELASSOCIATESMATERIAL,
  IfcRelAssociatesClassification:
    WebIFC.IFCRELASSOCIATESCLASSIFICATION,
});

function parseInputArgument(values) {
  if (values.length !== 2 || values[0] !== "--input") {
    throw new TypeError(
      "usage: node adapters/web-ifc/src/inspect.mjs --input <source.ifc>",
    );
  }
  return path.resolve(values[1]);
}

function vectorValues(vector) {
  const values = [];
  for (let index = 0; index < vector.size(); index += 1) {
    values.push(vector.get(index));
  }
  return values;
}

function scalar(value) {
  if (
    value !== null &&
    typeof value === "object" &&
    Object.hasOwn(value, "value")
  ) {
    return value.value;
  }
  return value;
}

function referenceId(value) {
  const candidate = scalar(value);
  return Number.isSafeInteger(candidate) ? candidate : null;
}

function referenceIds(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map(referenceId)
    .filter((item) => item !== null);
}

function textValue(value) {
  const candidate = scalar(value);
  return typeof candidate === "string" ? candidate : "";
}

function entityIds(api, modelId, type, includeInherited = false) {
  if (!Number.isSafeInteger(type)) {
    return [];
  }
  return vectorValues(
    api.GetLineIDsWithType(modelId, type, includeInherited),
  );
}

function firstLine(api, modelId, type) {
  const id = entityIds(api, modelId, type)[0];
  return Number.isSafeInteger(id)
    ? api.GetLine(modelId, id, false)
    : null;
}

function countEntities(api, modelId, types) {
  return Object.fromEntries(
    Object.entries(types).map(([name, type]) => [
      name,
      entityIds(api, modelId, type).length,
    ]),
  );
}

function lineReferences(line, field) {
  return referenceIds(line?.[field]);
}

function findRelationFor(api, modelId, relationType, field, expressId) {
  for (const relationId of entityIds(api, modelId, relationType)) {
    const relation = api.GetLine(modelId, relationId, false);
    if (lineReferences(relation, field).includes(expressId)) {
      return relation;
    }
  }
  return null;
}

function relatedLine(api, modelId, relation, field) {
  const id = referenceId(relation?.[field]);
  return id === null ? null : api.GetLine(modelId, id, false);
}

function propertySetNames(api, modelId, wallId, wallType) {
  const names = [];
  const occurrenceRelation = findRelationFor(
    api,
    modelId,
    WebIFC.IFCRELDEFINESBYPROPERTIES,
    "RelatedObjects",
    wallId,
  );
  const occurrenceSet = relatedLine(
    api,
    modelId,
    occurrenceRelation,
    "RelatingPropertyDefinition",
  );
  if (occurrenceSet) {
    names.push(textValue(occurrenceSet.Name));
  }
  for (const propertySetId of referenceIds(wallType?.HasPropertySets)) {
    const propertySet = api.GetLine(modelId, propertySetId, false);
    names.push(textValue(propertySet?.Name));
  }
  return [...new Set(names.filter(Boolean))].sort();
}

function semanticSnapshot(api, modelId) {
  const entityCounts = countEntities(api, modelId, ENTITY_TYPES);
  const relations = countEntities(api, modelId, RELATION_TYPES);
  const rootIds = entityIds(api, modelId, WebIFC.IFCROOT, true);
  const globalIds = rootIds.map((id) => {
    const line = api.GetLine(modelId, id, false);
    return textValue(line?.GlobalId);
  });
  const presentIds = globalIds.filter(Boolean);
  const duplicates = presentIds.length - new Set(presentIds).size;

  const spatialHierarchy = [
    WebIFC.IFCPROJECT,
    WebIFC.IFCSITE,
    WebIFC.IFCBUILDING,
    WebIFC.IFCBUILDINGSTOREY,
  ].map((type) => textValue(firstLine(api, modelId, type)?.Name));

  const wallId = entityIds(api, modelId, WebIFC.IFCWALL)[0];
  const wall = Number.isSafeInteger(wallId)
    ? api.GetLine(modelId, wallId, false)
    : null;
  const typeRelation = Number.isSafeInteger(wallId)
    ? findRelationFor(
      api,
      modelId,
      WebIFC.IFCRELDEFINESBYTYPE,
      "RelatedObjects",
      wallId,
    )
    : null;
  const wallType = relatedLine(
    api,
    modelId,
    typeRelation,
    "RelatingType",
  );
  const materialRelation = Number.isSafeInteger(wallId)
    ? findRelationFor(
      api,
      modelId,
      WebIFC.IFCRELASSOCIATESMATERIAL,
      "RelatedObjects",
      wallId,
    )
    : null;
  const material = relatedLine(
    api,
    modelId,
    materialRelation,
    "RelatingMaterial",
  );

  return {
    semantics: {
      entityCounts,
      globalIds: {
        count: presentIds.length,
        duplicates,
        missingOnIfcRoot: globalIds.length - presentIds.length,
      },
      spatialHierarchy,
      wall: {
        name: textValue(wall?.Name),
        tag: textValue(wall?.Tag),
        type: textValue(wallType?.Name),
        materials: [textValue(material?.Name)].filter(Boolean),
        propertySets: Number.isSafeInteger(wallId)
          ? propertySetNames(api, modelId, wallId, wallType)
          : [],
      },
    },
    relations,
  };
}

function geometrySnapshot(api, modelId) {
  let products = 0;
  let geometries = 0;
  let vertices = 0;
  let triangles = 0;
  const minimum = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY];
  const maximum = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY];
  api.StreamAllMeshes(modelId, (mesh) => {
    products += 1;
    for (
      let index = 0;
      index < mesh.geometries.size();
      index += 1
    ) {
      const placedGeometry = mesh.geometries.get(index);
      const geometry = api.GetGeometry(
        modelId,
        placedGeometry.geometryExpressID,
      );
      try {
        const vertexData = api.GetVertexArray(
          geometry.GetVertexData(),
          geometry.GetVertexDataSize(),
        );
        const indexData = api.GetIndexArray(
          geometry.GetIndexData(),
          geometry.GetIndexDataSize(),
        );
        geometries += 1;
        vertices += Math.floor(vertexData.length / 6);
        triangles += Math.floor(indexData.length / 3);
        const transform = placedGeometry.flatTransformation;
        for (
          let vertexIndex = 0;
          vertexIndex < vertexData.length;
          vertexIndex += 6
        ) {
          const x = vertexData[vertexIndex];
          const y = vertexData[vertexIndex + 1];
          const z = vertexData[vertexIndex + 2];
          const webX =
            transform[0] * x +
            transform[4] * y +
            transform[8] * z +
            transform[12];
          const webY =
            transform[1] * x +
            transform[5] * y +
            transform[9] * z +
            transform[13];
          const webZ =
            transform[2] * x +
            transform[6] * y +
            transform[10] * z +
            transform[14];
          const ifcWorld = [webX, -webZ, webY];
          for (let axis = 0; axis < 3; axis += 1) {
            minimum[axis] = Math.min(minimum[axis], ifcWorld[axis]);
            maximum[axis] = Math.max(maximum[axis], ifcWorld[axis]);
          }
        }
      } finally {
        geometry.delete();
      }
    }
  });
  const round = (value) => Number(value.toFixed(6));
  return {
    products,
    geometries,
    vertices,
    triangles,
    coordinateSystem: "ifc-world-z-up",
    bounds: {
      min: minimum.map(round),
      max: maximum.map(round),
    },
  };
}

function capabilities() {
  const result = Object.fromEntries(
    CAPABILITY_NAMES.map((name) => [name, "blocked"]),
  );
  Object.assign(result, {
    parse: "native",
    semanticIndex: "mapped",
    geometry: "native",
    placements: "mapped",
    identity: "native",
    typeOccurrence: "mapped",
    propertySets: "mapped",
    materials: "mapped",
    relations: "mapped",
    packagingMacos: process.platform === "darwin" ? "native" : "blocked",
    packagingLinux: process.platform === "linux" ? "native" : "blocked",
  });
  return result;
}

export async function inspectWebIfc(input) {
  const totalStarted = performance.now();
  const bytes = await readFile(input);
  const api = new WebIFC.IfcAPI();
  let modelId = null;
  let modelClosed = false;
  let engineDisposed = false;
  let report;

  const initializationStarted = performance.now();
  await api.Init();
  const initializationMs = performance.now() - initializationStarted;

  try {
    const openStarted = performance.now();
    modelId = api.OpenModel(bytes, {
      COORDINATE_TO_ORIGIN: false,
    });
    const openMs = performance.now() - openStarted;

    const semanticStarted = performance.now();
    const semantic = semanticSnapshot(api, modelId);
    const semanticMs = performance.now() - semanticStarted;

    const geometryStarted = performance.now();
    const geometry = geometrySnapshot(api, modelId);
    const geometryMs = performance.now() - geometryStarted;

    report = {
      schema: REPORT_SCHEMA,
      engine: {
        id: "web-ifc",
        version: "0.0.77",
        backend: "node-wasm-process",
        license: "MPL-2.0",
      },
      fixture: {
        id: "synthetic-small-ifc4",
        schema: api.GetModelSchema(modelId),
        view: "ReferenceView_V1.2",
        byteLength: bytes.byteLength,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      },
      capabilities: capabilities(),
      ...semantic,
      geometry,
      performance: {
        initializationMs,
        openMs,
        semanticMs,
        geometryMs,
        totalMs: performance.now() - totalStarted,
        peakRssBytes: process.resourceUsage().maxRSS * 1024,
        heapUsedBytes: process.memoryUsage().heapUsed,
      },
      cleanup: {
        modelClosed: false,
        engineDisposed: false,
      },
      diagnostics: [],
    };
  } finally {
    if (modelId !== null) {
      api.CloseModel(modelId);
      modelClosed = true;
    }
    api.Dispose();
    engineDisposed = true;
  }

  report.cleanup = {
    modelClosed,
    engineDisposed,
  };
  return finalizeReport(report);
}

async function main() {
  const input = parseInputArgument(process.argv.slice(2));
  const report = await inspectWebIfc(input);
  process.stdout.write(`${JSON.stringify(report)}\n`);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
