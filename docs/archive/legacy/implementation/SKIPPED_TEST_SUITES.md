# Skipped Test Suites Documentation

## Overview

This document tracks test suites that are currently skipped in `jest.config.js`. These tests are excluded from CI runs, meaning regressions in these areas will not be caught automatically.

## Current Skipped Suites

The following test suites are listed in `testPathIgnorePatterns` in `chatty/jest.config.js`:

### 1. `symbolic-reasoning.test.ts`

**Status**: Skipped

**Location**: `chatty/src/**/symbolic-reasoning.test.ts`

**Why Skipped**: Unknown (not documented)

**Risk Level**: Medium

**Impact**: 
- CI won't catch regressions in symbolic reasoning functionality
- May affect AI reasoning capabilities
- Could impact Zen's multi-model synthesis

**Coverage Gap**: Symbolic reasoning logic untested

**TODO**: 
- [ ] Investigate why this test was skipped
- [ ] Determine if test is flaky or requires setup
- [ ] Re-enable or fix test
- [ ] Document dependencies (if any)

---

### 2. `browserMemory.test.ts`

**Status**: Skipped

**Location**: `chatty/src/**/browserMemory.test.ts`

**Why Skipped**: Unknown (not documented)

**Risk Level**: High

**Impact**:
- CI won't catch regressions in browser memory management
- Memory leaks may go undetected
- User session continuity could break
- Affects all browser-based interactions

**Coverage Gap**: Browser memory system untested

**TODO**:
- [ ] Investigate why this test was skipped
- [ ] Check if test requires browser environment setup
- [ ] Re-enable or migrate to appropriate test framework
- [ ] Document browser memory test requirements

---

### 3. `dynamic-persona-mirroring.test.ts`

**Status**: Skipped

**Location**: `chatty/src/**/dynamic-persona-mirroring.test.ts`

**Why Skipped**: Unknown (not documented)

**Risk Level**: Medium

**Impact**:
- CI won't catch regressions in persona mirroring
- Character consistency may degrade
- User experience could be affected

**Coverage Gap**: Dynamic persona mirroring untested

**TODO**:
- [ ] Investigate why this test was skipped
- [ ] Determine test dependencies
- [ ] Re-enable or fix test
- [ ] Document persona mirroring test requirements

---

### 4. `personal-greeting.test.ts`

**Status**: Skipped

**Location**: `chatty/src/**/personal-greeting.test.ts`

**Why Skipped**: Unknown (not documented)

**Risk Level**: Low

**Impact**:
- CI won't catch regressions in personal greeting logic
- User personalization may degrade
- Minor UX impact

**Coverage Gap**: Personal greeting functionality untested

**TODO**:
- [ ] Investigate why this test was skipped
- [ ] Re-enable or fix test
- [ ] Document greeting test requirements

---

### 5. `runtime/bus.test.ts`

**Status**: Skipped

**Location**: `chatty/src/runtime/bus.test.ts`

**Why Skipped**: Unknown (not documented)

**Risk Level**: High

**Impact**:
- CI won't catch regressions in runtime bus system
- Inter-component communication could break
- Runtime orchestration may fail
- Critical for multi-runtime support

**Coverage Gap**: Runtime bus system untested

**TODO**:
- [ ] Investigate why this test was skipped
- [ ] Check if test requires runtime setup
- [ ] Re-enable or fix test
- [ ] Document runtime bus test requirements

---

### 6. `no-prose-assistant.test.ts`

**Status**: Skipped

**Location**: `chatty/src/**/no-prose-assistant.test.ts`

**Why Skipped**: Unknown (not documented)

**Risk Level**: Low

**Impact**:
- CI won't catch regressions in no-prose assistant mode
- Specific assistant mode may break
- Limited user impact

**Coverage Gap**: No-prose assistant mode untested

**TODO**:
- [ ] Investigate why this test was skipped
- [ ] Re-enable or fix test
- [ ] Document no-prose assistant test requirements

---

### 7. `katana-lock-hardening.test.ts`

**Status**: Skipped

**Location**: `chatty/src/**/katana-lock-hardening.test.ts`

**Why Skipped**: Unknown (not documented)

**Risk Level**: Medium

**Impact**:
- CI won't catch regressions in Katana lock hardening
- Security-related functionality untested
- Character lock mechanisms may degrade

**Coverage Gap**: Katana lock hardening untested

**TODO**:
- [ ] Investigate why this test was skipped
- [ ] Re-enable or fix test
- [ ] Document Katana lock test requirements

---

## Summary Statistics

- **Total Skipped Suites**: 7
- **High Risk**: 2 (browserMemory, runtime/bus)
- **Medium Risk**: 3 (symbolic-reasoning, dynamic-persona-mirroring, katana-lock-hardening)
- **Low Risk**: 2 (personal-greeting, no-prose-assistant)

## Risk Assessment

### Critical Areas Without Test Coverage

1. **Browser Memory Management** - High risk of memory leaks and session issues
2. **Runtime Bus System** - High risk of inter-component communication failures
3. **Symbolic Reasoning** - Medium risk of AI reasoning degradation
4. **Persona Mirroring** - Medium risk of character consistency issues
5. **Katana Lock Hardening** - Medium risk of security-related regressions

### CI Impact

- **No automatic regression detection** for skipped suites
- **Manual testing required** for these areas
- **Release risk increased** without test coverage
- **Debugging harder** when issues occur in production

## Recommendations

### Immediate Actions

1. **Document skip reasons**: Add comments in `jest.config.js` explaining why each test is skipped
2. **Prioritize high-risk suites**: Focus on restoring `browserMemory.test.ts` and `runtime/bus.test.ts`
3. **Create test restoration plan**: See [TEST_RESTORATION_PLAN.md](./TEST_RESTORATION_PLAN.md)

### Long-term Actions

1. **Re-enable all skipped suites** with proper fixes
2. **Add test infrastructure** for browser/runtime tests if needed
3. **Establish test coverage goals** (e.g., 80% minimum)
4. **Monitor test stability** to prevent future skips

## Related Documentation

- [Test Restoration Plan](./TEST_RESTORATION_PLAN.md)
- [Zen Delegation Testing](./ZEN_DELEGATION_TESTING.md)
- [Jest Configuration](../jest.config.js)

## Last Updated

2024-12-19 - Initial documentation created

