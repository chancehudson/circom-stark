import test from 'ava'
import { compile, buildTrace, field } from '../src/compiler.mjs'
import * as wasm from 'rstark'

function serializeBigint(v) {
  let _v = v
  const out = []
  while (_v > 0n) {
    out.push(Number(_v & ((1n << 32n) - 1n)))
    _v >>= 32n
  }
  return out
}

async function proveAndVerify(asm, inputs) {
  const compiled = compile(asm)
  const trace = buildTrace(compiled.program, inputs)
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

test('should set using named value', async t => {
  const v = field.random()
  const asm = `
set 0x0 input1
set 0x1 ${v.toString()}
eq 0x0 0x1
  `
  await proveAndVerify(asm, {
    input1: v
  })
  t.pass()
})

test('should add subtract eq', async t => {
  const asm = `
set 0x0 1
set 0x1 14
set 0x2 108
set 0x3 12
set 0x4 1512
set 0x6 0
neg 0x5 1
  `
  await proveAndVerify(asm)
  t.pass()
})

test('should add registers', async t => {
  const v1 = field.random()
  const v2 = field.random()
  const sum = field.add(v1, v2)
  const asm = `
set 0x0 ${v1.toString()}
set 0x1 ${v2.toString()}
add 0x2 0x0 0x1
set 0x3 ${sum.toString()}
eq 0x2 0x3
  `
  await proveAndVerify(asm)
  t.pass()
})

test('should add registers in place', async t => {
  const v1 = field.random()
  const v2 = field.random()
  const sum = field.add(v1, v2)
  const asm = `
set 0x0 ${v1.toString()}
set 0x1 ${v2.toString()}
add 0x0 0x0 0x1
set 0x1 ${sum.toString()}
eq 0x0 0x1
  `
  await proveAndVerify(asm)
  t.pass()
})

test('should check equality of registers', async t => {
  const asm = `
set 0x0 0x124129821400
set 0x1 0x124129821400
eq 0x0 0x1
  `
  await proveAndVerify(asm)
  t.pass()
})

test('should fail to prove equality', async t => {
  const asm = `
set 0x0 0x124129821400
set 0x1 0x124129821401
eq 0x0 0x1
  `
  await t.throwsAsync(() => proveAndVerify(asm))
})

test('should negate register', async t => {
  const v = field.random()
  const vNeg = field.neg(v)
  const asm = `
set 0x0 ${v.toString()}
set 0x1 ${vNeg.toString()}
neg 0x2 0x0
eq 0x2 0x1
  `
  await proveAndVerify(asm)
  t.pass()
})

test('should negate in place', async t => {
  const v = field.random()
  const vNeg = field.neg(v)
  const asm = `
set 0x0 ${v.toString()}
set 0x1 ${vNeg.toString()}
neg 0x0 0x0
eq 0x0 0x1
  `
  await proveAndVerify(asm)
  t.pass()
})

test('should multiply registers', async t => {
  const v1 = field.random()
  const v2 = field.random()
  const prod = field.mul(v1, v2)
  const asm = `
set 0x0 ${v1.toString()}
set 0x1 ${v2.toString()}
mul 0x2 0x0 0x1
set 0x3 ${prod.toString()}
eq 0x2 0x3
  `
  await proveAndVerify(asm)
  t.pass()
})

test('should multiply in place', async t => {
  const v1 = field.random()
  const v2 = field.random()
  const prod = field.mul(v1, v2)
  const asm = `
set 0x0 ${v1.toString()}
set 0x1 ${v2.toString()}
mul 0x0 0x0 0x1
set 0x1 ${prod.toString()}
eq 0x0 0x1
  `
  await proveAndVerify(asm)
  t.pass()
})
