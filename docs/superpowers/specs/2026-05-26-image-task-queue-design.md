# Image Task Queue Design

## Goal

Limit each browser session to two concurrently running image generation tasks. Additional submitted or retried tasks remain visible in the task list as queued work and start automatically when a running slot becomes available.

Also cap the requested output image count (`params.n`) at 2 so a single task can request at most two images.

## Scope

This change is client-side only. It updates the local task model, store scheduling behavior, task UI status rendering, and parameter compatibility limits. It does not change provider request formats, API profile storage, IndexedDB schema setup, or server-side rate limiting.

## State Model

`TaskStatus` gains a new `queued` value:

- `queued`: task has been accepted locally but no API request has started.
- `running`: API request or provider polling is active.
- `done`: outputs are stored.
- `error`: the task failed or is recoverable via an existing provider recovery path.

Queued tasks keep the same `createdAt`, prompt, params, API profile metadata, and input image references as normal tasks. They have `finishedAt: null`, `elapsed: null`, and no provider request identifiers until they actually start.

## Scheduling

The store owns a small task scheduler:

- `MAX_CONCURRENT_RUNNING_TASKS = 2`.
- A task submitted or retried starts immediately only when fewer than two tasks currently have `status === 'running'`.
- Otherwise it is stored with `status: 'queued'`.
- After a task leaves `running` because it finishes, fails, or is deleted, the scheduler starts queued tasks oldest-first by `createdAt` until the running limit is reached.
- Starting a queued task changes it to `running` before `executeTask` begins, so existing timeout, recovery, and completion guards keep using `running`.

Recovery tasks that are already `running` or recoverable on app startup continue to count as running work. Existing OpenAI interrupted-task cleanup still only applies to `running` OpenAI tasks; queued tasks are left queued after reload and may be scheduled by initialization when capacity exists.

## UI

Task cards and the detail modal render `queued` as a waiting state:

- Card status text: `排队中...`
- Detail modal status text: `排队中`
- Running timers do not advance for queued tasks; queued tasks show `00:00` until started.
- The status filter includes a queued option labelled `排队中`.

Queued tasks remain selectable, deletable, reusable, and visible in normal search/filter flows.

## Image Count Cap

`params.n` is clamped to a maximum of 2 in parameter normalization/output-limit logic so both UI controls and submit/retry paths enforce the same limit. Existing imported or persisted params with `n > 2` normalize down before a new API request is created.

## Testing

Add store tests before implementation:

- The third submitted task is queued when two tasks are already running.
- A queued task starts automatically when a running task finishes or fails.
- Retry uses the same queue rule.
- Queued tasks survive initialization without being marked as interrupted.
- `n` normalizes down to 2.

Update component expectations only where the new status value is rendered or filtered.
