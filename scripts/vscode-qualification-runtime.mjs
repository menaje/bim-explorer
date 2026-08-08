import { constants } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";

import {
  downloadAndUnzipVSCode,
  resolveCliArgsFromVSCodeExecutablePath,
} from "@vscode/test-electron";

export const VSCODE_QUALIFICATION_VERSION = "1.131.0";

const MACOS_EXECUTABLE =
  "/Applications/Visual Studio Code.app/Contents/MacOS/Code";

async function executablePath(value, label) {
  const resolved = path.resolve(value);
  try {
    await access(resolved, constants.X_OK);
  } catch {
    throw new Error(`${label} is not executable: ${resolved}`);
  }
  return resolved;
}

function requestedVersion() {
  const value = process.env.BIM_EXPLORER_VSCODE_VERSION ??
    VSCODE_QUALIFICATION_VERSION;
  if (!/^\d+\.\d+\.\d+$/u.test(value)) {
    throw new TypeError(
      "BIM_EXPLORER_VSCODE_VERSION must be an exact release version",
    );
  }
  return value;
}

async function localMacosExecutable() {
  if (process.platform !== "darwin") {
    return null;
  }
  try {
    return await executablePath(
      MACOS_EXECUTABLE,
      "local VS Code executable",
    );
  } catch {
    return null;
  }
}

async function downloadExactVersion(version) {
  const errors = [];
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return {
        attempts: attempt,
        executable: await downloadAndUnzipVSCode({
          version,
          timeout: 60_000,
        }),
      };
    } catch (error) {
      errors.push(error);
      if (attempt < 3) {
        await new Promise((resolve) =>
          setTimeout(resolve, attempt * 1_000));
      }
    }
  }
  throw new AggregateError(
    errors,
    `VS Code ${version} download failed after 3 attempts`,
  );
}

export async function resolveVscodeQualificationRuntime() {
  const executableOverride =
    process.env.BIM_EXPLORER_VSCODE_EXECUTABLE;
  const forceVersion =
    process.env.BIM_EXPLORER_VSCODE_VERSION;
  let executable;
  let downloadAttempts = 0;
  let source;
  let version = null;
  if (
    typeof executableOverride === "string" &&
    executableOverride.length > 0
  ) {
    executable = await executablePath(
      executableOverride,
      "BIM_EXPLORER_VSCODE_EXECUTABLE",
    );
    source = "environment";
  } else {
    const local = forceVersion === undefined
      ? await localMacosExecutable()
      : null;
    if (local !== null) {
      executable = local;
      source = "local-installation";
    } else {
      version = requestedVersion();
      const downloaded = await downloadExactVersion(version);
      executable = downloaded.executable;
      downloadAttempts = downloaded.attempts;
      source = "exact-download";
    }
  }

  const cliOverride = process.env.BIM_EXPLORER_VSCODE_CLI;
  const cli =
    typeof cliOverride === "string" &&
    cliOverride.length > 0
      ? [await executablePath(
          cliOverride,
          "BIM_EXPLORER_VSCODE_CLI",
        )]
      : resolveCliArgsFromVSCodeExecutablePath(
          executable,
          { reuseMachineInstall: true },
        );
  if (cli.length === 0) {
    throw new Error("VS Code CLI resolution returned no command");
  }
  await executablePath(cli[0], "resolved VS Code CLI");
  return Object.freeze({
    executable,
    cli: Object.freeze([...cli]),
    downloadAttempts,
    requestedVersion: version,
    source,
  });
}
