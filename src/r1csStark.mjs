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
  minRegisters = Math.ceil(minRegisters)
  console.log(`Minimum register count: ${minRegisters}`)
  console.log(`Total variables: ${nVars}`)
  console.log(`Total constraints: ${constraints.length}`)
  // console.log(constraints)

  // for each constraint determine what variables it needs
  // find common sets of variables for constraints

  // array of variable indices
  const TARGET_GROUP_SIZE = 500
  let varGroups = []

  const groupContainsVars = (vars, group) => {
    let count = 0
    for (const v of vars) {
      if (group[v] !== undefined) count++
    }
    return count
  }
  const groupOverlapCount = (group0, group1) => {
    let count = 0
    for (const k of Object.keys(group0)) {
      if (group1[k] !== undefined) count++
    }
    return count
  }

  // build the least efficient grouping

  for (const [key, [a, b, c]] of Object.entries(constraints)) {
    varGroups.push({ ...a, ...b, ...c })
  }

  for (const [key, g] of Object.entries(varGroups)) {
    delete g['0']
    delete g[0]
  }

  // first deduplicate the groups
  // find pairs of groups that are most similar and combine

  const deduplicate = (groups, maxSize = TARGET_GROUP_SIZE) => {
    const newGroups = []
    const matched = {}
    const noOverlap = []

    const overlaps = []

    for (const [groupIndex, group] of Object.entries(groups)) {
      for (const [groupIndexInner, groupInner] of Object.entries(groups)) {
        if (groupIndexInner <= groupIndex) continue
        overlaps.push([groupIndex, groupIndexInner, groupOverlapCount(group, groupInner)])
      }
    }
    overlaps.sort((a, b) => a[2] > b[2] ? -1 : 1)

    for (const [groupA, groupB] of overlaps) {
      if (matched[groupA] || matched[groupB]) continue
      matched[groupA] = true
      matched[groupB] = true
      newGroups.push({ ...groups[groupA], ...groups[groupB] })
    }

    const unmatched = {}
    for (let x = 0; x < groups.length; x++) {
      if (!matched[x]) unmatched[x] = true
    }
    for (let x = 0; x < Object.keys(unmatched).length; x+=2) {
      const key = Object.keys(unmatched)[x]
      if (Object.keys(unmatched).length === x+1) {
        // don't combine this one
        newGroups.push(groups[key])
      } else {
        const nextKey = Object.keys(unmatched)[x+1]
        newGroups.push({...groups[key], ...groups[nextKey] })
      }
    }
    return newGroups
  }

  const maxGroupSize = (groups) => {
    let maxSize = 0
    for (const g of groups) {
      maxSize = Math.max(Object.keys(g).length, maxSize)
    }
    return maxSize
  }

  // TODO: deduplicate until the spread in sizes is relatively small instead of
  // just looking at max size
  // while (maxGroupSize(varGroups) < minRegisters) {
  //   varGroups = deduplicate(varGroups)
  // }
  while (varGroups.length > 5) {
    varGroups = deduplicate(varGroups)
  }

  // now sort the trace based on which groups have the most overlap

  const overlaps = []

  for (const [groupIndex, group] of Object.entries(varGroups)) {
    for (const [groupIndexInner, groupInner] of Object.entries(varGroups)) {
      if (groupIndexInner <= groupIndex) continue
      overlaps.push([groupIndex, groupIndexInner, groupOverlapCount(group, groupInner)])
    }
  }
  overlaps.sort((a, b) => a[2] > b[2] ? -1 : 1)
  // console.log(overlaps)
  const sortedGroups = []
  const matched = {}
  for (const [groupA, groupB] of overlaps) {
    if (matched[groupA] || matched[groupB]) continue
    matched[groupA] = true
    matched[groupB] = true
    if (Object.keys(varGroups[groupA]).length > Object.keys(varGroups[groupB]).length) {
      sortedGroups.push(varGroups[groupA])
      sortedGroups.push(varGroups[groupB])
    } else {
      sortedGroups.push(varGroups[groupB])
      sortedGroups.push(varGroups[groupA])
    }
  }
  const unmatched = {}
  for (let x = 0; x < varGroups.length; x++) {
    if (!matched[x]) unmatched[x] = true
  }
  for (let x = 0; x < Object.keys(unmatched).length; x+=2) {
    const key = Object.keys(unmatched)[x]
    if (Object.keys(unmatched).length === x+1) {
      // don't combine this one
      sortedGroups.push(varGroups[key])
      continue
    }
    if (Object.keys(varGroups[key]).length > Object.keys(varGroups[nextKey]).length) {
      sortedGroups.push(varGroups[key])
      sortedGroups.push(varGroups[nextKey])
    } else {
      sortedGroups.push(varGroups[nextKey])
      sortedGroups.push(varGroups[key])
    }
  }

  varGroups = sortedGroups

  // deduplicate based on ordering

  for (const [groupIndex, group] of Object.entries(varGroups)) {
    if (+groupIndex % 2 === 1 || +groupIndex === varGroups.length - 1) continue
    const nextGroup = varGroups[+groupIndex + 1]
    for (const key of Object.keys(nextGroup)) {
      delete varGroups[groupIndex][key]
    }
  }

  // groups cannot share variables, they must be distinct
  console.log(`${varGroups.length} groups`)
  const globalVars = {}
  for (const [key, g] of Object.entries(varGroups)) {

    for (const [keyInternal, gInternal] of Object.entries(varGroups)) {
      if (key === keyInternal) continue
      let count = 0
      for (const k of Object.keys(g)) {
        if (gInternal[k]) {
          globalVars[k] = true
          count++
          // console.log(k)
        }
      }
      // if (count > 0) console.log(`group ${key} overlap ${keyInternal} n: ${count}`)
    }
  }
  console.log(`${Object.keys(globalVars).length} globals`)
  for (const g of varGroups) {
    for (const k of Object.keys(globalVars)) {
      delete g[k]
    }
    console.log(Object.keys(g).length)
  }

  // now determine which constraint should be applied to which trace index

  const combinedGroups = []
  for (let x = 0; x < varGroups.length - 1; x++) {
    combinedGroups.push({ ...varGroups[x], ...varGroups[x+1] })
  }

  const constraintGroupMap = {}
  for (const [key, [a, b, c]] of Object.entries(constraints)) {
    const varsNeeded = Object.keys({ ...a, ...b, ...c })
    let groupIndex = -1
    const notFound = []
    for (const [index, g] of Object.entries(combinedGroups)) {
      let groupValid = true
      for (const v of varsNeeded) {
        if (!globalVars[v] && !g[v] && v != 0) {
          notFound.push(v)
          groupValid = false
          break
        }
      }
      if (groupValid) {
        groupIndex = index
      }
    }
    if (groupIndex === -1) {
      console.log(notFound)
      throw new Error(`unable to find group for constraint ${key}`)
    }
    constraintGroupMap[key] = groupIndex
  }

  let groupSize = 0
  for (const g of varGroups) {
    groupSize = Math.max(Object.keys(g).length, groupSize)
  }
  const globalCount = Object.keys(globalVars).length
  const traceLength = varGroups.length

  const registerCount = groupSize + globalCount + traceLength
  const memory = memoryOverride ?? buildWitness(data, input)

  // initialize the trace with the selectors and globals

  // each entry of the trace consists of:
  // - traceLength selector variables
  // - globalCount signals that must be constant
  // - varGroups[i].length signals that must be unique between trace entries
  // - some number of unconstrained registers
  const trace = Array(traceLength).fill().map((_,i) => {
    const a = Array(traceLength).fill(0n)
    a[i] = 1n
    for (const v of Object.keys(globalVars)) {
      a.push(memory[v])
    }
    return a
  })

  // then add the unique signals
  for (const [i, row] of Object.entries(trace)) {
    const group = varGroups[i]
    for (const i of Object.keys(group)) {
      row.push(memory[i])
    }
    while (row.length < registerCount) {
      row.push(0n)
    }
  }

  const variables = Array(1+2*registerCount)
    .fill()
    .map((_, i) => new MultiPolynomial(field).term({ coef: 1n, exps: { [i]: 1n }}))
  const cycleIndex = variables[0]
  const prevState = variables.slice(1, registerCount+1)
  const nextState = variables.slice(1+registerCount)

  const zero = new MultiPolynomial(field).term({ coef: 0n, exps: { [0]: 0n }})
  const one = new MultiPolynomial(field).term({ coef: 1n, exps: { [0]: 0n }})
  const constant = (v) => new MultiPolynomial(field).term({ coef: v, exps: { [0]: 0n }})

  const varByIndex = (i) => {
    if (i < registerCount) {
      return nextState[i]
    }
    return prevState[i-registerCount]
  }

  const varAtTraceIndex = (varIndex, traceIndex) => {
    if (varIndex == 0) {
      return one
    }
    const prevVars = Object.keys(varGroups[traceIndex])
    const nextVars = Object.keys(varGroups[traceIndex+1])
    if (globalVars[varIndex]) {
      const globalIndex = Object.keys(globalVars).map(v => +v).indexOf(varIndex)
      if (globalIndex === -1) throw new Error(`unknown global variable`)
      return prevState[traceLength + globalIndex]
    }
    if (varGroups[traceIndex][varIndex] !== undefined) {
      const i = Object.keys(varGroups[traceIndex]).map(v => +v).indexOf(varIndex)
      if (i === -1) throw new Error('unknown variable in current row')
      return prevState[traceLength + globalCount + i]
    } else {
      const i = Object.keys(varGroups[traceIndex + 1]).map(v => +v).indexOf(varIndex)
      if (i === -1) throw new Error('unknown variable in next row')
      return nextState[traceLength + globalCount + i]
    }
  }

  const starkConstraints = []

  for (const [cKey, [a, b, c]] of Object.entries(constraints)) {
    const traceIndex = constraintGroupMap[cKey]
    const aPoly = zero.copy()
    for (const [key, value] of Object.entries(a)) {
      const coef = new MultiPolynomial(field).term({ coef: value, exps: { [0]: 0n }})
      aPoly.add(one.copy().mul(varAtTraceIndex(+key, +traceIndex)).mul(coef))
    }
    const bPoly = zero.copy()
    for (const [key, value] of Object.entries(b)) {
      const coef = new MultiPolynomial(field).term({ coef: value, exps: { [0]: 0n }})
      bPoly.add(one.copy().mul(varAtTraceIndex(+key, +traceIndex)).mul(coef))
    }
    const cPoly = zero.copy()
    for (const [key, value] of Object.entries(c)) {
      const coef = new MultiPolynomial(field).term({ coef: value, exps: { [0]: 0n }})
      cPoly.add(one.copy().mul(varAtTraceIndex(+key, +traceIndex)).mul(coef))
    }

    const constraint = aPoly.copy().mul(bPoly).sub(cPoly)
    // multiply by the selector
    constraint.mul(prevState[traceIndex])
    starkConstraints.push(constraint)
  }

  // constrain the selector values
  // - constrain that the value is either 0 or 1
  // - constrain that the value is 1 at the target index and 0 elsewhere
  for (let x = 0; x < traceLength; x++) {
    // 0 or 1
    starkConstraints.push(prevState[x].copy().mul(prevState[x]).sub(prevState[x]))
    // 1 at target index only
    starkConstraints.push(cycleIndex.copy().sub(constant(BigInt(x))).mul(prevState[x]))
  }

  // constrain that the globals don't change
  for (let x = 0; x < globalCount; x++) {
    starkConstraints.push(prevState[x + traceLength].copy().sub(nextState[x + traceLength]))
  }

  // where in the memory the public inputs start
  const pubInputsOffset = 1 + nOutputs
  return {
    constraints: starkConstraints,
    // boundary: memory.slice(pubInputsOffset, pubInputsOffset+nPubInputs).map((val, i) => [1, i+pubInputsOffset, val]),
    boundary: Array(traceLength).fill().map((_,i) => [i, i, 1n]),
    // boundary: [[0,0,1n]],
    trace,
    program: {
      registerCount,
    }
  }
}
