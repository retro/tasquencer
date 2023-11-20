import { Brand, Context, Effect } from 'effect';

import {
  ConditionDoesNotExist,
  InvalidTaskStateTransition,
  InvalidWorkItemTransition,
  InvalidWorkflowStateTransition,
  TaskDoesNotExist,
  WorkItemDoesNotExist,
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
  | 'exited'
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
  running: new Set(['exited', 'canceled', 'failed']),
  exited: new Set(),
  canceled: new Set(),
  failed: new Set(),
};

export type TaskInstanceState =
  | 'enabled'
  | 'disabled'
  | 'fired'
  | 'exited'
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
  fired: new Set(['exited', 'canceled', 'failed']),
  exited: new Set(['enabled']),
  canceled: new Set(['enabled']),
  failed: new Set(['enabled']),
};

export function isValidTaskInstanceTransition(
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

export type WorkItemState = 'running' | 'completed' | 'canceled' | 'failed';

export interface WorkItem {
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

interface WorkflowState {
  workflow: WorkflowInstance;
  tasks: Record<TaskName, TaskInstance>;
  conditions: Record<ConditionName, ConditionInstance>;
  workItems: Record<WorkItemId, WorkItem>;
  tasksToWorkItems: Record<TaskName, Record<number, WorkItemId[]>>;
}
export type State = Record<WorkflowInstanceId, WorkflowState>;

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

  getTasks(id: WorkflowInstanceId): Effect.Effect<never, never, TaskInstance[]>;

  getConditions(
    id: WorkflowInstanceId
  ): Effect.Effect<never, never, ConditionInstance[]>;

  getTask(
    workflowId: WorkflowInstanceId,
    taskName: TaskName
  ): Effect.Effect<never, TaskDoesNotExist, TaskInstance>;

  getTaskState(
    workflowId: WorkflowInstanceId,
    taskName: TaskName
  ): Effect.Effect<never, TaskDoesNotExist, TaskInstanceState>;

  getCondition(
    workflowId: WorkflowInstanceId,
    conditionName: ConditionName
  ): Effect.Effect<never, ConditionDoesNotExist, ConditionInstance>;

  getConditionMarking(
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

  updateTaskState(
    workflowId: WorkflowInstanceId,
    taskName: TaskName,
    taskState: TaskInstanceState
  ): Effect.Effect<never, TaskDoesNotExist | InvalidTaskStateTransition, void>;

  enableTask(
    workflowId: WorkflowInstanceId,
    taskName: TaskName
  ): Effect.Effect<never, TaskDoesNotExist | InvalidTaskStateTransition, void>;

  disableTask(
    workflowId: WorkflowInstanceId,
    taskName: TaskName
  ): Effect.Effect<never, TaskDoesNotExist | InvalidTaskStateTransition, void>;

  fireTask(
    workflowId: WorkflowInstanceId,
    taskName: TaskName
  ): Effect.Effect<never, TaskDoesNotExist | InvalidTaskStateTransition, void>;

  exitTask(
    workflowId: WorkflowInstanceId,
    taskName: TaskName
  ): Effect.Effect<never, TaskDoesNotExist | InvalidTaskStateTransition, void>;

  cancelTask(
    workflowId: WorkflowInstanceId,
    taskName: TaskName
  ): Effect.Effect<never, TaskDoesNotExist | InvalidTaskStateTransition, void>;

  failTask(
    workflowId: WorkflowInstanceId,
    taskName: TaskName
  ): Effect.Effect<never, TaskDoesNotExist | InvalidTaskStateTransition, void>;

  updateCondition(
    workflowId: WorkflowInstanceId,
    conditionName: ConditionName,
    f: (condition: ConditionInstance) => ConditionInstance
  ): Effect.Effect<never, ConditionDoesNotExist, void>;

  incrementConditionMarking(
    workflowId: WorkflowInstanceId,
    conditionName: ConditionName
  ): Effect.Effect<never, ConditionDoesNotExist, void>;

  decrementConditionMarking(
    workflowId: WorkflowInstanceId,
    conditionName: ConditionName
  ): Effect.Effect<never, ConditionDoesNotExist, void>;

  emptyConditionMarking(
    workflowId: WorkflowInstanceId,
    conditionName: ConditionName
  ): Effect.Effect<never, ConditionDoesNotExist, void>;

  createWorkItem(
    workflowId: WorkflowInstanceId,
    taskName: TaskName
  ): Effect.Effect<never, TaskDoesNotExist, void>;

  getWorkItem(
    workflowId: WorkflowInstanceId,
    taskName: TaskName,
    workItemId: WorkItemId
  ): Effect.Effect<never, WorkItemDoesNotExist, WorkItem>;

  updateWorkItemState(
    workflowId: WorkflowInstanceId,
    taskName: TaskName,
    workItemId: WorkItemId,
    nextState: WorkItemState
  ): Effect.Effect<
    never,
    InvalidWorkItemTransition | WorkItemDoesNotExist,
    void
  >;

  getWorkItems(
    workflowId: WorkflowInstanceId,
    taskName: TaskName,
    workItemState?: WorkItemState
  ): Effect.Effect<never, TaskDoesNotExist, WorkItem[]>;
}

export const StateManager = Context.Tag<StateManager>();
