import assert from "node:assert/strict";
import test from "node:test";

import {
  isEvidenceTimestampAtOrAfter,
} from "../../scripts/evidence-timestamp.mjs";

test("evidence timestamps may be captured after their profile date", () => {
  assert.equal(
    isEvidenceTimestampAtOrAfter(
      "2026-08-08T00:00:00.000Z",
      "2026-08-08",
    ),
    true,
  );
  assert.equal(
    isEvidenceTimestampAtOrAfter(
      "2026-08-09T01:04:35.523Z",
      "2026-08-08",
    ),
    true,
  );
});

test("evidence timestamps reject stale or non-canonical values", () => {
  for (const [capturedAt, asOf] of [
    ["2026-08-07T23:59:59.999Z", "2026-08-08"],
    ["2026-08-09T01:04:35Z", "2026-08-08"],
    ["2026-02-30T00:00:00.000Z", "2026-02-28"],
    ["2026-08-09T01:04:35.523+00:00", "2026-08-08"],
    ["2026-08-09T01:04:35.523Z", "2026-02-30"],
  ]) {
    assert.equal(
      isEvidenceTimestampAtOrAfter(capturedAt, asOf),
      false,
    );
  }
});
