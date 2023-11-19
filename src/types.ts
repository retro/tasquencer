import { Context, Effect } from 'effect';

import {
  ConditionFlowBuilder,
  OrXorTaskFlowBuilder,
  TaskFlowBuilder,
} from './builder/FlowBuilder.js';
import { AnyTaskBuilder } from './builder/TaskBuilder.js';
import {
  ConditionDoesNotExist,
  EndConditionDoesNotExist,
  InvalidTaskStateTransition,
  InvalidWorkflowStateTransition,
  StartConditionDoesNotExist,
  TaskDoesNotExist,
  WorkflowDoesNotExist,
} from './errors.js';
import { TaskInstanceState } from './state/types.js';

export type Prettify<T> = {
  [K in keyof T]: T[K];
} & object;

export type NotExtends<NS, N> = N extends NS ? never : N;

export type TaskState =
  | 'disabled'
  | 'enabled'
  | 'active'
  | 'completed'
  | 'canceled';

type JoinSplitType = 'and' | 'or' | 'xor';
export type SplitType = JoinSplitType;
export type JoinType = SplitType;

export type FlowType = 'task->condition' | 'condition->task';

export interface OutgoingTaskFlow {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  predicate?: (...args: any[]) => Effect.Effect<any, any, boolean>;
  order?: number;
  isDefault?: true;
}

export interface CancellationRegion {
  tasks?: string[];
  conditions?: string[];
}

export interface ConditionNode {
  isImplicit?: boolean;
}
export interface WorkflowBuilderDefinition {
  startCondition?: string;
  endCondition?: string;
  conditions: Record<string, ConditionNode>;
  tasks: Record<string, AnyTaskBuilder>;
  cancellationRegions: Record<string, CancellationRegion>;
  flows: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    conditions: Record<string, ConditionFlowBuilder<any>>;
    tasks: Record<
      string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      TaskFlowBuilder<any, any> | OrXorTaskFlowBuilder<any, any>
    >;
  };
}

export interface TaskActionsService {
  activateTask(
    taskName: string,
    input?: unknown
  ): Effect.Effect<never, never, void>;
  completeTask(
    taskName: string,
    input?: unknown
  ): Effect.Effect<never, never, void>;
}
export const TaskActionsService = Context.Tag<TaskActionsService>();

export interface DefaultTaskActivityPayload {
  getTaskName: () => Effect.Effect<never, never, string>;
  getWorkflowId: () => Effect.Effect<never, never, string>;
  getTaskState: () => Effect.Effect<never, TaskDoesNotExist, TaskInstanceState>;
}

export interface WorkflowOnStartPayload<C> {
  context: C;
  input: unknown;
  getWorkflowId: () => Effect.Effect<never, never, string>;
  startWorkflow(): Effect.Effect<
    never,
    | TaskDoesNotExist
    | StartConditionDoesNotExist
    | EndConditionDoesNotExist
    | ConditionDoesNotExist
    | WorkflowDoesNotExist
    | InvalidTaskStateTransition
    | InvalidWorkflowStateTransition,
    void
  >;
}

export interface WorkflowOnEndPayload<C> {
  context: C;
  getWorkflowId: () => Effect.Effect<never, never, string>;
  endWorkflow(): Effect.Effect<
    never,
    WorkflowDoesNotExist | InvalidWorkflowStateTransition,
    void
  >;
}

export type TaskOnDisablePayload<C extends object = object> =
  DefaultTaskActivityPayload & {
    context: C;
    disableTask: () => Effect.Effect<
      never,
      TaskDoesNotExist | InvalidTaskStateTransition,
      void
    >;
  };

export type TaskOnEnablePayload<C extends object = object> =
  DefaultTaskActivityPayload & {
    context: C;
    enableTask: () => Effect.Effect<
      never,
      TaskDoesNotExist | ConditionDoesNotExist | InvalidTaskStateTransition,
      {
        activateTask: (input?: unknown) => Effect.Effect<never, never, void>;
      }
    >;
  };

export type TaskOnActivatePayload<C extends object = object> =
  DefaultTaskActivityPayload & {
    context: C;
    input: unknown;
    activateTask: () => Effect.Effect<
      never,
      TaskDoesNotExist | ConditionDoesNotExist | InvalidTaskStateTransition,
      { completeTask: (input?: unknown) => Effect.Effect<never, never, void> }
    >;
  };

export type TaskOnExecutePayload<C extends object = object> =
  DefaultTaskActivityPayload & {
    context: C;
    input: unknown;
    completeTask: (
      input?: unknown
    ) => Effect.Effect<
      never,
      TaskDoesNotExist | ConditionDoesNotExist | InvalidTaskStateTransition,
      void
    >;
  };

export type TaskOnCompletePayload<C extends object = object> =
  DefaultTaskActivityPayload & {
    context: C;
    input: unknown;
    completeTask: () => Effect.Effect<
      never,
      TaskDoesNotExist | ConditionDoesNotExist | InvalidTaskStateTransition,
      void
    >;
  };

export type TaskOnCancelPayload<C extends object = object> =
  DefaultTaskActivityPayload & {
    context: C;
    cancelTask: () => Effect.Effect<
      never,
      TaskDoesNotExist | ConditionDoesNotExist | InvalidTaskStateTransition,
      void
    >;
  };

export interface TaskActivities<C extends object = object> {
  onDisable: (
    payload: TaskOnDisablePayload<C>
  ) => Effect.Effect<unknown, unknown, unknown>;
  onEnable: (
    payload: TaskOnEnablePayload<C>
  ) => Effect.Effect<unknown, unknown, unknown>;
  onActivate: (
    payload: TaskOnActivatePayload<C>
  ) => Effect.Effect<unknown, unknown, unknown>;
  onExecute: (
    payload: TaskOnExecutePayload<C>
  ) => Effect.Effect<unknown, unknown, unknown>;
  onComplete: (
    payload: TaskOnCompletePayload<C>
  ) => Effect.Effect<unknown, unknown, unknown>;
  onCancel: (
    payload: TaskOnCancelPayload<C>
  ) => Effect.Effect<unknown, unknown, unknown>;
}
