# circom-stark [![CircleCI](https://img.shields.io/circleci/build/github/vimwitch/circom-stark/main)](https://app.circleci.com/pipelines/github/vimwitch/circom-stark)

A lightweight turing-incomplete assembly language for STARK proofs. Designed to express r1cs proofs in STARKs.

## Syntax

Each line of a circuitvm `asm` file should contain an opcode, followed by registers to operate on. Each argument should be separated by exactly 1 space. Numbers may be prefixed by `0x` for hex, or written normally for decimal.

Lines starting with `;` or containing only whitespace are ignored.

## Opcodes

`set` - Store a value in a register. No assertion is made about the previous value. `value` may be a named variable accepted as an argument during compilation.

```
# set {register} {value}
set 0x0 0x1920490
set 0x1 secret_input
```

`add` - Add two registers together, store the result in a third register. Output register may be one of the input registers (e.g. overwrite the previous value).

```
# add {output_register} {register1} {register2}
add 0x2 0x0 0x1
```

`mul` - Multiply two registers, store the result in a third register. Output register may be one of the input registers (e.g. overwrite the previous value).

```
# mul {output_register} {register1} {register2}
mul 0x2 0x0 0x1
```

`neg` - Negate a value in a register, store the result in an output register. Output register may be the input register (e.g. negate in place).

```
# neg {output} {register}
neg 0x1 0x0
```

`eq` - Assert equality of two registers. The output register is implicity `F_p - 1` indicating that no register in the trace should be mutated.

```
# eq {register1} {register2}
eq 0x0 0x1
```

`out` - Create a boundary constraint for a register publicly constraining a value. This is analogous to a public signal.

```
# out {register} {value}
out 0x1 0x1000100001
```
