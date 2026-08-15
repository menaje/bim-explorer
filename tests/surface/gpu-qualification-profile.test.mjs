import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  gpuQualificationLaunchArguments,
  validateGpuQualificationMode,
  validatePhysicalGpuIdentity,
} from "../../scripts/gpu-qualification-profile.mjs";

const evidence = JSON.parse(await readFile(
  "compatibility/evidence/" +
    "federated-bim-surface-physical-gpu-darwin-arm64-" +
    "2026-08-11.json",
  "utf8",
));

test("GPU qualification profiles keep software and Metal modes explicit", () => {
  assert.deepEqual(
    gpuQualificationLaunchArguments("swiftshader"),
    [
      "--enable-unsafe-swiftshader",
      "--enable-webgl",
      "--ignore-gpu-blocklist",
      "--use-angle=swiftshader",
    ],
  );
  assert.deepEqual(
    gpuQualificationLaunchArguments("physical", {
      platform: "darwin",
    }),
    [
      "--disable-software-rasterizer",
      "--enable-gpu",
      "--enable-webgl",
      "--ignore-gpu-blocklist",
      "--use-angle=metal",
    ],
  );
});

test("physical GPU profile remains macOS Metal scoped", () => {
  assert.throws(
    () => gpuQualificationLaunchArguments("physical", {
      platform: "linux",
    }),
    /requires macOS Metal/u,
  );
  assert.throws(
    () => validateGpuQualificationMode("automatic"),
    /must be physical or swiftshader/u,
  );
});

test("recorded Apple Metal identity passes physical validation", () => {
  assert.deepEqual(
    validatePhysicalGpuIdentity(evidence.browser.runs[0].gpu, {
      platform: "darwin-arm64",
    }),
    {
      renderer:
        "ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)",
      vendor: "Google Inc. (Apple)",
    },
  );
});

test("software renderer identity cannot satisfy the physical Gate", () => {
  const software = structuredClone(evidence.browser.runs[0].gpu);
  software.unmaskedRenderer =
    "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))";
  assert.throws(
    () => validatePhysicalGpuIdentity(software, {
      platform: "darwin-arm64",
    }),
    /physical GPU identity is invalid/u,
  );
});
