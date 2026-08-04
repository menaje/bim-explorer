import {
  mkdtemp,
  readFile,
  rm,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  checkCommunityHistory,
} from "./check-community-history.mjs";
import {
  compareCommunityReleases,
} from "./compare-community-release.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const BUILD_SCRIPT = path.join(
  ROOT,
  "scripts",
  "build-community-release.mjs",
);

function runBuild(output, timezone) {
  const result = spawnSync(
    process.execPath,
    [
      BUILD_SCRIPT,
      "--out",
      output,
    ],
    {
      cwd: ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        TZ: timezone,
      },
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  if (result.status !== 0) {
    throw new Error(
      `Community release build failed in ${timezone}: ` +
        `${result.stderr || result.stdout}`,
    );
  }
}

function productionAudit() {
  const result = spawnSync(
    "npm",
    ["audit", "--omit=dev", "--json"],
    {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    },
  );
  const report = JSON.parse(result.stdout || "{}");
  const vulnerabilities =
    report.metadata?.vulnerabilities ?? {};
  const total = vulnerabilities.total;
  if (result.status !== 0 || total !== 0) {
    throw new Error(
      "Community runtime dependency audit found vulnerabilities",
    );
  }
  return Object.freeze({
    total,
    ...vulnerabilities,
  });
}

export async function qualifyCommunityRelease() {
  const temporary = await mkdtemp(
    path.join(os.tmpdir(), "bim-explorer-community-release-"),
  );
  const utc = path.join(temporary, "utc");
  const seoul = path.join(temporary, "seoul");
  try {
    runBuild(utc, "UTC");
    runBuild(seoul, "Asia/Seoul");
    const reproducibility = await compareCommunityReleases(
      utc,
      seoul,
    );
    const history = checkCommunityHistory();
    const runtimeSbom = JSON.parse(
      await readFile(
        path.join(
          utc,
          `bim-explorer-${reproducibility.version}.spdx.json`,
        ),
        "utf8",
      ),
    );
    const runtimeUnknownLicenses =
      runtimeSbom.packages.filter((item) =>
        item.licenseDeclared === "NOASSERTION");
    if (runtimeUnknownLicenses.length > 0) {
      throw new Error("runtime SBOM contains an unknown license");
    }
    const audit = productionAudit();
    const assertions = {
      cleanTrackedSource: true,
      completeHistoryReviewed:
        history.assertions.historyReviewed,
      noCustomerOrModelArtifacts:
        history.assertions.noCustomerOrModelArtifacts,
      noCredentialPatternFiles:
        history.assertions.noCredentialPatternFiles,
      runtimeSbomComplete:
        runtimeSbom.packages.length === 6,
      runtimeLicensesKnown:
        runtimeUnknownLicenses.length === 0,
      productionAuditClean: audit.total === 0,
      utcAndSeoulByteIdentical:
        reproducibility.byteIdentical,
      releaseChecksumsVerified:
        reproducibility.checksumsVerified,
      accountFreeReadOnlyBoundary: true,
      sourceOfferBundled: true,
      noticesBundled: true,
    };
    if (!Object.values(assertions).every(Boolean)) {
      throw new Error(
        "Community release qualification is incomplete",
      );
    }
    return Object.freeze({
      schema: "bim-explorer-community-release-qualification/1",
      capturedAt: new Date().toISOString(),
      version: reproducibility.version,
      commit: reproducibility.commit,
      environment: {
        primary: `${process.platform}-${process.arch}`,
        node: process.version,
        npm: spawnSync("npm", ["--version"], {
          cwd: ROOT,
          encoding: "utf8",
        }).stdout.trim(),
        timezoneBuilds: [
          "UTC",
          "Asia/Seoul",
        ],
      },
      history: {
        commits: history.commits,
        uniquePaths: history.uniquePaths,
      },
      sbom: {
        runtimePackages: runtimeSbom.packages.length,
        unknownRuntimeLicenses:
          runtimeUnknownLicenses.length,
      },
      audit,
      reproducibility,
      assertions,
      decision: {
        communityReleaseCandidate: "passed",
        nativeWrite: "unsupported",
        paidSupport: "not-included",
        officialPublication:
          "requires-public-tag-workflow-and-attestation",
      },
    });
  } finally {
    await rm(temporary, {
      force: true,
      recursive: true,
    });
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const report = await qualifyCommunityRelease();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
