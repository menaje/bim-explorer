import { constants } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";

const PLATFORM_CANDIDATES = Object.freeze({
  darwin: Object.freeze([
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Google Chrome for Testing.app/Contents/MacOS/" +
      "Google Chrome for Testing",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ]),
  linux: Object.freeze([
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ]),
});

async function isExecutable(file) {
  try {
    await access(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export async function resolveChromeQualificationExecutable() {
  const override =
    process.env.BIM_EXPLORER_CHROME_EXECUTABLE;
  if (typeof override === "string" && override.length > 0) {
    const resolved = path.resolve(override);
    if (!(await isExecutable(resolved))) {
      throw new Error(
        "BIM_EXPLORER_CHROME_EXECUTABLE is not executable: " +
          resolved,
      );
    }
    return resolved;
  }
  for (const candidate of PLATFORM_CANDIDATES[process.platform] ?? []) {
    if (await isExecutable(candidate)) {
      return candidate;
    }
  }
  throw new Error(
    "No supported Chrome executable was found; set " +
      "BIM_EXPLORER_CHROME_EXECUTABLE",
  );
}
