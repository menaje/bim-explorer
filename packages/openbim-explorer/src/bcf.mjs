import { unzipSync, zipSync } from "fflate";

import {
  IFC_GLOBAL_ID,
  UUID,
  asBytes,
  assertSourceBinding,
  boundedString,
  deepFreeze,
  finiteVector,
  identityProjection,
  plainRecord,
  sha256Identifier,
  sourceContext,
} from "./common.mjs";
import {
  parseBoundedXml,
  xmlChild,
  xmlChildren,
  xmlChildText,
  xmlEscape,
  xmlText,
} from "./xml.mjs";

export const BCF_DOCUMENT_SCHEMA =
  "bim-explorer-bcf-document/0.1";
export const BCF_VIEWPOINT_RESOLUTION_SCHEMA =
  "bim-explorer-bcf-viewpoint-resolution/0.1";
export const BCF_EXPORT_SCHEMA =
  "bim-explorer-bcf-export/0.1";
export const BCF_PROFILE = "BCF XML 3.0";

const DEFAULT_LIMITS = Object.freeze({
  maximumArchiveBytes: 8 * 1024 * 1024,
  maximumUncompressedBytes: 16 * 1024 * 1024,
  maximumEntryBytes: 2 * 1024 * 1024,
  maximumEntries: 128,
  maximumTopics: 64,
  maximumViewpoints: 256,
  maximumComponents: 5_000,
  maximumClippingPlanes: 6,
});
const ZIP_EOCD = 0x06054b50;
const ZIP_CENTRAL = 0x02014b50;
const ZIP_LOCAL = 0x04034b50;
const UTF8 = new TextEncoder();

function limitsFrom(overrides = {}) {
  plainRecord(overrides, "BCF limits");
  for (const key of Object.keys(overrides)) {
    if (!(key in DEFAULT_LIMITS)) {
      throw new TypeError(`BCF limit ${key} is unsupported`);
    }
  }
  const limits = {
    ...DEFAULT_LIMITS,
    ...overrides,
  };
  for (const [key, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new RangeError(
        `BCF limits.${key} must be a positive safe integer`,
      );
    }
  }
  return Object.freeze(limits);
}

function decodeZipName(bytes) {
  try {
    return new TextDecoder("utf-8", { fatal: true })
      .decode(bytes);
  } catch {
    throw new TypeError("BCF archive entry name is not UTF-8");
  }
}

function safeArchivePath(value) {
  const path = boundedString(
    value,
    "BCF archive entry path",
    { maximum: 512 },
  );
  if (
    path.includes("\\") ||
    path.startsWith("/") ||
    /^[A-Za-z]:/u.test(path)
  ) {
    throw new TypeError("BCF archive entry path is unsafe");
  }
  const normalized = path.endsWith("/")
    ? path.slice(0, -1)
    : path;
  if (
    normalized.length === 0 ||
    normalized.split("/").some(
      (part) => part.length === 0 ||
        part === "." ||
        part === "..",
    )
  ) {
    throw new TypeError("BCF archive entry path is unsafe");
  }
  return path;
}

function findEndOfCentralDirectory(view) {
  const minimum = Math.max(0, view.byteLength - 65_557);
  for (
    let offset = view.byteLength - 22;
    offset >= minimum;
    offset -= 1
  ) {
    if (view.getUint32(offset, true) === ZIP_EOCD) {
      return offset;
    }
  }
  throw new TypeError("BCF archive central directory is missing");
}

function inspectArchive(bytes, limits) {
  const view = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  );
  const eocd = findEndOfCentralDirectory(view);
  const disk = view.getUint16(eocd + 4, true);
  const centralDisk = view.getUint16(eocd + 6, true);
  const diskEntries = view.getUint16(eocd + 8, true);
  const entryCount = view.getUint16(eocd + 10, true);
  const centralBytes = view.getUint32(eocd + 12, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  const commentBytes = view.getUint16(eocd + 20, true);
  if (
    disk !== 0 ||
    centralDisk !== 0 ||
    diskEntries !== entryCount ||
    entryCount === 0 ||
    entryCount === 0xffff ||
    centralBytes === 0xffff_ffff ||
    centralOffset === 0xffff_ffff ||
    entryCount > limits.maximumEntries ||
    eocd + 22 + commentBytes !== bytes.byteLength ||
    centralOffset + centralBytes > eocd
  ) {
    throw new RangeError(
      "BCF archive uses an unsupported or out-of-bounds ZIP layout",
    );
  }

  const entries = [];
  const names = new Set();
  let totalUncompressed = 0;
  let offset = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (
      offset + 46 > eocd ||
      view.getUint32(offset, true) !== ZIP_CENTRAL
    ) {
      throw new TypeError(
        "BCF archive central directory is malformed",
      );
    }
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const compressedBytes = view.getUint32(offset + 20, true);
    const uncompressedBytes = view.getUint32(offset + 24, true);
    const nameBytes = view.getUint16(offset + 28, true);
    const extraBytes = view.getUint16(offset + 30, true);
    const entryCommentBytes = view.getUint16(offset + 32, true);
    const startDisk = view.getUint16(offset + 34, true);
    const externalAttributes = view.getUint32(offset + 38, true);
    const localOffset = view.getUint32(offset + 42, true);
    const end =
      offset + 46 + nameBytes + extraBytes + entryCommentBytes;
    if (
      end > eocd ||
      startDisk !== 0 ||
      localOffset === 0xffff_ffff ||
      compressedBytes === 0xffff_ffff ||
      uncompressedBytes === 0xffff_ffff ||
      (flags & 0x0001) !== 0 ||
      ![0, 8].includes(method)
    ) {
      throw new TypeError(
        "BCF archive entry uses unsupported ZIP features",
      );
    }
    const name = safeArchivePath(decodeZipName(
      bytes.subarray(offset + 46, offset + 46 + nameBytes),
    ));
    if (names.has(name)) {
      throw new TypeError(
        "BCF archive entry paths must be unique",
      );
    }
    names.add(name);
    const unixMode = externalAttributes >>> 16;
    if ((unixMode & 0xf000) === 0xa000) {
      throw new TypeError(
        "BCF archive must not contain symbolic links",
      );
    }
    const isDirectory = name.endsWith("/");
    if (
      !isDirectory &&
      (
        uncompressedBytes > limits.maximumEntryBytes ||
        compressedBytes > limits.maximumArchiveBytes
      )
    ) {
      throw new RangeError(
        "BCF archive entry exceeds its byte limit",
      );
    }
    totalUncompressed += uncompressedBytes;
    if (totalUncompressed > limits.maximumUncompressedBytes) {
      throw new RangeError(
        "BCF archive exceeds its uncompressed byte limit",
      );
    }
    if (
      localOffset + 30 > centralOffset ||
      view.getUint32(localOffset, true) !== ZIP_LOCAL
    ) {
      throw new TypeError(
        "BCF archive local entry is malformed",
      );
    }
    const localFlags = view.getUint16(localOffset + 6, true);
    const localMethod = view.getUint16(localOffset + 8, true);
    const localNameBytes = view.getUint16(localOffset + 26, true);
    const localExtraBytes = view.getUint16(localOffset + 28, true);
    const localNameStart = localOffset + 30;
    const localDataStart =
      localNameStart + localNameBytes + localExtraBytes;
    const localName = decodeZipName(
      bytes.subarray(
        localNameStart,
        localNameStart + localNameBytes,
      ),
    );
    if (
      localName !== name ||
      localFlags !== flags ||
      localMethod !== method ||
      localDataStart + compressedBytes > centralOffset
    ) {
      throw new TypeError(
        "BCF archive local and central entries disagree",
      );
    }
    entries.push({
      name,
      compressedBytes,
      uncompressedBytes,
      isDirectory,
    });
    offset = end;
  }
  if (offset !== centralOffset + centralBytes) {
    throw new TypeError(
      "BCF archive central directory length is inconsistent",
    );
  }
  return {
    entries,
    entryCount,
    totalUncompressed,
  };
}

function unzipBounded(input, limits) {
  const bytes = asBytes(
    input,
    "BCF archive",
    limits.maximumArchiveBytes,
  );
  const inspection = inspectArchive(bytes, limits);
  let rawEntries;
  try {
    rawEntries = unzipSync(bytes);
  } catch (error) {
    throw new TypeError("BCF archive decompression failed", {
      cause: error,
    });
  }
  const files = new Map();
  for (const entry of inspection.entries) {
    if (entry.isDirectory) {
      continue;
    }
    const content = rawEntries[entry.name];
    if (
      !(content instanceof Uint8Array) ||
      content.byteLength !== entry.uncompressedBytes
    ) {
      throw new TypeError(
        "BCF archive decompressed entry length is inconsistent",
      );
    }
    files.set(entry.name, content);
  }
  return {
    bytes,
    files,
    receipt: {
      archiveBytes: bytes.byteLength,
      entryCount: inspection.entryCount,
      uncompressedBytes: inspection.totalUncompressed,
    },
  };
}

function parseBoolean(value, label, fallback = false) {
  if (value === undefined) {
    return fallback;
  }
  if (value === "true" || value === "1") {
    return true;
  }
  if (value === "false" || value === "0") {
    return false;
  }
  throw new TypeError(`${label} must be a boolean`);
}

function finiteNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new TypeError(`${label} must be finite`);
  }
  return number;
}

function point(node, label) {
  if (node === null) {
    throw new TypeError(`${label} is required`);
  }
  return [
    finiteNumber(xmlChildText(node, "X", {
      required: true,
    }), `${label}.X`),
    finiteNumber(xmlChildText(node, "Y", {
      required: true,
    }), `${label}.Y`),
    finiteNumber(xmlChildText(node, "Z", {
      required: true,
    }), `${label}.Z`),
  ];
}

function component(node, label) {
  const globalId = node.attributes.IfcGuid ?? null;
  if (globalId !== null && !IFC_GLOBAL_ID.test(globalId)) {
    throw new TypeError(`${label} has an invalid IfcGuid`);
  }
  return {
    globalId,
    originatingSystem:
      xmlChildText(node, "OriginatingSystem") ?? null,
    authoringToolId:
      xmlChildText(node, "AuthoringToolId") ?? null,
  };
}

function components(container, label, limits) {
  if (container === null) {
    return [];
  }
  const nodes = xmlChildren(container, "Component");
  if (nodes.length > limits.maximumComponents) {
    throw new RangeError(`${label} exceeds its component limit`);
  }
  return nodes.map((node, index) =>
    component(node, `${label}[${index}]`));
}

function camera(node) {
  const perspective = xmlChild(node, "PerspectiveCamera");
  const orthogonal = xmlChild(node, "OrthogonalCamera");
  const selected = perspective ?? orthogonal;
  if (selected === null) {
    throw new TypeError("BCF viewpoint camera is missing");
  }
  const projection = perspective ? "perspective" : "orthographic";
  const result = {
    projection,
    position: point(
      xmlChild(selected, "CameraViewPoint"),
      "BCF camera position",
    ),
    direction: point(
      xmlChild(selected, "CameraDirection"),
      "BCF camera direction",
    ),
    up: point(
      xmlChild(selected, "CameraUpVector"),
      "BCF camera up vector",
    ),
    aspectRatio: finiteNumber(
      xmlChildText(selected, "AspectRatio", {
        required: true,
      }),
      "BCF camera aspect ratio",
    ),
  };
  if (result.aspectRatio <= 0) {
    throw new RangeError(
      "BCF camera aspect ratio must be positive",
    );
  }
  if (projection === "perspective") {
    result.fieldOfView = finiteNumber(
      xmlChildText(selected, "FieldOfView", {
        required: true,
      }),
      "BCF camera field of view",
    );
    if (
      result.fieldOfView <= 0 ||
      result.fieldOfView >= 180
    ) {
      throw new RangeError(
        "BCF camera field of view must be between 0 and 180",
      );
    }
  } else {
    result.viewToWorldScale = finiteNumber(
      xmlChildText(selected, "ViewToWorldScale", {
        required: true,
      }),
      "BCF camera view-to-world scale",
    );
    if (result.viewToWorldScale <= 0) {
      throw new RangeError(
        "BCF camera view-to-world scale must be positive",
      );
    }
  }
  return result;
}

function parseViewpoint(bytes, label, limits) {
  const document = parseBoundedXml(bytes, {
    label,
    limits: {
      maximumBytes: limits.maximumEntryBytes,
    },
  });
  if (document.root.name !== "VisualizationInfo") {
    throw new TypeError(`${label} root must be VisualizationInfo`);
  }
  const guid = document.root.attributes.Guid;
  if (!UUID.test(guid ?? "")) {
    throw new TypeError(`${label} Guid is invalid`);
  }
  const componentRoot = xmlChild(document.root, "Components");
  const selection = components(
    xmlChild(componentRoot, "Selection"),
    `${label} selection`,
    limits,
  );
  const visibilityNode = xmlChild(
    componentRoot,
    "Visibility",
  );
  const visibility = {
    defaultVisible: parseBoolean(
      visibilityNode?.attributes.DefaultVisibility,
      `${label} DefaultVisibility`,
      false,
    ),
    exceptions: components(
      xmlChild(visibilityNode, "Exceptions"),
      `${label} visibility exceptions`,
      limits,
    ),
  };
  const coloringNode = xmlChild(componentRoot, "Coloring");
  const coloring = xmlChildren(coloringNode, "Color")
    .map((colorNode, index) => {
      const color = colorNode.attributes.Color;
      if (!/^[0-9A-Fa-f]{6}(?:[0-9A-Fa-f]{2})?$/u.test(
        color ?? "",
      )) {
        throw new TypeError(
          `${label} coloring[${index}] color is invalid`,
        );
      }
      return {
        color: color.toUpperCase(),
        components: components(
          xmlChild(colorNode, "Components"),
          `${label} coloring[${index}]`,
          limits,
        ),
      };
    });
  const clippingRoot = xmlChild(
    document.root,
    "ClippingPlanes",
  );
  const clippingNodes = xmlChildren(
    clippingRoot,
    "ClippingPlane",
  );
  if (clippingNodes.length > limits.maximumClippingPlanes) {
    throw new RangeError(
      `${label} exceeds its clipping-plane limit`,
    );
  }
  const clippingPlanes = clippingNodes.map((plane, index) => ({
    location: point(
      xmlChild(plane, "Location"),
      `${label} clipping plane ${index} location`,
    ),
    direction: point(
      xmlChild(plane, "Direction"),
      `${label} clipping plane ${index} direction`,
    ),
  }));
  return {
    guid: guid.toLowerCase(),
    camera: camera(document.root),
    selection,
    visibility,
    coloring,
    clippingPlanes,
  };
}

function parseComment(node, label) {
  const guid = node.attributes.Guid;
  if (!UUID.test(guid ?? "")) {
    throw new TypeError(`${label} Guid is invalid`);
  }
  const viewpoint = xmlChild(node, "Viewpoint");
  const viewpointGuid = viewpoint?.attributes.Guid ?? null;
  if (viewpointGuid !== null && !UUID.test(viewpointGuid)) {
    throw new TypeError(`${label} viewpoint Guid is invalid`);
  }
  return {
    guid: guid.toLowerCase(),
    date: xmlChildText(node, "Date", { required: true }),
    author: xmlChildText(node, "Author", {
      required: true,
    }),
    text: xmlChildText(node, "Comment") ?? null,
    viewpointGuid: viewpointGuid?.toLowerCase() ?? null,
  };
}

function referencedPath(folder, value, label) {
  const filename = boundedString(value, label, { maximum: 255 });
  if (
    filename.includes("/") ||
    filename.includes("\\") ||
    filename === "." ||
    filename === ".."
  ) {
    throw new TypeError(`${label} must be a local topic filename`);
  }
  return `${folder}/${filename}`;
}

function parseTopic(folder, bytes, files, limits) {
  const label = `BCF topic ${folder}`;
  const normalizedFolder = folder.toLowerCase();
  const document = parseBoundedXml(bytes, {
    label: `${label} markup`,
    limits: {
      maximumBytes: limits.maximumEntryBytes,
    },
  });
  if (document.root.name !== "Markup") {
    throw new TypeError(`${label} root must be Markup`);
  }
  const topicNode = xmlChild(document.root, "Topic");
  if (topicNode === null) {
    throw new TypeError(`${label} Topic is missing`);
  }
  const guid = topicNode.attributes.Guid;
  if (
    !UUID.test(guid ?? "") ||
    guid.toLowerCase() !== normalizedFolder
  ) {
    throw new TypeError(
      `${label} folder and Topic Guid must match`,
    );
  }
  const viewpointNodes = xmlChildren(
    xmlChild(topicNode, "Viewpoints"),
    "ViewPoint",
  );
  if (viewpointNodes.length > limits.maximumViewpoints) {
    throw new RangeError(
      `${label} exceeds its viewpoint limit`,
    );
  }
  const viewpoints = viewpointNodes.map((node, index) => {
    const outerGuid = node.attributes.Guid;
    if (!UUID.test(outerGuid ?? "")) {
      throw new TypeError(
        `${label} viewpoint[${index}] Guid is invalid`,
      );
    }
    const filename = xmlChildText(node, "Viewpoint");
    if (filename === null) {
      return {
        guid: outerGuid.toLowerCase(),
        filename: null,
        snapshot: xmlChildText(node, "Snapshot") ?? null,
        index: Number(xmlChildText(node, "Index") ?? index),
        visualization: null,
        diagnostic: "viewpoint-file-missing",
      };
    }
    const path = referencedPath(
      folder,
      filename,
      `${label} viewpoint[${index}] filename`,
    );
    const content = files.get(path);
    if (content === undefined) {
      return {
        guid: outerGuid.toLowerCase(),
        filename,
        snapshot: xmlChildText(node, "Snapshot") ?? null,
        index: Number(xmlChildText(node, "Index") ?? index),
        visualization: null,
        diagnostic: "viewpoint-entry-missing",
      };
    }
    const visualization = parseViewpoint(
      content,
      `${label} viewpoint[${index}]`,
      limits,
    );
    if (visualization.guid !== outerGuid.toLowerCase()) {
      throw new TypeError(
        `${label} viewpoint Guid does not match markup`,
      );
    }
    return {
      guid: outerGuid.toLowerCase(),
      filename,
      snapshot: xmlChildText(node, "Snapshot") ?? null,
      index: Number(xmlChildText(node, "Index") ?? index),
      visualization,
      diagnostic: null,
    };
  });
  const comments = xmlChildren(
    xmlChild(topicNode, "Comments"),
    "Comment",
  ).map((node, index) =>
    parseComment(node, `${label} comment[${index}]`));
  return {
    guid: guid.toLowerCase(),
    type: boundedString(
      topicNode.attributes.TopicType,
      `${label} TopicType`,
      { maximum: 128 },
    ),
    status: boundedString(
      topicNode.attributes.TopicStatus,
      `${label} TopicStatus`,
      { maximum: 128 },
    ),
    title: xmlChildText(topicNode, "Title", {
      required: true,
    }),
    priority: xmlChildText(topicNode, "Priority") ?? null,
    creationDate: xmlChildText(topicNode, "CreationDate", {
      required: true,
    }),
    creationAuthor: xmlChildText(
      topicNode,
      "CreationAuthor",
      { required: true },
    ),
    modifiedDate:
      xmlChildText(topicNode, "ModifiedDate") ?? null,
    modifiedAuthor:
      xmlChildText(topicNode, "ModifiedAuthor") ?? null,
    dueDate: xmlChildText(topicNode, "DueDate") ?? null,
    assignedTo:
      xmlChildText(topicNode, "AssignedTo") ?? null,
    stage: xmlChildText(topicNode, "Stage") ?? null,
    description:
      xmlChildText(topicNode, "Description") ?? null,
    labels: xmlChildren(
      xmlChild(topicNode, "Labels"),
      "Label",
    ).map((node) => xmlText(node, { required: true })),
    referenceLinks: xmlChildren(
      xmlChild(topicNode, "ReferenceLinks"),
      "ReferenceLink",
    ).map((node) => xmlText(node, { required: true })),
    relatedTopicGuids: xmlChildren(
      xmlChild(topicNode, "RelatedTopics"),
      "RelatedTopic",
    ).map((node) => {
      const relatedGuid = node.attributes.Guid;
      if (!UUID.test(relatedGuid ?? "")) {
        throw new TypeError(
          `${label} related Topic Guid is invalid`,
        );
      }
      return relatedGuid.toLowerCase();
    }),
    comments,
    viewpoints,
  };
}

export async function importBcfArchive(
  input,
  {
    snapshot,
    limits: limitOverrides = {},
  },
) {
  const source = sourceContext(snapshot);
  const limits = limitsFrom(limitOverrides);
  const archive = unzipBounded(input, limits);
  const versionBytes = archive.files.get("bcf.version");
  if (versionBytes === undefined) {
    throw new TypeError("BCF archive bcf.version is missing");
  }
  const version = parseBoundedXml(versionBytes, {
    label: "BCF version",
    limits: {
      maximumBytes: limits.maximumEntryBytes,
      maximumNodes: 16,
      maximumDepth: 4,
      maximumAttributesPerNode: 8,
      maximumTextBytes: 1024,
    },
  });
  if (
    version.root.name !== "Version" ||
    version.root.attributes.VersionId !== "3.0"
  ) {
    throw new TypeError("only BCF XML 3.0 is supported");
  }
  const markupPaths = [...archive.files.keys()]
    .filter((path) =>
      /^[0-9a-f-]{36}\/markup\.bcf$/iu.test(path))
    .sort();
  if (
    markupPaths.length === 0 ||
    markupPaths.length > limits.maximumTopics
  ) {
    throw new RangeError(
      "BCF archive topic count is outside its bound",
    );
  }
  const topics = markupPaths.map((path) => {
    const folder = path.slice(0, 36);
    if (!UUID.test(folder)) {
      throw new TypeError("BCF topic folder Guid is invalid");
    }
    return parseTopic(
      folder,
      archive.files.get(path),
      archive.files,
      limits,
    );
  });
  return deepFreeze({
    schema: BCF_DOCUMENT_SCHEMA,
    profile: BCF_PROFILE,
    documentId: await sha256Identifier(archive.bytes),
    source: source.binding,
    topics,
    receipt: {
      ...archive.receipt,
      topics: topics.length,
      viewpoints: topics.reduce(
        (count, topic) => count + topic.viewpoints.length,
        0,
      ),
      networkRequests: 0,
    },
    authority: {
      sourceMutation: false,
      acceptance: false,
      publish: false,
      spatialRevision: false,
    },
  });
}

function topicAndViewpoint(document, topicGuid, viewpointGuid) {
  if (
    document?.schema !== BCF_DOCUMENT_SCHEMA ||
    !Array.isArray(document.topics)
  ) {
    throw new TypeError("BCF document is invalid");
  }
  const topic = document.topics.find(
    (candidate) => candidate.guid === topicGuid.toLowerCase(),
  );
  if (topic === undefined) {
    throw new RangeError("BCF topic does not exist");
  }
  const viewpoint = topic.viewpoints.find(
    (candidate) =>
      candidate.guid === viewpointGuid.toLowerCase(),
  );
  if (viewpoint === undefined) {
    throw new RangeError("BCF viewpoint does not exist");
  }
  if (viewpoint.visualization === null) {
    throw new DOMException(
      "BCF viewpoint file is unavailable",
      "NotFoundError",
    );
  }
  return { topic, viewpoint };
}

function resolveComponents(
  references,
  context,
  role,
  diagnostics,
) {
  const entities = [];
  for (let index = 0; index < references.length; index += 1) {
    const reference = references[index];
    if (reference.globalId === null) {
      diagnostics.push({
        code: "component-global-id-missing",
        role,
        index,
        originatingSystem: reference.originatingSystem,
        authoringToolId: reference.authoringToolId,
      });
      continue;
    }
    const entity = context.byGlobalId.get(reference.globalId);
    if (entity === undefined) {
      diagnostics.push({
        code: "component-global-id-not-found",
        role,
        index,
        globalId: reference.globalId,
      });
      continue;
    }
    const projection = identityProjection(entity);
    if (projection.renderId === null) {
      diagnostics.push({
        code: "component-not-renderable",
        role,
        index,
        globalId: reference.globalId,
        expressId: projection.expressId,
      });
    }
    entities.push(projection);
  }
  return entities;
}

export function resolveBcfViewpoint({
  document,
  snapshot,
  topicGuid,
  viewpointGuid,
}) {
  const context = assertSourceBinding(document?.source, snapshot);
  if (!UUID.test(topicGuid ?? "") || !UUID.test(viewpointGuid ?? "")) {
    throw new TypeError("BCF topic and viewpoint Guids are required");
  }
  const { topic, viewpoint } = topicAndViewpoint(
    document,
    topicGuid,
    viewpointGuid,
  );
  const visualization = viewpoint.visualization;
  const diagnostics = [];
  const selection = resolveComponents(
    visualization.selection,
    context,
    "selection",
    diagnostics,
  );
  const visibilityExceptions = resolveComponents(
    visualization.visibility.exceptions,
    context,
    "visibility-exception",
    diagnostics,
  );
  const coloring = visualization.coloring.map((entry, index) => ({
    color: entry.color,
    entities: resolveComponents(
      entry.components,
      context,
      `coloring:${index}`,
      diagnostics,
    ),
  }));
  const cameraTarget = visualization.camera.position.map(
    (coordinate, index) =>
      coordinate + visualization.camera.direction[index],
  );
  return deepFreeze({
    schema: BCF_VIEWPOINT_RESOLUTION_SCHEMA,
    profile: BCF_PROFILE,
    source: context.binding,
    topic: {
      guid: topic.guid,
      type: topic.type,
      status: topic.status,
      title: topic.title,
      description: topic.description,
      labels: [...topic.labels],
    },
    viewpoint: {
      guid: viewpoint.guid,
      projection: visualization.camera.projection,
      camera: {
        ...structuredClone(visualization.camera),
        target: cameraTarget,
      },
      clippingPlanes:
        structuredClone(visualization.clippingPlanes),
      visibility: {
        defaultVisible:
          visualization.visibility.defaultVisible,
        exceptions: visibilityExceptions,
      },
      selection,
      coloring,
    },
    diagnostics,
    canApply: diagnostics.every(
      (item) => item.code !== "component-global-id-not-found",
    ),
    authority: {
      sourceMutation: false,
      acceptance: false,
      publish: false,
      spatialRevision: false,
    },
  });
}

function dateTime(value, label) {
  const text = boundedString(value, label, { maximum: 64 });
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) {
    throw new TypeError(`${label} must be an ISO date-time`);
  }
  return text;
}

function xmlVector(name, vector) {
  return [
    `<${name}>`,
    `<X>${xmlEscape(vector[0])}</X>`,
    `<Y>${xmlEscape(vector[1])}</Y>`,
    `<Z>${xmlEscape(vector[2])}</Z>`,
    `</${name}>`,
  ].join("");
}

function exportComponent(reference, label) {
  const value = plainRecord(reference, label);
  if (!IFC_GLOBAL_ID.test(value.globalId ?? "")) {
    throw new TypeError(`${label}.globalId is invalid`);
  }
  const parts = [`<Component IfcGuid="${value.globalId}">`];
  if (value.originatingSystem) {
    parts.push(
      `<OriginatingSystem>${xmlEscape(
        boundedString(
          value.originatingSystem,
          `${label}.originatingSystem`,
          { maximum: 512 },
        ),
      )}</OriginatingSystem>`,
    );
  }
  if (value.authoringToolId) {
    parts.push(
      `<AuthoringToolId>${xmlEscape(
        boundedString(
          value.authoringToolId,
          `${label}.authoringToolId`,
          { maximum: 512 },
        ),
      )}</AuthoringToolId>`,
    );
  }
  parts.push("</Component>");
  return parts.join("");
}

function exportComponents(values, label) {
  if (!Array.isArray(values) || values.length > 5_000) {
    throw new RangeError(`${label} must be a bounded list`);
  }
  return values.map((value, index) =>
    exportComponent(value, `${label}[${index}]`)).join("");
}

function normalizeExportViewpoint(value) {
  const viewpoint = plainRecord(value, "BCF export viewpoint");
  const guid = boundedString(
    viewpoint.guid,
    "BCF export viewpoint.guid",
    { maximum: 36 },
  ).toLowerCase();
  if (!UUID.test(guid)) {
    throw new TypeError("BCF export viewpoint.guid is invalid");
  }
  const cameraValue = plainRecord(
    viewpoint.camera,
    "BCF export viewpoint.camera",
  );
  const projection = cameraValue.projection;
  if (!["perspective", "orthographic"].includes(projection)) {
    throw new TypeError(
      "BCF export camera projection is invalid",
    );
  }
  const camera = {
    projection,
    position: finiteVector(
      cameraValue.position,
      "BCF export camera.position",
    ),
    direction: finiteVector(
      cameraValue.direction,
      "BCF export camera.direction",
    ),
    up: finiteVector(
      cameraValue.up,
      "BCF export camera.up",
    ),
    aspectRatio: Number(cameraValue.aspectRatio),
  };
  if (
    !Number.isFinite(camera.aspectRatio) ||
    camera.aspectRatio <= 0
  ) {
    throw new RangeError(
      "BCF export camera.aspectRatio must be positive",
    );
  }
  if (projection === "perspective") {
    camera.fieldOfView = Number(cameraValue.fieldOfView);
    if (
      !Number.isFinite(camera.fieldOfView) ||
      camera.fieldOfView <= 0 ||
      camera.fieldOfView >= 180
    ) {
      throw new RangeError(
        "BCF export camera.fieldOfView is invalid",
      );
    }
  } else {
    camera.viewToWorldScale =
      Number(cameraValue.viewToWorldScale);
    if (
      !Number.isFinite(camera.viewToWorldScale) ||
      camera.viewToWorldScale <= 0
    ) {
      throw new RangeError(
        "BCF export camera.viewToWorldScale is invalid",
      );
    }
  }
  const clippingPlanes = viewpoint.clippingPlanes ?? [];
  if (
    !Array.isArray(clippingPlanes) ||
    clippingPlanes.length > 6
  ) {
    throw new RangeError(
      "BCF export clippingPlanes exceed their bound",
    );
  }
  return {
    guid,
    camera,
    selection: viewpoint.selection ?? [],
    visibility: {
      defaultVisible:
        viewpoint.visibility?.defaultVisible ?? true,
      exceptions: viewpoint.visibility?.exceptions ?? [],
    },
    coloring: viewpoint.coloring ?? [],
    clippingPlanes: clippingPlanes.map((plane, index) => ({
      location: finiteVector(
        plane.location,
        `BCF export clippingPlanes[${index}].location`,
      ),
      direction: finiteVector(
        plane.direction,
        `BCF export clippingPlanes[${index}].direction`,
      ),
    })),
  };
}

function viewpointXml(viewpoint) {
  const cameraName = viewpoint.camera.projection === "perspective"
    ? "PerspectiveCamera"
    : "OrthogonalCamera";
  const selection = exportComponents(
    viewpoint.selection,
    "BCF export selection",
  );
  const visibility = exportComponents(
    viewpoint.visibility.exceptions,
    "BCF export visibility exceptions",
  );
  if (
    !Array.isArray(viewpoint.coloring) ||
    viewpoint.coloring.length > 1_000
  ) {
    throw new RangeError("BCF export coloring exceeds its bound");
  }
  const coloring = viewpoint.coloring.map((entry, index) => {
    if (!/^[0-9A-Fa-f]{6}(?:[0-9A-Fa-f]{2})?$/u.test(
      entry.color ?? "",
    )) {
      throw new TypeError(
        `BCF export coloring[${index}].color is invalid`,
      );
    }
    return `<Color Color="${entry.color.toUpperCase()}">` +
      "<Components>" +
      exportComponents(
        entry.components ?? entry.entities ?? [],
        `BCF export coloring[${index}]`,
      ) +
      "</Components></Color>";
  }).join("");
  const clipping = viewpoint.clippingPlanes.map((plane) =>
    "<ClippingPlane>" +
    xmlVector("Location", plane.location) +
    xmlVector("Direction", plane.direction) +
    "</ClippingPlane>").join("");
  const cameraScalar = viewpoint.camera.projection === "perspective"
    ? `<FieldOfView>${viewpoint.camera.fieldOfView}</FieldOfView>`
    : `<ViewToWorldScale>${
        viewpoint.camera.viewToWorldScale
      }</ViewToWorldScale>`;
  return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>" +
    `<VisualizationInfo Guid="${viewpoint.guid}">` +
    "<Components>" +
    `<Selection>${selection}</Selection>` +
    `<Visibility DefaultVisibility="${
      viewpoint.visibility.defaultVisible ? "true" : "false"
    }"><Exceptions>${visibility}</Exceptions></Visibility>` +
    `<Coloring>${coloring}</Coloring>` +
    "</Components>" +
    `<${cameraName}>` +
    xmlVector("CameraViewPoint", viewpoint.camera.position) +
    xmlVector("CameraDirection", viewpoint.camera.direction) +
    xmlVector("CameraUpVector", viewpoint.camera.up) +
    cameraScalar +
    `<AspectRatio>${viewpoint.camera.aspectRatio}</AspectRatio>` +
    `</${cameraName}>` +
    `<ClippingPlanes>${clipping}</ClippingPlanes>` +
    "</VisualizationInfo>";
}

function normalizeExportTopic(value) {
  const topic = plainRecord(value, "BCF export topic");
  const guid = boundedString(
    topic.guid,
    "BCF export topic.guid",
    { maximum: 36 },
  ).toLowerCase();
  if (!UUID.test(guid)) {
    throw new TypeError("BCF export topic.guid is invalid");
  }
  const labels = topic.labels ?? [];
  if (!Array.isArray(labels) || labels.length > 100) {
    throw new RangeError("BCF export labels exceed their bound");
  }
  return {
    guid,
    type: boundedString(
      topic.type,
      "BCF export topic.type",
      { maximum: 128 },
    ),
    status: boundedString(
      topic.status,
      "BCF export topic.status",
      { maximum: 128 },
    ),
    title: boundedString(
      topic.title,
      "BCF export topic.title",
      { maximum: 65_536 },
    ),
    creationDate: dateTime(
      topic.creationDate,
      "BCF export topic.creationDate",
    ),
    creationAuthor: boundedString(
      topic.creationAuthor,
      "BCF export topic.creationAuthor",
      { maximum: 512 },
    ),
    description: topic.description === undefined ||
      topic.description === null
      ? null
      : boundedString(
          topic.description,
          "BCF export topic.description",
          { maximum: 65_536, required: false },
        ),
    labels: labels.map((label, index) =>
      boundedString(
        label,
        `BCF export labels[${index}]`,
        { maximum: 512 },
      )),
  };
}

function markupXml(topic, viewpoint) {
  const labels = topic.labels.length === 0
    ? ""
    : "<Labels>" +
      topic.labels.map((label) =>
        `<Label>${xmlEscape(label)}</Label>`).join("") +
      "</Labels>";
  const description = topic.description === null
    ? ""
    : `<Description>${xmlEscape(topic.description)}</Description>`;
  return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>" +
    "<Markup>" +
    `<Topic Guid="${topic.guid}" TopicType="${
      xmlEscape(topic.type)
    }" TopicStatus="${xmlEscape(topic.status)}">` +
    `<Title>${xmlEscape(topic.title)}</Title>` +
    labels +
    `<CreationDate>${
      xmlEscape(topic.creationDate)
    }</CreationDate>` +
    `<CreationAuthor>${
      xmlEscape(topic.creationAuthor)
    }</CreationAuthor>` +
    description +
    "<Viewpoints>" +
    `<ViewPoint Guid="${viewpoint.guid}">` +
    "<Viewpoint>viewpoint.bcfv</Viewpoint>" +
    "<Index>0</Index>" +
    "</ViewPoint>" +
    "</Viewpoints>" +
    "</Topic>" +
    "</Markup>";
}

export async function exportBcfArchive({
  snapshot,
  topic: topicValue,
  viewpoint: viewpointValue,
}) {
  const source = sourceContext(snapshot);
  const topic = normalizeExportTopic(topicValue);
  const viewpoint = normalizeExportViewpoint(viewpointValue);
  const files = {
    "bcf.version": [
      UTF8.encode(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>" +
        "<Version VersionId=\"3.0\"/>",
      ),
      {
        level: 0,
        mtime: new Date("1980-01-01T00:00:00.000Z"),
      },
    ],
    [`${topic.guid}/markup.bcf`]: [
      UTF8.encode(markupXml(topic, viewpoint)),
      {
        level: 6,
        mtime: new Date("1980-01-01T00:00:00.000Z"),
      },
    ],
    [`${topic.guid}/viewpoint.bcfv`]: [
      UTF8.encode(viewpointXml(viewpoint)),
      {
        level: 6,
        mtime: new Date("1980-01-01T00:00:00.000Z"),
      },
    ],
  };
  const bytes = zipSync(files, {
    level: 6,
  });
  return {
    schema: BCF_EXPORT_SCHEMA,
    profile: BCF_PROFILE,
    source: source.binding,
    documentId: await sha256Identifier(bytes),
    byteLength: bytes.byteLength,
    bytes,
    authority: deepFreeze({
      sourceMutation: false,
      acceptance: false,
      publish: false,
      spatialRevision: false,
    }),
  };
}
