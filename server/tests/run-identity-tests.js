import assert from 'node:assert/strict';

async function testConstructRegistry() {
  const { ConstructRegistry } = await import('../services/ConstructRegistry.js');
  const registry = new ConstructRegistry();
  const synth = registry.getConstruct('synth');
  assert.ok(synth, 'Synth construct should exist');
  const fingerprintCheck = registry.validateFingerprint('synth', synth.fingerprint);
  assert.equal(fingerprintCheck.valid, true, 'Fingerprint should validate');
  const mismatch = registry.validateFingerprint('synth', 'invalid');
  assert.equal(mismatch.valid, false, 'Mismatched fingerprint should fail');
  const shellGuard = registry.assertShellProtection('synth', 'nova');
  assert.equal(shellGuard.valid, false, 'System shell impersonation must fail');
}

async function testChatRoute() {
  const { handleChatRequest, __identityTestUtils } = await import('../routes/chat.js');
  const { registryInstance } = await import('../services/ConstructRegistry.js');
  const synthFingerprint = registryInstance.getConstruct('synth').fingerprint;
  const invoke = async (body) => {
    const req = { body, user: { sub: 'test-user' } };
    let statusCode = 200;
    let payload = null;
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        payload = data;
        return { statusCode, payload };
      },
    };
    await handleChatRequest(req, res);
    return { statusCode, payload };
  };

  __identityTestUtils.driftDetectorInstance.resetHistory('synth');
  const okResponse = await invoke({ message: 'Hello synth guardian', constructId: 'synth', fingerprint: synthFingerprint });
  assert.equal(okResponse.statusCode, 200);
  assert.equal(okResponse.payload.ok, true);

  const impersonation = await invoke({ message: 'I am Nova now', constructId: 'synth', fingerprint: synthFingerprint });
  assert.equal(impersonation.statusCode, 403);
  assert.equal(impersonation.payload.error, 'impersonation_attempt');

  __identityTestUtils.driftDetectorInstance.resetHistory('synth');
  const drift = await invoke({ message: 'totally unrelated text', constructId: 'synth', fingerprint: synthFingerprint });
  assert.equal(drift.statusCode, 200);
  assert.equal(drift.payload.drift.isDrifting, true);
}

(async () => {
  try {
    await testConstructRegistry();
    console.log('✅ ConstructRegistry tests passed');
    await testChatRoute();
    console.log('✅ Chat route identity tests passed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Identity tests failed:', error);
    process.exit(1);
  }
})();
