import test from 'ava'
import { compileR1cs } from '../src/r1csCompiler.mjs'
import * as wasm from 'rstark'
// import { compile, buildTrace } from '../src/compiler.mjs'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { compile } from '../src/r1csStark.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function serializeBigint(v) {
  const bits = 8n
  let _v = v
  const out = []
  while (_v > 0n) {
    out.push(Number(_v & ((1n << bits) - 1n)))
    _v >>= bits
  }
  return out
}

test.skip('should compile and prove bits r1cs', async () => {
  // the number to be bitified, should fit in 60 bits
  const input = [100n]
  const file = path.join(__dirname, 'bits.r1cs')
  const fileData = await fs.readFile(file)
  const compiled = compile(fileData.buffer, input)
  const proof = wasm.prove({
    transition_constraints: compiled.constraints.map(v => v.serialize()),
    boundary: compiled.boundary.map(v => [v[0], v[1], serializeBigint(v[2])]),
    trace: compiled.trace.map(t => t.map(v => serializeBigint(v))),
  })
  wasm.verify(proof, {
    trace_len: compiled.trace.length,
    register_count: compiled.program.registerCount,
    transition_constraints: compiled.constraints.map(v => v.serialize()),
    boundary: compiled.boundary.map(v => [v[0], v[1], serializeBigint(v[2])]),
  })

  t.pass()
})

test('should compile and prove unirep epoch key r1cs', async t => {
  const input = Array(7).fill(0n)
  // const input = Array(47).fill(0n)
  const file = path.join(__dirname, 'epochKeyLite_main.r1cs')
  const fileData = await fs.readFile(file)
  const compiled = compile(fileData.buffer, input)
  const _ = +new Date()
  const proof = wasm.prove({
    transition_constraints: compiled.constraints.map(v => v.serialize()),
    boundary: compiled.boundary.map(v => [v[0], v[1], serializeBigint(v[2])]),
    trace: compiled.trace.map(t => t.map(v => serializeBigint(v))),
  })
  console.log(`proved in ${+new Date() - _} ms`)
  wasm.verify(proof, {
    trace_len: compiled.trace.length,
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
  const compiled = compile(fileData.buffer, input)
  const proof = wasm.prove({
    transition_constraints: compiled.constraints.map(v => v.serialize()),
    boundary: compiled.boundary.map(v => [v[0], v[1], serializeBigint(v[2])]),
    trace: compiled.trace.map(t => t.map(v => serializeBigint(v))),
  })
  wasm.verify(proof, {
    trace_len: compiled.trace.length,
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
  const compiled = compile(fileData.buffer, null, inputMemory)
  const proof = wasm.prove({
    transition_constraints: compiled.constraints.map(v => v.serialize()),
    boundary: compiled.boundary.map(v => [v[0], v[1], serializeBigint(v[2])]),
    trace: compiled.trace.map(t => t.map(v => serializeBigint(v))),
  })
  t.throws(() => {
    wasm.verify(proof, {
      trace_len: compiled.trace.length,
      register_count: compiled.program.registerCount,
      transition_constraints: compiled.constraints.map(v => v.serialize()),
      boundary: compiled.boundary.map(v => [v[0], v[1], serializeBigint(v[2])]),
    })
  })
})
