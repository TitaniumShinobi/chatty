import {
  validatePocketverseManifest,
  type PocketverseManifest,
} from "./pocketverseManifest";

export type PocketverseSignatureAlgorithm = "ECDSA-P256-SHA256";

export type SignedPocketverseManifest = {
  schemaVersion: 1;
  manifest: PocketverseManifest;
  manifestHash: string;
  encryptedCapsuleHash: string;
  signature: {
    algorithm: PocketverseSignatureAlgorithm;
    publicKeyFingerprint: string;
    valueHex: string;
  };
};

export type PocketverseVerificationResult = {
  ok: boolean;
  readiness: Array<"declared" | "signed" | "tamper-evident" | "not-yet-rematerializable">;
  errors: string[];
  manifestHash: string;
  encryptedCapsuleHash: string;
  publicKeyFingerprint: string;
};

export type PocketverseNotificationPayload = {
  eventType:
    | "product_collapsed"
    | "product_missing"
    | "recovery_needs_approval"
    | "unknown_machine_attempted_seed_access";
  product: string;
  timestamp: string;
  approvalUrl?: string;
  challengeId?: string;
};

const encoder = new TextEncoder();

function assertWebCrypto(): Crypto {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Web Crypto subtle API is required for Pocketverse verification.");
  }
  return globalThis.crypto;
}

function bytesToHex(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Array.from(view)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex: string): Uint8Array {
  if (!/^(?:[a-f0-9]{2})+$/i.test(hex)) {
    throw new Error("Invalid hex string.");
  }

  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < hex.length; index += 2) {
    bytes[index / 2] = Number.parseInt(hex.slice(index, index + 2), 16);
  }
  return bytes;
}

function sortForCanonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortForCanonicalJson);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entryValue]) => entryValue !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, sortForCanonicalJson(entryValue)]),
    );
  }

  return value;
}

export function canonicalizePocketverseJson(value: unknown): string {
  return JSON.stringify(sortForCanonicalJson(value)) || "";
}

async function sha256HexFromBytes(bytes: Uint8Array): Promise<string> {
  const digest = await assertWebCrypto().subtle.digest("SHA-256", bytes);
  return bytesToHex(digest);
}

export async function sha256Hex(value: string | Uint8Array): Promise<string> {
  return sha256HexFromBytes(typeof value === "string" ? encoder.encode(value) : value);
}

async function publicKeyFingerprint(publicKey: CryptoKey): Promise<string> {
  const jwk = await assertWebCrypto().subtle.exportKey("jwk", publicKey);
  const publicOnlyJwk = {
    crv: jwk.crv,
    ext: jwk.ext,
    key_ops: jwk.key_ops,
    kty: jwk.kty,
    x: jwk.x,
    y: jwk.y,
  };
  return sha256Hex(canonicalizePocketverseJson(publicOnlyJwk));
}

export async function signPocketverseManifestForTest(input: {
  manifest: PocketverseManifest;
  encryptedCapsuleCiphertext: string | Uint8Array;
  privateKey: CryptoKey;
  publicKey: CryptoKey;
}): Promise<SignedPocketverseManifest> {
  const manifestValidation = validatePocketverseManifest(input.manifest);
  if (!manifestValidation.ok) {
    throw new Error(`Cannot sign invalid Pocketverse manifest: ${manifestValidation.errors.join(" ")}`);
  }

  const canonicalManifest = canonicalizePocketverseJson(input.manifest);
  const manifestBytes = encoder.encode(canonicalManifest);
  const signature = await assertWebCrypto().subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    input.privateKey,
    manifestBytes,
  );

  return {
    schemaVersion: 1,
    manifest: input.manifest,
    manifestHash: await sha256HexFromBytes(manifestBytes),
    encryptedCapsuleHash: await sha256Hex(input.encryptedCapsuleCiphertext),
    signature: {
      algorithm: "ECDSA-P256-SHA256",
      publicKeyFingerprint: await publicKeyFingerprint(input.publicKey),
      valueHex: bytesToHex(signature),
    },
  };
}

export async function verifySignedPocketverseManifest(input: {
  signedManifest: SignedPocketverseManifest;
  encryptedCapsuleCiphertext: string | Uint8Array;
  publicKey: CryptoKey;
}): Promise<PocketverseVerificationResult> {
  const errors: string[] = [];
  const canonicalManifest = canonicalizePocketverseJson(input.signedManifest.manifest);
  const manifestBytes = encoder.encode(canonicalManifest);
  const manifestHash = await sha256HexFromBytes(manifestBytes);
  const encryptedCapsuleHash = await sha256Hex(input.encryptedCapsuleCiphertext);
  const fingerprint = await publicKeyFingerprint(input.publicKey);
  const validation = validatePocketverseManifest(input.signedManifest.manifest);

  if (input.signedManifest.schemaVersion !== 1) {
    errors.push("signed manifest schemaVersion must be 1.");
  }
  if (!validation.ok) {
    errors.push(...validation.errors);
  }
  if (input.signedManifest.manifestHash !== manifestHash) {
    errors.push("manifest hash mismatch.");
  }
  if (input.signedManifest.encryptedCapsuleHash !== encryptedCapsuleHash) {
    errors.push("encrypted capsule hash mismatch.");
  }
  if (input.signedManifest.signature.algorithm !== "ECDSA-P256-SHA256") {
    errors.push("unsupported signature algorithm.");
  }
  if (input.signedManifest.signature.publicKeyFingerprint !== fingerprint) {
    errors.push("public key fingerprint mismatch.");
  }

  let signatureValid = false;
  try {
    signatureValid = await assertWebCrypto().subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      input.publicKey,
      hexToBytes(input.signedManifest.signature.valueHex),
      manifestBytes,
    );
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "signature verification failed.");
  }

  if (!signatureValid) {
    errors.push("signature verification failed.");
  }

  const ok = errors.length === 0;
  const readiness: PocketverseVerificationResult["readiness"] = ["declared"];
  if (signatureValid && input.signedManifest.signature.publicKeyFingerprint === fingerprint) {
    readiness.push("signed");
  }
  if (
    input.signedManifest.manifestHash === manifestHash &&
    input.signedManifest.encryptedCapsuleHash === encryptedCapsuleHash
  ) {
    readiness.push("tamper-evident");
  }
  if (ok) {
    readiness.push("not-yet-rematerializable");
  }

  return {
    ok,
    readiness,
    errors: Array.from(new Set(errors)),
    manifestHash,
    encryptedCapsuleHash,
    publicKeyFingerprint: fingerprint,
  };
}

export function shapePocketverseNotificationPayload(input: {
  eventType: PocketverseNotificationPayload["eventType"];
  product: string;
  timestamp?: string;
  approvalUrl?: string;
  challengeId?: string;
}): PocketverseNotificationPayload {
  const timestamp = input.timestamp || new Date().toISOString();
  const payload: PocketverseNotificationPayload = {
    eventType: input.eventType,
    product: input.product,
    timestamp,
  };

  if (input.approvalUrl) {
    payload.approvalUrl = input.approvalUrl;
  }
  if (input.challengeId) {
    payload.challengeId = input.challengeId;
  }

  return payload;
}
