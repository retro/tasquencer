import { Context, Effect } from 'effect';

import type { Condition } from '../elements/Condition.js';
import type { Task } from '../elements/Task.js';
import { Workflow } from '../elements/Workflow.js';
import type { WorkflowNotInitialized } from '../errors.js';
import { TaskState } from '../types.js';

export interface JSInterpreterState {
  markings: Record<string, number>;
  tasks: Record<string, TaskState>;
}

export type WorkflowState = Record<string, WorkflowItem>;
export interface WorkflowItem {
  id: string;
  name: string;
  state: 'running' | 'done' | 'canceled';
  tasks: Record<string, TaskItem>;
  conditions: Record<string, ConditionItem>;
}

export interface ConditionItem {
  id: string;
  name: string;
  marking: number;
}

export interface TaskItem {
  id: string;
  name: string;
  state: TaskState;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyWorkflow = Workflow<any, any, any, any, any>;

export interface StateManager {
  initializeWorkflow(workflow: AnyWorkflow): Effect.Effect<never, never, void>;
  updateWorkflowState(
    workflow: AnyWorkflow,
    state: 'canceled' | 'done'
  ): Effect.Effect<never, WorkflowNotInitialized, void>;
  incrementConditionMarking(
    condition: Condition
  ): Effect.Effect<never, WorkflowNotInitialized, void>;
  decrementConditionMarking(
    condition: Condition
  ): Effect.Effect<never, WorkflowNotInitialized, void>;
  emptyConditionMarking(
    condition: Condition
  ): Effect.Effect<never, WorkflowNotInitialized, void>;
  getConditionMarking(
    condition: Condition
  ): Effect.Effect<never, WorkflowNotInitialized, number>;

  enableTask(task: Task): Effect.Effect<never, WorkflowNotInitialized, void>;
  disableTask(task: Task): Effect.Effect<never, WorkflowNotInitialized, void>;
  activateTask(task: Task): Effect.Effect<never, WorkflowNotInitialized, void>;
  cancelTask(task: Task): Effect.Effect<never, WorkflowNotInitialized, void>;
  completeTask(task: Task): Effect.Effect<never, WorkflowNotInitialized, void>;
  getTaskState(
    task: Task
  ): Effect.Effect<never, WorkflowNotInitialized, TaskState>;

  getWorkflowState(
    workflowOrId: AnyWorkflow | string
  ): Effect.Effect<never, WorkflowNotInitialized, WorkflowItem>;
}

export const StateManager = Context.Tag<StateManager>();
export interface IdGenerator {
  next(
    type: 'workflow' | 'task' | 'condition'
  ): Effect.Effect<never, never, string>;
}
export const IdGenerator = Context.Tag<IdGenerator>();
