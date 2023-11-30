import { Context, Effect } from 'effect';

import {
  ConditionDoesNotExistInStore,
  InvalidTaskStateTransition,
  InvalidWorkItemTransition,
  InvalidWorkflowStateTransition,
  TaskDoesNotExistInStore,
  WorkItemDoesNotExist,
  WorkflowDoesNotExist,
} from './errors.js';
import {
  ConditionInstance,
  ConditionName,
  Store,
  StorePersistableState,
  TaskInstance,
  TaskInstanceState,
  TaskName,
  WorkItem,
  WorkItemId,
  WorkItemState,
  WorkflowId,
  WorkflowInstance,
  WorkflowInstanceParent,
  WorkflowInstanceState,
} from './types.js';

export interface State {
  initializeWorkflow(
    payload: {
      name: string;
      tasks: TaskName[];
      conditions: ConditionName[];
    },
    context: unknown,
    parent: WorkflowInstanceParent
  ): Effect.Effect<never, never, WorkflowInstance>;

  getWorkflow(
    id: WorkflowId
  ): Effect.Effect<never, WorkflowDoesNotExist, WorkflowInstance>;

  getWorkflowContext(
    id: WorkflowId
  ): Effect.Effect<never, WorkflowDoesNotExist, unknown>;

  getTasks(id: WorkflowId): Effect.Effect<never, never, TaskInstance[]>;

  getConditions(
    id: WorkflowId
  ): Effect.Effect<never, never, ConditionInstance[]>;

  getTask(
    workflowId: WorkflowId,
    taskName: TaskName
  ): Effect.Effect<never, TaskDoesNotExistInStore, TaskInstance>;

  getTaskState(
    workflowId: WorkflowId,
    taskName: TaskName
  ): Effect.Effect<never, TaskDoesNotExistInStore, TaskInstanceState>;

  getCondition(
    workflowId: WorkflowId,
    conditionName: ConditionName
  ): Effect.Effect<never, ConditionDoesNotExistInStore, ConditionInstance>;

  getConditionMarking(
    workflowId: WorkflowId,
    conditionName: ConditionName
  ): Effect.Effect<never, ConditionDoesNotExistInStore, number>;

  updateWorkflowState(
    workflowId: WorkflowId,
    workflowState: Exclude<WorkflowInstanceState, 'running'>
  ): Effect.Effect<
    never,
    WorkflowDoesNotExist | InvalidWorkflowStateTransition,
    void
  >;

  updateWorkflowContext(
    workflowId: WorkflowId,
    context: unknown
  ): Effect.Effect<never, WorkflowDoesNotExist, void>;

  updateTaskState(
    workflowId: WorkflowId,
    taskName: TaskName,
    taskState: TaskInstanceState
  ): Effect.Effect<
    never,
    TaskDoesNotExistInStore | InvalidTaskStateTransition,
    void
  >;

  enableTask(
    workflowId: WorkflowId,
    taskName: TaskName
  ): Effect.Effect<
    never,
    TaskDoesNotExistInStore | InvalidTaskStateTransition,
    void
  >;

  disableTask(
    workflowId: WorkflowId,
    taskName: TaskName
  ): Effect.Effect<
    never,
    TaskDoesNotExistInStore | InvalidTaskStateTransition,
    void
  >;

  fireTask(
    workflowId: WorkflowId,
    taskName: TaskName
  ): Effect.Effect<
    never,
    TaskDoesNotExistInStore | InvalidTaskStateTransition,
    void
  >;

  exitTask(
    workflowId: WorkflowId,
    taskName: TaskName
  ): Effect.Effect<
    never,
    TaskDoesNotExistInStore | InvalidTaskStateTransition,
    void
  >;

  cancelTask(
    workflowId: WorkflowId,
    taskName: TaskName
  ): Effect.Effect<
    never,
    TaskDoesNotExistInStore | InvalidTaskStateTransition,
    void
  >;

  failTask(
    workflowId: WorkflowId,
    taskName: TaskName
  ): Effect.Effect<
    never,
    TaskDoesNotExistInStore | InvalidTaskStateTransition,
    void
  >;

  updateCondition(
    workflowId: WorkflowId,
    conditionName: ConditionName,
    f: (condition: ConditionInstance) => ConditionInstance
  ): Effect.Effect<never, ConditionDoesNotExistInStore, void>;

  incrementConditionMarking(
    workflowId: WorkflowId,
    conditionName: ConditionName
  ): Effect.Effect<never, ConditionDoesNotExistInStore, void>;

  decrementConditionMarking(
    workflowId: WorkflowId,
    conditionName: ConditionName
  ): Effect.Effect<never, ConditionDoesNotExistInStore, void>;

  emptyConditionMarking(
    workflowId: WorkflowId,
    conditionName: ConditionName
  ): Effect.Effect<never, ConditionDoesNotExistInStore, void>;

  initializeWorkItem(
    workflowId: WorkflowId,
    taskName: TaskName,
    payload: unknown
  ): Effect.Effect<never, TaskDoesNotExistInStore, WorkItem>;

  updateWorkItem(
    workflowId: WorkflowId,
    taskName: TaskName,
    workItemId: WorkItemId,
    payload: unknown
  ): Effect.Effect<never, WorkItemDoesNotExist, void>;

  getWorkItem(
    workflowId: WorkflowId,
    taskName: TaskName,
    workItemId: WorkItemId
  ): Effect.Effect<never, WorkItemDoesNotExist, WorkItem>;

  updateWorkItemState(
    workflowId: WorkflowId,
    taskName: TaskName,
    workItemId: WorkItemId,
    nextState: WorkItemState
  ): Effect.Effect<
    never,
    InvalidWorkItemTransition | WorkItemDoesNotExist,
    void
  >;

  getWorkItems(
    workflowId: WorkflowId,
    taskName: TaskName
  ): Effect.Effect<never, TaskDoesNotExistInStore, WorkItem[]>;

  getWorkflows(
    workflowId: WorkflowId,
    taskName: TaskName
  ): Effect.Effect<never, TaskDoesNotExistInStore, WorkflowInstance[]>;

  getState(): Effect.Effect<never, never, StorePersistableState>;

  inspect(): Effect.Effect<never, never, Store>;
}

export const State = Context.Tag<State>();
