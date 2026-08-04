import { createHash } from "node:crypto";

import {
  syntheticIfc,
} from "./generate-synthetic-ifc.mjs";

function fixture(
  id,
  description,
  browserExpectedFailurePhase,
  content,
) {
  const bytes = Buffer.from(content, "utf8");
  return Object.freeze({
    id,
    description,
    browserExpectedFailurePhase,
    bytes,
    byteLength: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}

export function syntheticNegativeIfcCorpus() {
  const valid = syntheticIfc();
  const dataStart = valid.indexOf("#32=IFCWALL");
  if (dataStart < 0) {
    throw new Error("synthetic IFC mutation anchor is missing");
  }
  return Object.freeze([
    fixture(
      "invalid-step-preamble",
      "Complete STEP sections with an invalid exchange-file preamble",
      "source-envelope",
      [
        "NOT-ISO-10303-21;",
        "HEADER;",
        "FILE_SCHEMA(('IFC4'));",
        "ENDSEC;",
        "DATA;",
        "ENDSEC;",
        "END-ISO-10303-21;",
        "",
      ].join("\n"),
    ),
    fixture(
      "truncated-data-section",
      "Repository-authored IFC4 truncated inside the DATA section",
      "source-envelope",
      valid.slice(0, dataStart),
    ),
    fixture(
      "missing-project-root",
      "Complete IFC4 envelope with the Project root replaced by a non-root entity",
      "semantic-admission",
      valid.replace(
        /#13=IFCPROJECT\([^\n]+\);/u,
        "#13=IFCPERSON($,$,'Not Project',$,$,$,$,$);",
      ),
    ),
  ]);
}

export function syntheticNegativeIfcCase(id) {
  if (!/^[a-z0-9][a-z0-9-]+$/u.test(id)) {
    throw new TypeError("invalid negative IFC case id");
  }
  const value = syntheticNegativeIfcCorpus()
    .find((candidate) => candidate.id === id);
  if (!value) {
    throw new Error(`unknown negative IFC case ${id}`);
  }
  return value;
}
