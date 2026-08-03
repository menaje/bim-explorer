import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("foundation remains standalone and release-gated", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  assert.equal(packageJson.name, "bim-explorer");
  assert.equal(packageJson.private, true);
  assert.equal(packageJson.license, "UNLICENSED");

  for (const field of [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
  ]) {
    for (const version of Object.values(packageJson[field] ?? {})) {
      assert.doesNotMatch(String(version), /^(?:file|link|workspace):/u);
    }
  }
});

test("private BIM and generated cache patterns are ignored", async () => {
  const gitignore = await readFile(".gitignore", "utf8");
  for (const pattern of [
    "fixtures/private/",
    "fixtures/customer/",
    ".bim-explorer-cache/",
    ".ifc-cache/",
    "*.ifc",
    "*.rvt",
  ]) {
    assert.match(gitignore, new RegExp(
      pattern.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"),
      "u",
    ));
  }
});
