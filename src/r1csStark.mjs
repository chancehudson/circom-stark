import { R1CS } from './r1csParser.mjs'
import { buildWitness } from './witnessBuilder.mjs'
import { ScalarField } from 'starkstark/src/ScalarField.mjs'
import { MultiPolynomial } from 'starkstark/src/MultiPolynomial.mjs'

export const field = new ScalarField(
  18446744069414584321n,
  2717n
)

export function compile(r1csBuffer, input = [], memoryOverride) {
  const { data } = new R1CS(r1csBuffer)
  const {
    prime,
    constraints,
    nOutputs,
    nPubInputs,
    nPrvInputs,
    nVars
  } = data

  if (prime !== field.p) {
    throw new Error(`r1cs prime does not match expected value. Got ${prime} expected ${field.p}`)
  }

  const registerCount = nVars
  const memory = memoryOverride ?? buildWitness(data, input)

  // for all r1cs constraints make stark constraints
  // using signals in the trace memory
  // the trace will be of length 2 (only 1 step)
  // the prover just supplies the signals as input
  // in a single row
  //
  const variables = Array(1+2*registerCount)
    .fill()
    .map((_, i) => new MultiPolynomial(field).term({ coef: 1n, exps: { [i]: 1n }}))
  const cycleIndex = variables[0]
  const prevState = variables.slice(1, registerCount+1)
  const nextState = variables.slice(1+registerCount)

  const zero = new MultiPolynomial(field).term({ coef: 0n, exps: { [0]: 0n }})
  const one = new MultiPolynomial(field).term({ coef: 1n, exps: { [0]: 0n }})

  const starkConstraints = []

  // TODO: form a single constraint using a RLC
  // need to sample the input to get the randomness
  for (const [a, b, c] of constraints) {
    const aPoly = zero.copy()
    for (const [key, value] of Object.entries(a)) {
      const coef = new MultiPolynomial(field).term({ coef: value, exps: { [0]: 0n }})
      aPoly.add(one.copy().mul(prevState[+key]).mul(coef))
    }
    const bPoly = zero.copy()
    for (const [key, value] of Object.entries(b)) {
      const coef = new MultiPolynomial(field).term({ coef: value, exps: { [0]: 0n }})
      bPoly.add(one.copy().mul(prevState[+key]).mul(coef))
    }
    const cPoly = zero.copy()
    for (const [key, value] of Object.entries(c)) {
      const coef = new MultiPolynomial(field).term({ coef: value, exps: { [0]: 0n }})
      cPoly.add(one.copy().mul(prevState[+key]).mul(coef))
    }

    starkConstraints.push(aPoly.copy().mul(bPoly).sub(cPoly))
  }

  // where in the memory the public inputs start
  const pubInputsOffset = 1 + nOutputs
  return {
    constraints: starkConstraints,
    boundary: memory.slice(pubInputsOffset, pubInputsOffset+nPubInputs).map((val, i) => [1, i+pubInputsOffset, val]),
    trace: [memory, memory],
    program: {
      registerCount,
    }
  }
}
