import test from 'ava'
import { compileR1cs } from '../src/r1csCompiler.mjs'
import * as wasm from 'rstark'
import { compile, buildTrace } from '../src/compiler.mjs'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function serializeBigint(v) {
  let _v = v
  const out = []
  while (_v > 0n) {
    out.push(Number(_v & ((1n << 32n) - 1n)))
    _v >>= 32n
  }
  return out
}

test.skip('should compile and prove unirep epoch key r1cs', async t => {
  const input = Array(7).fill(2n)
  const file = path.join(__dirname, 'epochKeyLite_main.r1cs')
  const fileData = await fs.readFile(file)
  const asm = await compileR1cs(fileData.buffer, input)
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

test('should compile and prove r1cs', async t => {
  const input = [
    12n,
  ]
  const file = path.join(__dirname, 'example.r1cs')
  const fileData = await fs.readFile(file)
  const asm = await compileR1cs(fileData.buffer, input)
  console.log(asm)
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
  const file = path.join(__dirname, 'example.r1cs')
  const fileData = await fs.readFile(file)
  const asm = await compileR1cs(fileData.buffer, [12n], inputMemory)
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
