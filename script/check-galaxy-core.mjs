import crypto, { webcrypto } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  GALAXY_LENS_PROFILES,
  GALAXY_PUBLIC_CONTRACT,
  buildGalaxyGeometry,
  galaxyDivisionVisualRadius,
  galaxyPointerPolicy,
  galaxyRenderState,
  placeCanvasLabel,
  projectGalaxyPoint,
  resolveGalaxySelection,
  selectGalaxyHit,
  snapshotFreshness,
  snapshotResponseCanCommit,
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
assert(
  JSON.stringify(Object.keys(GALAXY_LENS_PROFILES)) === JSON.stringify(GALAXY_PUBLIC_CONTRACT.lensNames),
  "galaxy lens roster drifted",
);

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

const badCardinality = clone(facts);
badCardinality.hiveAi.neurons = 600;
badCardinality.hiveAi.trainableNeurons = 408;
badCardinality.hiveAi.divisions = 15;
badCardinality.hiveAi.families = 60;
badCardinality.hiveAi.notPurposeMastered = 44;
badCardinality.galaxy.representedNeurons = 600;
badCardinality.galaxy.divisions.pop();
badCardinality.galaxy.projectionHash = projectionHash(badCardinality.galaxy);
assert(!await validSnapshot(badCardinality), "runtime validator accepted a self-consistent non-640 projection");

const badCapturedAt = clone(facts);
badCapturedAt.capturedAt = "not-a-time";
assert(!await validSnapshot(badCapturedAt), "runtime validator accepted a malformed capture timestamp");

const futureCapturedAt = clone(facts);
futureCapturedAt.capturedAt = "2999-01-01T00:00:00Z";
assert(!await validSnapshot(futureCapturedAt), "runtime validator accepted a far-future capture timestamp");

const touchIdle = galaxyPointerPolicy("touch", false);
const touchEngaged = galaxyPointerPolicy("touch", true);
const mouseIdle = galaxyPointerPolicy("mouse", false);
assert(!touchIdle.engage && !touchIdle.focusCanvas && !touchIdle.orbitAllowed, "idle touch stole page-scroll ownership");
assert(!touchEngaged.engage && touchEngaged.focusCanvas && touchEngaged.orbitAllowed, "engaged touch cannot orbit");
assert(mouseIdle.engage && mouseIdle.focusCanvas && mouseIdle.orbitAllowed, "mouse pointer cannot engage galaxy controls");

const normalRender = galaxyRenderState({ hasContext: true, hasResizeObserver: true, forcedColorsActive: false });
const contrastRender = galaxyRenderState({ hasContext: true, hasResizeObserver: true, forcedColorsActive: true });
const missingCanvas = galaxyRenderState({ hasContext: false, hasResizeObserver: true, forcedColorsActive: false });
assert(normalRender.renderAvailable && normalRender.reasonCode === "READY", "normal render state rejected");
assert(!contrastRender.renderAvailable && contrastRender.reasonCode === "FORCED_COLORS", "forced-colors fallback state rejected");
assert(!missingCanvas.baseAvailable && missingCanvas.reasonCode === "CANVAS_UNAVAILABLE", "missing-canvas fallback state rejected");

assert(snapshotResponseCanCommit({ requestGeneration: 7, currentGeneration: 7 }), "current snapshot response rejected");
assert(!snapshotResponseCanCommit({ requestGeneration: 6, currentGeneration: 7 }), "stale snapshot response accepted");
assert(!snapshotResponseCanCommit({ requestGeneration: 7, currentGeneration: 7, aborted: true }), "aborted snapshot response accepted");
const freshnessNow = Date.parse("2026-08-04T21:00:00Z");
assert(snapshotFreshness("2026-08-04T20:50:00Z", freshnessNow).state === "current", "current snapshot marked delayed");
assert(snapshotFreshness("2026-08-04T20:30:00Z", freshnessNow).state === "delayed", "delayed snapshot marked current");
assert(snapshotFreshness("2026-08-04T19:00:00Z", freshnessNow).state === "critical", "critical snapshot age hidden");
assert(snapshotFreshness("not-a-date", freshnessNow).state === "invalid", "invalid snapshot time accepted");
assert(snapshotFreshness("2999-01-01T00:00:00Z", freshnessNow).state === "invalid", "far-future snapshot marked current");
assert(snapshotFreshness("2026-08-04T21:04:00Z", freshnessNow).state === "current", "bounded clock skew rejected");

const occupied = [];
const firstLabel = placeCanvasLabel(80, 18, -100, -100, 320, 180, occupied, true);
const secondLabel = placeCanvasLabel(80, 18, -100, -100, 320, 180, occupied, true);
assert(firstLabel?.x >= 5 && firstLabel?.y >= 5, "label placement escaped canvas bounds");
assert(secondLabel && (secondLabel.x !== firstLabel.x || secondLabel.y !== firstLabel.y), "priority labels overlap instead of searching alternatives");
assert(placeCanvasLabel(80, 18, 20, 20, 320, 180, [{ x: 0, y: 0, width: 320, height: 180 }], true) === null, "exhausted label placement did not fail closed");

const oneDivision = [{ x: 0, y: 0, z: 0, perspective: 1, divisionIndex: 0 }];
const masteryProfile = GALAXY_LENS_PROFILES.mastery;
const normalDivisionRadius = galaxyDivisionVisualRadius(oneDivision[0], 1, masteryProfile, false);
const selectedDivisionRadius = galaxyDivisionVisualRadius(oneDivision[0], 1, masteryProfile, true);
assert(normalDivisionRadius === 34 && selectedDivisionRadius === 48, "shared division visual radius drifted");
const normalHaloInside = selectGalaxyHit({
  pointer: { x: normalDivisionRadius - 0.1, y: 0 }, zoom: 1, lens: "mastery",
  projectedDivisions: oneDivision, projectedFamilies: [], projectedNeurons: [],
});
const normalHaloOutside = selectGalaxyHit({
  pointer: { x: normalDivisionRadius + 0.1, y: 0 }, zoom: 1, lens: "mastery",
  projectedDivisions: oneDivision, projectedFamilies: [], projectedNeurons: [],
});
const selectedHaloInside = selectGalaxyHit({
  pointer: { x: selectedDivisionRadius - 0.1, y: 0 }, zoom: 1, lens: "mastery",
  projectedDivisions: oneDivision, projectedFamilies: [], projectedNeurons: [], activeDivision: 0,
});
const selectedHaloOutside = selectGalaxyHit({
  pointer: { x: selectedDivisionRadius + 0.1, y: 0 }, zoom: 1, lens: "mastery",
  projectedDivisions: oneDivision, projectedFamilies: [], projectedNeurons: [], activeDivision: 0,
});
assert(normalHaloInside.divisionIndex === 0 && normalHaloOutside.divisionIndex === -1, "normal division hit radius diverged from the rendered halo");
assert(selectedHaloInside.divisionIndex === 0 && selectedHaloOutside.divisionIndex === -1, "selected division hit radius diverged from the rendered halo");
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
const preservedNeuron = resolveGalaxySelection({
  divisions: facts.galaxy.divisions,
  familyGeometry: geometry.familyGeometry,
  neurons: geometry.neurons,
  neuronIndexById: geometry.neuronIndexById,
  previousDivisionCode: "P",
  previousFamilyCode: "P4",
  previousNeuronId: "N640",
});
assert(geometry.neurons[preservedNeuron.activeNeuron]?.id === "N640", "neuron selection identity was not preserved");
assert(preservedNeuron.activeDivision === 15 && preservedNeuron.activeFamily === 63, "preserved neuron did not restore its parent focus");
const preservedFamily = resolveGalaxySelection({
  divisions: facts.galaxy.divisions,
  familyGeometry: geometry.familyGeometry,
  neurons: geometry.neurons,
  neuronIndexById: geometry.neuronIndexById,
  previousDivisionCode: "D",
  previousFamilyCode: "D2",
  previousNeuronId: null,
});
assert(preservedFamily.activeDivision === 3 && preservedFamily.activeFamily === 13, "family selection identity was not preserved");
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

console.log(`GALAXY_CORE_OK negative_snapshots=7 exact_centers=${checkedCenters} viewports=${viewports.length} lenses=${Object.keys(GALAXY_LENS_PROFILES).length} pointer_policies=3 render_states=3 label_cases=3 refresh_gates=3 freshness_states=6 selection_cases=2`);
