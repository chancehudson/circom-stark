import { readR1cs } from 'r1csfile'

export function parseBigint(v) {
  let out = 0n
  for (let x = 0; x < v.length; x++) {
    out += 2n**BigInt(x) * BigInt(v[x])
  }
  return out
}

const negOne = BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495616')

export async function compileR1cs(file, memory = []) {
  const {
    constraints,
    nOutputs,
    nPubInputs,
    nPrvInputs,
    nVars
  } = await readR1cs(file)
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
    asm.push(...sum(scratch0, scratch1, a))
    asm.push(...sum(scratch0, scratch2, b))
    asm.push(...sum(scratch0, scratch3, c))

    asm.push(`mul ${scratch0} ${scratch1} ${scratch2}`)
    asm.push(`set ${scratch1} 0`)
    asm.push(`neg ${scratch3} ${scratch3}`)
    asm.push(`add ${scratch0} ${scratch0} ${scratch3}`)
    asm.push(`eq ${scratch0} ${scratch1}`)
  }
  return asm.join('\n')
}

function sum(scratch0, scratch, map) {
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
