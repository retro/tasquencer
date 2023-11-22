import { Effect, Exit } from 'effect';
import { expect, it } from 'vitest';

import { IdGenerator } from '../stateManager/types.js';
import { make } from './memory.js';
import {
  ConditionName,
  TaskName,
  WorkItemId,
  WorkflowInstanceId,
} from './types.js';

const workflowId = WorkflowInstanceId('workflow1');
const taskName1 = TaskName('task1');
const conditionName1 = ConditionName('condition1');

const workflow = {
  id: workflowId,
  name: 'workflow',
  tasks: [taskName1, TaskName('task2')],
  conditions: [conditionName1, ConditionName('condition2')],
};

function makeIdGenerator(): IdGenerator {
  const ids = {
    workItem: 0,
    workflow: 0,
  };
  return {
    next(type) {
      ids[type]++;
      return Effect.succeed(`${type}-${ids[type]}`);
    },
  };
}

it('can initialize read workflow state', () => {
  const program = Effect.gen(function* ($) {
    const stateManager = yield* $(
      make(),
      Effect.provideService(IdGenerator, makeIdGenerator())
    );

    yield* $(stateManager.initializeWorkflow(workflow));

    const workflowState = yield* $(stateManager.getWorkflow(workflow.id));

    expect(workflowState).toEqual({
      id: 'workflow1',
      name: 'workflow',
      state: 'running',
    });

    const workflowTasks = yield* $(stateManager.getTasks(workflow.id));

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
      stateManager.getConditions(workflow.id)
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

    const task1 = yield* $(stateManager.getTask(workflowId, taskName1));

    expect(task1).toEqual({
      name: 'task1',
      workflowId: 'workflow1',
      generation: 0,
      state: 'disabled',
    });

    const condition1 = yield* $(
      stateManager.getCondition(workflowId, conditionName1)
    );

    expect(condition1).toEqual({
      name: 'condition1',
      workflowId: 'workflow1',
      marking: 0,
    });
  });

  Effect.runSync(program);
});

it('can update workflow state to exited', () => {
  const program = Effect.gen(function* ($) {
    const stateManager = yield* $(
      make(),
      Effect.provideService(IdGenerator, makeIdGenerator())
    );

    yield* $(stateManager.initializeWorkflow(workflow));

    const workflowState = yield* $(stateManager.getWorkflow(workflow.id));

    expect(workflowState).toEqual({
      id: 'workflow1',
      name: 'workflow',
      state: 'running',
    });

    yield* $(stateManager.updateWorkflowState(workflow.id, 'exited'));

    const workflowState2 = yield* $(stateManager.getWorkflow(workflow.id));

    expect(workflowState2).toEqual({
      id: 'workflow1',
      name: 'workflow',
      state: 'exited',
    });
  });
  Effect.runSync(program);
});

it('can update workflow state to canceled', () => {
  const program = Effect.gen(function* ($) {
    const stateManager = yield* $(
      make(),
      Effect.provideService(IdGenerator, makeIdGenerator())
    );

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
    const stateManager = yield* $(
      make(),
      Effect.provideService(IdGenerator, makeIdGenerator())
    );

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
    const stateManager = yield* $(
      make(),
      Effect.provideService(IdGenerator, makeIdGenerator())
    );

    yield* $(stateManager.initializeWorkflow(workflow));

    const task1 = yield* $(stateManager.getTask(workflow.id, taskName1));

    expect(task1).toEqual({
      name: 'task1',
      workflowId: 'workflow1',
      generation: 0,
      state: 'disabled',
    });

    yield* $(stateManager.enableTask(workflow.id, taskName1));

    const task2 = yield* $(stateManager.getTask(workflow.id, taskName1));

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
    const stateManager = yield* $(
      make(),
      Effect.provideService(IdGenerator, makeIdGenerator())
    );

    yield* $(stateManager.initializeWorkflow(workflow));

    yield* $(stateManager.enableTask(workflow.id, taskName1));

    yield* $(stateManager.fireTask(workflow.id, taskName1));

    const task1 = yield* $(stateManager.getTask(workflow.id, taskName1));

    expect(task1).toEqual({
      name: 'task1',
      workflowId: 'workflow1',
      generation: 1,
      state: 'fired',
    });
  });
  Effect.runSync(program);
});

it('should increment generation every time a task is fired', () => {
  const program = Effect.gen(function* ($) {
    const stateManager = yield* $(
      make(),
      Effect.provideService(IdGenerator, makeIdGenerator())
    );

    yield* $(stateManager.initializeWorkflow(workflow));

    yield* $(stateManager.enableTask(workflow.id, taskName1));

    yield* $(stateManager.fireTask(workflow.id, taskName1));

    yield* $(stateManager.exitTask(workflow.id, taskName1));

    yield* $(stateManager.enableTask(workflow.id, taskName1));

    yield* $(stateManager.fireTask(workflow.id, taskName1));

    const task1 = yield* $(stateManager.getTask(workflow.id, taskName1));

    expect(task1).toEqual({
      name: 'task1',
      workflowId: 'workflow1',
      generation: 2,
      state: 'fired',
    });
  });
  Effect.runSync(program);
});

it('can exit a task', () => {
  const program = Effect.gen(function* ($) {
    const stateManager = yield* $(
      make(),
      Effect.provideService(IdGenerator, makeIdGenerator())
    );

    yield* $(stateManager.initializeWorkflow(workflow));

    yield* $(stateManager.enableTask(workflow.id, taskName1));

    yield* $(stateManager.fireTask(workflow.id, taskName1));

    yield* $(stateManager.exitTask(workflow.id, taskName1));

    const task1 = yield* $(stateManager.getTask(workflow.id, taskName1));

    expect(task1).toEqual({
      name: 'task1',
      workflowId: 'workflow1',
      generation: 1,
      state: 'exited',
    });
  });
  Effect.runSync(program);
});

it('can cancel a task', () => {
  const program = Effect.gen(function* ($) {
    const stateManager = yield* $(
      make(),
      Effect.provideService(IdGenerator, makeIdGenerator())
    );

    yield* $(stateManager.initializeWorkflow(workflow));

    yield* $(stateManager.enableTask(workflow.id, taskName1));

    yield* $(stateManager.fireTask(workflow.id, taskName1));

    yield* $(stateManager.cancelTask(workflow.id, taskName1));

    const task1 = yield* $(stateManager.getTask(workflow.id, taskName1));

    expect(task1).toEqual({
      name: 'task1',
      workflowId: 'workflow1',
      generation: 1,
      state: 'canceled',
    });
  });
  Effect.runSync(program);
});

it('can fail a task', () => {
  const program = Effect.gen(function* ($) {
    const stateManager = yield* $(
      make(),
      Effect.provideService(IdGenerator, makeIdGenerator())
    );

    yield* $(stateManager.initializeWorkflow(workflow));

    yield* $(stateManager.enableTask(workflow.id, taskName1));

    yield* $(stateManager.fireTask(workflow.id, taskName1));

    yield* $(stateManager.failTask(workflow.id, taskName1));

    const task1 = yield* $(stateManager.getTask(workflow.id, taskName1));

    expect(task1).toEqual({
      name: 'task1',
      workflowId: 'workflow1',
      generation: 1,
      state: 'failed',
    });
  });
  Effect.runSync(program);
});

it('can increment condition marking', () => {
  const program = Effect.gen(function* ($) {
    const stateManager = yield* $(
      make(),
      Effect.provideService(IdGenerator, makeIdGenerator())
    );

    yield* $(stateManager.initializeWorkflow(workflow));

    yield* $(
      stateManager.incrementConditionMarking(workflow.id, conditionName1)
    );

    const condition1 = yield* $(
      stateManager.getCondition(workflow.id, conditionName1)
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
    const stateManager = yield* $(
      make(),
      Effect.provideService(IdGenerator, makeIdGenerator())
    );

    yield* $(stateManager.initializeWorkflow(workflow));

    yield* $(
      stateManager.incrementConditionMarking(workflow.id, conditionName1)
    );

    const condition1 = yield* $(
      stateManager.getCondition(workflow.id, conditionName1)
    );

    expect(condition1).toEqual({
      name: 'condition1',
      workflowId: 'workflow1',
      marking: 1,
    });

    yield* $(
      stateManager.decrementConditionMarking(workflow.id, conditionName1)
    );

    const condition2 = yield* $(
      stateManager.getCondition(workflow.id, conditionName1)
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
    const stateManager = yield* $(
      make(),
      Effect.provideService(IdGenerator, makeIdGenerator())
    );

    yield* $(stateManager.initializeWorkflow(workflow));

    yield* $(
      stateManager.incrementConditionMarking(workflow.id, conditionName1)
    );

    const condition1 = yield* $(
      stateManager.getCondition(workflow.id, conditionName1)
    );

    expect(condition1).toEqual({
      name: 'condition1',
      workflowId: 'workflow1',
      marking: 1,
    });

    yield* $(stateManager.emptyConditionMarking(workflow.id, conditionName1));

    const condition2 = yield* $(
      stateManager.getCondition(workflow.id, conditionName1)
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
    const stateManager = yield* $(
      make(),
      Effect.provideService(IdGenerator, makeIdGenerator())
    );

    yield* $(stateManager.initializeWorkflow(workflow));

    const condition1 = yield* $(
      stateManager.getCondition(workflow.id, conditionName1)
    );

    expect(condition1).toEqual({
      name: 'condition1',
      workflowId: 'workflow1',
      marking: 0,
    });

    yield* $(
      stateManager.decrementConditionMarking(workflow.id, conditionName1)
    );

    const condition2 = yield* $(
      stateManager.getCondition(workflow.id, conditionName1)
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
    const stateManager = yield* $(
      make(),
      Effect.provideService(IdGenerator, makeIdGenerator())
    );

    yield* $(stateManager.updateWorkflowState(workflow.id, 'exited'));
  });
  const result = Effect.runSyncExit(program);

  expect(Exit.isFailure(result)).toBe(true);

  // @ts-expect-error - we know it's a failure
  expect(result.cause.error._tag).toBe('WorkflowDoesNotExist');
});

it("can not update workflow state if it's already exited", () => {
  const program = Effect.gen(function* ($) {
    const stateManager = yield* $(
      make(),
      Effect.provideService(IdGenerator, makeIdGenerator())
    );

    yield* $(stateManager.initializeWorkflow(workflow));

    yield* $(stateManager.updateWorkflowState(workflow.id, 'exited'));

    yield* $(stateManager.updateWorkflowState(workflow.id, 'exited'));
  });
  const result = Effect.runSyncExit(program);

  expect(Exit.isFailure(result)).toBe(true);

  // @ts-expect-error - we know it's a failure
  expect(result.cause.error._tag).toBe('InvalidWorkflowStateTransition');
});

it("can not update workflow state if it's already canceled", () => {
  const program = Effect.gen(function* ($) {
    const stateManager = yield* $(
      make(),
      Effect.provideService(IdGenerator, makeIdGenerator())
    );

    yield* $(stateManager.initializeWorkflow(workflow));

    yield* $(stateManager.updateWorkflowState(workflow.id, 'canceled'));

    yield* $(stateManager.updateWorkflowState(workflow.id, 'exited'));
  });
  const result = Effect.runSyncExit(program);

  expect(Exit.isFailure(result)).toBe(true);

  // @ts-expect-error - we know it's a failure
  expect(result.cause.error._tag).toBe('InvalidWorkflowStateTransition');
});

it("can not update workflow state if it's already failed", () => {
  const program = Effect.gen(function* ($) {
    const stateManager = yield* $(
      make(),
      Effect.provideService(IdGenerator, makeIdGenerator())
    );

    yield* $(stateManager.initializeWorkflow(workflow));

    yield* $(stateManager.updateWorkflowState(workflow.id, 'failed'));

    yield* $(stateManager.updateWorkflowState(workflow.id, 'exited'));
  });
  const result = Effect.runSyncExit(program);

  expect(Exit.isFailure(result)).toBe(true);

  // @ts-expect-error - we know it's a failure
  expect(result.cause.error._tag).toBe('InvalidWorkflowStateTransition');
});

it('can not transition task from disabled to fired', () => {
  const program = Effect.gen(function* ($) {
    const stateManager = yield* $(
      make(),
      Effect.provideService(IdGenerator, makeIdGenerator())
    );

    yield* $(stateManager.initializeWorkflow(workflow));

    yield* $(stateManager.fireTask(workflow.id, taskName1));
  });
  const result = Effect.runSyncExit(program);

  expect(Exit.isFailure(result)).toBe(true);

  // @ts-expect-error - we know it's a failure
  expect(result.cause.error._tag).toBe('InvalidTaskStateTransition');
});

it('can not transition task from disabled to exited', () => {
  const program = Effect.gen(function* ($) {
    const stateManager = yield* $(
      make(),
      Effect.provideService(IdGenerator, makeIdGenerator())
    );

    yield* $(stateManager.initializeWorkflow(workflow));

    yield* $(stateManager.exitTask(workflow.id, taskName1));
  });
  const result = Effect.runSyncExit(program);

  expect(Exit.isFailure(result)).toBe(true);

  // @ts-expect-error - we know it's a failure
  expect(result.cause.error._tag).toBe('InvalidTaskStateTransition');
});

it('can not transition task from disabled to canceled', () => {
  const program = Effect.gen(function* ($) {
    const stateManager = yield* $(
      make(),
      Effect.provideService(IdGenerator, makeIdGenerator())
    );

    yield* $(stateManager.initializeWorkflow(workflow));

    yield* $(stateManager.cancelTask(workflow.id, taskName1));
  });
  const result = Effect.runSyncExit(program);

  expect(Exit.isFailure(result)).toBe(true);

  // @ts-expect-error - we know it's a failure
  expect(result.cause.error._tag).toBe('InvalidTaskStateTransition');
});

it('can not transition task from enabled to exited', () => {
  const program = Effect.gen(function* ($) {
    const stateManager = yield* $(
      make(),
      Effect.provideService(IdGenerator, makeIdGenerator())
    );

    yield* $(stateManager.initializeWorkflow(workflow));
    yield* $(stateManager.enableTask(workflow.id, taskName1));

    yield* $(stateManager.exitTask(workflow.id, taskName1));
  });
  const result = Effect.runSyncExit(program);

  expect(Exit.isFailure(result)).toBe(true);

  // @ts-expect-error - we know it's a failure
  expect(result.cause.error._tag).toBe('InvalidTaskStateTransition');
});

it('can not transition task from disabled to canceled', () => {
  const program = Effect.gen(function* ($) {
    const stateManager = yield* $(
      make(),
      Effect.provideService(IdGenerator, makeIdGenerator())
    );

    yield* $(stateManager.initializeWorkflow(workflow));
    yield* $(stateManager.enableTask(workflow.id, taskName1));

    yield* $(stateManager.cancelTask(workflow.id, taskName1));
  });
  const result = Effect.runSyncExit(program);

  expect(Exit.isFailure(result)).toBe(true);

  // @ts-expect-error - we know it's a failure
  expect(result.cause.error._tag).toBe('InvalidTaskStateTransition');
});

it('can not transition task from disabled to failed', () => {
  const program = Effect.gen(function* ($) {
    const stateManager = yield* $(
      make(),
      Effect.provideService(IdGenerator, makeIdGenerator())
    );

    yield* $(stateManager.initializeWorkflow(workflow));
    yield* $(stateManager.enableTask(workflow.id, taskName1));

    yield* $(stateManager.failTask(workflow.id, taskName1));
  });
  const result = Effect.runSyncExit(program);

  expect(Exit.isFailure(result)).toBe(true);

  // @ts-expect-error - we know it's a failure
  expect(result.cause.error._tag).toBe('InvalidTaskStateTransition');
});

it('can not transition task from enabled to exited', () => {
  const program = Effect.gen(function* ($) {
    const stateManager = yield* $(
      make(),
      Effect.provideService(IdGenerator, makeIdGenerator())
    );

    yield* $(stateManager.initializeWorkflow(workflow));
    yield* $(stateManager.enableTask(workflow.id, taskName1));

    yield* $(stateManager.exitTask(workflow.id, taskName1));
  });
  const result = Effect.runSyncExit(program);

  expect(Exit.isFailure(result)).toBe(true);

  // @ts-expect-error - we know it"s a failure
  expect(result.cause.error._tag).toBe('InvalidTaskStateTransition');
});

it('can not transition task from enabled to canceled', () => {
  const program = Effect.gen(function* ($) {
    const stateManager = yield* $(
      make(),
      Effect.provideService(IdGenerator, makeIdGenerator())
    );

    yield* $(stateManager.initializeWorkflow(workflow));
    yield* $(stateManager.enableTask(workflow.id, taskName1));

    yield* $(stateManager.cancelTask(workflow.id, taskName1));
  });
  const result = Effect.runSyncExit(program);

  expect(Exit.isFailure(result)).toBe(true);

  // @ts-expect-error - we know it"s a failure
  expect(result.cause.error._tag).toBe('InvalidTaskStateTransition');
});

it('can not transition task from enabled to failed', () => {
  const program = Effect.gen(function* ($) {
    const stateManager = yield* $(
      make(),
      Effect.provideService(IdGenerator, makeIdGenerator())
    );

    yield* $(stateManager.initializeWorkflow(workflow));
    yield* $(stateManager.enableTask(workflow.id, taskName1));

    yield* $(stateManager.failTask(workflow.id, taskName1));
  });
  const result = Effect.runSyncExit(program);

  expect(Exit.isFailure(result)).toBe(true);

  // @ts-expect-error - we know it"s a failure
  expect(result.cause.error._tag).toBe('InvalidTaskStateTransition');
});

it('can create work item', () => {
  const program = Effect.gen(function* ($) {
    const stateManager = yield* $(
      make(),
      Effect.provideService(IdGenerator, makeIdGenerator())
    );

    yield* $(stateManager.initializeWorkflow(workflow));
    yield* $(stateManager.createWorkItem(workflow.id, taskName1));
    const workItem = yield* $(
      stateManager.getWorkItem(workflowId, taskName1, WorkItemId('workItem-1'))
    );

    expect(workItem).toEqual({
      id: 'workItem-1',
      taskName: 'task1',
      state: 'initialized',
      payload: null,
    });
  });
  Effect.runSync(program);
});

it('can update work item state from initialized to completed', () => {
  const program = Effect.gen(function* ($) {
    const stateManager = yield* $(
      make(),
      Effect.provideService(IdGenerator, makeIdGenerator())
    );

    yield* $(stateManager.initializeWorkflow(workflow));
    yield* $(stateManager.createWorkItem(workflow.id, taskName1));
    yield* $(
      stateManager.updateWorkItemState(
        workflow.id,
        taskName1,
        WorkItemId('workItem-1'),
        'completed'
      )
    );
    const workItem = yield* $(
      stateManager.getWorkItem(workflowId, taskName1, WorkItemId('workItem-1'))
    );

    expect(workItem).toEqual({
      id: 'workItem-1',
      taskName: 'task1',
      state: 'completed',
      payload: null,
    });
  });
  Effect.runSync(program);
});

it('can get all task work items', () => {
  const program = Effect.gen(function* ($) {
    const stateManager = yield* $(
      make(),
      Effect.provideService(IdGenerator, makeIdGenerator())
    );

    yield* $(stateManager.initializeWorkflow(workflow));
    yield* $(stateManager.createWorkItem(workflow.id, taskName1));
    yield* $(stateManager.createWorkItem(workflow.id, taskName1));
    const workItems = yield* $(
      stateManager.getWorkItems(workflowId, taskName1)
    );

    expect(workItems).toEqual([
      {
        id: 'workItem-1',
        taskName: 'task1',
        state: 'initialized',
        payload: null,
      },
      {
        id: 'workItem-2',
        taskName: 'task1',
        state: 'initialized',
        payload: null,
      },
    ]);
  });
  Effect.runSync(program);
});

it('can get some work items based on work item state', () => {
  const program = Effect.gen(function* ($) {
    const stateManager = yield* $(
      make(),
      Effect.provideService(IdGenerator, makeIdGenerator())
    );
    yield* $(stateManager.initializeWorkflow(workflow));
    yield* $(stateManager.createWorkItem(workflow.id, taskName1));
    yield* $(stateManager.createWorkItem(workflow.id, taskName1));
    yield* $(
      stateManager.updateWorkItemState(
        workflow.id,
        taskName1,
        WorkItemId('workItem-1'),
        'completed'
      )
    );
    const workItems = yield* $(
      stateManager.getWorkItems(workflowId, taskName1, 'initialized')
    );

    expect(workItems).toEqual([
      {
        id: 'workItem-2',
        taskName: 'task1',
        state: 'initialized',
        payload: null,
      },
    ]);
  });
  Effect.runSync(program);
});
