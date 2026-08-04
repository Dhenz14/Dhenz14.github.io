import crypto, { webcrypto } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  GALAXY_LENS_PROFILES,
  buildGalaxyGeometry,
  projectGalaxyPoint,
  selectGalaxyHit,
  validSnapshot,
} from "../hub-assets/galaxy-core.mjs";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const facts = JSON.parse(fs.readFileSync(path.join(root, "hub-assets", "hub-facts.json"), "utf8"));
const clone = (value) => structuredClone(value);
const projectionHash = (galaxy) => {
  const { projectionHash: _ignored, ...projection } = galaxy;
  return crypto.createHash("sha256").update(JSON.stringify(projection)).digest("hex");
};
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

assert(await validSnapshot(facts), "checked-in public snapshot rejected by runtime validator");

const badHash = clone(facts);
badHash.galaxy.projectionHash = "0".repeat(64);
assert(!await validSnapshot(badHash), "runtime validator accepted a bad projection hash");

const badGraphBinding = clone(facts);
badGraphBinding.galaxy.sourceGraphHash = "1".repeat(64);
badGraphBinding.galaxy.projectionHash = projectionHash(badGraphBinding.galaxy);
assert(!await validSnapshot(badGraphBinding), "runtime validator accepted a mismatched source graph hash");

const badDivisionOrder = clone(facts);
badDivisionOrder.galaxy.divisions.reverse();
badDivisionOrder.galaxy.projectionHash = projectionHash(badDivisionOrder.galaxy);
assert(!await validSnapshot(badDivisionOrder), "runtime validator accepted reversed division identity");

const badFamilyOrder = clone(facts);
badFamilyOrder.galaxy.divisions[0].families.reverse();
badFamilyOrder.galaxy.projectionHash = projectionHash(badFamilyOrder.galaxy);
assert(!await validSnapshot(badFamilyOrder), "runtime validator accepted reversed family identity");

const oneDivision = [{ x: 0, y: 0, z: 0, perspective: 1, divisionIndex: 0 }];
const masteryHaloHit = selectGalaxyHit({
  pointer: { x: 35, y: 0 }, zoom: 1, lens: "mastery",
  projectedDivisions: oneDivision, projectedFamilies: [], projectedNeurons: [],
});
const productHaloHit = selectGalaxyHit({
  pointer: { x: 35, y: 0 }, zoom: 1, lens: "product",
  projectedDivisions: oneDivision, projectedFamilies: [], projectedNeurons: [],
});
assert(masteryHaloHit.divisionIndex === -1 && productHaloHit.divisionIndex === 0, "lens-scaled division hit radius is not aligned with its rendered halo");

const geometry = buildGalaxyGeometry(facts.galaxy.divisions);
const viewports = [
  { name: "desktop", width: 1000, height: 800 },
  { name: "mobile", width: 390, height: 544 },
];
let checkedCenters = 0;

for (const viewport of viewports) {
  for (const lens of Object.keys(GALAXY_LENS_PROFILES)) {
    const project = (points, zoom) => points.map((point) => projectGalaxyPoint(point, {
      rotationX: -0.08,
      rotationY: -0.32,
      zoom,
      width: viewport.width,
      height: viewport.height,
    }));

    const projectedDivisions = project(geometry.divisionGeometry, 0.9);
    for (const [index, point] of projectedDivisions.entries()) {
      const hit = selectGalaxyHit({
        pointer: point,
        zoom: 0.9,
        lens,
        projectedDivisions,
        projectedFamilies: [],
        projectedNeurons: [],
      });
      assert(hit.divisionIndex === index, `${viewport.name}/${lens}: division center ${index} resolved ${hit.divisionIndex}`);
      checkedCenters += 1;
    }

    const projectedFamilies = project(geometry.familyGeometry, 1.5);
    for (const [index, point] of projectedFamilies.entries()) {
      const hit = selectGalaxyHit({
        pointer: point,
        zoom: 1.5,
        lens,
        projectedDivisions: project(geometry.divisionGeometry, 1.5),
        projectedFamilies,
        projectedNeurons: [],
      });
      assert(hit.familyIndex === index, `${viewport.name}/${lens}: family center ${index} resolved ${hit.familyIndex}`);
      checkedCenters += 1;
    }

    const projectedNeurons = project(geometry.neurons, 2.15);
    for (const [index, point] of projectedNeurons.entries()) {
      const hit = selectGalaxyHit({
        pointer: point,
        zoom: 2.15,
        lens,
        projectedDivisions: project(geometry.divisionGeometry, 2.15),
        projectedFamilies: project(geometry.familyGeometry, 2.15),
        projectedNeurons,
      });
      assert(hit.neuronIndex === index, `${viewport.name}/${lens}: neuron ${point.id} resolved ${hit.neuronIndex}`);
      checkedCenters += 1;
    }
  }
}

console.log(`GALAXY_CORE_OK negative_snapshots=4 exact_centers=${checkedCenters} viewports=${viewports.length} lenses=${Object.keys(GALAXY_LENS_PROFILES).length}`);
