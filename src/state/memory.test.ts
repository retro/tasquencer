import { Effect, Exit } from 'effect';
import { expect, it } from 'vitest';

import { make } from './memory.js';
import { ConditionName, TaskName, WorkflowInstanceId } from './types.js';

const workflowId = WorkflowInstanceId('workflow1');
const taskName1 = TaskName('task1');
const conditionName1 = ConditionName('condition1');

const workflow = {
  id: workflowId,
  name: 'workflow',
  tasks: [taskName1, TaskName('task2')],
  conditions: [conditionName1, ConditionName('condition2')],
};

it('can initialize read workflow state', () => {
  const program = Effect.gen(function* ($) {
    const stateManager = yield* $(make());

    yield* $(stateManager.initializeWorkflow(workflow));

    const workflowState = yield* $(stateManager.getWorkflow(workflow.id));

    expect(workflowState).toEqual({
      id: 'workflow1',
      name: 'workflow',
      state: 'running',
    });

    const workflowTasks = yield* $(stateManager.getWorkflowTasks(workflow.id));

    expect(workflowTasks).toEqual([
      {
        name: 'task1',
        workflowId: 'workflow1',
        generation: 0,
        state: 'disabled',
      },
      {
        name: 'task2',
        workflowId: 'workflow1',
        generation: 0,
        state: 'disabled',
      },
    ]);

    const workflowConditions = yield* $(
      stateManager.getWorkflowConditions(workflow.id)
    );

    expect(workflowConditions).toEqual([
      {
        name: 'condition1',
        workflowId: 'workflow1',
        marking: 0,
      },
      {
        name: 'condition2',
        workflowId: 'workflow1',
        marking: 0,
      },
    ]);

    const task1 = yield* $(stateManager.getWorkflowTask(workflowId, taskName1));

    expect(task1).toEqual({
      name: 'task1',
      workflowId: 'workflow1',
      generation: 0,
      state: 'disabled',
    });

    const condition1 = yield* $(
      stateManager.getWorkflowCondition(workflowId, conditionName1)
    );

    expect(condition1).toEqual({
      name: 'condition1',
      workflowId: 'workflow1',
      marking: 0,
    });
  });

  Effect.runSync(program);
});

it('can update workflow state to completed', () => {
  const program = Effect.gen(function* ($) {
    const stateManager = yield* $(make());

    yield* $(stateManager.initializeWorkflow(workflow));

    const workflowState = yield* $(stateManager.getWorkflow(workflow.id));

    expect(workflowState).toEqual({
      id: 'workflow1',
      name: 'workflow',
      state: 'running',
    });

    yield* $(stateManager.updateWorkflowState(workflow.id, 'completed'));

    const workflowState2 = yield* $(stateManager.getWorkflow(workflow.id));

    expect(workflowState2).toEqual({
      id: 'workflow1',
      name: 'workflow',
      state: 'completed',
    });
  });
  Effect.runSync(program);
});

it('can update workflow state to canceled', () => {
  const program = Effect.gen(function* ($) {
    const stateManager = yield* $(make());

    yield* $(stateManager.initializeWorkflow(workflow));

    const workflowState = yield* $(stateManager.getWorkflow(workflow.id));

    expect(workflowState).toEqual({
      id: 'workflow1',
      name: 'workflow',
      state: 'running',
    });

    yield* $(stateManager.updateWorkflowState(workflow.id, 'canceled'));

    const workflowState2 = yield* $(stateManager.getWorkflow(workflow.id));

    expect(workflowState2).toEqual({
      id: 'workflow1',
      name: 'workflow',
      state: 'canceled',
    });
  });
  Effect.runSync(program);
});

it('can update workflow state to failed', () => {
  const program = Effect.gen(function* ($) {
    const stateManager = yield* $(make());

    yield* $(stateManager.initializeWorkflow(workflow));

    const workflowState = yield* $(stateManager.getWorkflow(workflow.id));

    expect(workflowState).toEqual({
      id: 'workflow1',
      name: 'workflow',
      state: 'running',
    });

    yield* $(stateManager.updateWorkflowState(workflow.id, 'failed'));

    const workflowState2 = yield* $(stateManager.getWorkflow(workflow.id));

    expect(workflowState2).toEqual({
      id: 'workflow1',
      name: 'workflow',
      state: 'failed',
    });
  });
  Effect.runSync(program);
});

it('can enable a task', () => {
  const program = Effect.gen(function* ($) {
    const stateManager = yield* $(make());

    yield* $(stateManager.initializeWorkflow(workflow));

    const task1 = yield* $(
      stateManager.getWorkflowTask(workflow.id, taskName1)
    );

    expect(task1).toEqual({
      name: 'task1',
      workflowId: 'workflow1',
      generation: 0,
      state: 'disabled',
    });

    yield* $(stateManager.enableWorkflowTask(workflow.id, taskName1));

    const task2 = yield* $(
      stateManager.getWorkflowTask(workflow.id, taskName1)
    );

    expect(task2).toEqual({
      name: 'task1',
      workflowId: 'workflow1',
      generation: 0,
      state: 'enabled',
    });
  });
  Effect.runSync(program);
});

it('can fire a task', () => {
  const program = Effect.gen(function* ($) {
    const stateManager = yield* $(make());

    yield* $(stateManager.initializeWorkflow(workflow));

    yield* $(stateManager.enableWorkflowTask(workflow.id, taskName1));

    yield* $(stateManager.fireWorkflowTask(workflow.id, taskName1));

    const task1 = yield* $(
      stateManager.getWorkflowTask(workflow.id, taskName1)
    );

    expect(task1).toEqual({
      name: 'task1',
      workflowId: 'workflow1',
      generation: 0,
      state: 'fired',
    });
  });
  Effect.runSync(program);
});

it('can complete a task', () => {
  const program = Effect.gen(function* ($) {
    const stateManager = yield* $(make());

    yield* $(stateManager.initializeWorkflow(workflow));

    yield* $(stateManager.enableWorkflowTask(workflow.id, taskName1));

    yield* $(stateManager.fireWorkflowTask(workflow.id, taskName1));

    yield* $(stateManager.completeWorkflowTask(workflow.id, taskName1));

    const task1 = yield* $(
      stateManager.getWorkflowTask(workflow.id, taskName1)
    );

    expect(task1).toEqual({
      name: 'task1',
      workflowId: 'workflow1',
      generation: 0,
      state: 'completed',
    });
  });
  Effect.runSync(program);
});

it('can cancel a task', () => {
  const program = Effect.gen(function* ($) {
    const stateManager = yield* $(make());

    yield* $(stateManager.initializeWorkflow(workflow));

    yield* $(stateManager.enableWorkflowTask(workflow.id, taskName1));

    yield* $(stateManager.fireWorkflowTask(workflow.id, taskName1));

    yield* $(stateManager.cancelWorkflowTask(workflow.id, taskName1));

    const task1 = yield* $(
      stateManager.getWorkflowTask(workflow.id, taskName1)
    );

    expect(task1).toEqual({
      name: 'task1',
      workflowId: 'workflow1',
      generation: 0,
      state: 'canceled',
    });
  });
  Effect.runSync(program);
});

it('can fail a task', () => {
  const program = Effect.gen(function* ($) {
    const stateManager = yield* $(make());

    yield* $(stateManager.initializeWorkflow(workflow));

    yield* $(stateManager.enableWorkflowTask(workflow.id, taskName1));

    yield* $(stateManager.fireWorkflowTask(workflow.id, taskName1));

    yield* $(stateManager.failWorkflowTask(workflow.id, taskName1));

    const task1 = yield* $(
      stateManager.getWorkflowTask(workflow.id, taskName1)
    );

    expect(task1).toEqual({
      name: 'task1',
      workflowId: 'workflow1',
      generation: 0,
      state: 'failed',
    });
  });
  Effect.runSync(program);
});

it('can increment condition marking', () => {
  const program = Effect.gen(function* ($) {
    const stateManager = yield* $(make());

    yield* $(stateManager.initializeWorkflow(workflow));

    yield* $(
      stateManager.incrementWorkflowConditionMarking(
        workflow.id,
        conditionName1
      )
    );

    const condition1 = yield* $(
      stateManager.getWorkflowCondition(workflow.id, conditionName1)
    );

    expect(condition1).toEqual({
      name: 'condition1',
      workflowId: 'workflow1',
      marking: 1,
    });
  });
  Effect.runSync(program);
});

it("can decrement condition marking if it's greater than 0", () => {
  const program = Effect.gen(function* ($) {
    const stateManager = yield* $(make());

    yield* $(stateManager.initializeWorkflow(workflow));

    yield* $(
      stateManager.incrementWorkflowConditionMarking(
        workflow.id,
        conditionName1
      )
    );

    const condition1 = yield* $(
      stateManager.getWorkflowCondition(workflow.id, conditionName1)
    );

    expect(condition1).toEqual({
      name: 'condition1',
      workflowId: 'workflow1',
      marking: 1,
    });

    yield* $(
      stateManager.decrementWorkflowConditionMarking(
        workflow.id,
        conditionName1
      )
    );

    const condition2 = yield* $(
      stateManager.getWorkflowCondition(workflow.id, conditionName1)
    );

    expect(condition2).toEqual({
      name: 'condition1',
      workflowId: 'workflow1',
      marking: 0,
    });
  });
  Effect.runSync(program);
});

it('can empty condition marking', () => {
  const program = Effect.gen(function* ($) {
    const stateManager = yield* $(make());

    yield* $(stateManager.initializeWorkflow(workflow));

    yield* $(
      stateManager.incrementWorkflowConditionMarking(
        workflow.id,
        conditionName1
      )
    );

    const condition1 = yield* $(
      stateManager.getWorkflowCondition(workflow.id, conditionName1)
    );

    expect(condition1).toEqual({
      name: 'condition1',
      workflowId: 'workflow1',
      marking: 1,
    });

    yield* $(
      stateManager.emptyWorkflowConditionMarking(workflow.id, conditionName1)
    );

    const condition2 = yield* $(
      stateManager.getWorkflowCondition(workflow.id, conditionName1)
    );

    expect(condition2).toEqual({
      name: 'condition1',
      workflowId: 'workflow1',
      marking: 0,
    });
  });
  Effect.runSync(program);
});

it("can decrement condition marking but it won't go below 0", () => {
  const program = Effect.gen(function* ($) {
    const stateManager = yield* $(make());

    yield* $(stateManager.initializeWorkflow(workflow));

    const condition1 = yield* $(
      stateManager.getWorkflowCondition(workflow.id, conditionName1)
    );

    expect(condition1).toEqual({
      name: 'condition1',
      workflowId: 'workflow1',
      marking: 0,
    });

    yield* $(
      stateManager.decrementWorkflowConditionMarking(
        workflow.id,
        conditionName1
      )
    );

    const condition2 = yield* $(
      stateManager.getWorkflowCondition(workflow.id, conditionName1)
    );

    expect(condition2).toEqual({
      name: 'condition1',
      workflowId: 'workflow1',
      marking: 0,
    });
  });
  Effect.runSync(program);
});

it('can not update workflow state if it is not initialized', () => {
  const program = Effect.gen(function* ($) {
    const stateManager = yield* $(make());

    yield* $(stateManager.updateWorkflowState(workflow.id, 'completed'));
  });
  const result = Effect.runSyncExit(program);

  expect(Exit.isFailure(result)).toBe(true);

  // @ts-expect-error - we know it's a failure
  expect(result.cause.error._tag).toBe('WorkflowDoesNotExist');
});

it("can not update workflow state if it's already completed", () => {
  const program = Effect.gen(function* ($) {
    const stateManager = yield* $(make());

    yield* $(stateManager.initializeWorkflow(workflow));

    yield* $(stateManager.updateWorkflowState(workflow.id, 'completed'));

    yield* $(stateManager.updateWorkflowState(workflow.id, 'completed'));
  });
  const result = Effect.runSyncExit(program);

  expect(Exit.isFailure(result)).toBe(true);

  // @ts-expect-error - we know it's a failure
  expect(result.cause.error._tag).toBe('InvalidWorkflowStateTransition');
});

it("can not update workflow state if it's already canceled", () => {
  const program = Effect.gen(function* ($) {
    const stateManager = yield* $(make());

    yield* $(stateManager.initializeWorkflow(workflow));

    yield* $(stateManager.updateWorkflowState(workflow.id, 'canceled'));

    yield* $(stateManager.updateWorkflowState(workflow.id, 'completed'));
  });
  const result = Effect.runSyncExit(program);

  expect(Exit.isFailure(result)).toBe(true);

  // @ts-expect-error - we know it's a failure
  expect(result.cause.error._tag).toBe('InvalidWorkflowStateTransition');
});

it("can not update workflow state if it's already failed", () => {
  const program = Effect.gen(function* ($) {
    const stateManager = yield* $(make());

    yield* $(stateManager.initializeWorkflow(workflow));

    yield* $(stateManager.updateWorkflowState(workflow.id, 'failed'));

    yield* $(stateManager.updateWorkflowState(workflow.id, 'completed'));
  });
  const result = Effect.runSyncExit(program);

  expect(Exit.isFailure(result)).toBe(true);

  // @ts-expect-error - we know it's a failure
  expect(result.cause.error._tag).toBe('InvalidWorkflowStateTransition');
});

it('can not transition task from disabled to fired', () => {
  const program = Effect.gen(function* ($) {
    const stateManager = yield* $(make());

    yield* $(stateManager.initializeWorkflow(workflow));

    yield* $(stateManager.fireWorkflowTask(workflow.id, taskName1));
  });
  const result = Effect.runSyncExit(program);

  expect(Exit.isFailure(result)).toBe(true);

  // @ts-expect-error - we know it's a failure
  expect(result.cause.error._tag).toBe('InvalidTaskStateTransition');
});

it('can not transition task from disabled to completed', () => {
  const program = Effect.gen(function* ($) {
    const stateManager = yield* $(make());

    yield* $(stateManager.initializeWorkflow(workflow));

    yield* $(stateManager.completeWorkflowTask(workflow.id, taskName1));
  });
  const result = Effect.runSyncExit(program);

  expect(Exit.isFailure(result)).toBe(true);

  // @ts-expect-error - we know it's a failure
  expect(result.cause.error._tag).toBe('InvalidTaskStateTransition');
});

it('can not transition task from disabled to canceled', () => {
  const program = Effect.gen(function* ($) {
    const stateManager = yield* $(make());

    yield* $(stateManager.initializeWorkflow(workflow));

    yield* $(stateManager.cancelWorkflowTask(workflow.id, taskName1));
  });
  const result = Effect.runSyncExit(program);

  expect(Exit.isFailure(result)).toBe(true);

  // @ts-expect-error - we know it's a failure
  expect(result.cause.error._tag).toBe('InvalidTaskStateTransition');
});

it('can not transition task from enabled to completed', () => {
  const program = Effect.gen(function* ($) {
    const stateManager = yield* $(make());

    yield* $(stateManager.initializeWorkflow(workflow));
    yield* $(stateManager.enableWorkflowTask(workflow.id, taskName1));

    yield* $(stateManager.completeWorkflowTask(workflow.id, taskName1));
  });
  const result = Effect.runSyncExit(program);

  expect(Exit.isFailure(result)).toBe(true);

  // @ts-expect-error - we know it's a failure
  expect(result.cause.error._tag).toBe('InvalidTaskStateTransition');
});

it('can not transition task from disabled to canceled', () => {
  const program = Effect.gen(function* ($) {
    const stateManager = yield* $(make());

    yield* $(stateManager.initializeWorkflow(workflow));
    yield* $(stateManager.enableWorkflowTask(workflow.id, taskName1));

    yield* $(stateManager.cancelWorkflowTask(workflow.id, taskName1));
  });
  const result = Effect.runSyncExit(program);

  expect(Exit.isFailure(result)).toBe(true);

  // @ts-expect-error - we know it's a failure
  expect(result.cause.error._tag).toBe('InvalidTaskStateTransition');
});

it('can not transition task from disabled to failed', () => {
  const program = Effect.gen(function* ($) {
    const stateManager = yield* $(make());

    yield* $(stateManager.initializeWorkflow(workflow));
    yield* $(stateManager.enableWorkflowTask(workflow.id, taskName1));

    yield* $(stateManager.failWorkflowTask(workflow.id, taskName1));
  });
  const result = Effect.runSyncExit(program);

  expect(Exit.isFailure(result)).toBe(true);

  // @ts-expect-error - we know it's a failure
  expect(result.cause.error._tag).toBe('InvalidTaskStateTransition');
});

it('can not transition task from enabled to completed', () => {
  const program = Effect.gen(function* ($) {
    const stateManager = yield* $(make());

    yield* $(stateManager.initializeWorkflow(workflow));
    yield* $(stateManager.enableWorkflowTask(workflow.id, taskName1));

    yield* $(stateManager.completeWorkflowTask(workflow.id, taskName1));
  });
  const result = Effect.runSyncExit(program);

  expect(Exit.isFailure(result)).toBe(true);

  // @ts-expect-error - we know it"s a failure
  expect(result.cause.error._tag).toBe('InvalidTaskStateTransition');
});

it('can not transition task from enabled to canceled', () => {
  const program = Effect.gen(function* ($) {
    const stateManager = yield* $(make());

    yield* $(stateManager.initializeWorkflow(workflow));
    yield* $(stateManager.enableWorkflowTask(workflow.id, taskName1));

    yield* $(stateManager.cancelWorkflowTask(workflow.id, taskName1));
  });
  const result = Effect.runSyncExit(program);

  expect(Exit.isFailure(result)).toBe(true);

  // @ts-expect-error - we know it"s a failure
  expect(result.cause.error._tag).toBe('InvalidTaskStateTransition');
});

it('can not transition task from enabled to failed', () => {
  const program = Effect.gen(function* ($) {
    const stateManager = yield* $(make());

    yield* $(stateManager.initializeWorkflow(workflow));
    yield* $(stateManager.enableWorkflowTask(workflow.id, taskName1));

    yield* $(stateManager.failWorkflowTask(workflow.id, taskName1));
  });
  const result = Effect.runSyncExit(program);

  expect(Exit.isFailure(result)).toBe(true);

  // @ts-expect-error - we know it"s a failure
  expect(result.cause.error._tag).toBe('InvalidTaskStateTransition');
});
