import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  BIM_REFERENCE_FORMAT_INTAKE_SCHEMA,
  BIM_REFERENCE_FORMAT_TRIAGE_SCHEMA,
  evaluateReferenceFormatIntake,
} from "../../packages/bim-federation/src/index.mjs";

function intake(overrides = {}) {
  return {
    schema: BIM_REFERENCE_FORMAT_INTAKE_SCHEMA,
    candidateFormat: "las",
    demand: {
      kind: "actual-user-task",
      evidenceReference: "public-issue:12",
      taskSummary:
        "Review an IFC design against an independently surveyed LAS context.",
      sourceFormats: ["ifc", "las"],
      requestedCapabilities: ["view", "query"],
    },
    fixture: {
      availability: "public-redistributable",
      url: "https://example.org/fixtures/survey.las",
      byteLength: 8_388_608,
      sha256: "a".repeat(64),
      license: "CC0-1.0",
      containsCustomerData: false,
    },
    implementation: {
      kind: "open-source-codec",
      artifactReference: "npm:example-las-codec@1.0.0",
      license: "MIT",
      redistribution: "confirmed",
    },
    coordinates: {
      mode: "projected-crs",
      crs: "EPSG:32652",
      evidenceReference:
        `public-evidence:sha256:${"b".repeat(64)}`,
      datumTransformationRequired: false,
    },
    qualification: {
      budgetReference:
        `public-evidence:sha256:${"c".repeat(64)}`,
      lifecycleHarness: true,
      networkPolicyReference: null,
      platformPackaging: false,
      reopenEvidence: false,
    },
    privacy: {
      publicIssueContainsModel: false,
      publicIssueContainsCredential: false,
      publicIssueContainsAbsolutePath: false,
    },
    ...overrides,
  };
}

test("complete intake can start qualification without admitting a format", () => {
  const receipt = evaluateReferenceFormatIntake(intake());
  assert.equal(
    receipt.schema,
    BIM_REFERENCE_FORMAT_TRIAGE_SCHEMA,
  );
  assert.equal(receipt.status, "ready-for-qualification");
  assert.equal(receipt.registry.admitted, false);
  assert.equal(receipt.qualification.ready, true);
  assert.deepEqual(receipt.qualification.missingEvidence, []);
  assert.equal(receipt.authority.formatAdmission, false);
  assert.equal(receipt.authority.semanticAuthority, false);
  assert.equal(receipt.decision.admissionRemainsHeld, true);
  assert.equal(Object.isFrozen(receipt), true);
});

test("maintainer hypothesis remains held with explicit gaps", () => {
  const receipt = evaluateReferenceFormatIntake(intake({
    candidateFormat: "dgn",
    demand: {
      kind: "maintainer-hypothesis",
      evidenceReference: null,
      taskSummary: "A native DGN review workflow is only a hypothesis.",
      sourceFormats: ["dgn"],
      requestedCapabilities: ["query", "roundTrip"],
    },
    fixture: {
      availability: "none",
      url: null,
      byteLength: null,
      sha256: null,
      license: null,
      containsCustomerData: false,
    },
    implementation: {
      kind: "unknown",
      artifactReference: null,
      license: null,
      redistribution: "unknown",
    },
    coordinates: {
      mode: "unknown",
      crs: null,
      evidenceReference: null,
      datumTransformationRequired: null,
    },
    qualification: {
      budgetReference: null,
      lifecycleHarness: false,
      networkPolicyReference: null,
      platformPackaging: false,
      reopenEvidence: false,
    },
  }));
  assert.equal(receipt.status, "held-missing-evidence");
  assert.equal(receipt.qualification.ready, false);
  for (const gap of [
    "actual-user-task-evidence",
    "multi-source-workflow-evidence",
    "public-redistributable-fixture",
    "redistribution-rights",
    "native-sdk-platform-package",
    "native-reopen-qualification",
  ]) {
    assert.ok(receipt.qualification.missingEvidence.includes(gap));
  }
  assert.equal(receipt.decision.nextStep, "collect-missing-evidence");
  assert.equal(receipt.authority.nativeWrite, false);
});

test("3D Tiles requires an explicit network engine policy", () => {
  const candidate = intake({
    candidateFormat: "3d-tiles",
    demand: {
      ...intake().demand,
      taskSummary:
        "Review an IFC design inside a bounded public 3D Tiles site context.",
      sourceFormats: ["ifc", "3d-tiles"],
    },
    implementation: {
      ...intake().implementation,
      kind: "network-engine",
      artifactReference: "npm:example-tiles-engine@1.0.0",
    },
    coordinates: {
      ...intake().coordinates,
      mode: "geospatial-tileset",
    },
  });
  const held = evaluateReferenceFormatIntake(candidate);
  assert.deepEqual(
    held.qualification.missingEvidence,
    ["network-engine-policy-evidence"],
  );

  candidate.qualification.networkPolicyReference =
    `public-evidence:sha256:${"d".repeat(64)}`;
  const ready = evaluateReferenceFormatIntake(candidate);
  assert.equal(ready.status, "ready-for-qualification");
  assert.equal(ready.authority.formatAdmission, false);
});

test("intake rejects confidential data signals and unsafe URLs", () => {
  const extraField = intake();
  extraField.customerModelName = "private-model.las";
  assert.throws(
    () => evaluateReferenceFormatIntake(extraField),
    /fields are invalid/u,
  );

  const confidential = intake();
  confidential.privacy.publicIssueContainsModel = true;
  assert.throws(
    () => evaluateReferenceFormatIntake(confidential),
    /cannot carry model data/u,
  );

  const credentialUrl = intake();
  credentialUrl.fixture.url =
    "https://example.org/survey.las?token=secret";
  assert.throws(
    () => evaluateReferenceFormatIntake(credentialUrl),
    /credential-free HTTPS/u,
  );

  const localPath = intake();
  localPath.demand.taskSummary =
    "Open /Users/example/private/customer.las with IFC.";
  assert.throws(
    () => evaluateReferenceFormatIntake(localPath),
    /path-free string/u,
  );
});

test("intake cannot reopen an already admitted format", () => {
  const admitted = intake({
    candidateFormat: "glb",
    demand: {
      ...intake().demand,
      sourceFormats: ["ifc", "glb"],
    },
  });
  assert.throws(
    () => evaluateReferenceFormatIntake(admitted),
    /already admitted/u,
  );
});

test("public issue form keeps evidence and privacy gates explicit", async () => {
  const form = await readFile(
    ".github/ISSUE_TEMPLATE/reference-format-qualification.yml",
    "utf8",
  );
  for (const value of [
    "LAS",
    "LAZ",
    "E57",
    "3D Tiles",
    "RVT",
    "DGN",
    "실제 사용자 과업",
    "고객 모델을 첨부하지 않았습니다",
    "credential이나 absolute path를 포함하지 않았습니다",
    "write/round-trip 지원을 자동으로 승인하지 않습니다",
  ]) {
    assert.ok(form.includes(value), `issue form must include ${value}`);
  }
});
