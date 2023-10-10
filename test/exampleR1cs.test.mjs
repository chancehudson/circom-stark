import test from 'ava'
import { compileR1cs } from '../src/r1cs.mjs'
import * as wasm from 'rstark'
import { compile, buildTrace } from '../src/compiler.mjs'

function serializeBigint(v) {
  let _v = v
  const out = []
  while (_v > 0n) {
    out.push(Number(_v & ((1n << 32n) - 1n)))
    _v >>= 32n
  }
  return out
}

test('should compile and prove r1cs', async t => {
  const input = [
    12n,
  ]
  const asm = await compileR1cs('test/example.r1cs', input)
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

  t.pass()
})

test('should fail to prove invalid input', async t => {
  // if the circuit is properly constrained changing any of these
  // values by any amount should cause the proof to fail
  const inputMemory = [
    1n,
    12n,
    90n,
    11n, // change by 1
    1080n
  ]
  const asm = await compileR1cs('test/example.r1cs', [12n], inputMemory)
  const compiled = compile(asm)
  const trace = buildTrace(compiled.program)
  const proof = wasm.prove({
    transition_constraints: compiled.constraints.map(v => v.serialize()),
    boundary: compiled.boundary.map(v => [v[0], v[1], serializeBigint(v[2])]),
    trace: trace.map(t => t.map(v => serializeBigint(v))),
  })
  t.throws(() => {
    wasm.verify(proof, {
      trace_len: trace.length,
      register_count: compiled.program.registerCount,
      transition_constraints: compiled.constraints.map(v => v.serialize()),
      boundary: compiled.boundary.map(v => [v[0], v[1], serializeBigint(v[2])]),
    })
  })
})
