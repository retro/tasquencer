import { Brand, Context, Effect } from 'effect';

import {
  ConditionDoesNotExist,
  InvalidTaskStateTransition,
  InvalidWorkflowStateTransition,
  TaskDoesNotExist,
  WorkflowDoesNotExist,
} from '../errors.js';

export type WorkflowInstanceId = string & Brand.Brand<'WorkflowInstanceId'>;
export const WorkflowInstanceId = Brand.refined<WorkflowInstanceId>(
  (value) => typeof value === 'string',
  (value) => Brand.error(`Expected string, got ${typeof value}`)
);

export type TaskName = string & Brand.Brand<'TaskName'>;
export const TaskName = Brand.refined<TaskName>(
  (value) => typeof value === 'string',
  (value) => Brand.error(`Expected string, got ${typeof value}`)
);

export type ConditionName = string & Brand.Brand<'ConditionName'>;
export const ConditionName = Brand.refined<ConditionName>(
  (value) => typeof value === 'string',
  (value) => Brand.error(`Expected string, got ${typeof value}`)
);

export type WorkItemId = string & Brand.Brand<'WorkItemId'>;
export const WorkItemId = Brand.refined<WorkItemId>(
  (value) => typeof value === 'string',
  (value) => Brand.error(`Expected string, got ${typeof value}`)
);

export type WorkflowInstanceState =
  | 'running'
  | 'completed'
  | 'canceled'
  | 'failed';

export interface WorkflowInstance {
  id: WorkflowInstanceId;
  name: string;
  state: WorkflowInstanceState;
}

export const validWorkflowInstanceTransitions: Record<
  WorkflowInstanceState,
  Set<WorkflowInstanceState>
> = {
  running: new Set(['completed', 'canceled', 'failed']),
  completed: new Set(),
  canceled: new Set(),
  failed: new Set(),
};

export type TaskInstanceState =
  | 'enabled'
  | 'disabled'
  | 'fired'
  | 'completed'
  | 'canceled'
  | 'failed';

export interface TaskInstance {
  name: TaskName;
  workflowId: WorkflowInstanceId;
  generation: number;
  state: TaskInstanceState;
}

export const validTaskInstanceTransitions: Record<
  TaskInstanceState,
  Set<TaskInstanceState>
> = {
  enabled: new Set(['disabled', 'fired']),
  disabled: new Set(['enabled']),
  fired: new Set(['completed', 'canceled', 'failed']),
  completed: new Set(),
  canceled: new Set(),
  failed: new Set(),
};

export function isValidTaskTransition(
  from: TaskInstanceState,
  to: TaskInstanceState
) {
  return validTaskInstanceTransitions[from].has(to);
}

export interface ConditionInstance {
  name: ConditionName;
  workflowId: WorkflowInstanceId;
  marking: number;
}

type WorkItemState = 'running' | 'completed' | 'canceled' | 'failed';

interface WorkItem {
  id: WorkItemId;
  taskName: TaskName;
  state: WorkItemState;
}

export const validWorkItemStateTransitions: Record<
  WorkItemState,
  Set<WorkItemState>
> = {
  running: new Set(['completed', 'canceled', 'failed']),
  completed: new Set(),
  canceled: new Set(),
  failed: new Set(),
};

export interface State {
  workflows: Record<WorkflowInstanceId, WorkflowInstance>;
  tasks: Record<TaskName, TaskInstance>;
  conditions: Record<ConditionName, ConditionInstance>;
  workItems: Record<WorkItemId, WorkItem>;
  workflowsToTasks: Record<WorkflowInstanceId, TaskName[]>;
  workflowsToConditions: Record<WorkflowInstanceId, ConditionName[]>;
  tasksToWorkItems: Record<TaskName, Record<number, WorkItemId[]>>;
}

export interface StateManager {
  initializeWorkflow(payload: {
    id: WorkflowInstanceId;
    name: string;
    tasks: TaskName[];
    conditions: ConditionName[];
  }): Effect.Effect<never, never, void>;

  getWorkflow(
    id: WorkflowInstanceId
  ): Effect.Effect<never, WorkflowDoesNotExist, WorkflowInstance>;

  getWorkflowTasks(
    id: WorkflowInstanceId
  ): Effect.Effect<never, never, TaskInstance[]>;

  getWorkflowConditions(
    id: WorkflowInstanceId
  ): Effect.Effect<never, never, ConditionInstance[]>;

  getWorkflowTask(
    workflowId: WorkflowInstanceId,
    taskName: TaskName
  ): Effect.Effect<never, TaskDoesNotExist, TaskInstance>;

  getWorkflowTaskState(
    workflowId: WorkflowInstanceId,
    taskName: TaskName
  ): Effect.Effect<never, TaskDoesNotExist, TaskInstanceState>;

  getWorkflowCondition(
    workflowId: WorkflowInstanceId,
    conditionName: ConditionName
  ): Effect.Effect<never, ConditionDoesNotExist, ConditionInstance>;

  getWorkflowConditionMarking(
    workflowId: WorkflowInstanceId,
    conditionName: ConditionName
  ): Effect.Effect<never, ConditionDoesNotExist, number>;

  updateWorkflowState(
    workflowId: WorkflowInstanceId,
    workflowState: Exclude<WorkflowInstanceState, 'running'>
  ): Effect.Effect<
    never,
    WorkflowDoesNotExist | InvalidWorkflowStateTransition,
    void
  >;

  updateWorkflowTaskState(
    workflowId: WorkflowInstanceId,
    taskName: TaskName,
    taskState: TaskInstanceState
  ): Effect.Effect<never, TaskDoesNotExist | InvalidTaskStateTransition, void>;

  enableWorkflowTask(
    workflowId: WorkflowInstanceId,
    taskName: TaskName
  ): Effect.Effect<never, TaskDoesNotExist | InvalidTaskStateTransition, void>;

  disableWorkflowTask(
    workflowId: WorkflowInstanceId,
    taskName: TaskName
  ): Effect.Effect<never, TaskDoesNotExist | InvalidTaskStateTransition, void>;

  fireWorkflowTask(
    workflowId: WorkflowInstanceId,
    taskName: TaskName
  ): Effect.Effect<never, TaskDoesNotExist | InvalidTaskStateTransition, void>;

  completeWorkflowTask(
    workflowId: WorkflowInstanceId,
    taskName: TaskName
  ): Effect.Effect<never, TaskDoesNotExist | InvalidTaskStateTransition, void>;

  cancelWorkflowTask(
    workflowId: WorkflowInstanceId,
    taskName: TaskName
  ): Effect.Effect<never, TaskDoesNotExist | InvalidTaskStateTransition, void>;

  failWorkflowTask(
    workflowId: WorkflowInstanceId,
    taskName: TaskName
  ): Effect.Effect<never, TaskDoesNotExist | InvalidTaskStateTransition, void>;

  updateWorkflowCondition(
    workflowId: WorkflowInstanceId,
    conditionName: ConditionName,
    f: (condition: ConditionInstance) => ConditionInstance
  ): Effect.Effect<never, ConditionDoesNotExist, void>;

  incrementWorkflowConditionMarking(
    workflowId: WorkflowInstanceId,
    conditionName: ConditionName
  ): Effect.Effect<never, ConditionDoesNotExist, void>;

  decrementWorkflowConditionMarking(
    workflowId: WorkflowInstanceId,
    conditionName: ConditionName
  ): Effect.Effect<never, ConditionDoesNotExist, void>;

  emptyWorkflowConditionMarking(
    workflowId: WorkflowInstanceId,
    conditionName: ConditionName
  ): Effect.Effect<never, ConditionDoesNotExist, void>;
}

export const StateManager = Context.Tag<StateManager>();
