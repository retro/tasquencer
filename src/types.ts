import { Brand, Context, Effect } from 'effect';

import { AnyCompositeTaskBuilder } from './builder/CompositeTaskBuilder.js';
import {
  ConditionFlowBuilder,
  OrXorTaskFlowBuilder,
  TaskFlowBuilder,
} from './builder/FlowBuilder.js';
import { AnyTaskBuilder } from './builder/TaskBuilder.js';
import { Workflow } from './elements/Workflow.js';
import {
  ConditionDoesNotExist,
  EndConditionDoesNotExist,
  InvalidTaskStateTransition,
  InvalidWorkflowStateTransition,
  StartConditionDoesNotExist,
  TaskDoesNotExist,
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
  getTaskState: () => Effect.Effect<never, TaskDoesNotExist, TaskInstanceState>;
}

export interface WorkflowOnStartPayload<C> {
  context: C;
  input: unknown;
  getWorkflowId: () => Effect.Effect<never, never, string>;
  startWorkflow(): Effect.Effect<
    IdGenerator,
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
    TaskDoesNotExist | ConditionDoesNotExist | InvalidTaskStateTransition,
    {
      createWorkItem: (
        payload: P
      ) => Effect.Effect<never, TaskDoesNotExist, WorkItem<P>>;
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
    TaskDoesNotExist | ConditionDoesNotExist | InvalidTaskStateTransition,
    {
      startSubWorkflow: (
        payload: P
      ) => Effect.Effect<never, TaskDoesNotExist, Workflow>;
    }
  >;
};

export type TaskOnExitPayload<C extends object = object> =
  DefaultTaskActivityPayload & {
    context: C;
    input: unknown;
    exitTask: () => Effect.Effect<
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
  workflow: () => Effect.Effect<never, never, WorkflowInstanceId>;
  workItem: () => Effect.Effect<never, never, WorkItemId>;
}
export const IdGenerator = Context.Tag<IdGenerator>();

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

export type WorkItemState =
  | 'initialized'
  | 'started'
  | 'completed'
  | 'canceled'
  | 'failed';

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

interface WorkflowState {
  workflow: WorkflowInstance;
  tasks: Record<TaskName, TaskInstance>;
  conditions: Record<ConditionName, ConditionInstance>;
  workItems: Record<WorkItemId, WorkItem>;
  tasksToWorkItems: Record<TaskName, Record<number, WorkItemId[]>>;
}
export type State = Record<WorkflowInstanceId, WorkflowState>;
