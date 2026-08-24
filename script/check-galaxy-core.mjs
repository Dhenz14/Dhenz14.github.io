import crypto, { webcrypto } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  GALAXY_CANONICAL_GEOMETRY_HASH,
  GALAXY_GENERATOR_VERSION,
  GALAXY_LENS_PROFILES,
  GALAXY_OVERLAY_GAP,
  GALAXY_PUBLIC_CONTRACT,
  GALAXY_PUBLIC_PALETTES,
  GALAXY_RENDERER_CONTRACT,
  GALAXY_RENDERER_CONTRACT_HASH,
  adaptiveGalaxyDpr,
  buildPublicHandoffUrl,
  buildGalaxyGeometry,
  canonicalJson,
  depthSortGalaxyPoints,
  exactGalaxyDirectorState,
  galaxyDivisionVisualRadius,
  galaxyFocusCamera,
  galaxyOverviewCamera,
  galaxyGestureCamera,
  galaxyGestureMetrics,
  galaxyMembershipBundleGeometry,
  galaxyOverlayBoxes,
  galaxyPointerPolicy,
  galaxyRenderState,
  galaxyZoomAtPointer,
  placeCanvasLabel,
  projectGalaxyPoint,
  rectanglesIntersect,
  resolveGalaxySelection,
  selectGalaxyHit,
  snapshotFreshness,
  snapshotResponseCanCommit,
  sourceSnapshotPresentation,
  validPublicGeometryProjection,
  validSnapshot,
} from "../hub-assets/galaxy-core.mjs";
import { readHubFactsSync } from "./hub-facts-custody.mjs";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const facts = readHubFactsSync(path.join(root, "hub-assets", "hub-facts.json"), "galaxy core fixture");
const clone = (value) => structuredClone(value);
const TITLE_MINOR_WORDS = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "in", "nor", "of", "on", "or", "per", "the", "to", "via", "with"]);
const titleCase = (value) => String(value || "").toLowerCase().replace(/\b[a-z0-9']+/g, (word, offset) =>
  (offset > 0 && TITLE_MINOR_WORDS.has(word)) ? word : word.charAt(0).toUpperCase() + word.slice(1));
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const rehashGeometry = (snapshot) => {
  const geometry = snapshot.galaxy.geometry;
  geometry.geometryHash = sha256(canonicalJson({
    coordinateSpace: geometry.coordinateSpace,
    divisions: geometry.divisions,
    families: geometry.families,
    neurons: geometry.neurons,
  }));
};
const rehashGalaxy = (snapshot) => {
  const { projectionHash: _ignored, ...body } = snapshot.galaxy;
  snapshot.galaxy.projectionHash = sha256(canonicalJson(body));
};
const rehashSnapshot = (snapshot) => {
  const { snapshotHash: _ignored, ...body } = snapshot;
  snapshot.snapshotHash = sha256(canonicalJson(body));
};
const seal = (snapshot, geometry = false) => {
  if (geometry) rehashGeometry(snapshot);
  rehashGalaxy(snapshot);
  rehashSnapshot(snapshot);
  return snapshot;
};
const rejects = async (label, mutate, geometry = false) => {
  const candidate = clone(facts);
  mutate(candidate);
  seal(candidate, geometry);
  assert(!await validSnapshot(candidate), `runtime validator accepted ${label}`);
};

assert(sha256(canonicalJson(GALAXY_RENDERER_CONTRACT)) === GALAXY_RENDERER_CONTRACT_HASH, "renderer contract canonical hash drifted");
assert(await validSnapshot(facts), "checked-in public snapshot rejected by runtime validator");
assert(
  JSON.stringify(Object.keys(GALAXY_LENS_PROFILES)) === JSON.stringify(GALAXY_PUBLIC_CONTRACT.lensNames),
  "galaxy lens roster drifted",
);
assert(await validPublicGeometryProjection(facts.galaxy.geometry, facts.hiveAi.graphHash), "checked-in authored geometry rejected");
assert(facts.galaxy.geometry.geometryHash === GALAXY_CANONICAL_GEOMETRY_HASH, "checked-in geometry does not match the reviewed canonical digest");

const reservedStatusColors = new Set(["255,209,102", "52,255,136", "113,246,188"]);
for (const [lens, palette] of Object.entries(GALAXY_PUBLIC_PALETTES)) {
  assert(palette.length === 4, `${lens} public palette cardinality drifted`);
  for (const color of palette) {
    assert(!reservedStatusColors.has(color.join(",")), `${lens} palette reused a reserved Twitch or PM-only status color`);
    assert(color.every((channel) => Number.isSafeInteger(channel) && channel >= 0 && channel <= 255), `${lens} palette channel invalid`);
  }
}

await rejects("a downgraded snapshot schema", (candidate) => { candidate.schema = "hive.ecosystem.public-source-snapshot.v2"; });
await rejects("a mismatched generator version", (candidate) => { candidate.galaxy.generatorVersion = "999"; });
await rejects("a mismatched graph schema", (candidate) => { candidate.hiveAi.graphSchema = "hiveai.living_anatomy_graph.v999"; });
await rejects("a zero source fingerprint", (candidate) => { candidate.hiveAi.sourceFingerprint = "0".repeat(64); });
await rejects("a private-evidence boundary escalation", (candidate) => { candidate.boundaries.privateEvidencePublished = true; });
await rejects("an extra top-level private status object", (candidate) => { candidate.perNeuronPrivateStatus = { N001: "live" }; });
await rejects("an extra Hive-AI field", (candidate) => { candidate.hiveAi.privateEvidence = ["secret"]; });
await rejects("a mismatched renderer contract hash", (candidate) => { candidate.galaxy.geometry.contractHash = "1".repeat(64); });
await rejects("a mismatched source graph binding", (candidate) => { candidate.galaxy.sourceGraphHash = "1".repeat(64); });
await rejects("reversed authored division identity", (candidate) => { candidate.galaxy.geometry.divisions.reverse(); }, true);
await rejects("reordered authored family identity", (candidate) => { candidate.galaxy.geometry.families.reverse(); }, true);
await rejects("a forged authored x coordinate with every advertised hash recomputed", (candidate) => { candidate.galaxy.geometry.neurons[0][3] += 1; }, true);
await rejects("a forged semantic depth with every advertised hash recomputed", (candidate) => { candidate.galaxy.geometry.families[0][5] += 1; }, true);
await rejects("a zero-size authored neuron with every advertised hash recomputed", (candidate) => { candidate.galaxy.geometry.neurons[0][6] = 0; }, true);
await rejects("an out-of-range authored coordinate with every advertised hash recomputed", (candidate) => { candidate.galaxy.geometry.divisions[0][2] = 1_000_001; }, true);
await rejects("a wrong neuron taxonomy with every advertised hash recomputed", (candidate) => { candidate.galaxy.geometry.neurons[0][1] = "B"; }, true);
await rejects("a duplicated authored tuple body with every advertised hash recomputed", (candidate) => { candidate.galaxy.geometry.neurons[1].splice(3, 4, ...candidate.galaxy.geometry.neurons[0].slice(3)); }, true);
await rejects("an extended private neuron tuple", (candidate) => { candidate.galaxy.geometry.neurons[0].push("runtime-live"); }, true);
await rejects("a duplicate topology neuron", (candidate) => { candidate.galaxy.divisions[0].families[0].neuronIds[0] = "N002"; });
await rejects("a malformed capture timestamp", (candidate) => { candidate.capturedAt = "not-a-time"; });
await rejects("a far-future capture timestamp", (candidate) => { candidate.capturedAt = "2999-01-01T00:00:00Z"; });
const badProjectionHash = clone(facts);
badProjectionHash.galaxy.projectionHash = "0".repeat(64);
rehashSnapshot(badProjectionHash);
assert(!await validSnapshot(badProjectionHash), "runtime validator accepted a bad galaxy projection hash");
const badSnapshotHash = clone(facts);
badSnapshotHash.snapshotHash = "0".repeat(64);
assert(!await validSnapshot(badSnapshotHash), "runtime validator accepted a bad snapshot hash");

const touchIdle = galaxyPointerPolicy("touch", false);
const touchEngaged = galaxyPointerPolicy("touch", true);
const mouseIdle = galaxyPointerPolicy("mouse", false);
assert(!touchIdle.engage && !touchIdle.focusCanvas && !touchIdle.orbitAllowed, "idle touch stole page-scroll ownership");
assert(!touchEngaged.engage && touchEngaged.focusCanvas && touchEngaged.orbitAllowed, "engaged touch cannot orbit");
assert(mouseIdle.engage && mouseIdle.focusCanvas && mouseIdle.orbitAllowed, "mouse pointer cannot engage galaxy controls");

const membershipFixture = {
  division: { x: 8, y: 18 },
  family: { x: 108, y: 76 },
  members: [
    { x: 196, y: 28 }, { x: 212, y: 47 }, { x: 226, y: 66 },
    { x: 218, y: 87 }, { x: 201, y: 104 }, { x: 183, y: 91 },
  ],
  lane: 0.5,
};
const membershipFixtureBefore = JSON.stringify(membershipFixture);
const membershipBundle = galaxyMembershipBundleGeometry(membershipFixture);
const repeatedMembershipBundle = galaxyMembershipBundleGeometry(structuredClone(membershipFixture));
assert(membershipBundle && JSON.stringify(membershipBundle) === JSON.stringify(repeatedMembershipBundle), "membership bundle is not deterministic");
assert(JSON.stringify(membershipFixture) === membershipFixtureBefore, "membership bundle mutated authored projected points");
assert(Object.isFrozen(membershipBundle)
  && Object.isFrozen(membershipBundle.junction)
  && Object.isFrozen(membershipBundle.sourceControl)
  && Object.isFrozen(membershipBundle.trunkControl), "membership bundle output is mutable");
assert([
  membershipBundle.centroid.x, membershipBundle.centroid.y,
  membershipBundle.junction.x, membershipBundle.junction.y,
  membershipBundle.sourceControl.x, membershipBundle.sourceControl.y,
  membershipBundle.trunkControl.x, membershipBundle.trunkControl.y,
  membershipBundle.spread,
].every(Number.isFinite), "membership bundle emitted non-finite geometry");
const averageDistance = (origin, points) => points.reduce((total, point) => (
  total + Math.hypot(point.x - origin.x, point.y - origin.y)
), 0) / points.length;
assert(
  averageDistance(membershipBundle.junction, membershipFixture.members)
    < averageDistance(membershipFixture.family, membershipFixture.members) * 0.58,
  "membership junction did not shorten the neuron fan",
);
const invalidMembershipBundles = [
  galaxyMembershipBundleGeometry(),
  galaxyMembershipBundleGeometry({ ...membershipFixture, members: [] }),
  galaxyMembershipBundleGeometry({ ...membershipFixture, family: { x: Number.NaN, y: 2 } }),
  galaxyMembershipBundleGeometry({ ...membershipFixture, members: [{ x: 2, y: Number.POSITIVE_INFINITY }] }),
];
assert(invalidMembershipBundles.every((value) => value === null), "invalid membership geometry did not fail closed");
const bundledMembershipCases = 2 + invalidMembershipBundles.length;

const normalRender = galaxyRenderState({ hasContext: true, hasResizeObserver: true, forcedColorsActive: false });
const contrastRender = galaxyRenderState({ hasContext: true, hasResizeObserver: true, forcedColorsActive: true });
const missingCanvas = galaxyRenderState({ hasContext: false, hasResizeObserver: true, forcedColorsActive: false });
const lostContext = galaxyRenderState({ hasContext: true, hasResizeObserver: true, forcedColorsActive: false, contextLost: true });
assert(normalRender.renderAvailable && normalRender.reasonCode === "READY", "normal render state rejected");
assert(!contrastRender.renderAvailable && contrastRender.reasonCode === "FORCED_COLORS", "forced-colors fallback state rejected");
assert(!missingCanvas.baseAvailable && missingCanvas.reasonCode === "CANVAS_UNAVAILABLE", "missing-canvas fallback state rejected");
assert(!lostContext.baseAvailable && lostContext.reasonCode === "CONTEXT_LOST", "lost context fallback state rejected");

assert(snapshotResponseCanCommit({ requestGeneration: 7, currentGeneration: 7 }), "current snapshot response rejected");
assert(!snapshotResponseCanCommit({ requestGeneration: 6, currentGeneration: 7 }), "stale snapshot response accepted");
assert(!snapshotResponseCanCommit({ requestGeneration: 7, currentGeneration: 7, aborted: true }), "aborted snapshot response accepted");
const freshnessNow = Date.parse("2026-08-04T21:00:00Z");
assert(snapshotFreshness("2026-08-04T20:50:00Z", freshnessNow).state === "recent", "recent source capture marked aged");
assert(snapshotFreshness("2026-08-04T20:30:00Z", freshnessNow).state === "aged", "aged source capture marked recent");
assert(snapshotFreshness("2026-08-04T19:00:00Z", freshnessNow).state === "historical", "historical source capture hidden");
assert(snapshotFreshness("not-a-date", freshnessNow).state === "invalid", "invalid source capture accepted");
assert(snapshotFreshness("2999-01-01T00:00:00Z", freshnessNow).state === "invalid", "far-future source capture marked recent");
assert(snapshotFreshness("2026-08-04T21:04:00Z", freshnessNow).state === "recent", "bounded clock skew rejected");
for (const automaticBridgeEnabled of [true, false]) {
  const recent = sourceSnapshotPresentation("2026-08-04T20:50:00Z", automaticBridgeEnabled, freshnessNow);
  const aged = sourceSnapshotPresentation("2026-08-04T20:40:00Z", automaticBridgeEnabled, freshnessNow);
  const historical = sourceSnapshotPresentation("2026-08-04T19:00:00Z", automaticBridgeEnabled, freshnessNow);
  assert(recent.freshness === "recent" && aged.freshness === "aged" && historical.freshness === "historical", `source age was coupled to bridge=${automaticBridgeEnabled}`);
  const expectedBridge = automaticBridgeEnabled ? "configured" : "manual";
  const expectedSuffix = automaticBridgeEnabled ? "auto-sync configured" : "manual snapshot";
  assert([recent, aged, historical].every((value) => value.bridge === expectedBridge && value.label.endsWith(expectedSuffix)), `bridge=${automaticBridgeEnabled} was not reported separately`);
  assert(recent.badgeState === "" && recent.freshnessDisposition === "CURRENT_EVIDENCE_OK", `recent source capture was not current for bridge=${automaticBridgeEnabled}`);
  assert([aged, historical].every((value) => value.badgeState === "stale" && value.freshnessDisposition === "FRESHNESS_HOLD" && value.label.includes("freshness HOLD")), `aged source capture escaped freshness HOLD for bridge=${automaticBridgeEnabled}`);
}
assert(sourceSnapshotPresentation("not-a-date", true, freshnessNow).badgeState === "stale", "invalid source capture received a verified badge");

const handoffCommit = "a".repeat(40);
const handoffGraph = "b".repeat(64);
const handoffMatrix = [
  {
    input: { presentation: "1", lens: "mastery", node: "division:A", level: "division" },
    expected: `http://127.0.0.1:5002/constellation/body?presentation=1&publicContextVersion=1&sourceCommit=${handoffCommit}&graphHash=${handoffGraph}&lens=mastery&node=division%3AA&level=district`,
  },
  {
    input: { presentation: "1", lens: "artifact", node: "neuron:N640", level: "neuron" },
    expected: `http://127.0.0.1:5002/constellation/body?presentation=1&publicContextVersion=1&sourceCommit=${handoffCommit}&graphHash=${handoffGraph}&lens=build&node=N640&level=neuron`,
  },
  {
    input: { presentation: "1", lens: "evidence", node: "family:P4", level: "family" },
    expected: `http://127.0.0.1:5002/constellation/body?presentation=1&publicContextVersion=1&sourceCommit=${handoffCommit}&graphHash=${handoffGraph}&lens=evidence&node=family%3AP4&level=family`,
  },
  {
    input: { presentation: "1", lens: "runtime", node: "N001", level: "interior" },
    expected: `http://127.0.0.1:5002/constellation/body?presentation=1&publicContextVersion=1&sourceCommit=${handoffCommit}&graphHash=${handoffGraph}&lens=runtime&node=N001&level=interior`,
  },
  {
    input: { presentation: "1", lens: "product", node: "", level: "body" },
    expected: `http://127.0.0.1:5002/constellation/body?presentation=1&publicContextVersion=1&sourceCommit=${handoffCommit}&graphHash=${handoffGraph}&lens=product&node=&level=body`,
  },
];
for (const row of handoffMatrix) {
  const actual = buildPublicHandoffUrl({ ...row.input, sourceCommit: handoffCommit, graphHash: handoffGraph });
  assert(actual === row.expected, `canonical handoff URL drifted: ${actual}`);
  const keys = [...new URL(actual).searchParams.keys()];
  assert(keys.join(",") === "presentation,publicContextVersion,sourceCommit,graphHash,lens,node,level", "handoff query allowlist/order drifted");
}
assert(buildPublicHandoffUrl({ ...handoffMatrix[0].input, sourceCommit: "main", graphHash: handoffGraph }) === null, "unbound source handoff was emitted");
assert(buildPublicHandoffUrl({ ...handoffMatrix[0].input, presentation: "0", sourceCommit: handoffCommit, graphHash: handoffGraph }) === null, "operator mode was aliased onto the presentation service");

const directorState = {
  lens: "evidence", activeDivision: 7, activeFamily: 29, activeNeuron: 298,
  rotationX: -0.22, rotationY: 1.7, zoom: 2.1, panX: 24, panY: -18,
  targetRotationX: -0.18, targetRotationY: 1.8, targetZoom: 2.2, targetPanX: 26, targetPanY: -16,
};
for (const route of ["stop", "pointer-interrupt", "close", "motion-pause", "escape"]) {
  assert(JSON.stringify(exactGalaxyDirectorState(structuredClone(directorState))) === JSON.stringify(directorState), `${route} could not restore exact Director state`);
}

const overlayViewports = [
  [1920, 1080], [1440, 900], [1366, 768], [1024, 768], [768, 1024], [390, 844], [320, 568],
];
// This matrix covers the fixed control envelopes only. Responsive DOM-stack boxes remain a real-browser acceptance gate.
let overlayCases = 0;
for (const [physicalWidth, physicalHeight] of overlayViewports) {
  for (const browserZoom of [1, 1.25, 2]) {
    const boxes = Object.entries(galaxyOverlayBoxes(physicalWidth / browserZoom, physicalHeight / browserZoom));
    for (let left = 0; left < boxes.length; left += 1) {
      for (let right = left + 1; right < boxes.length; right += 1) {
        assert(!rectanglesIntersect(boxes[left][1], boxes[right][1], GALAXY_OVERLAY_GAP), `${physicalWidth}x${physicalHeight}@${browserZoom}: ${boxes[left][0]} collided with ${boxes[right][0]}`);
      }
    }
    overlayCases += 1;
  }
}

const occupied = [];
const firstLabel = placeCanvasLabel(80, 18, -100, -100, 320, 180, occupied, true);
const secondLabel = placeCanvasLabel(80, 18, -100, -100, 320, 180, occupied, true);
assert(firstLabel?.x >= 5 && firstLabel?.y >= 5, "label placement escaped canvas bounds");
assert(secondLabel && !rectanglesIntersect(firstLabel, secondLabel, 4), "priority labels overlap instead of searching alternatives");
assert(placeCanvasLabel(80, 18, 20, 20, 320, 180, [{ x: 0, y: 0, width: 320, height: 180 }], true) === null, "exhausted label placement did not fail closed");

const exactExitOverlay = { x: 929.49, y: 12, width: 123.85, height: 44 };
const exactDivisionLabel = { x: 512, y: 5, width: 430, height: 36 };
assert(rectanglesIntersect(exactDivisionLabel, exactExitOverlay), "exact 1440x900 N001 fixture no longer reproduces the Exit collision");
const exactTopBoundary = exactExitOverlay.y + exactExitOverlay.height + GALAXY_OVERLAY_GAP;
const exactSafeTop = exactTopBoundary + GALAXY_OVERLAY_GAP;
const exactSafeOccupied = [
  exactExitOverlay,
  { x: 0, y: 0, width: 1064, height: exactTopBoundary },
];
const exactPlacedDivision = placeCanvasLabel(
  exactDivisionLabel.width,
  exactDivisionLabel.height,
  exactDivisionLabel.x,
  Math.max(exactDivisionLabel.y, exactSafeTop),
  1064,
  900,
  exactSafeOccupied,
  true,
);
assert(exactPlacedDivision, "exact 1440x900 N001 division label was hidden instead of safely placed");
assert(exactPlacedDivision.x === exactDivisionLabel.x && exactPlacedDivision.y >= exactSafeTop, "exact N001 repair drifted horizontal framing or escaped the top safe frame");
assert(exactPlacedDivision.width === exactDivisionLabel.width && exactPlacedDivision.height === exactDivisionLabel.height, "exact N001 repair shrank or truncated the division label box");
assert(exactPlacedDivision.x >= 5 && exactPlacedDivision.x + exactPlacedDivision.width <= 1059, "exact N001 repair escaped the 1064px canvas");
assert(!rectanglesIntersect(exactPlacedDivision, exactExitOverlay, GALAXY_OVERLAY_GAP), "exact N001 division label still collides with Exit at the protected gap");

let safeFrameLabelCases = 0;
for (const { width, height } of [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1064, height: 900 },
]) {
  const boxes = galaxyOverlayBoxes(width, height);
  const topBoundary = Math.max(boxes.exit.y + boxes.exit.height, boxes.demo.y + boxes.demo.height) + GALAXY_OVERLAY_GAP;
  const bottomBoundary = boxes.readout.y - GALAXY_OVERLAY_GAP;
  const safeTop = topBoundary + GALAXY_OVERLAY_GAP;
  const safeBottom = bottomBoundary - GALAXY_OVERLAY_GAP;
  const tiers = [
    { name: "division", width: width >= 620 ? 430 : 44, height: width >= 620 ? 36 : 29 },
    { name: "full-family", width: 304, height: 33 },
    { name: "neuron", width: 66, height: 29 },
  ];
  for (const tier of tiers) {
    const overlayOccupied = [
      ...Object.values(boxes),
      { x: 0, y: 0, width, height: topBoundary },
      { x: 0, y: bottomBoundary, width, height: height - bottomBoundary },
    ];
    const placed = placeCanvasLabel(
      tier.width,
      tier.height,
      (width - tier.width) / 2,
      safeTop,
      width,
      height,
      overlayOccupied,
      true,
    );
    assert(placed, `${width}x${height}: ${tier.name} label was hidden by the safe frame`);
    assert(placed.width === tier.width && placed.height === tier.height, `${width}x${height}: ${tier.name} label dimensions changed`);
    assert(placed.y >= safeTop && placed.y + placed.height <= safeBottom, `${width}x${height}: ${tier.name} label escaped the vertical safe frame`);
    for (const [overlayName, overlayBox] of Object.entries(boxes)) {
      assert(!rectanglesIntersect(placed, overlayBox, GALAXY_OVERLAY_GAP), `${width}x${height}: ${tier.name} label collided with ${overlayName}`);
    }
    safeFrameLabelCases += 1;
  }
}

assert(adaptiveGalaxyDpr({ devicePixelRatio: 3, width: 390, height: 600 }) === 3, "small high-DPI atlas was needlessly blurred");
assert(adaptiveGalaxyDpr({ devicePixelRatio: 2, width: 1000, height: 800 }) === 2, "2x desktop atlas was needlessly blurred");
assert(adaptiveGalaxyDpr({ devicePixelRatio: 3, width: 3840, height: 2160 }) === 1, "4K atlas exceeded the bounded pixel budget");

const zoomInput = { zoom: 1, panX: 24, panY: -12, pointerX: 740, pointerY: 420, width: 1000, height: 700, factor: 1.6 };
const zoomed = galaxyZoomAtPointer(zoomInput);
const beforeX = zoomInput.pointerX - zoomInput.width / 2 - zoomInput.panX;
const beforeY = zoomInput.pointerY - zoomInput.height / 2 - zoomInput.panY;
assert(Math.abs(zoomed.panX + beforeX * (zoomed.zoom / zoomInput.zoom) - (zoomInput.pointerX - zoomInput.width / 2)) < 1e-9, "pointer-centered zoom drifted horizontally");
assert(Math.abs(zoomed.panY + beforeY * (zoomed.zoom / zoomInput.zoom) - (zoomInput.pointerY - zoomInput.height / 2)) < 1e-9, "pointer-centered zoom drifted vertically");
const gestureBefore = galaxyGestureMetrics([{ x: 100, y: 100 }, { x: 200, y: 100 }]);
const gestureAfter = galaxyGestureMetrics([{ x: 90, y: 110 }, { x: 230, y: 110 }]);
const gestureCamera = galaxyGestureCamera({ previous: gestureBefore, current: gestureAfter, zoom: 1, width: 400, height: 300 });
assert(Math.abs(gestureCamera.zoom - 1.4) < 1e-9 && Number.isFinite(gestureCamera.panX) && Number.isFinite(gestureCamera.panY), "pinch centroid/span camera update drifted");

const depthRows = depthSortGalaxyPoints([{ id: "b", z: 1 }, { id: "a", z: -1 }, { id: "c", z: 1 }]);
assert(depthRows.map((row) => row.id).join("") === "abc", "stable authored depth sort drifted");

const geometry = buildGalaxyGeometry(facts.galaxy);
const divisionNavigatorLabels = facts.galaxy.divisions.map((division) => `${division.code} · ${titleCase(division.name)}`);
assert(divisionNavigatorLabels.length === 16, "division navigator did not receive the exact authored division count");
divisionNavigatorLabels.forEach((label, index) => {
  const division = facts.galaxy.divisions[index];
  assert(division.code === String.fromCharCode(65 + index), `division navigator option ${index} left canonical A–P order`);
  assert(label === `${division.code} · ${titleCase(division.name)}` && label.length > division.code.length + 3 && !label.includes("…"), `division navigator option ${division.code} lost its exact full name`);
});
assert(geometry.neurons[0]?.id === "N001" && geometry.neurons[0]?.divisionIndex === 0 && geometry.neurons[0]?.familyGeometryIndex === 0, "exact safe-frame fixture drifted from canonical N001 / Division A / A1 identity");
assert(geometry.divisionGeometry.length === 16 && geometry.familyGeometry.length === 64 && geometry.neurons.length === 640, "authored renderer cardinality drifted");
for (const [index, point] of geometry.divisionGeometry.entries()) {
  assert(JSON.stringify(point.authored) === JSON.stringify(facts.galaxy.geometry.divisions[index].slice(-4)), `division ${index} lost its authored tuple`);
}
for (const [index, point] of geometry.familyGeometry.entries()) {
  assert(JSON.stringify(point.authored) === JSON.stringify(facts.galaxy.geometry.families[index].slice(-4)), `family ${index} lost its authored tuple`);
}
for (const [index, point] of geometry.neurons.entries()) {
  assert(point.id === `N${String(index + 1).padStart(3, "0")}`, `neuron ${index} identity drifted`);
  assert(JSON.stringify(point.authored) === JSON.stringify(facts.galaxy.geometry.neurons[index].slice(-4)), `neuron ${index} lost its authored tuple`);
}

const overviewViewportCases = [
  { name: "1920x1080", physicalWidth: 1920, physicalHeight: 1080, width: 1421, height: 1080, zoom: 1.3, minSpanRatio: 0.44 },
  { name: "1440x900", physicalWidth: 1440, physicalHeight: 900, width: 1066, height: 900, zoom: 1.3, minSpanRatio: 0.44 },
  { name: "1366x768", physicalWidth: 1366, physicalHeight: 768, width: 1011, height: 768, zoom: 1.3, minSpanRatio: 0.44 },
  { name: "1024x768", physicalWidth: 1024, physicalHeight: 768, width: 704, height: 768, zoom: 1.2, minSpanRatio: 0.46 },
  { name: "390x844", physicalWidth: 390, physicalHeight: 844, width: 390, height: 473, zoom: 0.98, minSpanRatio: 0.35 },
  { name: "320x568", physicalWidth: 320, physicalHeight: 568, width: 320, height: 318, zoom: 0.98, minSpanRatio: 0.35 },
];
let overviewCameraCases = 0;
for (const viewport of overviewViewportCases) {
  const camera = galaxyOverviewCamera(viewport);
  assert(camera, `${viewport.name}: overview camera was unavailable`);
  assert(camera.rotationX === -0.25 && camera.rotationY === -0.64, `${viewport.name}: cinematic overview rotation drifted`);
  assert(camera.zoom === viewport.zoom, `${viewport.name}: viewport-aware overview zoom drifted`);
  assert(camera.panX === 0 && camera.panY > 0 && camera.panY <= 64, `${viewport.name}: overview pan left its bounded positive contract`);
  const projections = geometry.neurons.map((point) => projectGalaxyPoint(point, { ...camera, width: viewport.width, height: viewport.height }));
  const xs = projections.map(({ x }) => x);
  const ys = projections.map(({ y }) => y).sort((left, right) => left - right);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = ys[0];
  const maxY = ys.at(-1);
  const medianY = ys[Math.floor(ys.length / 2)];
  assert(minX >= 5 && maxX <= viewport.width - 5, `${viewport.name}: overview escaped horizontal projection bounds`);
  assert(minY >= viewport.height * 0.12 && maxY <= viewport.height * 0.86, `${viewport.name}: overview escaped conservative vertical projection bounds`);
  assert(medianY >= viewport.height * 0.42 && medianY <= viewport.height * 0.53, `${viewport.name}: overview lost its centered visual mass`);
  assert(maxY - minY >= viewport.height * viewport.minSpanRatio, `${viewport.name}: overview collapsed into a top-heavy strip`);
  overviewCameraCases += 1;
}
assert(galaxyOverviewCamera({ width: 0, height: 900 }) === null, "zero-width overview input did not fail closed");
assert(galaxyOverviewCamera({ width: 1440, height: Number.NaN }) === null, "non-finite overview input did not fail closed");

const projectCanonicalScene = ({ lens = "mastery", ...camera }) => ({
  lens,
  zoom: camera.zoom,
  projectedDivisions: geometry.divisionGeometry.map((point) => projectGalaxyPoint(point, camera)),
  projectedFamilies: geometry.familyGeometry.map((point) => projectGalaxyPoint(point, camera)),
  projectedNeurons: geometry.neurons.map((point) => projectGalaxyPoint(point, camera)),
});

const assertCanonicalCenterHit = (tier, index, scene, label) => {
  const projected = tier === "division"
    ? scene.projectedDivisions[index]
    : tier === "family"
      ? scene.projectedFamilies[index]
      : scene.projectedNeurons[index];
  const hit = selectGalaxyHit({
    pointer: { x: projected.x, y: projected.y },
    zoom: scene.zoom,
    lens: scene.lens,
    projectedDivisions: scene.projectedDivisions,
    projectedFamilies: scene.projectedFamilies,
    projectedNeurons: scene.projectedNeurons,
  });
  if (tier === "division") {
    const expectedCode = facts.galaxy.geometry.divisions[index][1];
    assert(
      hit.divisionIndex === index
        && hit.familyIndex === -1
        && hit.neuronIndex === -1
        && geometry.divisionGeometry[hit.divisionIndex]?.code === expectedCode,
      `${label}: division ${expectedCode} center resolved to the wrong canonical identity`,
    );
    return;
  }
  if (tier === "family") {
    const tuple = facts.galaxy.geometry.families[index];
    const selectedFamily = geometry.familyGeometry[hit.familyIndex];
    const selectedDivisionCode = facts.galaxy.divisions[hit.divisionIndex]?.code;
    assert(
      hit.familyIndex === index
        && hit.neuronIndex === -1
        && hit.divisionIndex === projected.divisionIndex
        && selectedFamily?.code === tuple[1]
        && selectedDivisionCode === tuple[2],
      `${label}: family ${tuple[1]} center resolved to the wrong canonical identity or parent`,
    );
    return;
  }
  const tuple = facts.galaxy.geometry.neurons[index];
  const selectedNeuron = geometry.neurons[hit.neuronIndex];
  const selectedFamilyCode = geometry.familyGeometry[hit.familyIndex]?.code;
  const selectedDivisionCode = facts.galaxy.divisions[hit.divisionIndex]?.code;
  assert(
    hit.neuronIndex === index
      && hit.familyIndex === projected.familyGeometryIndex
      && hit.divisionIndex === projected.divisionIndex
      && selectedNeuron?.id === tuple[0]
      && selectedFamilyCode === tuple[2]
      && selectedDivisionCode === tuple[1],
    `${label}: neuron ${tuple[0]} center resolved to the wrong canonical identity or parents`,
  );
};

const exhaustiveCamera = {
  rotationX: -0.11,
  rotationY: -0.37,
  width: 1440,
  height: 900,
  panX: 13,
  panY: -9,
};
const exhaustiveTiers = [
  { tier: "division", zoom: 0.82, count: geometry.divisionGeometry.length },
  { tier: "family", zoom: 1.28, count: geometry.familyGeometry.length },
  { tier: "neuron", zoom: 2.15, count: geometry.neurons.length },
];
let exhaustiveCenterHits = 0;
for (const { tier, zoom, count } of exhaustiveTiers) {
  const scene = projectCanonicalScene({ ...exhaustiveCamera, zoom });
  assert(
    scene.projectedDivisions.length === 16
      && scene.projectedFamilies.length === 64
      && scene.projectedNeurons.length === 640,
    `${tier}: complete canonical projection was not retained for hit testing`,
  );
  for (let index = 0; index < count; index += 1) {
    assertCanonicalCenterHit(tier, index, scene, `exhaustive ${tier}`);
    exhaustiveCenterHits += 1;
  }
}
assert(exhaustiveCenterHits === 720, "integrated exhaustive 16/64/640 center-hit coverage drifted");

const representativeCameras = [
  { name: "desktop", width: 1920, height: 1080, rotationX: -0.08, rotationY: -0.32, panX: 8, panY: -5, targets: [0, 0, 0] },
  { name: "tablet", width: 1024, height: 768, rotationX: 0.17, rotationY: 0.61, panX: -21, panY: 14, targets: [8, 32, 320] },
  { name: "mobile", width: 390, height: 844, rotationX: -0.24, rotationY: 1.07, panX: 19, panY: -27, targets: [15, 63, 639] },
];
let representativeCenterHits = 0;
for (const { name, targets, ...camera } of representativeCameras) {
  for (const [{ tier, zoom }, index] of exhaustiveTiers.map((value, tierIndex) => [value, targets[tierIndex]])) {
    const scene = projectCanonicalScene({ ...camera, zoom });
    assertCanonicalCenterHit(tier, index, scene, `${name}/${zoom}`);
    representativeCenterHits += 1;
  }
}
assert(representativeCenterHits === 9, "representative viewport and camera center-hit coverage drifted");

const overlapBackIndex = 1;
const overlapFrontIndex = 638;
const overlapScene = projectCanonicalScene({
  rotationX: 0.19,
  rotationY: -0.71,
  zoom: 2.2,
  width: 1366,
  height: 768,
  panX: -12,
  panY: 17,
});
const overlapAnchor = overlapScene.projectedNeurons[overlapBackIndex];
overlapScene.projectedNeurons = overlapScene.projectedNeurons.map((point, index) => {
  if (index === overlapBackIndex) return { ...point, x: overlapAnchor.x, y: overlapAnchor.y, z: -2 };
  if (index === overlapFrontIndex) return { ...point, x: overlapAnchor.x, y: overlapAnchor.y, z: 2 };
  return point;
});
const depthHit = selectGalaxyHit({
  pointer: { x: overlapAnchor.x, y: overlapAnchor.y },
  zoom: overlapScene.zoom,
  lens: overlapScene.lens,
  projectedDivisions: overlapScene.projectedDivisions,
  projectedFamilies: overlapScene.projectedFamilies,
  projectedNeurons: overlapScene.projectedNeurons,
});
const depthNeuron = geometry.neurons[overlapFrontIndex];
assert(
  depthHit.neuronIndex === overlapFrontIndex
    && depthHit.divisionIndex === depthNeuron.divisionIndex
    && depthHit.familyIndex === depthNeuron.familyGeometryIndex
    && geometry.neurons[depthHit.neuronIndex]?.id === depthNeuron.id,
  "complete-scene depth overlap did not select the front-most canonical neuron and parents",
);

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
let divisionNavigatorSelectionCases = 0;
for (const [index, division] of facts.galaxy.divisions.entries()) {
  const selection = resolveGalaxySelection({
    divisions: facts.galaxy.divisions,
    familyGeometry: geometry.familyGeometry,
    neurons: geometry.neurons,
    neuronIndexById: geometry.neuronIndexById,
    previousDivisionCode: division.code,
    previousFamilyCode: null,
    previousNeuronId: null,
  });
  assert(selection.activeDivision === index && selection.activeFamily === -1 && selection.activeNeuron === -1, `division navigator selection ${division.code} did not resolve to its exact division`);
  divisionNavigatorSelectionCases += 1;
}

const viewports = [
  { name: "desktop", width: 1000, height: 800 },
  { name: "tablet", width: 768, height: 720 },
  { name: "mobile", width: 390, height: 544 },
];
let finiteProjections = 0;
let fittedSelections = 0;
for (const viewport of viewports) {
  for (const zoom of [0.68, 1.08, 2.15, 3.4]) {
    for (const point of [...geometry.divisionGeometry, ...geometry.familyGeometry, ...geometry.neurons]) {
      const projected = projectGalaxyPoint(point, {
        rotationX: -0.08,
        rotationY: -0.32,
        zoom,
        width: viewport.width,
        height: viewport.height,
        panX: 8,
        panY: -5,
      });
      assert([projected.x, projected.y, projected.z, projected.perspective].every(Number.isFinite), `${viewport.name}/${zoom}: non-finite authored projection`);
      finiteProjections += 1;
    }
  }
  for (const { rows, zoom } of [
    { rows: geometry.divisionGeometry, zoom: 1.18 },
    { rows: geometry.familyGeometry, zoom: 1.58 },
    { rows: geometry.neurons, zoom: 2.15 },
  ]) {
    for (const point of rows) {
      const camera = galaxyFocusCamera(point, { ...viewport, zoom, targetYRatio: 0.46 });
      assert(camera && camera.zoom === zoom, `${viewport.name}/${zoom}: exact fit zoom drifted`);
      const projected = projectGalaxyPoint(point, { ...camera, width: viewport.width, height: viewport.height });
      assert(Math.abs(projected.x - viewport.width * 0.5) <= 0.5, `${viewport.name}/${zoom}: fitted selection left the horizontal safe center`);
      assert(Math.abs(projected.y - viewport.height * 0.46) <= 0.5, `${viewport.name}/${zoom}: fitted selection left the vertical safe center`);
      fittedSelections += 1;
    }
  }
}

const oneDivision = [{ x: 0, y: 0, z: 0, perspective: 1, divisionIndex: 0 }];
const masteryProfile = GALAXY_LENS_PROFILES.mastery;
const normalDivisionRadius = galaxyDivisionVisualRadius(oneDivision[0], 1, masteryProfile, false);
const selectedDivisionRadius = galaxyDivisionVisualRadius(oneDivision[0], 1, masteryProfile, true);
const normalHaloInside = selectGalaxyHit({ pointer: { x: normalDivisionRadius - 0.1, y: 0 }, zoom: 1, lens: "mastery", projectedDivisions: oneDivision, projectedFamilies: [], projectedNeurons: [] });
const normalHaloOutside = selectGalaxyHit({ pointer: { x: normalDivisionRadius + 0.1, y: 0 }, zoom: 1, lens: "mastery", projectedDivisions: oneDivision, projectedFamilies: [], projectedNeurons: [] });
const selectedHaloInside = selectGalaxyHit({ pointer: { x: selectedDivisionRadius - 0.1, y: 0 }, zoom: 1, lens: "mastery", projectedDivisions: oneDivision, projectedFamilies: [], projectedNeurons: [], activeDivision: 0 });
assert(normalHaloInside.divisionIndex === 0 && normalHaloOutside.divisionIndex === -1 && selectedHaloInside.divisionIndex === 0, "division hit radius diverged from its rendered halo");

console.log(`GALAXY_CORE_OK negative_snapshots=23 authored=16/64/640 division_nav_options=${divisionNavigatorLabels.length} division_nav_selections=${divisionNavigatorSelectionCases} overview_camera_cases=${overviewCameraCases} integrated_center_hits=${exhaustiveCenterHits} representative_center_hits=${representativeCenterHits} depth_overlap_cases=1 finite_projections=${finiteProjections} fitted_selections=${fittedSelections} viewports=${viewports.length} zoom_levels=4 handoff_urls=${handoffMatrix.length} fixed_control_overlay_cases=${overlayCases} safe_frame_label_cases=${safeFrameLabelCases} exact_exit_fixture=1 pointer_policies=3 render_states=4 gesture_cases=2 freshness_bridge_cases=6 bundled_membership_cases=${bundledMembershipCases}`);
