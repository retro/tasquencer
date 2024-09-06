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
  WorkItemId,
  WorkItemInstance,
  WorkItemInstanceState,
  WorkflowId,
  WorkflowInstance,
  WorkflowInstanceParent,
  WorkflowInstanceState,
} from './types.js';

export class State extends Context.Tag('tasquencer/State')<
  State,
  {
    initializeWorkflow(
      payload: {
        name: string;
        tasks: TaskName[];
        conditions: ConditionName[];
      },
      context: unknown,
      parent: WorkflowInstanceParent
    ): Effect.Effect<WorkflowInstance>;

    getWorkflow(
      id: WorkflowId
    ): Effect.Effect<WorkflowInstance, WorkflowDoesNotExist>;

    getWorkflowContext(
      id: WorkflowId
    ): Effect.Effect<unknown, WorkflowDoesNotExist>;

    getTasks(id: WorkflowId): Effect.Effect<TaskInstance[]>;

    getConditions(id: WorkflowId): Effect.Effect<ConditionInstance[]>;

    getTask(
      workflowId: WorkflowId,
      taskName: TaskName
    ): Effect.Effect<TaskInstance, TaskDoesNotExistInStore>;

    getTaskState(
      workflowId: WorkflowId,
      taskName: TaskName
    ): Effect.Effect<TaskInstanceState, TaskDoesNotExistInStore>;

    getTaskPath(
      workflowId: WorkflowId,
      taskName: TaskName
    ): Effect.Effect<string[], TaskDoesNotExistInStore | WorkflowDoesNotExist>;

    getCondition(
      workflowId: WorkflowId,
      conditionName: ConditionName
    ): Effect.Effect<ConditionInstance, ConditionDoesNotExistInStore>;

    getConditionMarking(
      workflowId: WorkflowId,
      conditionName: ConditionName
    ): Effect.Effect<number, ConditionDoesNotExistInStore>;

    updateWorkflowState(
      workflowId: WorkflowId,
      workflowState: Exclude<WorkflowInstanceState, 'running'>
    ): Effect.Effect<
      void,
      WorkflowDoesNotExist | InvalidWorkflowStateTransition
    >;

    updateWorkflowContext(
      workflowId: WorkflowId,
      context: unknown
    ): Effect.Effect<void, WorkflowDoesNotExist>;

    updateTaskState(
      workflowId: WorkflowId,
      taskName: TaskName,
      taskState: TaskInstanceState
    ): Effect.Effect<
      void,
      TaskDoesNotExistInStore | InvalidTaskStateTransition
    >;

    enableTask(
      workflowId: WorkflowId,
      taskName: TaskName
    ): Effect.Effect<
      void,
      TaskDoesNotExistInStore | InvalidTaskStateTransition
    >;

    disableTask(
      workflowId: WorkflowId,
      taskName: TaskName
    ): Effect.Effect<
      void,
      TaskDoesNotExistInStore | InvalidTaskStateTransition
    >;

    startTask(
      workflowId: WorkflowId,
      taskName: TaskName
    ): Effect.Effect<
      void,
      TaskDoesNotExistInStore | InvalidTaskStateTransition
    >;

    completeTask(
      workflowId: WorkflowId,
      taskName: TaskName
    ): Effect.Effect<
      void,
      TaskDoesNotExistInStore | InvalidTaskStateTransition
    >;

    cancelTask(
      workflowId: WorkflowId,
      taskName: TaskName
    ): Effect.Effect<
      void,
      TaskDoesNotExistInStore | InvalidTaskStateTransition
    >;

    failTask(
      workflowId: WorkflowId,
      taskName: TaskName
    ): Effect.Effect<
      void,
      TaskDoesNotExistInStore | InvalidTaskStateTransition
    >;

    updateCondition(
      workflowId: WorkflowId,
      conditionName: ConditionName,
      f: (condition: ConditionInstance) => ConditionInstance
    ): Effect.Effect<void, ConditionDoesNotExistInStore>;

    incrementConditionMarking(
      workflowId: WorkflowId,
      conditionName: ConditionName
    ): Effect.Effect<void, ConditionDoesNotExistInStore>;

    decrementConditionMarking(
      workflowId: WorkflowId,
      conditionName: ConditionName
    ): Effect.Effect<void, ConditionDoesNotExistInStore>;

    emptyConditionMarking(
      workflowId: WorkflowId,
      conditionName: ConditionName
    ): Effect.Effect<void, ConditionDoesNotExistInStore>;

    initializeWorkItem(
      workflowId: WorkflowId,
      taskName: TaskName,
      payload: unknown
    ): Effect.Effect<WorkItemInstance, TaskDoesNotExistInStore>;

    updateWorkItemPayload(
      workflowId: WorkflowId,
      taskName: TaskName,
      workItemId: WorkItemId,
      payload: unknown
    ): Effect.Effect<void, WorkItemDoesNotExist>;

    getWorkItem(
      workflowId: WorkflowId,
      taskName: TaskName,
      workItemId: WorkItemId
    ): Effect.Effect<WorkItemInstance, WorkItemDoesNotExist>;

    updateWorkItemState(
      workflowId: WorkflowId,
      taskName: TaskName,
      workItemId: WorkItemId,
      nextState: WorkItemInstanceState
    ): Effect.Effect<void, InvalidWorkItemTransition | WorkItemDoesNotExist>;

    getWorkItems(
      workflowId: WorkflowId,
      taskName: TaskName
    ): Effect.Effect<WorkItemInstance[], TaskDoesNotExistInStore>;

    getWorkflows(
      workflowId: WorkflowId,
      taskName: TaskName
    ): Effect.Effect<WorkflowInstance[], TaskDoesNotExistInStore>;

    getState(): Effect.Effect<StorePersistableState, never>;

    inspect(): Effect.Effect<Store, never>;
  }
>() {}
