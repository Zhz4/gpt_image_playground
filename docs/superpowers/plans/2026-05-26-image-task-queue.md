# Image Task Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add client-side queuing so only two image generation tasks run at once, while capping each task's output image count at two.

**Architecture:** Extend `TaskStatus` with `queued`, keep task execution in `src/store.ts`, and add a small scheduler that starts queued tasks oldest-first when capacity is available. Keep API calls unchanged; queued tasks are local task records that become `running` immediately before `executeTask`.

**Tech Stack:** TypeScript, React 19, Zustand, Vitest, Vite.

---

### Task 1: Parameter Count Cap

**Files:**
- Modify: `src/lib/paramCompatibility.ts`
- Modify: `src/lib/paramCompatibility.test.ts`

- [ ] **Step 1: Write failing tests**

Add tests proving every provider limit is 2 and normalization clamps larger `n` values to 2.

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/lib/paramCompatibility.test.ts`
Expected: tests fail because existing limits are 10 for OpenAI and 4 for fal.ai.

- [ ] **Step 3: Implement count cap**

Set both max output constants to 2 and keep existing normalization flow.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- src/lib/paramCompatibility.test.ts`
Expected: all param compatibility tests pass.

### Task 2: Store Queue Scheduler

**Files:**
- Modify: `src/types.ts`
- Modify: `src/store.ts`
- Modify: `src/store.test.ts`

- [ ] **Step 1: Write failing tests**

Add tests for: third submitted task queues behind two running tasks; queued task starts after a running task finishes; retry uses the same queue rule; queued tasks are not interrupted by startup cleanup.

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/store.test.ts`
Expected: tests fail because `queued` is not a valid status and every task starts immediately.

- [ ] **Step 3: Implement scheduler**

Add `queued` status, `MAX_CONCURRENT_RUNNING_TASKS = 2`, helpers to decide whether a task starts immediately, and a `scheduleQueuedTasks` function called after submit, retry, task updates, deletion, and initialization.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- src/store.test.ts`
Expected: store tests pass.

### Task 3: UI Queued State

**Files:**
- Modify: `src/components/TaskCard.tsx`
- Modify: `src/components/DetailModal.tsx`
- Modify: `src/components/SearchBar.tsx`
- Modify: `src/store.ts`

- [ ] **Step 1: Add queued rendering**

Render queued cards as waiting, show `排队中...` on cards, show `排队中` in the detail modal, and add a `排队中` filter option.

- [ ] **Step 2: Verify type/build feedback**

Run: `npm run build`
Expected: build passes without TypeScript errors.

### Task 4: Full Verification

**Files:**
- No code changes expected.

- [ ] **Step 1: Run focused tests**

Run: `npm test -- src/lib/paramCompatibility.test.ts src/store.test.ts`
Expected: focused tests pass.

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: TypeScript and Vite build pass.
