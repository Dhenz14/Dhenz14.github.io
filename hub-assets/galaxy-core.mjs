export const GALAXY_LENS_PROFILES = Object.freeze({
  mastery: { links: 1, divisions: 1, families: 1, neurons: 1, familyThreshold: 1.02 },
  artifact: { links: 0.78, divisions: 0.9, families: 1.35, neurons: 1.05, familyThreshold: 0.94 },
  evidence: { links: 1.55, divisions: 0.82, families: 1.05, neurons: 0.92, familyThreshold: 1.06 },
  runtime: { links: 0.86, divisions: 0.9, families: 0.92, neurons: 1.24, familyThreshold: 1.12 },
  product: { links: 0.72, divisions: 1.35, families: 0.72, neurons: 0.78, familyThreshold: 1.28 },
});

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

export function buildGalaxyGeometry(divisions) {
  const divisionGeometry = [];
  const familyGeometry = [];
  const neurons = [];
  const neuronIndexById = new Map();
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const total = divisions.length;

  divisions.forEach((division, divisionIndex) => {
    const vertical = 1 - (2 * (divisionIndex + 0.5)) / total;
    const shell = Math.sqrt(Math.max(0, 1 - vertical * vertical));
    const theta = divisionIndex * goldenAngle + 0.22;
    const center = {
      x: Math.cos(theta) * shell * 2.45,
      y: vertical * 2.25,
      z: Math.sin(theta) * shell * 1.9,
    };
    divisionGeometry.push({ ...center, divisionIndex });

    division.families.forEach((family, familyIndex) => {
      const familyGeometryIndex = familyGeometry.length;
      const familyAngle = theta + familyIndex * (Math.PI / 2) + 0.28;
      const familyCenter = {
        x: center.x + Math.cos(familyAngle) * 0.34,
        y: center.y + (familyIndex - 1.5) * 0.12,
        z: center.z + Math.sin(familyAngle) * 0.34,
        divisionIndex,
        familyIndex,
        familyGeometryIndex,
      };
      familyGeometry.push(familyCenter);

      family.neuronIds.forEach((neuronId, neuronIndex) => {
        const localAngle = neuronIndex * goldenAngle + familyIndex * 0.71;
        const localVertical = (neuronIndex - 4.5) / 9;
        const localShell = Math.sqrt(Math.max(0, 1 - localVertical * localVertical));
        const radius = 0.17 + (neuronIndex % 3) * 0.018;
        const neuron = {
          id: neuronId,
          divisionIndex,
          familyIndex,
          familyGeometryIndex,
          x: familyCenter.x + Math.cos(localAngle) * localShell * radius,
          y: familyCenter.y + localVertical * radius * 1.4,
          z: familyCenter.z + Math.sin(localAngle) * localShell * radius,
          phase: (divisionIndex * 40 + familyIndex * 10 + neuronIndex) * 0.417,
        };
        neuronIndexById.set(neuronId, neurons.length);
        neurons.push(neuron);
      });
    });
  });
  return { divisionGeometry, familyGeometry, neurons, neuronIndexById };
}

export function projectGalaxyPoint(point, { rotationX, rotationY, zoom, width, height }) {
  const cosY = Math.cos(rotationY);
  const sinY = Math.sin(rotationY);
  const x1 = point.x * cosY - point.z * sinY;
  const z1 = point.x * sinY + point.z * cosY;
  const cosX = Math.cos(rotationX);
  const sinX = Math.sin(rotationX);
  const y2 = point.y * cosX - z1 * sinX;
  const z2 = point.y * sinX + z1 * cosX;
  const camera = 7.4;
  const perspective = camera / Math.max(3.6, camera - z2);
  const scale = Math.min(width, height) * 0.137 * zoom;
  return {
    ...point,
    x: width * 0.5 + x1 * scale * perspective,
    y: height * 0.5 + y2 * scale * perspective,
    z: z2,
    perspective,
  };
}

async function sha256Hex(value) {
  if (!globalThis.crypto?.subtle || typeof TextEncoder !== "function") return "";
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function validGalaxyProjection(galaxy, facts) {
  if (galaxy?.schema !== "hive.ecosystem.public-galaxy.v1"
    || galaxy?.statusProjection !== "none"
    || galaxy?.representedNeurons !== facts?.neurons
    || galaxy?.sourceGraphHash !== facts?.graphHash
    || !/^[a-f0-9]{64}$/.test(galaxy?.projectionHash || "")
    || !Array.isArray(galaxy?.divisions)
    || galaxy.divisions.length !== facts?.divisions) return false;

  const neuronIds = new Set();
  let familyCount = 0;
  let neuronCount = 0;
  for (const [divisionIndex, division] of galaxy.divisions.entries()) {
    const expectedDivision = String.fromCharCode(65 + divisionIndex);
    if (division?.code !== expectedDivision
      || typeof division?.name !== "string"
      || !Array.isArray(division?.families)
      || division.families.length !== 4) return false;
    let divisionNeurons = 0;
    for (const [familyIndex, family] of division.families.entries()) {
      if (family?.code !== `${expectedDivision}${familyIndex + 1}`
        || typeof family?.name !== "string"
        || !Array.isArray(family?.neuronIds)
        || family.neuronIds.length !== 10) return false;
      familyCount += 1;
      divisionNeurons += family.neuronIds.length;
      for (const neuronId of family.neuronIds) {
        if (!/^N\d{3}$/.test(neuronId) || neuronIds.has(neuronId)) return false;
        neuronIds.add(neuronId);
      }
    }
    if (division?.neuronCount !== divisionNeurons) return false;
    neuronCount += divisionNeurons;
  }
  if (familyCount !== facts.families || neuronCount !== facts.neurons || neuronIds.size !== facts.neurons) return false;
  for (let index = 1; index <= facts.neurons; index += 1) {
    if (!neuronIds.has(`N${String(index).padStart(3, "0")}`)) return false;
  }
  return true;
}

export async function validSnapshot(snapshot) {
  const facts = snapshot?.hiveAi;
  if (!(snapshot?.schema === "hive.ecosystem.public-source-snapshot.v2"
    && snapshot?.boundaries?.snapshotOnly === true
    && snapshot?.boundaries?.runtimeTelemetry === false
    && snapshot?.boundaries?.grantsAuthority === false
    && /^[a-f0-9]{40}$/.test(facts?.sourceCommit || "")
    && /^[a-f0-9]{64}$/.test(facts?.graphHash || "")
    && [facts?.neurons, facts?.components, facts?.organs, facts?.nodes, facts?.edges, facts?.moons, facts?.divisions, facts?.families]
      .every((value) => Number.isSafeInteger(value) && value > 0)
    && [facts?.purposeMastered, facts?.twitches, facts?.pmOnly, facts?.notPurposeMastered]
      .every((value) => Number.isSafeInteger(value) && value >= 0)
    && facts.twitches <= facts.purposeMastered
    && facts.pmOnly === facts.purposeMastered - facts.twitches
    && facts.notPurposeMastered === facts.neurons - facts.purposeMastered
    && validGalaxyProjection(snapshot?.galaxy, facts))) return false;

  const { projectionHash, ...projection } = snapshot.galaxy;
  return projectionHash === await sha256Hex(JSON.stringify(projection));
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
    return {
      divisionIndex: neuron.divisionIndex,
      familyIndex: neuron.familyGeometryIndex,
      neuronIndex,
    };
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
    return {
      divisionIndex: projectedFamilies[familyIndex].divisionIndex,
      familyIndex,
      neuronIndex: -1,
    };
  }

  const divisionIndex = nearestProjected(projectedDivisions, pointer, (point, index) => {
    const selected = index === activeDivision || index === hoverDivision;
    return clamp(
      (selected ? 43 : 31) * point.perspective * zoom * profile.divisions,
      17,
      selected ? 88 : 62,
    );
  });
  return { divisionIndex, familyIndex: -1, neuronIndex: -1 };
}
