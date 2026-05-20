# Zen Delegation Testing Documentation

## Overview

This document tracks test restoration needs for Zen delegation functionality, specifically around OptimizedZenProcessor integration and multi-model synthesis.

## Test Restoration Status

### Current State

- Zen delegation was implemented with hard-forced routing to OptimizedZenProcessor
- Production hardening added fallback handling and optional Ollama checks
- Test suites may have been skipped or disabled during implementation

### Test Suites Requiring Restoration

#### 1. OptimizedZenProcessor Unit Tests

**Location**: `chatty/src/engine/__tests__/optimizedZen.test.ts` (if exists)

**Status**: TODO - Verify existence and restore if skipped

**Coverage Needed**:
- Constructor initialization with config
- `processMessage()` with various conversation histories
- Ollama check caching behavior
- Fallback handling when Ollama models unavailable
- Identity loading from VVAULT

**Owner**: TBD

#### 2. Conversations API Integration Tests

**Location**: `chatty/server/routes/__tests__/conversations.test.js` (if exists)

**Status**: TODO - Verify existence and restore if skipped

**Coverage Needed**:
- Zen delegation path (zen-001 constructId)
- Fallback to gptRuntimeBridge when OptimizedZenProcessor fails
- Compiled JS vs TS import paths
- Error handling for DELEGATE_TO_OPTIMIZED_ZEN
- Conversation history loading

**Owner**: TBD

#### 3. GPT Runtime Bridge Tests

**Location**: `chatty/server/lib/__tests__/gptRuntimeBridge.test.js` (if exists)

**Status**: TODO - Verify existence and restore if skipped

**Coverage Needed**:
- DELEGATE_TO_OPTIMIZED_ZEN error propagation
- Fallback to legacy runtime when delegation fails
- Error handling and logging

**Owner**: TBD

#### 4. Orchestration Integration Tests

**Location**: `chatty/orchestration/__tests__/agent_squad_manager.test.py` (if exists)

**Status**: TODO - Verify existence and restore if skipped

**Coverage Needed**:
- PlaceholderAgent always delegates zen
- Status: 'delegate_to_optimized_zen' return value
- Identity context passing

**Owner**: TBD

## Test Coverage Goals

### Minimum Coverage Targets

- **Unit Tests**: 80% coverage for OptimizedZenProcessor
- **Integration Tests**: All Zen delegation paths covered
- **E2E Tests**: Zen conversation flow from message to response

### Critical Test Scenarios

1. **Happy Path**: Zen message → OptimizedZenProcessor → Ollama → Response
2. **Fallback Path**: OptimizedZenProcessor import fails → gptRuntimeBridge → Response
3. **Ollama Unavailable**: Ollama checks fail → Processing continues → Response (degraded)
4. **Compiled JS Path**: Production build uses compiled JS imports
5. **TS Source Path**: Development uses TS source imports
6. **Orchestration Path**: Agent Squad delegates to OptimizedZenProcessor

## Implementation Notes

### Test Environment Setup

- Requires Ollama running with models: phi3, deepseek-coder, mistral
- Mock Ollama responses for unit tests
- Test both SKIP_OLLAMA_CHECK=true and false scenarios
- Test cache TTL behavior (5 minute window)

### Known Test Gaps

1. **Ollama Check Caching**: Need tests for cache TTL and invalidation
2. **Import Fallback**: Need tests for compiled JS vs TS import paths
3. **Error Propagation**: Need tests for DELEGATE_TO_OPTIMIZED_ZEN error handling
4. **Production Build**: Need tests verifying compiled JS works in production mode

## TODO Items

- [ ] Audit existing test files for skipped/disabled suites
- [ ] Restore OptimizedZenProcessor unit tests
- [ ] Restore Conversations API integration tests
- [ ] Restore GPT Runtime Bridge tests
- [ ] Restore Orchestration integration tests
- [ ] Add tests for Ollama check caching
- [ ] Add tests for import fallback (JS vs TS)
- [ ] Add tests for production build scenarios
- [ ] Verify test coverage meets minimum targets
- [ ] Document test execution instructions

## Related Documentation

- [Zen Delegation Implementation Plan](../architecture/ZEN_DELEGATION.md) (if exists)
- [Production Hardening Plan](./PRODUCTION_HARDENING.md) (if exists)
- [OptimizedZenProcessor Architecture](../architecture/OPTIMIZED_ZEN.md) (if exists)

## Last Updated

2024-12-19 - Initial documentation created

