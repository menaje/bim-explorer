import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  validateBimSemanticExplorerCompatibility,
} from "../../scripts/check-bim-semantic-explorer-compatibility.mjs";

async function fixtures() {
  const manifest = JSON.parse(await readFile(
    "compatibility/bim-semantic-explorer.json",
    "utf8",
  ));
  const evidence = JSON.parse(await readFile(
    manifest.evidence.browserSynthetic,
    "utf8",
  ));
  return { evidence, manifest };
}

test("BIM semantic explorer pins Browser semantic and 3D selection evidence", async () => {
  const { evidence, manifest } = await fixtures();
  const result = validateBimSemanticExplorerCompatibility(
    manifest,
    evidence,
  );

  assert.deepEqual(result, {
    status: "experimental",
    fixture: "synthetic-semantic-ifc4",
    treeRows: 7,
    searchResults: 2,
    passedGates: 15,
    heldGates: 3,
  });
});

test("semantic explorer cannot promote public scale without evidence", async () => {
  const { evidence, manifest } = await fixtures();
  const promoted = structuredClone(manifest);
  promoted.gates.publicRepresentativeScale = true;

  assert.throws(
    () => validateBimSemanticExplorerCompatibility(
      promoted,
      evidence,
    ),
    /publicRepresentativeScale must remain held/u,
  );
});

test("semantic explorer evidence pins active source revision", async () => {
  const { evidence, manifest } = await fixtures();
  const stale = structuredClone(evidence);
  stale.semantic.pick.selectionRevisionId += ":stale";

  assert.throws(
    () => validateBimSemanticExplorerCompatibility(
      manifest,
      stale,
    ),
    /renderer selection is invalid/u,
  );
});

test("semantic explorer evidence requires keyboard navigation", async () => {
  const { evidence, manifest } = await fixtures();
  const incomplete = structuredClone(evidence);
  incomplete.browser.keyboardEvents = [
    "ArrowDown",
    "SearchEnter",
  ];

  assert.throws(
    () => validateBimSemanticExplorerCompatibility(
      manifest,
      incomplete,
    ),
    /Browser bounds are invalid/u,
  );
});
