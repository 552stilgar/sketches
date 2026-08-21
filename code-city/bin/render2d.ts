#!/usr/bin/env node
// usage: node --experimental-strip-types bin/render2d.ts <city.json> <output.svg>
import { readFileSync, writeFileSync } from "node:fs";
import { render2d } from "../src/renderer/svg.ts";
import { validateCity } from "../src/types.ts";
import type { CityModel } from "../src/types.ts";

function main(): void {
  const [, , inPath, outPath] = process.argv;
  if (!inPath || !outPath) {
    console.error("usage: node bin/render2d.ts <city.json> <output.svg>");
    process.exit(1);
  }

  const city = JSON.parse(readFileSync(inPath, "utf-8")) as CityModel;
  const check = validateCity(city);
  if (!check.ok) {
    console.error("input city.json is invalid:");
    for (const e of check.errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  const svg = render2d(city);
  writeFileSync(outPath, svg);
  console.log(`wrote ${outPath}`);
}

try {
  main();
} catch (err: unknown) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
