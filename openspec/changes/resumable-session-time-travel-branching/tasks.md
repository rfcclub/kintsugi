# Implementation Plan: resumable-session-time-travel-branching

## Preparation

- [ ] Review spec scenarios for resumable-session-time-travel-branching
- [ ] Review design.md test strategy

## Tasks

### Task 1: Log truncation logic and session re-hydration

**Files:**
- Modify: `src/store/session.ts`
- Test: `tests/session-time-travel.test.ts`

- [ ] **Step 1: Write the failing test**
  Verify parsing and truncating JSONL files up to turn index restores expected messages array.
- [ ] **Step 2: Write minimal implementation**
  Add JSONL parser modification routines.
- [ ] **Step 3: Commit**

### Task 2: Git snapshotting and rollback commands

**Files:**
- Create: `src/runtime/git-rollback.ts`
- Test: `tests/session-time-travel.test.ts`

- [ ] **Step 1: Write the failing test**
  Verify git commit runs per turn and checking out a previous turn hash reverts filesystem.
- [ ] **Step 2: Write minimal implementation**
  Wrap core git spawn commands to track turn/hash.
- [ ] **Step 3: Commit**

### Task 3: Implement branching command `/session branch`

**Files:**
- Modify: `src/store/session.ts`
- Test: `tests/session-time-travel.test.ts`

- [ ] **Step 1: Write the failing test**
  Verify session forks current status to a new session key correctly.
- [ ] **Step 2: Write minimal implementation**
  Expose copy routine and update writer paths.
- [ ] **Step 3: Commit**

## Verification

- [ ] All scenarios passing (coverage = 100%)
- [ ] `.traceability.yaml` updated
