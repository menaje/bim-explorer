import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  WebIfcInspectionError,
  inspectWebIfc,
} from "./inspect.mjs";

function parseArguments(values) {
  if (values.length !== 4) {
    throw new TypeError(
      "usage: node inspect-negative.mjs --input <source> " +
        "--fixture-id <id>",
    );
  }
  const options = {
    fixtureId: null,
    input: null,
  };
  for (let index = 0; index < values.length; index += 2) {
    const name = values[index];
    const value = values[index + 1];
    if (name === "--input" && typeof value === "string" && value.length > 0) {
      options.input = path.resolve(value);
    } else if (
      name === "--fixture-id" &&
      /^[a-z0-9][a-z0-9-]+$/u.test(value)
    ) {
      options.fixtureId = value;
    } else {
      throw new TypeError(`invalid web-ifc negative adapter argument ${name}`);
    }
  }
  if (options.input === null || options.fixtureId === null) {
    throw new TypeError("--input and --fixture-id are required");
  }
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  try {
    await inspectWebIfc(options.input, options.fixtureId);
  } catch (error) {
    if (error instanceof WebIfcInspectionError) {
      process.stdout.write(`${JSON.stringify(error.receipt)}\n`);
      return;
    }
    throw error;
  }
  throw new Error("negative IFC source was unexpectedly accepted");
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
