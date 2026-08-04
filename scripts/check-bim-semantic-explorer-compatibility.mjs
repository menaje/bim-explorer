import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const TRUE_GATES = [
  "sourceBoundSemanticQueries",
  "spatialHierarchy",
  "decompositionContainmentDistinction",
  "typeOccurrenceRoundTrip",
  "propertyQuantityMaterialClassificationPanels",
  "boundedSearchContinuation",
  "treeProperty3dSelectionSync",
  "resultVisibilityScope",
  "unsupportedInformationDisplay",
  "sourceLocalSavedView",
  "keyboardNavigation",
  "accessibleRoles",
  "boundedDomLifecycle",
  "actualBrowserWebGl2Pick",
  "deferredSemanticDetailRanges",
  "deterministicCleanup",
];
const HELD_GATES = [
  "publicRepresentativeScale",
  "fullPropertyValuePayload",
  "advancedRelationGraph",
];
const ASSERTIONS = [
  "accessibleRoles",
  "actualBrowser",
  "actualRendererPick",
  "boundedLazyDetails",
  "boundedDom",
  "boundedSearch",
  "decompositionAndContainment",
  "deterministicCleanup",
  "informationLimitsVisible",
  "keyboardTreeNavigation",
  "panelCoverage",
  "revisionBoundSelection",
  "savedLocalView",
  "spatialRoundTrip",
  "typeOccurrenceRoundTrip",
  "visibilityScope",
  "webGl2",
  "pathFreeReport",
];

function plainRecord(value, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function equalJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function validateBimSemanticExplorerCompatibility(
  manifest,
  evidence,
) {
  plainRecord(manifest, "semantic explorer manifest");
  plainRecord(evidence, "semantic explorer evidence");
  if (
    manifest.schema !==
      "bim-explorer-bim-semantic-explorer-compatibility/1" ||
    manifest.asOf !== "2026-08-04" ||
    manifest.status !== "experimental" ||
    evidence.schema !==
      "bim-explorer-semantic-explorer-browser-report/1" ||
    evidence.status !== "passed"
  ) {
    throw new Error(
      "BIM semantic explorer evidence identity is invalid",
    );
  }
  const contract = manifest.contract;
  if (
    contract?.explorer !==
      "bim-explorer-bim-semantic-explorer/0.1" ||
    contract?.sourceProtocol !==
      "bim-explorer-bim-source/0.2" ||
    contract?.semanticQueryResult !==
      "bim-explorer-bim-source-semantic-query-result/0.1" ||
    contract?.rendererPickReceipt !==
      "bim-explorer-bim-renderer-3d-pick-receipt/0.1" ||
    contract?.savedView !==
      "bim-explorer-bim-semantic-saved-view/0.1"
  ) {
    throw new Error(
      "BIM semantic explorer contract is invalid",
    );
  }
  const fixture = manifest.fixture;
  if (
    evidence.fixture?.id !== fixture.id ||
    evidence.fixture?.byteLength !== fixture.byteLength ||
    evidence.fixture?.ifcSchema !== fixture.schema ||
    evidence.fixture?.profile !== fixture.profile ||
    evidence.fixture?.artifactCommitted !== false ||
    fixture.artifactCommitted !== false ||
    fixture.thirdPartyContent !== false ||
    evidence.source?.fingerprint !==
      `sha256:${fixture.sha256}` ||
    evidence.source?.protocolVersion !==
      contract.sourceProtocol ||
    evidence.source?.revisionId !==
      `source-snapshot:sha256:${fixture.sha256}`
  ) {
    throw new Error(
      "BIM semantic explorer fixture identity is invalid",
    );
  }
  const gates = plainRecord(
    manifest.gates,
    "semantic explorer gates",
  );
  for (const gate of TRUE_GATES) {
    if (gates[gate] !== true) {
      throw new Error(
        `BIM semantic explorer gate ${gate} must pass`,
      );
    }
  }
  for (const gate of HELD_GATES) {
    if (gates[gate] !== false) {
      throw new Error(
        `BIM semantic explorer gate ${gate} must remain held`,
      );
    }
  }
  if (
    Object.keys(gates).length !==
      TRUE_GATES.length + HELD_GATES.length ||
    !Array.isArray(manifest.blockers) ||
    manifest.blockers.length !== HELD_GATES.length ||
    manifest.evidence?.browserSynthetic !==
      "compatibility/evidence/" +
        "bim-semantic-explorer-browser-synthetic-2026-08-04.json" ||
    manifest.policy?.readOnly !== true ||
    manifest.policy?.spatialAuthority !== false ||
    manifest.policy?.claimDeferredSemanticDetails !== true ||
    manifest.policy?.claimPublicScale !== false ||
    manifest.policy?.claimFullPropertyValues !== false ||
    manifest.policy?.claimAdvancedRelationGraph !== false ||
    manifest.policy?.claimProductionUx !== false
  ) {
    throw new Error(
      "BIM semantic explorer policy overclaims compatibility",
    );
  }
  const limits = manifest.limits;
  if (
    limits?.maximumDomRows !== 8 ||
    limits?.maximumLoadedTreeItems !== 32 ||
    limits?.maximumRelations !== 100 ||
    limits?.maximumSearchResults !== 10 ||
    limits?.searchPageSize !== 1 ||
    limits?.treePageSize !== 2 ||
    limits?.maximumSourceReadBytes !== 1_024 ||
    limits?.maximumDetailReadBytes !== 440 ||
    limits?.maximumSemanticQueries !== 20
  ) {
    throw new Error(
      "BIM semantic explorer limits are invalid",
    );
  }
  for (const assertion of ASSERTIONS) {
    if (evidence.assertions?.[assertion] !== true) {
      throw new Error(
        `BIM semantic explorer assertion ${assertion} did not pass`,
      );
    }
  }
  if (
    Object.keys(evidence.assertions ?? {}).length !==
      ASSERTIONS.length ||
    evidence.renderer?.actualGpu !== true ||
    evidence.renderer?.context !== "webgl2" ||
    evidence.renderer?.nonBackgroundPixels <= 0 ||
    evidence.renderer?.sourceReadBytes >
      limits.maximumSourceReadBytes ||
    evidence.renderer?.pick?.status !== "hit" ||
    evidence.renderer.pick.identity?.expressId !== 40 ||
    evidence.renderer.pick.source?.fingerprint !==
      evidence.source.fingerprint ||
    evidence.renderer.pick.source?.revisionId !==
      evidence.source.revisionId ||
    evidence.semantic?.pick?.selectionExpressId !== 40 ||
    evidence.semantic.pick.selectionRevisionId !==
      evidence.source.revisionId ||
    evidence.semantic.pick.sourceFingerprint !==
      evidence.source.fingerprint
  ) {
    throw new Error(
      "BIM semantic explorer renderer selection is invalid",
    );
  }
  if (
    !equalJson(
      evidence.semantic?.hierarchy?.map((item) => [
        item.expressId,
        item.parentRelation,
      ]),
      [
        [13, "root"],
        [15, "decomposition"],
        [17, "decomposition"],
        [19, "decomposition"],
        [21, "decomposition"],
        [40, "spatial-containment"],
        [44, "spatial-containment"],
      ],
    ) ||
    evidence.semantic?.type?.expressId !== 55 ||
    !equalJson(
      evidence.semantic.type.occurrences,
      [40, 44],
    ) ||
    evidence.semantic.type.returnedOccurrence !== 40
  ) {
    throw new Error(
      "BIM semantic explorer hierarchy round-trip is invalid",
    );
  }
  const panels = evidence.semantic.panels;
  if (
    !panels?.propertySets?.includes("Pset_WallCommon") ||
    !panels.quantities?.includes("GrossVolume") ||
    panels.quantityValues?.GrossVolume !== 2.4 ||
    !panels.materials?.includes("Concrete") ||
    !panels.classifications?.includes("BE-WALL") ||
    !panels.limitations?.includes(
      "host-void-fill-relation:opaque",
    ) ||
    !panels.limitations?.includes("property-value:lossy")
  ) {
    throw new Error(
      "BIM semantic explorer panels are invalid",
    );
  }
  if (
    !equalJson(evidence.semantic?.search, {
      first: {
        loaded: 1,
        omitted: 1,
        total: 2,
      },
      complete: {
        loaded: 2,
        omitted: 0,
        total: 2,
      },
    }) ||
    evidence.semantic?.visibility?.renderIds?.length !== 2 ||
    evidence.semantic.visibility.viewMode !== "isolate" ||
    evidence.semantic?.savedView?.restored !== true ||
    evidence.semantic.savedView.selectionExpressId !== 40
  ) {
    throw new Error(
      "BIM semantic explorer bounded state is invalid",
    );
  }
  const queryCount =
    evidence.beforeCleanup?.session?.treeQueries +
    evidence.beforeCleanup?.session?.searchQueries +
    evidence.beforeCleanup?.session?.relationQueries;
  if (
    evidence.browser?.renderedTreeRows >
      limits.maximumDomRows ||
    evidence.browser?.maximumDomRows !==
      limits.maximumDomRows ||
    !equalJson(evidence.browser?.keyboardEvents, [
      "ArrowDown",
      "Enter",
      "SearchEnter",
    ]) ||
    !Object.values(evidence.browser?.roles ?? {})
      .every((value) => value === true) ||
    queryCount > limits.maximumSemanticQueries ||
    evidence.beforeCleanup?.session?.detailReads !== 1 ||
    evidence.beforeCleanup?.session?.rangeReads !== 9 ||
    evidence.beforeCleanup?.session?.rangeBytes !== 1_200 ||
    evidence.beforeCleanup.session.rangeBytes >
      limits.maximumSourceReadBytes +
        limits.maximumDetailReadBytes
  ) {
    throw new Error(
      "BIM semantic explorer Browser bounds are invalid",
    );
  }
  if (
    evidence.cleanup?.backend?.disposed !== true ||
    evidence.cleanup.backend.activeBytes !== 0 ||
    evidence.cleanup.backend.releasedBytes !==
      evidence.beforeCleanup.backend.activeBytes ||
    evidence.cleanup?.explorerDisposed !== true ||
    evidence.cleanup?.rendererDisposed !== true ||
    evidence.cleanup?.session?.disposed !== true ||
    evidence.cleanup?.sessionDisposed !== true
  ) {
    throw new Error(
      "BIM semantic explorer cleanup is invalid",
    );
  }
  if (
    /\/Volumes\/|\/Users\/|[A-Z]:\\/u.test(
      JSON.stringify({ manifest, evidence }),
    )
  ) {
    throw new Error(
      "BIM semantic explorer evidence exposes a path",
    );
  }
  return Object.freeze({
    status: manifest.status,
    fixture: fixture.id,
    treeRows: evidence.browser.renderedTreeRows,
    searchResults:
      evidence.semantic.search.complete.loaded,
    passedGates: TRUE_GATES.length,
    heldGates: HELD_GATES.length,
  });
}

async function main() {
  const root = process.cwd();
  const manifest = JSON.parse(await readFile(
    path.join(
      root,
      "compatibility",
      "bim-semantic-explorer.json",
    ),
    "utf8",
  ));
  const evidence = JSON.parse(await readFile(
    path.join(root, manifest.evidence.browserSynthetic),
    "utf8",
  ));
  const result = validateBimSemanticExplorerCompatibility(
    manifest,
    evidence,
  );
  console.log(
    "BIM semantic explorer compatibility check passed: " +
      `${result.status}, ${result.treeRows} tree rows, ` +
      `${result.searchResults} search results, ` +
      `${result.passedGates} passed and ` +
      `${result.heldGates} held gates`,
  );
}

if (
  process.argv[1] &&
  import.meta.url ===
    pathToFileURL(path.resolve(process.argv[1])).href
) {
  await main();
}
