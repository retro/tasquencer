import * as Context from '@effect/data/Context';
import * as Effect from '@effect/io/Effect';

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

export interface StateManager {
  initializeWorkflow(workflow: Workflow): Effect.Effect<never, never, void>;

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
    workflowOrId: Workflow | string
  ): Effect.Effect<never, WorkflowNotInitialized, WorkflowItem>;
}

export const StateManager = Context.Tag<StateManager>();
export interface IdGenerator {
  next(
    type: 'workflow' | 'task' | 'condition'
  ): Effect.Effect<never, never, string>;
}
export const IdGenerator = Context.Tag<IdGenerator>();
