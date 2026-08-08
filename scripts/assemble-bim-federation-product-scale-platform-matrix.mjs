import {
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  assembleBimFederationProductScalePlatformMatrix,
} from "./bim-federation-product-scale-platform-evidence.mjs";
import {
  validateBimFederationProductScaleEvidence,
} from "./check-bim-federation-compatibility.mjs";

function parseArguments(values) {
  if (values.length % 2 !== 0) {
    throw new TypeError("matrix arguments require values");
  }
  const options = {};
  for (let index = 0; index < values.length; index += 2) {
    const name = values[index];
    const value = values[index + 1];
    if (typeof value !== "string" || value.length === 0) {
      throw new TypeError(`missing value for ${name}`);
    }
    if (name === "--commit") {
      options.commit = value;
    } else if (name === "--linux") {
      options.linux = path.resolve(value);
    } else if (name === "--macos") {
      options.macos = path.resolve(value);
    } else if (name === "--output") {
      options.output = path.resolve(value);
    } else if (name === "--run-id") {
      options.runId = Number(value);
    } else {
      throw new TypeError(`unknown argument ${name}`);
    }
  }
  for (const name of [
    "commit",
    "linux",
    "macos",
    "output",
    "runId",
  ]) {
    if (options[name] === undefined) {
      const flag = name.replace(
        /[A-Z]/gu,
        (letter) => `-${letter.toLowerCase()}`,
      );
      throw new TypeError(`missing --${flag}`);
    }
  }
  return options;
}

export async function assembleFromFiles(options) {
  const [linux, macos] = await Promise.all([
    readFile(options.linux, "utf8").then(JSON.parse),
    readFile(options.macos, "utf8").then(JSON.parse),
  ]);
  const matrix =
    assembleBimFederationProductScalePlatformMatrix({
      commit: options.commit,
      linux,
      macos,
      runId: options.runId,
      validateObservation:
        validateBimFederationProductScaleEvidence,
    });
  await mkdir(path.dirname(options.output), {
    recursive: true,
  });
  await writeFile(
    options.output,
    `${JSON.stringify(matrix, null, 2)}\n`,
    "utf8",
  );
  return matrix;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    fileURLToPath(import.meta.url)
) {
  const options = parseArguments(process.argv.slice(2));
  const matrix = await assembleFromFiles(options);
  process.stdout.write(
    `product-scale federation platform matrix assembled: ` +
      `${matrix.platforms.length} platforms\n`,
  );
}
