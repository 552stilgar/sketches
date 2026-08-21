// compiler: repo.json (RepoGraph) -> city.json (CityModel)
//
// Contract: docs/CONTRACT-city-json.md. Implementation lane fills this in.
//
// MUST be a pure function of `graph` — no Date.now(), no Math.random(), no dependence on
// object-key insertion order or Set/Map iteration order. See
// tests/compiler-determinism.test.ts and tests/compiler-layout.test.ts for the exact
// behavioral gates this has to satisfy: byte-identical repeat output, unrelated buildings never
// move when one file's metrics change, no AABB overlaps, every building inside a district, every
// road resolves to a real building id, and the LOD table (fixed, see the contract doc).

import type { RepoGraph, CityModel } from "../types.ts";

export function compileCity(graph: RepoGraph): CityModel {
  throw new Error("NotImplemented");
}
