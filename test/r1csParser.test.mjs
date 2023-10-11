import test from 'ava'
import fs from 'fs/promises'
import { R1CS } from '../src/r1csParser.mjs'
import { readR1cs } from 'r1csfile'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

test('should parse r1cs and match r1csfile parsing for real circuit', async t => {
  const file = path.join(__dirname, 'epochKeyLite_main.r1cs')
  const data = await readR1cs(file)
  const r1csData = await fs.readFile(file)
  const r = new R1CS(r1csData.buffer)
  r.parse()

  t.is(r.data.nWires, data.nVars)
  t.is(r.data.nVars, data.nVars)
  t.is(r.data.prime, data.prime)
  t.is(r.data.nOutputs, data.nOutputs)
  t.is(r.data.nPrvInputs, data.nPrvInputs)
  t.is(r.data.nPubInputs, data.nPubInputs)
  // we're going to discard the labels
  // the r1csfile label parsing seems to be bugged
  // t.is(r.data.nLabels, data.nLabels)
  t.is(r.data.nConstraints, data.nConstraints)
  for (let x = 0; x < r.data.nConstraints; x++) {
    for (let y = 0; y < 3; y++) {
      // check that number of terms matches
      t.is(Object.keys(r.data.constraints[x][y]).length, Object.keys(data.constraints[x][y]).length)
      // check that each variable id and constant match
      for (const key of Object.keys(r.data.constraints[x][y])) {
        t.is(r.data.constraints[x][y][key], data.constraints[x][y][key])
      }
    }
  }
})

test('should parse r1cs and match r1csfile parsing for example circuit', async t => {
  const file = path.join(__dirname, 'example.r1cs')
  const data = await readR1cs(file)
  const r1csData = await fs.readFile(file)
  const r = new R1CS(r1csData.buffer)
  r.parse()

  t.is(r.data.nWires, data.nVars)
  t.is(r.data.nVars, data.nVars)
  t.is(r.data.prime, data.prime)
  t.is(r.data.nOutputs, data.nOutputs)
  t.is(r.data.nPrvInputs, data.nPrvInputs)
  t.is(r.data.nPubInputs, data.nPubInputs)
  // we're going to discard the labels
  // the r1csfile label parsing seems to be bugged
  // t.is(r.data.nLabels, data.nLabels)
  t.is(r.data.nConstraints, data.nConstraints)
  for (let x = 0; x < r.data.nConstraints; x++) {
    for (let y = 0; y < 3; y++) {
      // check that number of terms matches
      t.is(Object.keys(r.data.constraints[x][y]).length, Object.keys(data.constraints[x][y]).length)
      // check that each variable id and constant match
      for (const key of Object.keys(r.data.constraints[x][y])) {
        t.is(r.data.constraints[x][y][key], data.constraints[x][y][key])
      }
    }
  }
})
