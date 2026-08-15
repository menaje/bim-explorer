const GPU_MODES = new Set(["physical", "swiftshader"]);

const SOFTWARE_RENDERER_PATTERN =
  /(?:swiftshader|subzero|llvmpipe|lavapipe|softpipe|software rasterizer|basic render)/iu;

export function validateGpuQualificationMode(value) {
  if (!GPU_MODES.has(value)) {
    throw new TypeError(
      "GPU qualification mode must be physical or swiftshader",
    );
  }
  return value;
}

export function gpuQualificationLaunchArguments(
  mode,
  { platform = process.platform } = {},
) {
  validateGpuQualificationMode(mode);
  if (mode === "swiftshader") {
    return Object.freeze([
      "--enable-unsafe-swiftshader",
      "--enable-webgl",
      "--ignore-gpu-blocklist",
      "--use-angle=swiftshader",
    ]);
  }
  if (platform !== "darwin") {
    throw new Error(
      "physical GPU qualification currently requires macOS Metal",
    );
  }
  return Object.freeze([
    "--disable-software-rasterizer",
    "--enable-gpu",
    "--enable-webgl",
    "--ignore-gpu-blocklist",
    "--use-angle=metal",
  ]);
}

function boundedString(value) {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= 512 &&
    !/[\u0000-\u001f\u007f]/u.test(value)
    ? value
    : null;
}

export function validatePhysicalGpuIdentity(
  value,
  { platform = `${process.platform}-${process.arch}` } = {},
) {
  const fields = [
    value?.vendor,
    value?.renderer,
    value?.unmaskedVendor,
    value?.unmaskedRenderer,
    value?.version,
    value?.shadingLanguageVersion,
  ].map(boundedString);
  if (
    value?.schema !== "bim-explorer-webgl2-gpu-identity/1" ||
    value.webgl2 !== true ||
    value.debugRendererInfo !== true ||
    fields.some((field) => field === null) ||
    SOFTWARE_RENDERER_PATTERN.test(fields.join(" ")) ||
    value.contextAttributes?.failIfMajorPerformanceCaveat !== true ||
    !["high-performance", "low-power"].includes(
      value.contextAttributes.powerPreference,
    )
  ) {
    throw new Error("physical GPU identity is invalid");
  }
  if (
    platform === "darwin-arm64" &&
    (
      !/\bApple\b/u.test(value.unmaskedVendor) ||
      !/ANGLE Metal Renderer: Apple/u.test(
        value.unmaskedRenderer,
      )
    )
  ) {
    throw new Error("macOS physical GPU is not an Apple Metal renderer");
  }
  return Object.freeze({
    renderer: value.unmaskedRenderer,
    vendor: value.unmaskedVendor,
  });
}
