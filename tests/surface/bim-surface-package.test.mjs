import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  qualifyBimSurfacePackage,
} from "../../scripts/qualify-bim-surface-package.mjs";

test("BIM surface package is reproducible and clean-installs offline", async () => {
  const expected = JSON.parse(await readFile(
    "compatibility/evidence/" +
      "bim-surface-package-2026-08-09.json",
    "utf8",
  ));
  const observed = await qualifyBimSurfacePackage();
  assert.deepEqual(observed, expected);
});
