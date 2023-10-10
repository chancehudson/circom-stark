import { readR1cs } from 'r1csfile'
import { ScalarField } from 'starkstark/src/ScalarField.mjs'
import { MultiPolynomial } from 'starkstark/src/MultiPolynomial.mjs'
import { Polynomial } from 'starkstark/src/Polynomial.mjs'

function buildWitness(data, input = [], baseField) {
  const {
    nOutputs,
    nPubInputs,
    nPrvInputs,
    nVars
  } = data
  const vars = Array(nVars).fill(null)
  vars[0] = 1n
  for (let x = 0; x < nPubInputs + nPrvInputs; x++) {
    vars[1+nOutputs+x] = input[x]
  }
  const constraints = []
  for (const constraint of data.constraints) {
    const [a, b, c] = constraint
    const polyA = new MultiPolynomial(baseField)
    for (const [key, val] of Object.entries(a)) {
      polyA.term({ coef: val, exps: { [Number(key)]: 1n } })
    }
    const polyB = new MultiPolynomial(baseField)
    for (const [key, val] of Object.entries(b)) {
      polyB.term({ coef: val, exps: { [Number(key)]: 1n } })
    }
    const polyC = new MultiPolynomial(baseField)
    for (const [key, val] of Object.entries(c)) {
      polyC.term({ coef: val, exps: { [Number(key)]: 1n } })
    }
    const finalPoly = polyA.copy().mul(polyB).sub(polyC)
    constraints.push(finalPoly)
  }
  while (vars.indexOf(null) !== -1) {
    let solvedCount = 0
    for (const constraint of constraints) {
      let unknownVars = []
      for (const [key, coef] of constraint.expMap.entries()) {
        const v = MultiPolynomial.expStringToVector(key)
        for (const [varIndex, degree] of Object.entries(v)) {
          if (degree > 0n && vars[+varIndex] === null && unknownVars.indexOf(+varIndex) === -1) {
            unknownVars.push(+varIndex)
          }
        }
      }
      if (unknownVars.length >= 2 || unknownVars.length === 0) continue
      // otherwise solve
      const cc = constraint.copy()
      for (const [i, v] of Object.entries(vars)) {
        if (v === null) continue
        cc.evaluateSingle(BigInt(v), Number(i))
      }
      if (cc.expMap.size !== 2) {
        throw new Error('expected exactly 2 remaining terms')
      }
      if (!cc.expMap.has('0')) {
        throw new Error('exactly one term should be a constant')
      }
      const _expKey = Array(unknownVars[0]).fill(0n)
      _expKey.push(1n)
      const expKey = MultiPolynomial.expVectorToString(_expKey)
      if (!cc.expMap.has(expKey)) {
        throw new Error('cannot find remaining variable')
      }
      const out = cc.field.div(cc.field.neg(cc.expMap.get('0')), cc.expMap.get(expKey))
      vars[unknownVars[0]] = out
      solvedCount++
    }
    if (solvedCount === 0)
      throw new Error('Unable to solve for remaining variables')
  }
  return vars
}

export async function compileR1cs(file, input = [], memoryOverride) {
  const data = await readR1cs(file)
  const {
    prime,
    constraints,
    nOutputs,
    nPubInputs,
    nPrvInputs,
    nVars
  } = data
  const baseField = new ScalarField(prime)
  const memory = memoryOverride ? memoryOverride : buildWitness(data, input, baseField)
  const negOne = baseField.neg(1n)
  // order of variables
  // ONE, outputs, pub inputs, prv inputs
  // for all entries in the r1cs we must prove that ab - c = 0
  // where a, b, c are each linear combinations
  // more here https://github.com/iden3/r1csfile/blob/master/doc/r1cs_bin_format.md

  // variables are laid out in memory from 0-(nVars-1)
  // after that are scratch0, scratch1, scratch2, scratch3
  const scratch0 = `0x${nVars.toString(16)}`
  const scratch1 = `0x${(nVars+1).toString(16)}`
  const scratch2 = `0x${(nVars+2).toString(16)}`
  const scratch3 = `0x${(nVars+3).toString(16)}`

  const asm = []
  for (const [i, v] of Object.entries(memory)) {
    asm.push(`set 0x${i.toString(16)} ${v}`)
  }
  for (const [a, b, c] of constraints) {
    // each are objects
    asm.push(...sum(scratch0, scratch1, a, negOne))
    asm.push(...sum(scratch0, scratch2, b, negOne))
    asm.push(...sum(scratch0, scratch3, c, negOne))

    asm.push(`mul ${scratch0} ${scratch1} ${scratch2}`)
    asm.push(`set ${scratch1} 0`)
    asm.push(`neg ${scratch3} ${scratch3}`)
    asm.push(`add ${scratch0} ${scratch0} ${scratch3}`)
    asm.push(`eq ${scratch0} ${scratch1}`)
  }
  return asm.join('\n')

}

function sum(scratch0, scratch, map, negOne) {
  if (Object.keys(map).length === 0) {
    return [`set ${scratch} 0`]
  }
  const out = []
  out.push(`set ${scratch} 0`)
  for (let x = 0; x < Object.keys(map).length; x++) {
    const key = Object.keys(map)[x]
    const val = map[key]
    if (val !== negOne) {
      out.push(`set ${scratch0} ${val}`)
      out.push(`mul ${scratch0} ${scratch0} ${key}`)
    } else {
      out.push(`neg ${scratch0} ${key}`)
    }
    out.push(`add ${scratch} ${scratch} ${scratch0}`)
  }
  return out
}

