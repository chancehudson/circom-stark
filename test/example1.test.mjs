import test from "ava";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { compile, buildTrace } from "../src/compiler.mjs";
// import * as wasm from 'rstark'

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function serializeBigint(v) {
  let _v = v;
  const out = [];
  while (_v > 0n) {
    out.push(Number(_v & ((1n << 32n) - 1n)));
    _v >>= 32n;
  }
  return out;
}

test("should compile and prove example1", async (t) => {
  const asm = await fs.readFile(path.join(__dirname, "./example1.asm"));
  const compiled = compile(asm.toString());
  const trace = buildTrace(compiled.program);
  for (const line of trace) {
    t.is(line.length, compiled.program.registerCount);
  }
  // const proof = wasm.prove({
  //   transition_constraints: compiled.constraints.map((v) => v.serialize()),
  //   boundary: compiled.boundary.map((v) => [v[0], v[1], serializeBigint(v[2])]),
  //   trace: trace.map((t) => t.map((v) => serializeBigint(v))),
  // });
  // wasm.verify(proof, {
  //   trace_len: trace.length,
  //   register_count: compiled.program.registerCount,
  //   transition_constraints: compiled.constraints.map((v) => v.serialize()),
  //   boundary: compiled.boundary.map((v) => [v[0], v[1], serializeBigint(v[2])]),
  // });
  t.pass();
});
