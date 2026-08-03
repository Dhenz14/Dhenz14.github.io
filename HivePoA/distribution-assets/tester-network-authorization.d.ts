export const PINNED_CHANNEL_INDEX_PUBLIC_KEY_SHA256: string;
export const TESTER_NETWORK_RELEASE: Readonly<{
  version: string;
  releaseSequence: number;
  githubReleaseTag: string;
  githubRepository: string;
  githubRepositoryId: number;
  primaryArtifact: string;
  platform: string;
  architecture: string;
}>;
export const TESTER_NETWORK_METADATA_ROLES: readonly ["manifest", "receipt", "publicationProof"];
export function canonicalStringify(value: unknown): string;
export function htmlSafeJson(value: unknown): string;
export function sha256Hex(buffer: ArrayBuffer): Promise<string>;
export function verifyAuthorizedTesterNetworkIndex(
  index: unknown,
  options?: { pinnedFingerprint?: string; nowMs?: number },
): Promise<{
  ok: boolean;
  reason: string | null;
  release: Record<string, any> | null;
  signed: Record<string, any> | null;
}>;

