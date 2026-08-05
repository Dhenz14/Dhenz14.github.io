const HEX_40 = /^[a-f0-9]{40}$/;
const HEX_64 = /^[a-f0-9]{64}$/;
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const RELEASE_CHANNELS = new Set(["unsigned-public-tester", "publisher-authenticated"]);
const RELEASE_STAGES = new Set(["tester", "stable"]);
const MAX_INSTALLER_BYTES = 2 * 1024 * 1024 * 1024;
const LATEST_KEYS = [
  "schema",
  "product",
  "version",
  "stage",
  "channel",
  "releasedAtUtc",
  "sourceCommit",
  "manifestUrl",
  "manifestSha256",
  "installerUrl",
  "installerSha256",
  "installerSizeBytes",
  "publisherAuthenticated",
  "smartScreenWarningExpected",
  "readyForPublicFunctionalTesting",
];

function requireExactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(`${label} fields are not exact`);
  }
}

function requireString(value, label) {
  if (typeof value !== "string" || !value.trim() || value !== value.trim()) {
    throw new Error(`${label} must be a canonical non-empty string`);
  }
  return value;
}

function requireHex(value, pattern, label) {
  const canonical = requireString(value, label);
  if (!pattern.test(canonical)) throw new Error(`${label} is malformed`);
  return canonical;
}

function requireCanonicalUtc(value) {
  const canonical = requireString(value, "releasedAtUtc");
  const parsed = new Date(canonical);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== canonical) {
    throw new Error("releasedAtUtc is not canonical UTC");
  }
  return canonical;
}

function requireReleaseAsset(value, fileName) {
  const raw = requireString(value, `${fileName} URL`);
  const parsed = new URL(raw);
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "github.com" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.port
  ) {
    throw new Error(`${fileName} URL escaped the immutable central release host`);
  }
  const escapedFile = fileName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = parsed.pathname.match(
    new RegExp(`^/Dhenz14/Dhenz14\\.github\\.io/releases/download/([A-Za-z0-9][A-Za-z0-9._-]{0,127})/${escapedFile}$`),
  );
  if (!match) throw new Error(`${fileName} URL is not an immutable central release asset`);
  return { url: parsed.href, tag: match[1] };
}

export function validateIdeReleaseLatest(value) {
  requireExactKeys(value, LATEST_KEYS, "Hive IDE latest feed");
  if (value.schema !== "hive.ide.public_release_latest.v1" || value.product !== "Hive IDE") {
    throw new Error("Hive IDE latest feed identity is invalid");
  }
  const version = requireString(value.version, "version");
  if (!SEMVER.test(version)) throw new Error("version is not semantic");
  const stage = requireString(value.stage, "stage");
  const channel = requireString(value.channel, "channel");
  if (!RELEASE_STAGES.has(stage) || !RELEASE_CHANNELS.has(channel)) {
    throw new Error("release stage or channel is unsupported");
  }
  if (stage === "stable" && channel !== "publisher-authenticated") {
    throw new Error("an unsigned release cannot be advertised as stable");
  }
  const publisherAuthenticated = value.publisherAuthenticated;
  const smartScreenWarningExpected = value.smartScreenWarningExpected;
  if (
    typeof publisherAuthenticated !== "boolean" ||
    typeof smartScreenWarningExpected !== "boolean" ||
    publisherAuthenticated !== (channel === "publisher-authenticated") ||
    smartScreenWarningExpected === publisherAuthenticated ||
    value.readyForPublicFunctionalTesting !== true
  ) {
    throw new Error("release readiness or publisher-authentication flags contradict the channel");
  }
  const manifest = requireReleaseAsset(value.manifestUrl, "hive-ide-release-manifest.json");
  const installer = requireReleaseAsset(value.installerUrl, "Hive-IDE-OneClick-Windows-x64.exe");
  if (manifest.tag !== installer.tag) throw new Error("manifest and installer do not share one release tag");
  if (
    !Number.isSafeInteger(value.installerSizeBytes) ||
    value.installerSizeBytes < 1024 * 1024 ||
    value.installerSizeBytes > MAX_INSTALLER_BYTES
  ) {
    throw new Error("installer size is outside the bounded Windows package range");
  }
  return Object.freeze({
    ...value,
    version,
    stage,
    channel,
    releasedAtUtc: requireCanonicalUtc(value.releasedAtUtc),
    sourceCommit: requireHex(value.sourceCommit, HEX_40, "sourceCommit"),
    manifestUrl: manifest.url,
    manifestSha256: requireHex(value.manifestSha256, HEX_64, "manifestSha256"),
    installerUrl: installer.url,
    installerSha256: requireHex(value.installerSha256, HEX_64, "installerSha256"),
    releaseTag: installer.tag,
  });
}

export function humanInstallerBytes(bytes) {
  if (!Number.isSafeInteger(bytes) || bytes < 0) return "Unavailable";
  const units = ["B", "KiB", "MiB", "GiB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 100 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}
