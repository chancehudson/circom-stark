import { compile, buildTrace } from './compiler.mjs'
import * as wasm from 'rstark'

export function serializeBigint(v) {
  let _v = v
  const out = []
  while (_v > 0n) {
    out.push(Number(_v & ((1n << 32n) - 1n)))
    _v >>= 32n
  }
  return out
}

export function compileAndProve(asm, inputs = {}) {
  const compiled = compile(asm)
  const trace = buildTrace(compiled.program)
  const proof = wasm.prove({
    transition_constraints: compiled.constraints.map(v => v.serialize()),
    boundary: compiled.boundary.map(v => [v[0], v[1], serializeBigint(v[2])]),
    trace: trace.map(t => t.map(v => serializeBigint(v))),
  })
  wasm.verify(proof, {
    trace_len: trace.length,
    register_count: compiled.program.registerCount,
    transition_constraints: compiled.constraints.map(v => v.serialize()),
    boundary: compiled.boundary.map(v => [v[0], v[1], serializeBigint(v[2])]),
  })
}
