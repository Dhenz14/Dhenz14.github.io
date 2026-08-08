export const GALAXY_LENS_PROFILES = Object.freeze({
  mastery: { links: 1, divisions: 1, families: 1, neurons: 1, familyThreshold: 1.02 },
  artifact: { links: 0.78, divisions: 0.9, families: 1.35, neurons: 1.05, familyThreshold: 0.94 },
  evidence: { links: 1.55, divisions: 0.82, families: 1.05, neurons: 0.92, familyThreshold: 1.06 },
  runtime: { links: 0.86, divisions: 0.9, families: 0.92, neurons: 1.24, familyThreshold: 1.12 },
  product: { links: 0.72, divisions: 1.35, families: 0.72, neurons: 0.78, familyThreshold: 1.28 },
});

export const GALAXY_RENDERER_CONTRACT = Object.freeze({
  schema: "hive.galaxy.renderer-contract.v1",
  version: "1.0.0",
  geometrySchema: "hive.galaxy.public-geometry.v1",
  statusSchema: "hive.galaxy.status-language.v1",
  cameraSchema: "hive.galaxy.camera.v1",
  eventSchema: "hive.galaxy.event-semantics.v1",
  fallbackSchema: "hive.galaxy.progressive-fallback.v1",
});

export const GALAXY_RENDERER_CONTRACT_HASH = "698d9c371ebe98b47cffbf10643080cb06ccb2c06267d580349063fb992230ad";
export const GALAXY_CANONICAL_GEOMETRY_HASH = "29948f2ccbc310eb9ecc802a82ba1ff298aa19bc131ea21ebce85b8db7c5c314";
export const GALAXY_GENERATOR_VERSION = "3.0.0";
export const GALAXY_SNAPSHOT_VERSION = "3.0.0";

export const GALAXY_PUBLIC_PALETTES = Object.freeze({
  mastery: Object.freeze([[104, 228, 255], [151, 205, 255], [109, 159, 255], [182, 205, 228]]),
  artifact: Object.freeze([[121, 184, 232], [142, 204, 238], [109, 159, 255], [190, 214, 234]]),
  evidence: Object.freeze([[185, 245, 255], [104, 228, 255], [151, 205, 255], [200, 226, 243]]),
  runtime: Object.freeze([[122, 210, 255], [104, 228, 255], [80, 197, 210], [151, 205, 255]]),
  product: Object.freeze([[151, 205, 255], [176, 221, 242], [104, 228, 255], [111, 158, 255]]),
});

export const GALAXY_PUBLIC_CONTRACT = Object.freeze({
  neurons: 640,
  divisions: 16,
  families: 64,
  familiesPerDivision: 4,
  neuronsPerFamily: 10,
  lensNames: Object.freeze(["mastery", "artifact", "evidence", "runtime", "product"]),
  snapshotSchema: "hive.ecosystem.public-source-snapshot.v3",
  galaxySchema: "hive.ecosystem.public-galaxy.v2",
  graphSchema: "hiveai.living_anatomy_graph.v2",
  geometrySchema: GALAXY_RENDERER_CONTRACT.geometrySchema,
  coordinateSpace: "hiveai.living_anatomy_layout.v1",
});

const HEX40 = /^[a-f0-9]{40}$/;
const HEX64 = /^[a-f0-9]{64}$/;
const NONZERO_HEX64 = /^(?!0{64}$)[a-f0-9]{64}$/;
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const integerInRange = (value, minimum, maximum) => Number.isSafeInteger(value) && value >= minimum && value <= maximum;
const exactKeys = (value, expected) => isPlainObject(value)
  && Object.keys(value).length === expected.length
  && expected.every((key) => Object.hasOwn(value, key));

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

const PUBLIC_HANDOFF_LENSES = Object.freeze({
  mastery: "mastery",
  artifact: "build",
  evidence: "evidence",
  runtime: "runtime",
  product: "product",
});
const PUBLIC_HANDOFF_LEVELS = Object.freeze({
  body: "body",
  division: "district",
  district: "district",
  family: "family",
  neuron: "neuron",
  interior: "interior",
});

export function buildPublicHandoffUrl({ presentation, sourceCommit, graphHash, lens, node, level }) {
  const route = String(presentation);
  const canonicalLens = PUBLIC_HANDOFF_LENSES[String(lens || "").toLowerCase()];
  const canonicalLevel = PUBLIC_HANDOFF_LEVELS[String(level || "").toLowerCase()];
  const rawNode = String(node || "");
  const canonicalNode = /^neuron:N\d{3}$/.test(rawNode) ? rawNode.slice("neuron:".length) : rawNode;
  if (!["0", "1"].includes(route)
    || !HEX40.test(String(sourceCommit || ""))
    || !HEX64.test(String(graphHash || ""))
    || !canonicalLens
    || !canonicalLevel
    || (canonicalNode && !/^N(?:00[1-9]|0[1-9][0-9]|[1-5][0-9]{2}|6[0-3][0-9]|640)$/.test(canonicalNode)
      && !/^division:[A-P]$/.test(canonicalNode)
      && !/^family:[A-P][1-4]$/.test(canonicalNode))) return null;
  const target = new URL("http://127.0.0.1:5002/constellation/body");
  target.searchParams.set("presentation", route);
  target.searchParams.set("publicContextVersion", "1");
  target.searchParams.set("sourceCommit", sourceCommit);
  target.searchParams.set("graphHash", graphHash);
  target.searchParams.set("lens", canonicalLens);
  target.searchParams.set("node", canonicalNode);
  target.searchParams.set("level", canonicalLevel);
  return target.href;
}

export function sourceSnapshotPresentation(capturedAt, automaticBridgeEnabled, now = Date.now()) {
  const freshness = snapshotFreshness(capturedAt, now);
  const bridge = automaticBridgeEnabled ? "active" : "inactive";
  const ageLabel = freshness.state === "historical"
    ? "Historical source capture"
    : freshness.state === "aged"
      ? "Aged source capture"
      : freshness.state === "recent"
        ? "Recent source capture"
        : "Invalid source capture";
  return Object.freeze({
    freshness: freshness.state,
    bridge,
    badgeState: freshness.state === "recent" && bridge === "active" ? "" : "stale",
    label: `${ageLabel} · bridge ${bridge}`,
  });
}

const DIRECTOR_STATE_KEYS = Object.freeze([
  "lens", "activeDivision", "activeFamily", "activeNeuron",
  "rotationX", "rotationY", "zoom", "panX", "panY",
  "targetRotationX", "targetRotationY", "targetZoom", "targetPanX", "targetPanY",
]);

export function exactGalaxyDirectorState(value) {
  if (!isPlainObject(value) || !exactKeys(value, DIRECTOR_STATE_KEYS)) return null;
  if (!GALAXY_PUBLIC_CONTRACT.lensNames.includes(value.lens)
    || !Number.isSafeInteger(value.activeDivision)
    || !Number.isSafeInteger(value.activeFamily)
    || !Number.isSafeInteger(value.activeNeuron)
    || DIRECTOR_STATE_KEYS.slice(4).some((key) => !Number.isFinite(value[key]))) return null;
  return Object.freeze(Object.fromEntries(DIRECTOR_STATE_KEYS.map((key) => [key, value[key]])));
}

export const GALAXY_OVERLAY_GAP = 8;
export function galaxyOverlayBoxes(width, height) {
  const w = Math.max(160, Number(width) || 160);
  const h = Math.max(320, Number(height) || 320);
  const edge = 8;
  const exitWidth = Math.min(112, w - edge * 2);
  const demoWidth = Math.min(128, w - edge * 2);
  const exit = { x: w - edge - exitWidth, y: edge, width: exitWidth, height: 44 };
  const demo = { x: edge, y: w < 280 ? exit.y + exit.height + GALAXY_OVERLAY_GAP : edge, width: demoWidth, height: 54 };
  const readout = { x: edge, y: h - edge - 58, width: Math.min(148, w - edge * 2), height: 58 };
  const caption = { x: edge, y: readout.y - GALAXY_OVERLAY_GAP - 84, width: w - edge * 2, height: 84 };
  return Object.freeze({ exit, demo, readout, caption });
}

async function sha256Hex(value) {
  if (!globalThis.crypto?.subtle || typeof TextEncoder !== "function") return "";
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const boxesOverlap = (left, right, gap = 4) => left.x < right.x + right.width + gap
  && left.x + left.width + gap > right.x
  && left.y < right.y + right.height + gap
  && left.y + left.height + gap > right.y;

export function rectanglesIntersect(left, right, gap = 0) {
  return boxesOverlap(left, right, gap);
}

export function placeCanvasLabel(width, height, desiredX, desiredY, canvasWidth, canvasHeight, occupied, priority = false) {
  const margin = 5;
  const baseX = clamp(desiredX, margin, Math.max(margin, canvasWidth - width - margin));
  const baseY = clamp(desiredY, margin, Math.max(margin, canvasHeight - height - margin));
  const verticalStep = height + 5;
  const horizontalStep = Math.max(20, Math.min(width * 0.62, 86));
  const offsets = priority ? [
    [0, 0], [0, verticalStep], [0, -verticalStep],
    [horizontalStep, 0], [-horizontalStep, 0],
    [horizontalStep, verticalStep], [-horizontalStep, verticalStep],
    [horizontalStep, -verticalStep], [-horizontalStep, -verticalStep],
    [0, verticalStep * 2], [0, -verticalStep * 2],
    [horizontalStep * 2, 0], [-horizontalStep * 2, 0],
  ] : [[0, 0]];
  for (const [offsetX, offsetY] of offsets) {
    const box = {
      x: clamp(baseX + offsetX, margin, Math.max(margin, canvasWidth - width - margin)),
      y: clamp(baseY + offsetY, margin, Math.max(margin, canvasHeight - height - margin)),
      width,
      height,
    };
    if (!occupied.some((other) => boxesOverlap(box, other))) {
      occupied.push(box);
      return box;
    }
  }
  return null;
}

export function galaxyPointerPolicy(pointerType, engaged) {
  const isTouch = pointerType === "touch";
  return {
    engage: !isTouch,
    focusCanvas: !isTouch || Boolean(engaged),
    orbitAllowed: !isTouch || Boolean(engaged),
  };
}

export function galaxyRenderState({ hasContext, hasResizeObserver, forcedColorsActive, contextLost = false }) {
  const baseAvailable = Boolean(hasContext && hasResizeObserver && !contextLost);
  return {
    baseAvailable,
    renderAvailable: baseAvailable && !forcedColorsActive,
    reasonCode: contextLost ? "CONTEXT_LOST" : !baseAvailable ? "CANVAS_UNAVAILABLE" : forcedColorsActive ? "FORCED_COLORS" : "READY",
  };
}

export function adaptiveGalaxyDpr({ devicePixelRatio = 1, width = 1, height = 1, pixelBudget = 6_200_000 }) {
  const density = Number.isFinite(devicePixelRatio) ? Math.max(1, devicePixelRatio) : 1;
  const area = Math.max(1, width) * Math.max(1, height);
  const budgetCap = Math.sqrt(Math.max(1, pixelBudget) / area);
  return Math.max(1, Math.min(3, density, budgetCap));
}

export function snapshotResponseCanCommit({ requestGeneration, currentGeneration, aborted = false }) {
  return !aborted && requestGeneration === currentGeneration;
}

export function snapshotFreshness(capturedAt, now = Date.now()) {
  const raw = String(capturedAt || "");
  const captured = Date.parse(raw);
  if (!Number.isFinite(captured) || !Number.isFinite(now)) return { state: "invalid", ageMs: null };
  const canonical = new Date(captured).toISOString().replace(".000Z", "Z");
  if (raw !== canonical || captured - now > 5 * 60_000) return { state: "invalid", ageMs: null };
  const ageMs = Math.max(0, now - captured);
  if (ageMs >= 60 * 60_000) return { state: "historical", ageMs };
  if (ageMs >= 15 * 60_000) return { state: "aged", ageMs };
  return { state: "recent", ageMs };
}

function validGeometryTuple(row, width, stringCount) {
  return Array.isArray(row)
    && row.length === width
    && row.slice(0, stringCount).every((value) => typeof value === "string" && value.length > 0)
    && row.slice(-4).every((value) => Number.isSafeInteger(value))
    && integerInRange(row[width - 4], 0, 1_000_000)
    && integerInRange(row[width - 3], 0, 1_000_000)
    && integerInRange(row[width - 2], -1_000_000, 1_000_000)
    && integerInRange(row[width - 1], 1, 1_000_000);
}

export function semanticAnatomicalDepthMilli(kind, divisionCode, familyCode = "") {
  if (!/^[A-P]$/.test(divisionCode)) return null;
  const divisionIndex = divisionCode.charCodeAt(0) - 65;
  const divisionBand = [18, 6, -6, -18][Math.floor(divisionIndex / 4)];
  let familyOffset = 0;
  if (familyCode) {
    if (!new RegExp(`^${divisionCode}[1-4]$`).test(familyCode)) return null;
    familyOffset = (Number(familyCode.at(-1)) - 2.5) * 3;
  }
  const depth = kind === "division"
    ? divisionBand + 14
    : kind === "family"
      ? divisionBand + 7 + familyOffset * 0.5
      : kind === "neuron"
        ? divisionBand + familyOffset
        : null;
  return depth === null ? null : Math.round(depth * 1000);
}

export async function validPublicGeometryProjection(geometry, sourceGraphHash = "") {
  const keys = [
    "schema", "projection", "sourceGraphHash", "contractVersion", "contractHash",
    "coordinateSpace", "divisions", "families", "neurons", "geometryHash",
  ];
  if (!exactKeys(geometry, keys)
    || geometry.schema !== GALAXY_PUBLIC_CONTRACT.geometrySchema
    || geometry.projection !== "living-anatomy-body"
    || geometry.sourceGraphHash !== sourceGraphHash
    || geometry.contractVersion !== GALAXY_RENDERER_CONTRACT.version
    || geometry.contractHash !== GALAXY_RENDERER_CONTRACT_HASH
    || geometry.coordinateSpace !== GALAXY_PUBLIC_CONTRACT.coordinateSpace
    || !HEX64.test(geometry.geometryHash || "")
    || !Array.isArray(geometry.divisions)
    || !Array.isArray(geometry.families)
    || !Array.isArray(geometry.neurons)
    || geometry.divisions.length !== GALAXY_PUBLIC_CONTRACT.divisions
    || geometry.families.length !== GALAXY_PUBLIC_CONTRACT.families
    || geometry.neurons.length !== GALAXY_PUBLIC_CONTRACT.neurons) return false;

  const divisionCodes = new Set();
  for (const [index, row] of geometry.divisions.entries()) {
    const code = String.fromCharCode(65 + index);
    if (!validGeometryTuple(row, 6, 2)
      || row[0] !== `division:${code}`
      || row[1] !== code
      || row[4] !== semanticAnatomicalDepthMilli("division", code)
      || row[5] !== 10_500) return false;
    divisionCodes.add(code);
  }
  const familyCodes = new Set();
  for (const [index, row] of geometry.families.entries()) {
    const division = String.fromCharCode(65 + Math.floor(index / 4));
    const code = `${division}${(index % 4) + 1}`;
    if (!validGeometryTuple(row, 7, 3)
      || row[0] !== `family:${code}`
      || row[1] !== code
      || row[2] !== division
      || row[5] !== semanticAnatomicalDepthMilli("family", division, code)
      || row[6] !== 7_000
      || !divisionCodes.has(row[2])) return false;
    familyCodes.add(code);
  }
  for (const [index, row] of geometry.neurons.entries()) {
    const id = `N${String(index + 1).padStart(3, "0")}`;
    const division = String.fromCharCode(65 + Math.floor(index / 40));
    const family = `${division}${Math.floor((index % 40) / 10) + 1}`;
    if (!validGeometryTuple(row, 7, 3)
      || row[0] !== id
      || row[1] !== division
      || row[2] !== family
      || row[5] !== semanticAnatomicalDepthMilli("neuron", division, family)
      || row[6] !== 3_100
      || !familyCodes.has(row[2])) return false;
  }
  const body = {
    coordinateSpace: geometry.coordinateSpace,
    divisions: geometry.divisions,
    families: geometry.families,
    neurons: geometry.neurons,
  };
  const computedHash = await sha256Hex(canonicalJson(body));
  return computedHash === GALAXY_CANONICAL_GEOMETRY_HASH
    && geometry.geometryHash === GALAXY_CANONICAL_GEOMETRY_HASH;
}

function authoredPoint(row, metadata = {}) {
  const [xUnit, yUnit, zMilli, sizeUnit] = row.slice(-4);
  return {
    ...metadata,
    x: (xUnit - 500_000) / 140_000,
    y: (500_000 - yUnit) / 180_000,
    z: zMilli / 10_000,
    authored: Object.freeze([xUnit, yUnit, zMilli, sizeUnit]),
    sizeUnit,
  };
}

export function buildGalaxyGeometry(galaxy) {
  const divisions = galaxy?.divisions || [];
  const geometry = galaxy?.geometry;
  if (!geometry || !Array.isArray(geometry.divisions) || !Array.isArray(geometry.families) || !Array.isArray(geometry.neurons)) {
    throw new Error("authored public galaxy geometry is unavailable");
  }
  const divisionIndexByCode = new Map(divisions.map((division, index) => [division.code, index]));
  const familyIndexByCode = new Map();
  const divisionGeometry = geometry.divisions.map((row) => authoredPoint(row, {
    divisionIndex: divisionIndexByCode.get(row[1]),
    code: row[1],
  }));
  const familyGeometry = geometry.families.map((row, familyGeometryIndex) => {
    const divisionIndex = divisionIndexByCode.get(row[2]);
    const familyIndex = divisions[divisionIndex]?.families?.findIndex((family) => family.code === row[1]);
    familyIndexByCode.set(row[1], familyGeometryIndex);
    return authoredPoint(row, { code: row[1], divisionIndex, familyIndex, familyGeometryIndex });
  });
  const neurons = [];
  const neuronIndexById = new Map();
  geometry.neurons.forEach((row, index) => {
    const divisionIndex = divisionIndexByCode.get(row[1]);
    const familyGeometryIndex = familyIndexByCode.get(row[2]);
    const familyIndex = familyGeometry[familyGeometryIndex]?.familyIndex;
    const neuron = authoredPoint(row, {
      id: row[0], divisionIndex, familyIndex, familyGeometryIndex,
      phase: index * 0.417,
    });
    neuronIndexById.set(neuron.id, neurons.length);
    neurons.push(neuron);
  });
  return { divisionGeometry, familyGeometry, neurons, neuronIndexById };
}

export function resolveGalaxySelection({
  divisions,
  familyGeometry,
  neurons,
  neuronIndexById,
  previousDivisionCode,
  previousFamilyCode,
  previousNeuronId,
}) {
  let activeDivision = Math.max(0, divisions.findIndex((division) => division.code === previousDivisionCode));
  let activeFamily = previousFamilyCode
    ? familyGeometry.findIndex((geometry) => divisions[geometry.divisionIndex]?.families?.[geometry.familyIndex]?.code === previousFamilyCode)
    : -1;
  const activeNeuron = previousNeuronId ? (neuronIndexById.get(previousNeuronId) ?? -1) : -1;
  if (activeNeuron >= 0) {
    activeDivision = neurons[activeNeuron].divisionIndex;
    activeFamily = neurons[activeNeuron].familyGeometryIndex;
  } else if (activeFamily >= 0) {
    activeDivision = familyGeometry[activeFamily].divisionIndex;
  }
  return { activeDivision, activeFamily, activeNeuron };
}

export function projectGalaxyPoint(point, {
  rotationX,
  rotationY,
  zoom,
  width,
  height,
  panX = 0,
  panY = 0,
}) {
  const cosY = Math.cos(rotationY);
  const sinY = Math.sin(rotationY);
  const x1 = point.x * cosY - point.z * sinY;
  const z1 = point.x * sinY + point.z * cosY;
  const cosX = Math.cos(rotationX);
  const sinX = Math.sin(rotationX);
  const y2 = point.y * cosX - z1 * sinX;
  const z2 = point.y * sinX + z1 * cosX;
  const camera = 8.6;
  const perspective = camera / Math.max(4.2, camera - z2);
  const scale = Math.min(width, height) * 0.12 * zoom;
  return {
    ...point,
    x: width * 0.5 + panX + x1 * scale * perspective,
    y: height * 0.5 + panY + y2 * scale * perspective,
    z: z2,
    perspective,
  };
}

export function galaxyOverviewCamera({ width, height } = {}) {
  const viewportWidth = Number(width);
  const viewportHeight = Number(height);
  if (
    !Number.isFinite(viewportWidth) ||
    !Number.isFinite(viewportHeight) ||
    viewportWidth <= 0 ||
    viewportHeight <= 0
  ) {
    return null;
  }

  const narrow = viewportWidth <= 520;
  const compact = !narrow && viewportWidth <= 820;
  const short = !narrow && !compact && viewportHeight < 560;

  return Object.freeze({
    rotationX: -0.25,
    rotationY: -0.64,
    zoom: narrow ? 0.92 : compact ? 1.14 : short ? 1.18 : 1.34,
    panX: 0,
    panY: clamp(viewportHeight * 0.055, narrow ? 14 : 22, narrow ? 34 : 64),
  });
}

export function galaxyFocusCamera(point, {
  width,
  height,
  zoom,
  targetYRatio = 0.46,
}) {
  if (![point?.x, point?.y, point?.z, width, height, zoom, targetYRatio].every(Number.isFinite)
    || width <= 0 || height <= 0) return null;
  const rotationY = Math.atan2(point.x, point.z);
  const rotationX = -Math.atan2(point.y, Math.hypot(point.x, point.z)) * 0.72;
  const fittedZoom = clamp(zoom, 0.68, 3.4);
  const fittedYRatio = clamp(targetYRatio, 0.38, 0.54);
  const projected = projectGalaxyPoint(point, {
    rotationX,
    rotationY,
    zoom: fittedZoom,
    width,
    height,
    panX: 0,
    panY: 0,
  });
  return Object.freeze({
    rotationX,
    rotationY,
    zoom: fittedZoom,
    panX: width * 0.5 - projected.x,
    panY: height * fittedYRatio - projected.y,
  });
}

export function galaxyZoomAtPointer({ zoom, panX = 0, panY = 0, pointerX, pointerY, width, height, factor, minimum = 0.68, maximum = 3.4 }) {
  const nextZoom = clamp(zoom * factor, minimum, maximum);
  const ratio = nextZoom / Math.max(zoom, 1e-9);
  const centeredX = pointerX - width / 2;
  const centeredY = pointerY - height / 2;
  return {
    zoom: nextZoom,
    panX: centeredX - (centeredX - panX) * ratio,
    panY: centeredY - (centeredY - panY) * ratio,
  };
}

export function galaxyGestureMetrics(points) {
  const rows = Array.from(points || []);
  if (!rows.length) return null;
  const centroid = rows.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
  centroid.x /= rows.length;
  centroid.y /= rows.length;
  const span = rows.length < 2 ? 0 : Math.hypot(rows[0].x - rows[1].x, rows[0].y - rows[1].y);
  return { centroid, span };
}

export function galaxyGestureCamera({ previous, current, zoom, panX = 0, panY = 0, width, height }) {
  if (!previous || !current) return { zoom, panX, panY };
  const translatedPanX = panX + current.centroid.x - previous.centroid.x;
  const translatedPanY = panY + current.centroid.y - previous.centroid.y;
  if (!(previous.span > 0 && current.span > 0)) return { zoom, panX: translatedPanX, panY: translatedPanY };
  return galaxyZoomAtPointer({
    zoom,
    panX: translatedPanX,
    panY: translatedPanY,
    pointerX: current.centroid.x,
    pointerY: current.centroid.y,
    width,
    height,
    factor: current.span / previous.span,
  });
}

export function depthSortGalaxyPoints(points) {
  return points.map((point, index) => ({ point, index }))
    .sort((left, right) => left.point.z - right.point.z || left.index - right.index)
    .map(({ point }) => point);
}

export async function validGalaxyProjection(galaxy, facts) {
  const keys = [
    "schema", "generatorVersion", "sourceGraphHash", "representedNeurons", "divisions",
    "geometry", "statusProjection", "claimBoundary", "projectionHash",
  ];
  if (!exactKeys(galaxy, keys)
    || galaxy.schema !== GALAXY_PUBLIC_CONTRACT.galaxySchema
    || galaxy.generatorVersion !== GALAXY_GENERATOR_VERSION
    || galaxy.statusProjection !== "none"
    || galaxy.sourceGraphHash !== facts?.graphHash
    || galaxy.representedNeurons !== GALAXY_PUBLIC_CONTRACT.neurons
    || typeof galaxy.claimBoundary !== "string"
    || !galaxy.claimBoundary.includes("authenticated local")
    || !HEX64.test(galaxy.projectionHash || "")
    || !Array.isArray(galaxy.divisions)
    || galaxy.divisions.length !== GALAXY_PUBLIC_CONTRACT.divisions
    || !await validPublicGeometryProjection(galaxy.geometry, facts?.graphHash)) return false;

  const geometryNeuronById = new Map(galaxy.geometry.neurons.map((row) => [row[0], row]));
  const topologyNeuronIds = new Set();
  let familyCount = 0;
  let neuronCount = 0;
  for (const [divisionIndex, division] of galaxy.divisions.entries()) {
    const expectedDivision = String.fromCharCode(65 + divisionIndex);
    if (!exactKeys(division, ["code", "name", "neuronCount", "families"])
      || division.code !== expectedDivision
      || typeof division.name !== "string"
      || !Array.isArray(division.families)
      || division.families.length !== GALAXY_PUBLIC_CONTRACT.familiesPerDivision) return false;
    let divisionNeurons = 0;
    for (const [familyIndex, family] of division.families.entries()) {
      const expectedFamily = `${expectedDivision}${familyIndex + 1}`;
      if (!exactKeys(family, ["code", "name", "neuronIds"])
        || family.code !== expectedFamily
        || typeof family.name !== "string"
        || !Array.isArray(family.neuronIds)
        || family.neuronIds.length !== GALAXY_PUBLIC_CONTRACT.neuronsPerFamily) return false;
      familyCount += 1;
      divisionNeurons += family.neuronIds.length;
      for (const neuronId of family.neuronIds) {
        if (topologyNeuronIds.has(neuronId)) return false;
        topologyNeuronIds.add(neuronId);
        const row = geometryNeuronById.get(neuronId);
        if (!row || row[1] !== expectedDivision || row[2] !== expectedFamily) return false;
      }
    }
    if (division.neuronCount !== divisionNeurons) return false;
    neuronCount += divisionNeurons;
  }
  if (familyCount !== GALAXY_PUBLIC_CONTRACT.families
    || neuronCount !== GALAXY_PUBLIC_CONTRACT.neurons
    || topologyNeuronIds.size !== GALAXY_PUBLIC_CONTRACT.neurons) return false;
  const { projectionHash, ...projection } = galaxy;
  return projectionHash === await sha256Hex(canonicalJson(projection));
}

export async function validSnapshot(snapshot) {
  const topKeys = ["schema", "snapshotVersion", "hiveAi", "galaxy", "ecosystem", "refresh", "boundaries", "capturedAt", "snapshotHash"];
  const facts = snapshot?.hiveAi;
  if (!exactKeys(snapshot, topKeys)
    || snapshot.schema !== GALAXY_PUBLIC_CONTRACT.snapshotSchema
    || snapshot.snapshotVersion !== GALAXY_SNAPSHOT_VERSION
    || !HEX64.test(snapshot.snapshotHash || "")
    || snapshotFreshness(snapshot.capturedAt).state === "invalid"
    || !exactKeys(facts, [
      "sourceCommit", "sourceBranch", "graphSource", "graphSchema", "graphHash", "sourceFingerprint",
      "neurons", "trainableNeurons", "deterministicNeurons", "purposeMastered", "twitches", "pmOnly",
      "notPurposeMastered", "nodes", "edges", "divisions", "families", "moons", "organs", "components",
      "federationRepositories",
    ])
    || !HEX40.test(facts.sourceCommit || "")
    || facts.sourceBranch !== "main"
    || facts.graphSchema !== GALAXY_PUBLIC_CONTRACT.graphSchema
    || !HEX64.test(facts.graphHash || "")
    || !NONZERO_HEX64.test(facts.sourceFingerprint || "")
    || facts.neurons !== GALAXY_PUBLIC_CONTRACT.neurons
    || facts.divisions !== GALAXY_PUBLIC_CONTRACT.divisions
    || facts.families !== GALAXY_PUBLIC_CONTRACT.families
    || facts.trainableNeurons + facts.deterministicNeurons !== facts.neurons
    || [facts.neurons, facts.trainableNeurons, facts.deterministicNeurons, facts.components, facts.organs, facts.nodes, facts.edges, facts.moons, facts.divisions, facts.families, facts.federationRepositories]
      .some((value) => !Number.isSafeInteger(value) || value <= 0)
    || [facts.purposeMastered, facts.twitches, facts.pmOnly, facts.notPurposeMastered]
      .some((value) => !Number.isSafeInteger(value) || value < 0)
    || facts.twitches > facts.purposeMastered
    || facts.purposeMastered > facts.neurons
    || facts.pmOnly !== facts.purposeMastered - facts.twitches
    || facts.notPurposeMastered !== facts.neurons - facts.purposeMastered
    || !exactKeys(snapshot.boundaries, ["snapshotOnly", "runtimeTelemetry", "grantsAuthority", "privateEvidencePublished", "localChatUrl", "localGalaxyUrl"])
    || snapshot.boundaries.snapshotOnly !== true
    || snapshot.boundaries.runtimeTelemetry !== false
    || snapshot.boundaries.grantsAuthority !== false
    || snapshot.boundaries.privateEvidencePublished !== false
    || snapshot.boundaries.localChatUrl !== "http://127.0.0.1:5002/chat"
    || snapshot.boundaries.localGalaxyUrl !== "http://127.0.0.1:5002/constellation/body?presentation=1"
    || !exactKeys(snapshot.ecosystem, ["schema", "primaryOrgans", "federationRepositories"])
    || snapshot.ecosystem.schema !== "hive.ecosystem.public-organ-map.v1"
    || snapshot.ecosystem.federationRepositories !== facts.federationRepositories
    || !Array.isArray(snapshot.ecosystem.primaryOrgans)
    || snapshot.ecosystem.primaryOrgans.length !== 6
    || !exactKeys(snapshot.refresh, ["privateSourceMode", "automaticBridgeEnabled", "reasonCode", "lastGoodBehavior"])
    || snapshot.refresh.lastGoodBehavior !== "retain_previous_snapshot") return false;

  const organIds = ["hive-ai", "hivepoa", "neurachain", "hive-ide", "second-brain", "compute-pool"];
  for (const [index, organ] of snapshot.ecosystem.primaryOrgans.entries()) {
    if (!exactKeys(organ, ["id", "label", "role", "exposure"]) || organ.id !== organIds[index]) return false;
    if (!["label", "role", "exposure"].every((key) => typeof organ[key] === "string" && organ[key].length > 0)) return false;
  }
  const activeCloud = snapshot.refresh.automaticBridgeEnabled === true
    && snapshot.refresh.privateSourceMode === "scheduled-living-main-publisher"
    && snapshot.refresh.reasonCode === "SCHEDULED_LIVING_MAIN_PUBLISHER";
  const activeLocal = snapshot.refresh.automaticBridgeEnabled === true
    && snapshot.refresh.privateSourceMode === "local-living-main-publisher"
    && snapshot.refresh.reasonCode === "LOCAL_LIVING_MAIN_PUBLISHER";
  const inactive = snapshot.refresh.automaticBridgeEnabled === false
    && snapshot.refresh.privateSourceMode === "manual-source-bound-snapshot"
    && ["CROSS_REPOSITORY_CREDENTIAL_NOT_CONFIGURED", "PRIVATE_SOURCE_CHECKOUT_FAILED"].includes(snapshot.refresh.reasonCode);
  if (!activeCloud && !activeLocal && !inactive) return false;
  if (!await validGalaxyProjection(snapshot.galaxy, facts)) return false;
  const { snapshotHash, ...body } = snapshot;
  return snapshotHash === await sha256Hex(canonicalJson(body));
}

function nearestProjected(points, pointer, radiusFor) {
  let bestIndex = -1;
  let bestScore = Number.POSITIVE_INFINITY;
  let bestDepth = Number.NEGATIVE_INFINITY;
  points.forEach((point, index) => {
    const radius = radiusFor(point, index);
    if (!(radius > 0)) return;
    const score = Math.hypot(point.x - pointer.x, point.y - pointer.y) / radius;
    if (score > 1) return;
    if (score < bestScore - 1e-9 || (Math.abs(score - bestScore) <= 1e-9 && point.z > bestDepth)) {
      bestIndex = index;
      bestScore = score;
      bestDepth = point.z;
    }
  });
  return bestIndex;
}

export function galaxyDivisionVisualRadius(point, zoom, profile, selected) {
  return clamp(
    (selected ? 48 : 34) * point.perspective * zoom * profile.divisions,
    20,
    selected ? 98 : 70,
  );
}

export function selectGalaxyHit({
  pointer,
  zoom,
  lens,
  projectedDivisions,
  projectedFamilies,
  projectedNeurons,
  activeDivision = -1,
  activeFamily = -1,
  activeNeuron = -1,
  hoverDivision = -1,
  hoverFamily = -1,
  hoverNeuron = -1,
}) {
  const profile = GALAXY_LENS_PROFILES[lens] || GALAXY_LENS_PROFILES.mastery;
  let neuronIndex = -1;
  if (zoom > 1.62) {
    neuronIndex = nearestProjected(projectedNeurons, pointer, (point, index) => {
      const emphasis = index === activeNeuron || index === hoverNeuron ? 1.18 : 1;
      return clamp(7.5 * point.perspective * zoom * Math.sqrt(profile.neurons) * emphasis, 7, 20);
    });
  }
  if (neuronIndex >= 0) {
    const neuron = projectedNeurons[neuronIndex];
    return { divisionIndex: neuron.divisionIndex, familyIndex: neuron.familyGeometryIndex, neuronIndex };
  }

  let familyIndex = -1;
  if (zoom > profile.familyThreshold) {
    familyIndex = nearestProjected(projectedFamilies, pointer, (point, index) => {
      const selected = index === activeFamily || index === hoverFamily;
      const visualRadius = clamp(
        (selected ? 17 : 11) * point.perspective * Math.sqrt(zoom) * profile.families,
        7,
        selected ? 34 : 22,
      );
      return Math.max(14, visualRadius);
    });
  }
  if (familyIndex >= 0) {
    return { divisionIndex: projectedFamilies[familyIndex].divisionIndex, familyIndex, neuronIndex: -1 };
  }

  const divisionIndex = nearestProjected(projectedDivisions, pointer, (point, index) => {
    const selected = index === activeDivision || index === hoverDivision;
    return galaxyDivisionVisualRadius(point, zoom, profile, selected);
  });
  return { divisionIndex, familyIndex: -1, neuronIndex: -1 };
}
