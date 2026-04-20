import { webcrypto } from "node:crypto";
import {
  CHATTY_PRODUCT_BODY_POCKETVERSE_MANIFEST,
  type PocketverseManifest,
} from "../pocketverseManifest";
import {
  shapePocketverseNotificationPayload,
  signPocketverseManifestForTest,
  verifySignedPocketverseManifest,
} from "../pocketverseVerifier";

if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto,
    configurable: true,
  });
}

const MOCK_ENCRYPTED_CAPSULE = "mock-encrypted-capsule:v0:opaque-ciphertext-no-plaintext-contacts";

function cloneManifest(manifest: PocketverseManifest): PocketverseManifest {
  return JSON.parse(JSON.stringify(manifest));
}

async function generateTestKeyPair(): Promise<CryptoKeyPair> {
  return globalThis.crypto.subtle.generateKey(
    {
      name: "ECDSA",
      namedCurve: "P-256",
    },
    true,
    ["sign", "verify"],
  ) as Promise<CryptoKeyPair>;
}

describe("pocketverseVerifier", () => {
  it("signs and verifies Chatty's product-body Pocketverse manifest", async () => {
    const keyPair = await generateTestKeyPair();
    const signed = await signPocketverseManifestForTest({
      manifest: CHATTY_PRODUCT_BODY_POCKETVERSE_MANIFEST,
      encryptedCapsuleCiphertext: MOCK_ENCRYPTED_CAPSULE,
      privateKey: keyPair.privateKey,
      publicKey: keyPair.publicKey,
    });

    const verification = await verifySignedPocketverseManifest({
      signedManifest: signed,
      encryptedCapsuleCiphertext: MOCK_ENCRYPTED_CAPSULE,
      publicKey: keyPair.publicKey,
    });

    expect(verification).toMatchObject({
      ok: true,
      errors: [],
      readiness: ["declared", "signed", "tamper-evident", "not-yet-rematerializable"],
    });
    expect(verification.manifestHash).toMatch(/^[a-f0-9]{64}$/);
    expect(verification.encryptedCapsuleHash).toMatch(/^[a-f0-9]{64}$/);
    expect(verification.publicKeyFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects a tampered Chatty manifest after signing", async () => {
    const keyPair = await generateTestKeyPair();
    const signed = await signPocketverseManifestForTest({
      manifest: CHATTY_PRODUCT_BODY_POCKETVERSE_MANIFEST,
      encryptedCapsuleCiphertext: MOCK_ENCRYPTED_CAPSULE,
      privateKey: keyPair.privateKey,
      publicKey: keyPair.publicKey,
    });
    const tampered = cloneManifest(signed.manifest);
    tampered.thesis = "tampered product-body claim";

    const verification = await verifySignedPocketverseManifest({
      signedManifest: {
        ...signed,
        manifest: tampered,
      },
      encryptedCapsuleCiphertext: MOCK_ENCRYPTED_CAPSULE,
      publicKey: keyPair.publicKey,
    });

    expect(verification.ok).toBe(false);
    expect(verification.errors).toContain("manifest hash mismatch.");
    expect(verification.errors).toContain("signature verification failed.");
    expect(verification.readiness).toEqual(["declared"]);
  });

  it("rejects a tampered encrypted capsule hash", async () => {
    const keyPair = await generateTestKeyPair();
    const signed = await signPocketverseManifestForTest({
      manifest: CHATTY_PRODUCT_BODY_POCKETVERSE_MANIFEST,
      encryptedCapsuleCiphertext: MOCK_ENCRYPTED_CAPSULE,
      privateKey: keyPair.privateKey,
      publicKey: keyPair.publicKey,
    });

    const verification = await verifySignedPocketverseManifest({
      signedManifest: signed,
      encryptedCapsuleCiphertext: `${MOCK_ENCRYPTED_CAPSULE}:tampered`,
      publicKey: keyPair.publicKey,
    });

    expect(verification.ok).toBe(false);
    expect(verification.errors).toContain("encrypted capsule hash mismatch.");
    expect(verification.readiness).toEqual(["declared", "signed"]);
  });

  it("refuses to sign a local-body-authorized recovery manifest", async () => {
    const keyPair = await generateTestKeyPair();
    const manifest = cloneManifest(CHATTY_PRODUCT_BODY_POCKETVERSE_MANIFEST);
    (manifest.rematerialization as any).localBodyCanAuthorizeRecovery = true;

    await expect(
      signPocketverseManifestForTest({
        manifest,
        encryptedCapsuleCiphertext: MOCK_ENCRYPTED_CAPSULE,
        privateKey: keyPair.privateKey,
        publicKey: keyPair.publicKey,
      }),
    ).rejects.toThrow("The local body must not authorize recovery by itself.");
  });

  it("keeps notification payloads wake-only and secret-free", () => {
    const payload = shapePocketverseNotificationPayload({
      eventType: "recovery_needs_approval",
      product: "chatty",
      timestamp: "2026-04-20T00:00:00.000Z",
      approvalUrl: "https://approval.example/challenge/chal_chatty_001",
      challengeId: "chal_chatty_001",
      phoneNumber: "248-672-1809",
      email: "devon@example.com",
      secret: "seed-unlock",
    } as any);
    const serialized = JSON.stringify(payload);

    expect(Object.keys(payload).sort()).toEqual([
      "approvalUrl",
      "challengeId",
      "eventType",
      "product",
      "timestamp",
    ]);
    expect(serialized).not.toContain("248-672-1809");
    expect(serialized).not.toContain("devon@example.com");
    expect(serialized).not.toContain("seed-unlock");
  });
});
