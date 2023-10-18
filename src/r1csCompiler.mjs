import { ScalarField } from 'starkstark/src/ScalarField.mjs'
import { R1CS } from '../src/r1csParser.mjs'
import { buildWitness } from './witnessBuilder.mjs'

export async function compileR1cs(buffer, input = [], memoryOverride) {
  const r = new R1CS(buffer)
  const {
    prime,
    constraints,
    nOutputs,
    nPubInputs,
    nPrvInputs,
    nVars
  } = r.data
  const baseField = new ScalarField(prime)
  const memory = memoryOverride ? memoryOverride : (await buildWitness(r.data, input))
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
  console.log(`Proving ${asm.length} steps with ${memory.length} memory slots`)
  await new Promise(r => setTimeout(r, 100))
  return asm.join('\n')
}

// mulsum - multiply 2 numbers and add them to a third register
// abc - constrain 3 registers to a*b - c = 0

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

