import {
  ensurePublicIfcFixture,
} from "./public-ifc-fixture.mjs";

const result = await ensurePublicIfcFixture();
process.stdout.write(`${JSON.stringify(result.receipt, null, 2)}\n`);
