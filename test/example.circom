pragma circom 2.0.0;

template Example() {
  signal input a;
  // signal input b;

  signal output c;
  signal output d;

  c <== 2+a;

  d <== 9*a;

  signal f <== c * d;

}

component main { public [ a ] } = Example();

