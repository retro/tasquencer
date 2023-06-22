import * as Context from '@effect/data/Context';
import * as Effect from '@effect/io/Effect';

import type { Condition } from '../elements/Condition.js';
import type { Task } from '../elements/Task.js';
import { Workflow, WorkflowNotInitialized } from '../elements/Workflow.js';
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

  incrementConditionMarking<E>(
    condition: Condition
  ): Effect.Effect<never, E | WorkflowNotInitialized, void>;
  decrementConditionMarking<E>(
    condition: Condition
  ): Effect.Effect<never, E | WorkflowNotInitialized, void>;
  emptyConditionMarking<E>(
    condition: Condition
  ): Effect.Effect<never, E | WorkflowNotInitialized, void>;
  getConditionMarking<E>(
    condition: Condition
  ): Effect.Effect<never, E | WorkflowNotInitialized, number>;

  enableTask<E>(
    task: Task
  ): Effect.Effect<never, E | WorkflowNotInitialized, void>;
  disableTask<E>(
    task: Task
  ): Effect.Effect<never, E | WorkflowNotInitialized, void>;
  activateTask<E>(
    task: Task
  ): Effect.Effect<never, E | WorkflowNotInitialized, void>;
  cancelTask<E>(
    task: Task
  ): Effect.Effect<never, E | WorkflowNotInitialized, void>;
  completeTask<E>(
    task: Task
  ): Effect.Effect<never, E | WorkflowNotInitialized, void>;
  getTaskState<E>(
    task: Task
  ): Effect.Effect<never, E | WorkflowNotInitialized, TaskState>;

  getWorkflowState<E>(
    workflow: Workflow
  ): Effect.Effect<never, E | WorkflowNotInitialized, WorkflowItem>;
}

export const StateManager = Context.Tag<StateManager>();
export interface IdGenerator {
  next(
    type: 'workflow' | 'task' | 'condition'
  ): Effect.Effect<never, never, string>;
}
export const IdGenerator = Context.Tag<IdGenerator>();
