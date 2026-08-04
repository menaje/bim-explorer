import {
  BCF_DOCUMENT_SCHEMA,
  BCF_EXPORT_SCHEMA,
  BCF_PROFILE,
  BCF_VIEWPOINT_RESOLUTION_SCHEMA,
  exportBcfArchive,
  importBcfArchive,
  resolveBcfViewpoint,
} from "./bcf.mjs";
import {
  BSDD_LOOKUP_SCHEMA,
  BSDD_REFERENCE_SCHEMA,
  createBsddReference,
  createBsddResolver,
} from "./bsdd.mjs";
import {
  IDS_DOCUMENT_SCHEMA,
  IDS_PROFILE,
  IDS_RESULT_RESOLUTION_SCHEMA,
  IDS_RESULT_SCHEMA,
  importIdsDocument,
  importIdsResult,
  resolveIdsResult,
} from "./ids.mjs";
import {
  deepFreeze,
  plainRecord,
  sourceContext,
} from "./common.mjs";

export {
  BCF_DOCUMENT_SCHEMA,
  BCF_EXPORT_SCHEMA,
  BCF_PROFILE,
  BCF_VIEWPOINT_RESOLUTION_SCHEMA,
  BSDD_LOOKUP_SCHEMA,
  BSDD_REFERENCE_SCHEMA,
  IDS_DOCUMENT_SCHEMA,
  IDS_PROFILE,
  IDS_RESULT_RESOLUTION_SCHEMA,
  IDS_RESULT_SCHEMA,
  createBsddReference,
  createBsddResolver,
  exportBcfArchive,
  importBcfArchive,
  importIdsDocument,
  importIdsResult,
  resolveBcfViewpoint,
  resolveIdsResult,
};

export const OPENBIM_EXPLORER_CONTRACT =
  "bim-explorer-openbim-explorer/0.1";

export function createOpenBimExplorer({
  snapshot,
  fetcher = globalThis.fetch,
  limits = {},
}) {
  const context = sourceContext(snapshot);
  plainRecord(limits, "openBIM explorer limits");
  for (const key of Object.keys(limits)) {
    if (!["bcf", "ids", "bsdd"].includes(key)) {
      throw new TypeError(
        `openBIM explorer limit group ${key} is unsupported`,
      );
    }
  }
  const resolver = createBsddResolver({
    fetcher,
    limits: limits.bsdd,
  });
  let disposed = false;
  let bcfImports = 0;
  let bcfExports = 0;
  let idsImports = 0;
  let idsResultImports = 0;

  function active() {
    if (disposed) {
      throw new DOMException(
        "openBIM explorer is disposed",
        "InvalidStateError",
      );
    }
  }

  return Object.freeze({
    contract: OPENBIM_EXPLORER_CONTRACT,
    source: context.binding,
    async importBcf(input) {
      active();
      const result = await importBcfArchive(input, {
        snapshot: context.snapshot,
        limits: limits.bcf,
      });
      bcfImports += 1;
      return result;
    },
    async exportBcf(value) {
      active();
      const result = await exportBcfArchive({
        ...plainRecord(value, "BCF export request"),
        snapshot: context.snapshot,
      });
      bcfExports += 1;
      return result;
    },
    resolveBcf(value) {
      active();
      return resolveBcfViewpoint({
        ...plainRecord(value, "BCF resolution request"),
        snapshot: context.snapshot,
      });
    },
    async importIds(input) {
      active();
      const result = await importIdsDocument(input, {
        snapshot: context.snapshot,
        limits: limits.ids,
      });
      idsImports += 1;
      return result;
    },
    importIdsResult(value) {
      active();
      const result = limits.ids?.maximumResultEntities === undefined
        ? importIdsResult(value)
        : importIdsResult(value, {
            maximumEntities:
              limits.ids.maximumResultEntities,
          });
      idsResultImports += 1;
      return result;
    },
    resolveIds(value) {
      active();
      return resolveIdsResult({
        ...plainRecord(value, "IDS resolution request"),
        snapshot: context.snapshot,
      });
    },
    lookupBsdd(reference, options) {
      active();
      return resolver.lookup(reference, options);
    },
    clearBsddCache() {
      active();
      return resolver.clear();
    },
    get state() {
      return deepFreeze({
        disposed,
        source: context.binding,
        bcfImports,
        bcfExports,
        idsImports,
        idsResultImports,
        bsdd: resolver.state,
        networkRequests: resolver.state.networkRequests,
        authority: {
          sourceMutation: false,
          acceptance: false,
          publish: false,
          spatialRevision: false,
        },
      });
    },
    dispose() {
      if (disposed) {
        return false;
      }
      disposed = true;
      resolver.dispose();
      return true;
    },
  });
}
