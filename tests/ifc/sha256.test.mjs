import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  sha256Hex,
} from "../../packages/bim-model-source/src/sha256.mjs";

test("runtime-neutral SHA-256 matches the platform implementation", () => {
  const values = [
    new Uint8Array(),
    new TextEncoder().encode("abc"),
    Uint8Array.from(
      { length: 1_025 },
      (_, index) => index % 251,
    ),
  ];
  for (const value of values) {
    assert.equal(
      sha256Hex(value),
      createHash("sha256").update(value).digest("hex"),
    );
  }
});

test("runtime-neutral SHA-256 rejects non-byte input", () => {
  assert.throws(
    () => sha256Hex("abc"),
    /Uint8Array/u,
  );
});
