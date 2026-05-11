import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveLifeUserIdForLogin } from '../lib/userRegistry.js';

test('duplicate Devon email resolves to canonical active LIFE id', () => {
  const registry = {
    users: {
      devon_woodson_1762969514958: {
        user_id: 'devon_woodson_1762969514958',
        email: 'dwoodson92@gmail.com',
      },
      devon_woodson_1774390416168: {
        user_id: 'devon_woodson_1774390416168',
        email: 'dwoodson92@gmail.com',
      },
    },
  };

  const resolved = resolveLifeUserIdForLogin(
    registry,
    '507f1f77bcf86cd799439011',
    'dwoodson92@gmail.com',
    'Devon Woodson'
  );

  assert.equal(resolved, 'devon_woodson_1774390416168');
});

test('existing LIFE id is preserved as an explicit user id', () => {
  const registry = {
    users: {
      devon_woodson_1762969514958: {
        user_id: 'devon_woodson_1762969514958',
        email: 'dwoodson92@gmail.com',
      },
      devon_woodson_1774390416168: {
        user_id: 'devon_woodson_1774390416168',
        email: 'dwoodson92@gmail.com',
      },
    },
  };

  const resolved = resolveLifeUserIdForLogin(
    registry,
    'devon_woodson_1762969514958',
    'dwoodson92@gmail.com',
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
