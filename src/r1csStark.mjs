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

  let minRegisters = 0
  for (const [a, b, c] of constraints) {
    const totalVars = Object.keys(a).length + Object.keys(b).length + Object.keys(c).length
    if (totalVars > minRegisters) {
      minRegisters = totalVars
    }
  }
  console.log(`Minimum register count: ${Math.ceil(minRegisters)}`)
  console.log(`Total variables: ${nVars}`)
  console.log(`Total constraints: ${constraints.length}`)
  // console.log(constraints)

  // for each constraint determine what variables it needs
  // find common sets of variables for constraints

  // array of variable indices
  const varGroups = []

  const groupContainsVars = (vars, group) => {
    let count = 0
    for (const v of vars) {
      if (group[v] !== undefined) count++
    }
    return count
  }
  const constraintGroupMap = {}

  for (const [key, [a, b, c]] of Object.entries(constraints)) {
    const varIndices = Object.keys({ ...a, ...b, ...c })
    let added = false
    let bestGroup = [-1, -1]
    for (const [groupIndex, group] of Object.entries(varGroups)) {
      const varsInGroup = groupContainsVars(varIndices, group)
      if (varsInGroup > bestGroup[1] && Object.keys(group).length < 100) {
        bestGroup = [groupIndex, varsInGroup]
      }
    }
    // no suitable group was found, make a new one
    if (bestGroup[0] === -1) {
      constraintGroupMap[key] = varGroups.length
      varGroups.push({...a, ...b, ...c})
    } else {
      constraintGroupMap[key] = bestGroup[0]
      for (const k of varIndices) {
        varGroups[bestGroup[0]][k] = true
      }
    }
  }
  // groups cannot share variables, they must be distinct
  console.log(`${varGroups.length} groups`)
  for (const [key, g] of Object.entries(varGroups)) {
    delete g['0']
    delete g[0]
  }
  for (const [key, g] of Object.entries(varGroups)) {

    for (const [keyInternal, gInternal] of Object.entries(varGroups)) {
      if (key === keyInternal) continue
      let count = 0
      for (const k of Object.keys(g)) {
        if (gInternal[k]) {
          count++
          console.log(k)
        }
      }
      if (count > 0) console.log(`group ${key} overlap ${keyInternal} n: ${count}`)
    }
  }
  for (const g of varGroups) {
    console.log(Object.keys(g).length)
  }

return

  const registerCount = Math.ceil(nVars / 2)
  const memory = memoryOverride ?? buildWitness(data, input)
  if (memory.length % 2 === 1) {
    memory.push(0n)
  }

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

  const varByIndex = (i) => {
    if (i < registerCount) {
      return nextState[i]
    }
    return prevState[i-registerCount]
  }

  const starkConstraints = []

  for (const [a, b, c] of constraints) {
    const aPoly = zero.copy()
    for (const [key, value] of Object.entries(a)) {
      const coef = new MultiPolynomial(field).term({ coef: value, exps: { [0]: 0n }})
      aPoly.add(one.copy().mul(varByIndex(+key)).mul(coef))
    }
    const bPoly = zero.copy()
    for (const [key, value] of Object.entries(b)) {
      const coef = new MultiPolynomial(field).term({ coef: value, exps: { [0]: 0n }})
      bPoly.add(one.copy().mul(varByIndex(+key)).mul(coef))
    }
    const cPoly = zero.copy()
    for (const [key, value] of Object.entries(c)) {
      const coef = new MultiPolynomial(field).term({ coef: value, exps: { [0]: 0n }})
      cPoly.add(one.copy().mul(varByIndex(+key)).mul(coef))
    }

    starkConstraints.push(aPoly.copy().mul(bPoly).sub(cPoly))
  }

  // where in the memory the public inputs start
  const pubInputsOffset = 1 + nOutputs
  return {
    constraints: starkConstraints,
    boundary: memory.slice(pubInputsOffset, pubInputsOffset+nPubInputs).map((val, i) => [1, i+pubInputsOffset, val]),
    trace: [memory.slice(0, registerCount), memory.slice(registerCount)].reverse(),
    program: {
      registerCount,
    }
  }
}
