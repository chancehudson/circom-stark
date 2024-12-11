import test from "ava";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { buildWitness } from "../src/witnessBuilder.mjs";
import { R1CS } from "../src/r1csParser.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("should compile and prove unirep epoch key r1cs", async (t) => {
  const input = Array(7).fill(0n);
  const file = path.join(__dirname, "epochKeyLite_main.r1cs");
  const fileData = await fs.readFile(file);
  // const compiled = compile(fileData.buffer, input);
  const { data } = new R1CS(fileData.buffer);
  const witness = buildWitness(data, input);
  // console.log(witness);
  /// TODO: confirm the witness fulfills the r1cs
  t.pass();
});
