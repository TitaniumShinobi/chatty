import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { requestClock } from '../lib/requestClock.js';

describe('requestClock middleware', () => {
  it('injects req.clock as an ISO 8601 string', () => {
    const req = {};
    const res = {};
    let nextCalled = false;
    requestClock(req, res, () => { nextCalled = true; });

    assert.equal(typeof req.clock, 'string');
    assert.match(req.clock, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    assert.equal(nextCalled, true);
  });

  it('injects req.requestId as a non-empty string', () => {
    const req = {};
    const res = {};
    let nextCalled = false;
    requestClock(req, res, () => { nextCalled = true; });

    assert.equal(typeof req.requestId, 'string');
    assert.ok(req.requestId.length > 0);
    assert.equal(nextCalled, true);
  });

  it('req.clock is stable within the same request', () => {
    const req = {};
    const res = {};
    requestClock(req, res, () => {});

    const clock1 = req.clock;
    const clock2 = req.clock;
    assert.equal(clock1, clock2);
  });

  it('req.requestId is stable within the same request', () => {
    const req = {};
    const res = {};
    requestClock(req, res, () => {});

    const id1 = req.requestId;
    const id2 = req.requestId;
    assert.equal(id1, id2);
  });

  it('different requests get different requestIds', async () => {
    const req1 = {}; const req2 = {};
    const res = {};
    await new Promise((resolve) => requestClock(req1, res, resolve));
    await new Promise((resolve) => requestClock(req2, res, resolve));

    assert.notEqual(req1.requestId, req2.requestId);
  });
});
