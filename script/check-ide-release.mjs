import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateIdeReleaseLatest } from "../hub-assets/ide-release-core.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const feedPath = path.join(root, "downloads", "hive-ide", "latest.json");
const manifestPath = path.join(root, "downloads", "hive-ide", "hive-ide-release-manifest.json");
const HEX_40 = /^[a-f0-9]{40}$/;
const HEX_64 = /^[a-f0-9]{64}$/;

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function validFixture() {
  const tag = "hive-ide-v0.3.0-tester.1";
  const base = `https://github.com/Dhenz14/Dhenz14.github.io/releases/download/${tag}/`;
  return {
    schema: "hive.ide.public_release_latest.v1",
    product: "Hive IDE",
    version: "0.3.0",
    stage: "tester",
    channel: "unsigned-public-tester",
    releasedAtUtc: "2026-08-05T00:00:00.000Z",
    sourceCommit: "1".repeat(40),
    manifestUrl: `${base}hive-ide-release-manifest.json`,
    manifestSha256: "2".repeat(64),
    installerUrl: `${base}Hive-IDE-OneClick-Windows-x64.exe`,
    installerSha256: "3".repeat(64),
    installerSizeBytes: 128 * 1024 * 1024,
    publisherAuthenticated: false,
    smartScreenWarningExpected: true,
    readyForPublicFunctionalTesting: true,
  };
}

function expectReject(label, mutation) {
  const fixture = structuredClone(validFixture());
  mutation(fixture);
  try {
    validateIdeReleaseLatest(fixture);
  } catch {
    return { label, passed: true };
  }
  return { label, passed: false };
}

function selfTest() {
  validateIdeReleaseLatest(validFixture());
  const tests = [
    { label: "valid_unsigned_tester", passed: true },
    expectReject("unknown_field_refused", (value) => { value.untrusted = true; }),
    expectReject("http_installer_refused", (value) => { value.installerUrl = value.installerUrl.replace("https:", "http:"); }),
    expectReject("alternate_repository_refused", (value) => { value.installerUrl = value.installerUrl.replace("Dhenz14.github.io", "HivePoA"); }),
    expectReject("split_release_tag_refused", (value) => { value.installerUrl = value.installerUrl.replace("tester.1", "tester.2"); }),
    expectReject("unsigned_stable_refused", (value) => { value.stage = "stable"; }),
    expectReject("source_identity_refused", (value) => { value.sourceCommit = "main"; }),
    expectReject("contradictory_smartscreen_refused", (value) => { value.smartScreenWarningExpected = false; }),
    expectReject("tiny_installer_refused", (value) => { value.installerSizeBytes = 10; }),
  ];
  const ok = tests.every((test) => test.passed);
  console.log(JSON.stringify({ schema: "hive.ide.public_hub_release_self_test.v1", ok, tests }, null, 2));
  if (!ok) process.exitCode = 1;
}

function validatePublishedFeed() {
  if (!fs.existsSync(feedPath) || !fs.existsSync(manifestPath)) {
    throw new Error("Hive IDE feed and mirrored manifest must both be published");
  }
  const feedBytes = fs.readFileSync(feedPath);
  const manifestBytes = fs.readFileSync(manifestPath);
  if (feedBytes.length > 64 * 1024 || manifestBytes.length > 512 * 1024) {
    throw new Error("Hive IDE publication documents exceed their static size bounds");
  }
  const latest = validateIdeReleaseLatest(JSON.parse(feedBytes.toString("utf8")));
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const manifestHash = sha256(manifestBytes);
  const releaseBase = `https://github.com/Dhenz14/Dhenz14.github.io/releases/download/${latest.releaseTag}/`;
  const expectedBoundary = latest.publisherAuthenticated
    ? "PUBLISHER_AUTHENTICATED_WINDOWS_TESTER_RELEASE_NOT_PUBLIC_HIVEPOA_REWARD_NETWORK"
    : "PUBLIC_HTTPS_UNSIGNED_WINDOWS_TESTER_RELEASE_NOT_PUBLISHER_AUTHENTICATED_OR_PUBLIC_HIVEPOA_REWARD_NETWORK";
  const ideSource = manifest?.source?.hiveIde;
  const hiveAiSource = manifest?.source?.hiveAi;
  const poaSource = manifest?.source?.hivePoAInternalSidecar;
  const policy = manifest?.testerPolicy;
  const runtime = manifest?.runtime;
  const artifact = manifest?.artifact;
  if (
    !HEX_64.test(manifestHash) ||
    latest.manifestSha256 !== manifestHash ||
    manifest?.schema !== "hive.ide.public_release_manifest.v1" ||
    manifest?.product?.name !== "Hive IDE" ||
    manifest?.product?.version !== latest.version ||
    manifest?.product?.platform !== "windows" ||
    manifest?.product?.architecture !== "x86_64" ||
    manifest?.product?.installerType !== "nsis-current-user" ||
    manifest?.product?.profile !== "tester-complete-internal-option-c" ||
    manifest?.release?.tag !== latest.releaseTag ||
    manifest?.release?.stage !== latest.stage ||
    manifest?.release?.channel !== latest.channel ||
    manifest?.release?.repository !== "Dhenz14/Dhenz14.github.io" ||
    manifest?.release?.releasedAtUtc !== latest.releasedAtUtc ||
    manifest?.release?.releasePageUrl !== `https://github.com/Dhenz14/Dhenz14.github.io/releases/tag/${latest.releaseTag}` ||
    manifest?.release?.updateFeedUrl !== "https://dhenz14.github.io/downloads/hive-ide/latest.json" ||
    manifest?.release?.manifestUrl !== latest.manifestUrl ||
    manifest?.release?.provenanceUrl !== `${releaseBase}windows-installer-provenance.json` ||
    manifest?.release?.installerUrl !== latest.installerUrl ||
    artifact?.name !== "Hive-IDE-OneClick-Windows-x64.exe" ||
    artifact?.sha256 !== latest.installerSha256 ||
    artifact?.sizeBytes !== latest.installerSizeBytes ||
    artifact?.publisherAuthenticated !== latest.publisherAuthenticated ||
    !HEX_64.test(artifact?.unsignedBuildSha256 ?? "") ||
    (!latest.publisherAuthenticated && artifact?.unsignedBuildSha256 !== artifact?.sha256) ||
    (!latest.publisherAuthenticated && artifact?.authenticodeReceiptSha256 !== null) ||
    (latest.publisherAuthenticated && !HEX_64.test(artifact?.authenticodeReceiptSha256 ?? "")) ||
    ideSource?.commit !== latest.sourceCommit ||
    !HEX_40.test(ideSource?.tree ?? "") ||
    !HEX_40.test(hiveAiSource?.commit ?? "") ||
    !HEX_40.test(hiveAiSource?.tree ?? "") ||
    !HEX_40.test(poaSource?.commit ?? "") ||
    !HEX_40.test(poaSource?.tree ?? "") ||
    !HEX_64.test(poaSource?.artifactSha256 ?? "") ||
    !HEX_64.test(poaSource?.checksumReceiptSha256 ?? "") ||
    poaSource?.publicHivePoAReleaseClaimed !== false ||
    runtime?.cleanSourceWorktrees !== true ||
    runtime?.offlineBundledDependencies !== true ||
    runtime?.wslBootstrapMayRequireWindowsManagedNetwork !== true ||
    runtime?.installerProvenanceReceipt?.name !== "windows-installer-provenance.json" ||
    !HEX_64.test(runtime?.installerProvenanceReceipt?.sha256 ?? "") ||
    policy?.readyForPublicFunctionalTesting !== true ||
    policy?.signedPublicRelease !== latest.publisherAuthenticated ||
    policy?.smartScreenWarningExpected !== latest.smartScreenWarningExpected ||
    policy?.testCreditsHaveMonetaryValue !== false ||
    policy?.testCreditsTransferable !== false ||
    policy?.testCreditsRedeemable !== false ||
    manifest?.claimBoundary !== expectedBoundary
  ) {
    throw new Error("mirrored Hive IDE manifest does not bind the exact public feed and claim boundary");
  }
  console.log(`IDE_RELEASE_FEED_OK version=${latest.version} channel=${latest.channel} source=${latest.sourceCommit.slice(0, 12)} sha256=${latest.installerSha256}`);
}

if (process.argv.includes("--self-test")) {
  selfTest();
} else {
  validatePublishedFeed();
}
