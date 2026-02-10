# Test Restoration Plan

## Overview

This document provides an actionable plan to restore skipped test suites documented in [SKIPPED_TEST_SUITES.md](./SKIPPED_TEST_SUITES.md). Tests are prioritized by risk level and impact.

## Priority Matrix

### High Priority (Critical - Restore First)

These tests cover critical functionality with high risk of production issues:

1. **browserMemory.test.ts** - Browser memory management
2. **runtime/bus.test.ts** - Runtime bus system

### Medium Priority (Important - Restore Next)

These tests cover important functionality with moderate risk:

3. **symbolic-reasoning.test.ts** - AI reasoning capabilities
4. **dynamic-persona-mirroring.test.ts** - Character consistency
5. **katana-lock-hardening.test.ts** - Security features

### Low Priority (Nice to Have - Restore Later)

These tests cover less critical functionality:

6. **personal-greeting.test.ts** - Personalization features
7. **no-prose-assistant.test.ts** - Specific assistant mode

## Detailed Restoration Plan

### 1. browserMemory.test.ts

**Priority**: High  
**Risk Level**: High  
**Estimated Effort**: 4-6 hours  
**Owner**: TBD

#### Dependencies

- Browser environment (Puppeteer/Playwright)
- LocalStorage mock
- Memory cleanup utilities

#### Restoration Checklist

- [ ] Locate test file: `chatty/src/**/browserMemory.test.ts`
- [ ] Review test code and identify why it was skipped
- [ ] Check if test requires browser environment setup
- [ ] Set up browser testing framework if needed (Puppeteer/Playwright)
- [ ] Mock localStorage and browser APIs
- [ ] Fix any flaky test conditions
- [ ] Verify test passes locally
- [ ] Re-enable in `jest.config.js`
- [ ] Verify CI passes
- [ ] Document test requirements

#### Success Criteria

- Test runs successfully in CI
- No flaky test failures
- Browser memory functionality verified

---

### 2. runtime/bus.test.ts

**Priority**: High  
**Risk Level**: High  
**Estimated Effort**: 3-5 hours  
**Owner**: TBD

#### Dependencies

- Runtime bus implementation
- Mock runtime components
- Event system setup

#### Restoration Checklist

- [ ] Locate test file: `chatty/src/runtime/bus.test.ts`
- [ ] Review test code and identify why it was skipped
- [ ] Check if test requires runtime setup
- [ ] Mock runtime components if needed
- [ ] Set up event system for testing
- [ ] Fix any timing/async issues
- [ ] Verify test passes locally
- [ ] Re-enable in `jest.config.js`
- [ ] Verify CI passes
- [ ] Document test requirements

#### Success Criteria

- Test runs successfully in CI
- Runtime bus functionality verified
- Inter-component communication tested

---

### 3. symbolic-reasoning.test.ts

**Priority**: Medium  
**Risk Level**: Medium  
**Estimated Effort**: 2-4 hours  
**Owner**: TBD

#### Dependencies

- Symbolic reasoning implementation
- Test fixtures/data
- Possibly Ollama models (if integration test)

#### Restoration Checklist

- [ ] Locate test file: `chatty/src/**/symbolic-reasoning.test.ts`
- [ ] Review test code and identify why it was skipped
- [ ] Check if test requires external dependencies (Ollama, etc.)
- [ ] Mock external dependencies if needed
- [ ] Fix any flaky conditions
- [ ] Verify test passes locally
- [ ] Re-enable in `jest.config.js`
- [ ] Verify CI passes
- [ ] Document test requirements

#### Success Criteria

- Test runs successfully in CI
- Symbolic reasoning functionality verified
- No external dependencies required for CI

---

### 4. dynamic-persona-mirroring.test.ts

**Priority**: Medium  
**Risk Level**: Medium  
**Estimated Effort**: 2-3 hours  
**Owner**: TBD

#### Dependencies

- Persona mirroring implementation
- Test personas/fixtures
- Possibly VVAULT (if integration test)

#### Restoration Checklist

- [ ] Locate test file: `chatty/src/**/dynamic-persona-mirroring.test.ts`
- [ ] Review test code and identify why it was skipped
- [ ] Check if test requires VVAULT or external services
- [ ] Mock external dependencies if needed
- [ ] Create test personas/fixtures
- [ ] Fix any flaky conditions
- [ ] Verify test passes locally
- [ ] Re-enable in `jest.config.js`
- [ ] Verify CI passes
- [ ] Document test requirements

#### Success Criteria

- Test runs successfully in CI
- Persona mirroring functionality verified
- Character consistency tested

---

### 5. katana-lock-hardening.test.ts

**Priority**: Medium  
**Risk Level**: Medium  
**Estimated Effort**: 2-3 hours  
**Owner**: TBD

#### Dependencies

- Katana lock implementation
- Security test utilities
- Possibly VVAULT (if integration test)

#### Restoration Checklist

- [ ] Locate test file: `chatty/src/**/katana-lock-hardening.test.ts`
- [ ] Review test code and identify why it was skipped
- [ ] Check if test requires VVAULT or external services
- [ ] Mock external dependencies if needed
- [ ] Set up security test utilities
- [ ] Fix any flaky conditions
- [ ] Verify test passes locally
- [ ] Re-enable in `jest.config.js`
- [ ] Verify CI passes
- [ ] Document test requirements

#### Success Criteria

- Test runs successfully in CI
- Katana lock hardening verified
- Security functionality tested

---

### 6. personal-greeting.test.ts

**Priority**: Low  
**Risk Level**: Low  
**Estimated Effort**: 1-2 hours  
**Owner**: TBD

#### Dependencies

- Personal greeting implementation
- User data fixtures
- Possibly memory system (if integration test)

#### Restoration Checklist

- [ ] Locate test file: `chatty/src/**/personal-greeting.test.ts`
- [ ] Review test code and identify why it was skipped
- [ ] Check if test requires external dependencies
- [ ] Mock external dependencies if needed
- [ ] Fix any flaky conditions
- [ ] Verify test passes locally
- [ ] Re-enable in `jest.config.js`
- [ ] Verify CI passes
- [ ] Document test requirements

#### Success Criteria

- Test runs successfully in CI
- Personal greeting functionality verified

---

### 7. no-prose-assistant.test.ts

**Priority**: Low  
**Risk Level**: Low  
**Estimated Effort**: 1-2 hours  
**Owner**: TBD

#### Dependencies

- No-prose assistant implementation
- Test fixtures

#### Restoration Checklist

- [ ] Locate test file: `chatty/src/**/no-prose-assistant.test.ts`
- [ ] Review test code and identify why it was skipped
- [ ] Check if test requires external dependencies
- [ ] Mock external dependencies if needed
- [ ] Fix any flaky conditions
- [ ] Verify test passes locally
- [ ] Re-enable in `jest.config.js`
- [ ] Verify CI passes
- [ ] Document test requirements

#### Success Criteria

- Test runs successfully in CI
- No-prose assistant functionality verified

---

## General Restoration Process

### Step 1: Investigation

For each skipped test:

1. Locate the test file
2. Read the test code
3. Identify why it was skipped (check git history, comments, etc.)
4. Determine dependencies and requirements
5. Assess complexity and effort

### Step 2: Preparation

1. Set up required test infrastructure
2. Create mocks for external dependencies
3. Prepare test fixtures/data
4. Document test requirements

### Step 3: Restoration

1. Fix test code issues
2. Address flaky conditions
3. Ensure test isolation
4. Verify test passes locally
5. Re-enable in `jest.config.js`
6. Verify CI passes

### Step 4: Documentation

1. Document why test was skipped (if not already documented)
2. Document test requirements
3. Document dependencies
4. Update this plan with completion status

## Timeline Estimate

### Phase 1: High Priority (Weeks 1-2)

- browserMemory.test.ts: 4-6 hours
- runtime/bus.test.ts: 3-5 hours
- **Total**: 7-11 hours

### Phase 2: Medium Priority (Weeks 3-4)

- symbolic-reasoning.test.ts: 2-4 hours
- dynamic-persona-mirroring.test.ts: 2-3 hours
- katana-lock-hardening.test.ts: 2-3 hours
- **Total**: 6-10 hours

### Phase 3: Low Priority (Week 5)

- personal-greeting.test.ts: 1-2 hours
- no-prose-assistant.test.ts: 1-2 hours
- **Total**: 2-4 hours

### Grand Total: 15-25 hours

## Success Metrics

- **All high-priority tests restored**: 2/2
- **All medium-priority tests restored**: 3/3
- **All low-priority tests restored**: 2/2
- **CI test coverage increase**: Target 80%+ coverage
- **Zero flaky tests**: All restored tests stable

## Related Documentation

- [Skipped Test Suites](./SKIPPED_TEST_SUITES.md)
- [Zen Delegation Testing](./ZEN_DELEGATION_TESTING.md)
- [Jest Configuration](../jest.config.js)

## Last Updated

2024-12-19 - Initial restoration plan created

