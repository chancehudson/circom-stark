# circom-stark [![CircleCI](https://img.shields.io/circleci/build/github/vimwitch/circom-stark/main)](https://app.circleci.com/pipelines/github/vimwitch/circom-stark)

A binding to make R1CS proofs using [rstark](https://github.com/vimwitch/rstark).

## About

R1CS proofs are based on sets of constraints of the form `A*B - C = 0` where `A`, `B`, and `C` are scalar sums. We can take such a system and reduce it to a single constraint using a random linear combination. This reduces to a STARK proof with trace length 1 and 1 constraint. The proof speed is limited by the total number of variables (aka signals) in the R1CS.
