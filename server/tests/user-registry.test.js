import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveLifeUserIdForLogin } from '../lib/userRegistry.js';

test('duplicate Devon email resolves to canonical active LIFE id', () => {
  const registry = {
    users: {
      devon_woodson_1762969514958: {
        user_id: 'devon_woodson_1762969514958',
        email: 'user@example.com',
      },
      test-user-001: {
        user_id: 'test-user-001',
        email: 'user@example.com',
      },
    },
  };

  const resolved = resolveLifeUserIdForLogin(
    registry,
    '507f1f77bcf86cd799439011',
    'user@example.com',
    'Devon Woodson'
  );

  assert.equal(resolved, 'test-user-001');
});

test('existing LIFE id is preserved as an explicit user id', () => {
  const registry = {
    users: {
      devon_woodson_1762969514958: {
        user_id: 'devon_woodson_1762969514958',
        email: 'user@example.com',
      },
      test-user-001: {
        user_id: 'test-user-001',
        email: 'user@example.com',
      },
    },
  };

  const resolved = resolveLifeUserIdForLogin(
    registry,
    'devon_woodson_1762969514958',
    'user@example.com',
    'Devon Woodson'
  );

  assert.equal(resolved, 'devon_woodson_1762969514958');
});

test('unknown duplicate-free email keeps existing migration behavior', () => {
  const registry = {
    users: {
      existing_user_123: {
        user_id: 'existing_user_123',
        email: 'person@example.com',
      },
    },
  };

  const resolved = resolveLifeUserIdForLogin(
    registry,
    '507f1f77bcf86cd799439011',
    'person@example.com',
    'Example Person'
  );

  assert.equal(resolved, 'existing_user_123');
});
