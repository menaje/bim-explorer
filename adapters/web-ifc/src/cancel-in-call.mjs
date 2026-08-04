import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as WebIFC from "web-ifc";

const PROGRESS_SCHEMA =
  "bim-explorer-ifc-in-call-progress/0.1";

function parseArguments(values) {
  if (values.length !== 4) {
    throw new TypeError(
      "usage: node cancel-in-call.mjs --input <source> " +
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
      throw new TypeError(`invalid web-ifc cancellation argument ${name}`);
    }
  }
  if (options.input === null || options.fixtureId === null) {
    throw new TypeError("--input and --fixture-id are required");
  }
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const bytes = await readFile(options.input);
  const source = {
    id: options.fixtureId,
    byteLength: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
  const api = new WebIFC.IfcAPI();
  let modelId = null;
  await api.Init();
  process.stdout.write(`${JSON.stringify({
    schema: PROGRESS_SCHEMA,
    phase: "model-open-call-starting",
    engine: {
      id: "web-ifc",
      version: "0.0.77",
      backend: "node-wasm-process",
    },
    source,
  })}\n`);
  try {
    modelId = api.OpenModel(bytes, {
      COORDINATE_TO_ORIGIN: false,
    });
    const schema = api.GetModelSchema(modelId);
    process.stdout.write(`${JSON.stringify({
      schema: "bim-explorer-ifc-in-call-unexpected-completion/0.1",
      status: "completed",
      source: {
        ...source,
        schema,
      },
    })}\n`);
  } finally {
    if (modelId !== null) {
      api.CloseModel(modelId);
    }
    api.Dispose();
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
