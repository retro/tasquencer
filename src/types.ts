import { Brand, Context, Effect } from 'effect';

import { State } from './State.js';
import { AnyCompositeTaskBuilder } from './builder/CompositeTaskBuilder.js';
import {
  ConditionFlowBuilder,
  OrXorTaskFlowBuilder,
  TaskFlowBuilder,
} from './builder/FlowBuilder.js';
import { AnyTaskBuilder } from './builder/TaskBuilder.js';
import {
  ConditionDoesNotExist,
  ConditionDoesNotExistInStore,
  EndConditionDoesNotExist,
  InvalidTaskStateTransition,
  InvalidWorkflowStateTransition,
  StartConditionDoesNotExist,
  TaskDoesNotExist,
  TaskDoesNotExistInStore,
  WorkflowDoesNotExist,
} from './errors.js';

export type Prettify<T> = {
  [K in keyof T]: T[K];
} & object;

export type NotExtends<NS, N> = N extends NS ? never : N;

export type TaskState = TaskInstanceState;

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
  tasks: Record<string, AnyTaskBuilder | AnyCompositeTaskBuilder>;
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
  fireTask(
    taskName: string,
    input?: unknown
  ): Effect.Effect<never, never, void>;
  exitTask(
    taskName: string,
    input?: unknown
  ): Effect.Effect<never, never, void>;
}
export const TaskActionsService = Context.Tag<TaskActionsService>();

export interface DefaultTaskActivityPayload {
  getTaskName: () => Effect.Effect<never, never, string>;
  getWorkflowId: () => Effect.Effect<never, never, string>;
  getTaskState: () => Effect.Effect<
    State,
    TaskDoesNotExistInStore,
    TaskInstanceState
  >;
}

export interface WorkflowOnStartPayload<C> {
  context: C;
  input: unknown;
  getWorkflowId: () => Effect.Effect<never, never, string>;
  startWorkflow(): Effect.Effect<
    State,
    | TaskDoesNotExist
    | TaskDoesNotExistInStore
    | StartConditionDoesNotExist
    | EndConditionDoesNotExist
    | ConditionDoesNotExist
    | ConditionDoesNotExistInStore
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
    State,
    | ConditionDoesNotExist
    | WorkflowDoesNotExist
    | InvalidWorkflowStateTransition
    | TaskDoesNotExist
    | TaskDoesNotExistInStore
    | InvalidTaskStateTransition
    | ConditionDoesNotExistInStore
    | EndConditionDoesNotExist,
    void
  >;
}

export type TaskOnDisablePayload<C extends object = object> =
  DefaultTaskActivityPayload & {
    context: C;
    disableTask: () => Effect.Effect<
      never,
      TaskDoesNotExist | TaskDoesNotExistInStore | InvalidTaskStateTransition,
      void
    >;
  };

export type TaskOnEnablePayload<C extends object = object> =
  DefaultTaskActivityPayload & {
    context: C;
    enableTask: () => Effect.Effect<
      never,
      | TaskDoesNotExist
      | TaskDoesNotExistInStore
      | ConditionDoesNotExist
      | ConditionDoesNotExistInStore
      | InvalidTaskStateTransition,
      {
        fireTask: (input?: unknown) => Effect.Effect<never, never, void>;
      }
    >;
  };

export type TaskOnFirePayload<
  C extends object = object,
  P = unknown
> = DefaultTaskActivityPayload & {
  context: C;
  input: unknown;

  fireTask: () => Effect.Effect<
    never,
    | TaskDoesNotExist
    | TaskDoesNotExistInStore
    | ConditionDoesNotExist
    | ConditionDoesNotExistInStore
    | InvalidTaskStateTransition,
    {
      createWorkItem: (
        payload: P
      ) => Effect.Effect<State, TaskDoesNotExistInStore, WorkItem<P>>;
    }
  >;
};

export type CompositeTaskOnFirePayload<
  C extends object = object,
  P = unknown
> = DefaultTaskActivityPayload & {
  context: C;
  input: unknown;

  fireTask: () => Effect.Effect<
    never,
    | TaskDoesNotExist
    | TaskDoesNotExistInStore
    | ConditionDoesNotExist
    | ConditionDoesNotExistInStore
    | InvalidTaskStateTransition,
    {
      initializeWorkflow: (
        payload: P
      ) => Effect.Effect<State, TaskDoesNotExist, WorkflowInstance>;
      startWorkflow: (
        workflowId: WorkflowId,
        payload?: unknown
      ) => Effect.Effect<
        State,
        | TaskDoesNotExist
        | TaskDoesNotExistInStore
        | StartConditionDoesNotExist
        | EndConditionDoesNotExist
        | ConditionDoesNotExist
        | ConditionDoesNotExistInStore
        | WorkflowDoesNotExist
        | InvalidTaskStateTransition
        | InvalidWorkflowStateTransition,
        void
      >;
    }
  >;
};

export type TaskOnExitPayload<C extends object = object> =
  DefaultTaskActivityPayload & {
    context: C;
    input: unknown;
    exitTask: () => Effect.Effect<
      never,
      | TaskDoesNotExist
      | TaskDoesNotExistInStore
      | ConditionDoesNotExist
      | ConditionDoesNotExistInStore
      | InvalidTaskStateTransition,
      void
    >;
  };

export type TaskOnCancelPayload<C extends object = object> =
  DefaultTaskActivityPayload & {
    context: C;
    cancelTask: () => Effect.Effect<
      never,
      | TaskDoesNotExist
      | TaskDoesNotExistInStore
      | ConditionDoesNotExist
      | ConditionDoesNotExistInStore
      | InvalidTaskStateTransition,
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
  onFire: (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    payload: TaskOnFirePayload<C, any>
  ) => Effect.Effect<unknown, unknown, unknown>;
  onExit: (
    payload: TaskOnExitPayload<C>
  ) => Effect.Effect<unknown, unknown, unknown>;
  onCancel: (
    payload: TaskOnCancelPayload<C>
  ) => Effect.Effect<unknown, unknown, unknown>;
}
export type CompositeTaskActivities<C extends object = object> = Omit<
  TaskActivities<C>,
  'onFire'
> & {
  onFire: (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    payload: CompositeTaskOnFirePayload<C, any>
  ) => Effect.Effect<unknown, unknown, unknown>;
};

export interface IdGenerator {
  workflow: () => Effect.Effect<never, never, WorkflowId>;
  workItem: () => Effect.Effect<never, never, WorkItemId>;
}
export const IdGenerator = Context.Tag<IdGenerator>();

export type WorkflowId = string & Brand.Brand<'WorkflowId'>;
export const WorkflowId = Brand.refined<WorkflowId>(
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
  | 'initialized'
  | 'started'
  | 'completed'
  | 'canceled'
  | 'failed';

export type WorkflowInstanceParent = {
  workflowId: WorkflowId;
  taskName: TaskName;
} | null;

export interface WorkflowInstance {
  parent: WorkflowInstanceParent;
  id: WorkflowId;
  name: string;
  state: WorkflowInstanceState;
}

export const validWorkflowInstanceTransitions: Record<
  WorkflowInstanceState,
  Set<WorkflowInstanceState>
> = {
  initialized: new Set(['started']),
  started: new Set(['completed', 'canceled', 'failed']),
  completed: new Set(),
  canceled: new Set(),
  failed: new Set(),
};

export const finalWorkflowInstanceStates = new Set([
  'completed',
  'canceled',
  'failed',
]);

export const activeWorkflowInstanceStates = new Set(['initialized', 'started']);

export type TaskInstanceState =
  | 'enabled'
  | 'disabled'
  | 'fired'
  | 'exited'
  | 'canceled'
  | 'failed';

export interface TaskInstance {
  name: TaskName;
  workflowId: WorkflowId;
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
  workflowId: WorkflowId;
  marking: number;
}

export type WorkItemState = WorkflowInstanceState;

export interface WorkItem<P = unknown> {
  id: WorkItemId;
  taskName: TaskName;
  state: WorkItemState;
  payload: P;
}

export const validWorkItemStateTransitions: Record<
  WorkItemState,
  Set<WorkItemState>
> = {
  initialized: new Set(['started', 'canceled', 'completed']), // TODO: remove completed from here
  started: new Set(['completed', 'canceled', 'failed']),
  completed: new Set(),
  canceled: new Set(),
  failed: new Set(),
};

export const finalWorkItemInstanceStates = finalWorkflowInstanceStates;
export const activeWorkItemInstanceStates = activeWorkflowInstanceStates;

interface WorkflowState {
  workflow: WorkflowInstance;
  tasks: Record<TaskName, TaskInstance>;
  conditions: Record<ConditionName, ConditionInstance>;
  workItems: Record<WorkItemId, WorkItem>;
  tasksToWorkItems: Record<TaskName, Record<number, WorkItemId[]>>;
  tasksToWorkflows: Record<TaskName, Record<number, WorkflowId[]>>;
}
export type Store = Record<WorkflowId, WorkflowState>;
