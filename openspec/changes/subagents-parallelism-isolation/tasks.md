# Implementation Plan: subagents-parallelism-isolation

## Preparation

- [ ] Review spec scenarios for subagents-parallelism-isolation
- [ ] Review design.md test strategy

## Tasks

### Task 1: Initialize SubagentManager and runtime instantiator

**Files:**
- Create: `src/runtime/subagents.ts`
- Test: `tests/subagents.test.ts`

- [ ] **Step 1: Write the failing test**
  Verify spawning multiple isolated in-memory runtimes with correct custom prompts and history.
- [ ] **Step 2: Write minimal implementation**
  Create SubagentManager and configure isolated message pools.
- [ ] **Step 3: Commit**

### Task 2: Implement execution permission guard rails

**Files:**
- Modify: `src/runtime/loop.ts`
- Test: `tests/subagents.test.ts`

- [ ] **Step 1: Write the failing test**
  Verify a subagent with read-only permission triggers an error block when calling write_file.
- [ ] **Step 2: Write minimal implementation**
  Add pre-execution checks checking subagent permission list.
- [ ] **Step 3: Commit**

### Task 3: Establish parent-child asynchronous message passing

**Files:**
- Modify: `src/runtime/subagents.ts`
- Test: `tests/subagents.test.ts`

- [ ] **Step 1: Write the failing test**
  Verify that message-passing sends and routes requests and returns events correctly.
- [ ] **Step 2: Write minimal implementation**
  Add communication hooks on SubagentManager.
- [ ] **Step 3: Commit**

## Verification

- [ ] All scenarios passing (coverage = 100%)
- [ ] `.traceability.yaml` updated
