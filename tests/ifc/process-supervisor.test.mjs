import assert from "node:assert/strict";
import test from "node:test";

import {
  AdapterProcessError,
  runAdapterProcess,
} from "../../packages/ifc-engine-contract/src/process-supervisor.mjs";

test("adapter supervisor returns a bounded success receipt", async () => {
  const result = await runAdapterProcess({
    id: "success-stub",
    executable: process.execPath,
    arguments: [
      "--input-type=module",
      "--eval",
      "process.stdout.write(JSON.stringify({ok:true}) + '\\n')",
    ],
  });
  assert.deepEqual(result.report, {
    ok: true,
  });
  assert.equal(result.receipt.outcome, "completed");
  assert.equal(result.receipt.processExited, true);
  assert.equal(result.receipt.stderrCaptured, false);
});

test("adapter supervisor redacts stderr and local paths on failure", async () => {
  await assert.rejects(
    runAdapterProcess({
      id: "failure-stub",
      executable: process.execPath,
      arguments: [
        "--input-type=module",
        "--eval",
        "process.stderr.write('/private/customer.ifc'); process.exit(7)",
      ],
    }),
    (error) => {
      assert.ok(error instanceof AdapterProcessError);
      assert.equal(error.receipt.outcome, "nonzero-exit");
      assert.equal(error.receipt.exitCode, 7);
      assert.equal(error.receipt.stderrCaptured, true);
      assert.doesNotMatch(
        JSON.stringify({
          message: error.message,
          receipt: error.receipt,
        }),
        /customer|\\.ifc|\/private\//u,
      );
      return true;
    },
  );
});

test("adapter supervisor terminates a cancelled child process", async () => {
  const cancellation = new AbortController();
  const running = runAdapterProcess({
    id: "cancellation-stub",
    executable: process.execPath,
    arguments: [
      "--input-type=module",
      "--eval",
      "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)",
    ],
    signal: cancellation.signal,
    timeoutMs: 5_000,
    cancellationGraceMs: 25,
  });
  setTimeout(() => {
    cancellation.abort();
  }, 100);
  await assert.rejects(running, (error) => {
    assert.ok(error instanceof AdapterProcessError);
    assert.equal(error.receipt.outcome, "cancelled");
    assert.equal(error.receipt.cancelled, true);
    assert.equal(error.receipt.processExited, true);
    assert.equal(error.receipt.timedOut, false);
    assert.equal(error.receipt.signal, "SIGKILL");
    return true;
  });
});

test("adapter supervisor applies time and output budgets", async (t) => {
  await t.test("timeout", async () => {
    await assert.rejects(
      runAdapterProcess({
        id: "timeout-stub",
        executable: process.execPath,
        arguments: [
          "--input-type=module",
          "--eval",
          "setInterval(() => {}, 1000)",
        ],
        timeoutMs: 50,
      }),
      (error) => {
        assert.ok(error instanceof AdapterProcessError);
        assert.equal(error.receipt.outcome, "timeout");
        assert.equal(error.receipt.timedOut, true);
        assert.equal(error.receipt.processExited, true);
        return true;
      },
    );
  });

  await t.test("output limit", async () => {
    await assert.rejects(
      runAdapterProcess({
        id: "output-stub",
        executable: process.execPath,
        arguments: [
          "--input-type=module",
          "--eval",
          "process.stdout.write('x'.repeat(4096))",
        ],
        maxOutputBytes: 128,
      }),
      (error) => {
        assert.ok(error instanceof AdapterProcessError);
        assert.equal(error.receipt.outcome, "output-limit");
        assert.equal(error.receipt.outputLimitExceeded, true);
        assert.equal(error.receipt.processExited, true);
        assert.ok(error.receipt.stdoutBytes > 128);
        return true;
      },
    );
  });
});

test("adapter supervisor rejects cancellation before spawn", async () => {
  const cancellation = new AbortController();
  cancellation.abort();
  await assert.rejects(
    runAdapterProcess({
      id: "cancelled-stub",
      executable: process.execPath,
      arguments: ["--version"],
      signal: cancellation.signal,
    }),
    (error) => {
      assert.ok(error instanceof AdapterProcessError);
      assert.equal(error.receipt.outcome, "cancelled-before-start");
      assert.equal(error.receipt.processExited, false);
      assert.equal(error.receipt.cancelled, true);
      return true;
    },
  );
});
