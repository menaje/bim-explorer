import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  qualifyOpenBimExplorer,
} from "../../scripts/qualify-openbim-explorer.mjs";

test("openBIM qualification matches committed evidence", async () => {
  const current = await qualifyOpenBimExplorer();
  const committed = JSON.parse(await readFile(
    "compatibility/evidence/" +
      "openbim-explorer-synthetic-2026-08-04.json",
    "utf8",
  ));
  assert.deepEqual(current, committed);
});
