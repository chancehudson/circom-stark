import { starkVariables, defaultStark } from 'starkstark'
import { MultiPolynomial } from 'starkstark/src/MultiPolynomial.mjs'
import { Polynomial } from 'starkstark/src/Polynomial.mjs'
import { ScalarField } from 'starkstark/src/ScalarField.mjs'

export const field = new ScalarField(
  1n + 407n * (1n << 119n),
  85408008396924667383611388730472331217n
)

// compile an assembly file to a set of STARK constraints
const validOperations = {
  set: {
    argumentCount: 2,
    opcode: 0x0,
  },
  mul: {
    argumentCount: 3,
    opcode: 0x1,
  },
  add: {
    argumentCount: 3,
    opcode: 0x2,
  },
  neg: {
    argumentCount: 2,
    opcode: 0x3,
  },
  eq: {
    argumentCount: 2,
    opcode: 0x4,
  },
  out: {
    argumentCount: 2,
    // virtual opcode not present in trace
    opcode: 0x99999999999,
  }
}

const opcodeCount = Object.keys(validOperations).length - 1

// program should be the compiled program output from `compile`
export function buildTrace(program, inputs = {}) {
  const { steps, registerCount, memoryRegisterCount, opcodeRegisterCount } = program
  const trace = []
  const memoryRegisters = Array(memoryRegisterCount).fill(0n)
  for (const { opcode, name, args } of steps) {
    if (name === 'out') continue
    const currentMemory = [...memoryRegisters]
    const read1Selector = Array(memoryRegisterCount).fill(0n)
    const read2Selector = Array(memoryRegisterCount).fill(0n)
    const outputSelector = Array(memoryRegisterCount).fill(0n)
    const opcodeSelector = Array(opcodeCount).fill(0n)
    let freeInput = 0n
    opcodeSelector[validOperations[name].opcode] = 1n
    if (name === 'set') {
      // set some dummy read registers
      read1Selector[0] = 1n
      read2Selector[0] = 1n
      // set the output register
      outputSelector[+args[0]] = 1n
      // update the memory
      if (/^\d+$/.test(args[1]) || /^0x[0-9a-fA-F]+$/.test(args[1])) {
        memoryRegisters[+args[0]] = BigInt(args[1])
        freeInput = BigInt(args[1])
      } else if (typeof inputs[args[1]] === 'bigint') {
        // consider it a named variable
        memoryRegisters[+args[0]] = inputs[args[1]]
        freeInput = inputs[args[1]]
      } else {
        throw new Error(`No input supplied for named value "${args[1]}"`)
      }
    } else if (name === 'add' || name === 'mul') {
      read1Selector[+args[1]] = 1n
      read2Selector[+args[2]] = 1n
      outputSelector[+args[0]] = 1n
      memoryRegisters[+args[0]] = field[name](memoryRegisters[+args[1]], memoryRegisters[+args[2]])
    } else if (name === 'neg') {
      read1Selector[+args[1]] = 1n
      read2Selector[0] = 1n
      outputSelector[+args[0]] = 1n
      memoryRegisters[+args[0]] = field.neg(memoryRegisters[+args[1]])
    } else if (name === 'eq') {
      read1Selector[+args[0]] = 1n
      read2Selector[+args[1]] = 1n
      // set a dummy output, this is constrained
      // to not change in the vm
      outputSelector[0] = 1n
    }
    trace.push([currentMemory, outputSelector, read1Selector, read2Selector, opcodeSelector, freeInput].flat())
  }
  trace.push([
    memoryRegisters,
    [...Array(memoryRegisterCount-1).fill(0n), 1n],
    [...Array(memoryRegisterCount-1).fill(0n), 1n],
    [...Array(memoryRegisterCount-1).fill(0n), 1n],
    [...Array(opcodeCount-1).fill(0n), 1n],
    0n
  ].flat())
  return trace
}

export function compile(asm) {
  const steps = asm
    .split('\n')
    .filter(line => {
      if (line.trim().startsWith(';')) return false
      if (line.trim().length === 0) return false
      return true
    })
    .map(line => line.trim())
    .map(line => line.split(' '))
    .map((operation, i) => {
      const commentIndex = operation.indexOf(';')
      const [ op, ...args ] = commentIndex >= 0 ? operation.slice(0, commentIndex) : operation
      if (!validOperations[op]) {
        throw new Error(`Invalid op "${op}"`)
      }
      const { opcode, argumentCount } = validOperations[op]
      if (argumentCount !== args.length) {
        throw new Error(`Invalid number of arguments for "${op}" on line ${i}. Expected ${argumentCount}, received ${args.length}`)
      }
      return {
        opcode,
        name: op,
        args,
      }
    })
  // we now have an array of opcodes and arguments
  // determine the number of memory registers that we need
  // for the steps
  let memoryRegisterCount = 0
  for (const { name, args } of steps) {
    if (name === 'set') {
      // the set operation is the only one that accepts a value as an input
      // all other operations accept register indices
      if (+args[0] > memoryRegisterCount) {
        memoryRegisterCount = +args[0]
      }
      continue
    }
    if (name === 'out') {
      if (+args[0] > memoryRegisterCount) {
        memoryRegisterCount = +args[0]
      }
      continue
    }
    for (const i of args) {
      if (+i > memoryRegisterCount) {
        memoryRegisterCount = +i
      }
    }
  }
  // convert index to length
  memoryRegisterCount++

  // the `out` opcode is not included in the trace
  const opcodeRegisterCount = opcodeCount

  // we need 3 selector values for each memory register
  // then a selector for each possible opcode
  // then a single free input register
  const registerCount = memoryRegisterCount * 4 + opcodeRegisterCount + 1
  const variables = Array(1+2*registerCount)
    .fill()
    .map((_, i) => new MultiPolynomial(field).term({ coef: 1n, exps: { [i]: 1n }}))
  const cycleIndex = variables[0]
  const prevState = variables.slice(1, registerCount+1)
  const nextState = variables.slice(1+registerCount)

  const constraints = []
  const boundary = []

  const one = new MultiPolynomial(field).term({ coef: 1n, exps: { [0]: 0n }})

  // now build the constraints

  // first we constrain each register to not change unless it's the output of an operation
  // to do this we define a constraint (a - a)(i - i_a) where a is the value in the register
  // i is the index of the register being mutated, and i_a is the index of register containing a
  // we define this constraint for each memory register
  for (let x = 0; x < memoryRegisterCount; x++) {
    const outputSelector = prevState[memoryRegisterCount + x]
    const c = prevState[x]
      .copy()
      .sub(nextState[x])
      .mul(one.copy().sub(outputSelector))
    constraints.push(c)
  }

  // now let's constraint that all selector values must be either 0 or 1
  for (let x = memoryRegisterCount; x < memoryRegisterCount * 4 + opcodeRegisterCount; x++) {
    // x^2 - x constrains x to be either 0 or 1
    // e.g. 0^2 - 0 = 0 and 1^2 - 1 = 0
    // but 2^2 - 2 != 0
    const c = prevState[x].copy().mul(prevState[x]).sub(prevState[x])
    constraints.push(c)
  }

  // now let's constrain that for each selector range there is only one
  // 1 (selecting a certain register)
  for (let x = 1; x < 4; x++) {
    const c = new MultiPolynomial(field)
    for (let y = 0; y < memoryRegisterCount; y++) {
      c.add(prevState[x*memoryRegisterCount + y])
    }
    c.sub(one)
    constraints.push(c)
  }

  const opcodeC = new MultiPolynomial(field)
  for (let x = 4*memoryRegisterCount; x < 4*memoryRegisterCount + opcodeRegisterCount; x++) {
    opcodeC.add(prevState[x])
  }
  opcodeC.sub(one)
  constraints.push(opcodeC)

  // now build individual operation constraints

  const freeInRegister = prevState[4*memoryRegisterCount+opcodeRegisterCount]

  const read1 = new MultiPolynomial(field)
  const read2 = new MultiPolynomial(field)
  const outputLast = new MultiPolynomial(field)
  const output = new MultiPolynomial(field)
  for (let x = 0; x < memoryRegisterCount; x++) {
    output.add(nextState[x].copy().mul(prevState[memoryRegisterCount + x]))
    outputLast.add(prevState[x].copy().mul(prevState[memoryRegisterCount + x]))
    read1.add(prevState[x].copy().mul(prevState[2*memoryRegisterCount + x]))
    read2.add(prevState[x].copy().mul(prevState[3*memoryRegisterCount + x]))
  }

  // now write the constraints for each operator

  // just constrain that the free input and output registers are equal
  const set = freeInRegister.copy().sub(output)
  constraints.push(set.copy().mul(prevState[4*memoryRegisterCount+validOperations['set'].opcode]))

  const add = read1.copy().add(read2).sub(output)
  constraints.push(add.copy().mul(prevState[4*memoryRegisterCount+validOperations['add'].opcode]))

  const neg = read1.copy().add(output)
  constraints.push(neg.copy().mul(prevState[4*memoryRegisterCount+validOperations['neg'].opcode]))

  // this constraint is degree 5!
  // TODO: possibly use the free input register to reduce this
  const mul = read1.copy().mul(read2).sub(output)
  constraints.push(mul.copy().mul(prevState[4*memoryRegisterCount+validOperations['mul'].opcode]))

  const eq = read1.copy().sub(read2)
  constraints.push(eq.copy().mul(prevState[4*memoryRegisterCount+validOperations['eq'].opcode]))

  // for the equality operation constrain that the output doesn't change
  // because we're not using it
  const eq2 = output.copy().sub(outputLast)
  constraints.push(eq2.copy().mul(prevState[4*memoryRegisterCount+validOperations['eq'].opcode]))

  // we now have our transition constraints
  // we need to build boundary constraints

  // we'll constrain each step in the trace depending on the opcode
  // TODO: build a polynomial for each opcode selector by summing values
  // using cycle index, e.g. if we want to active on cycle 2, and 3
  // v[0] + v[1] + v[2](cycleIndex - 2) + v[3](cycleIndex - 3)
  let step = 0
  for (const { opcode, name, args } of steps) {
    if (name === 'out') {
      // create a boundary constraint
      // TODO: support named variables
      boundary.push([step, +args[0], BigInt(args[1])])
      continue
    }
    boundary.push([step, 4*memoryRegisterCount+opcode, 1n])
    step++
  }
  boundary.push([step, 4*memoryRegisterCount+opcodeRegisterCount-1, 1n])

  // we now have a constraint system for a simple VM

  return {
    constraints,
    boundary,
    program: { steps, registerCount, memoryRegisterCount, opcodeRegisterCount }
  }
}
