import { ScalarField } from "starkstark/src/ScalarField.mjs";
import { MultiPolynomial } from "starkstark/src/MultiPolynomial.mjs";
import { Polynomial } from "starkstark/src/Polynomial.mjs";

// data: the parsed R1CS data
// input: the private and public input values, in that order
//
// take only the input variables and solve a system of
// equations (the constraints) to return a complete witness
//
// TODO: exploit structure of the constraint to solve more efficiently
// when possible
export function buildWitness(data, input = [], circuitName) {
  const baseField = new ScalarField(data.prime);
  const { nOutputs, nPubInputs, nPrvInputs, nVars } = data;
  const vars = Array(nVars).fill(null);
  vars[0] = 1n;
  for (let x = 0; x < nPubInputs + nPrvInputs; x++) {
    vars[1 + nOutputs + x] = input[x];
  }
  const constraints = [];
  // turn the raw constraints into multivariate polynomials
  for (const constraint of data.constraints) {
    const [a, b, c] = constraint;
    const polyA = new MultiPolynomial(baseField);
    for (const [key, val] of Object.entries(a)) {
      polyA.term({ coef: val, exps: { [Number(key)]: 1n } });
    }
    const polyB = new MultiPolynomial(baseField);
    for (const [key, val] of Object.entries(b)) {
      polyB.term({ coef: val, exps: { [Number(key)]: 1n } });
    }
    const polyC = new MultiPolynomial(baseField);
    for (const [key, val] of Object.entries(c)) {
      polyC.term({ coef: val, exps: { [Number(key)]: 1n } });
    }
    const finalPoly = polyA.copy().mul(polyB).sub(polyC);
    finalPoly.originalConstraint = constraint;
    constraints.push(finalPoly);
  }
  // build a map of what constraints need what variables
  for (const [i, constraint] of Object.entries(constraints)) {
    const unknownVars = [];
    const unknownVarsMap = {};
    constraint.vars = [];
    const [a, b, c] = constraint.originalConstraint;
    for (const obj of [a, b, c].flat()) {
      for (const key of Object.keys(obj)) {
        constraint.vars[+key] = true;
      }
    }
  }
  const allConstraints = [...constraints];
  // iterate over the set of constraints
  // look for constraints that have only 1 unknown
  // and solve for that unknown
  // then iterate again
  // repeat until all variables are known
  while (vars.indexOf(null) !== -1) {
    const solved = [];
    // determine what variables are unknown. If there is not
    // exactly 1 unknown then skip
    for (const [key, constraint] of Object.entries(constraints)) {
      const unknownVarsMap = {};
      for (const [varIndex] of Object.entries(constraint.vars)) {
        if (vars[varIndex] === null) {
          unknownVarsMap[varIndex] = true;
          if (Object.keys(unknownVarsMap).length > 1) {
            break;
          }
        }
      }
      const unknownVars = Object.keys(unknownVarsMap).map((v) => +v);
      if (unknownVars.length >= 2 || unknownVars.length === 0) continue;
      // otherwise solve
      const cc = constraint.copy();
      cc.evaluatePartial(vars);
      // we should end up with either
      // 0 = x + c
      // or
      // 0 = x^2 + x
      // or a constraint with c = 0
      // in which case we solve a and b
      let out;

      if (circuitName == "bits") {
        out = num2Bits(vars, unknownVars, cc, constraint, baseField);
      } else {
        out = bruteForce(vars, unknownVars, cc, constraint, baseField);
        vars[unknownVars[0]] = out;
      }

      solved.push(constraint);
    }
    for (const c of solved) {
      const i = constraints.indexOf(c);
      constraints.splice(i, 1);
    }
    if (solved.length === 0)
      throw new Error("Unable to solve for remaining variables");
  }
  // attempt to evaluate the constraints using the provided inputs
  for (const c of allConstraints) {
    if (c.evaluate(vars) !== 0n) {
      throw new Error("invalid inputs");
    }
  }
  return vars;
}

const num2Bits = (vars, unknownVars, cc, constraint, baseField) => {
  const sol = vars[vars.length - 1];
  for (let x = 0; x < vars.length - 2; x++) {
    vars[x + 1] = BigInt(((1n << BigInt(x)) & sol) != 0 ? 1n : 0n);
    unknownVars[x + 1] = false;
  }
  return bruteForce(vars, unknownVars, cc, constraint, baseField);
};

const bruteForce = (vars, unknownVars, cc, constraint, baseField) => {
  let out;
  if (cc.expMap.size === 3) {
    const [a, b, c] = constraint.originalConstraint;
    // check that c = 0
    if (Object.keys(c).length !== 0) {
      throw new Error("expected c = 0 in quadratic polynomial constraint");
    }
    // solve for the unknown in a and b
    const polyA = new Polynomial(baseField);
    const polyB = new Polynomial(baseField);
    for (const [key, val] of Object.entries(a)) {
      if (+unknownVars[0] === +key) {
        polyA.term({ coef: val, exp: 1n });
      } else {
        polyA.term({ coef: baseField.mul(val, vars[+key]), exp: 0n });
      }
    }
    for (const [key, val] of Object.entries(b)) {
      if (+unknownVars[0] === +key) {
        polyB.term({ coef: val, exp: 1n });
      } else {
        polyB.term({ coef: baseField.mul(val, vars[+key]), exp: 0n });
      }
    }
    out = polyA.solve() ?? polyB.solve();
  } else {
    const _expKey = Array(unknownVars[0]).fill(0n);
    _expKey.push(1n);
    const expKey = MultiPolynomial.expVectorToString(_expKey);
    if (cc.expMap.size !== 2) {
      throw new Error("expected exactly 2 remaining terms");
      return;
    }
    if (!cc.expMap.has(expKey)) {
      throw new Error("cannot find remaining variable");
    }
    if (cc.expMap.has(expKey.replace("1", "2"))) {
      // we're in the case of 0 = x^2 + x
      // reduce by dividing an x out
      cc.expMap.set("0", cc.expMap.get(expKey));
      cc.expMap.set(expKey, cc.expMap.get(expKey.replace("1", "2")));
      cc.expMap.delete(expKey.replace("1", "2"));
    }
    if (!cc.expMap.has("0")) {
      throw new Error("exactly one term should be a constant");
    }
    out = cc.field.div(cc.field.neg(cc.expMap.get("0")), cc.expMap.get(expKey));
  }
  return out;
};
