import { Brand, Context, Effect } from 'effect';

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
  InvalidTaskState,
  InvalidTaskStateTransition,
  InvalidWorkItemTransition,
  InvalidWorkflowStateTransition,
  ParentWorkflowDoesNotExist,
  StartConditionDoesNotExist,
  TaskDoesNotExist,
  TaskDoesNotExistInStore,
  WorkItemDoesNotExist,
  WorkflowDoesNotExist,
} from './errors.js';

export type UnknownEffect = Effect.Effect<unknown, unknown, unknown>;

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
  predicate?: (...args: any[]) => Effect.Effect<boolean, any, any>;
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
    conditions: Record<string, ConditionFlowBuilder<any>>;
    tasks: Record<
      string,
      TaskFlowBuilder<any, any> | OrXorTaskFlowBuilder<any, any>
    >;
  };
}

type UpdateWorkflowContext<TContext> = (
  contextOrUpdater: TContext | ((context: TContext) => TContext)
) => Effect.Effect<void, WorkflowDoesNotExist>;

export interface DefaultTaskOrWorkItemActivityPayload<TContext> {
  getWorkflowContext(): Effect.Effect<TContext, WorkflowDoesNotExist>;
  updateWorkflowContext: UpdateWorkflowContext<TContext>;
}

export type TaskOnDisablePayload<TContext> =
  DefaultTaskOrWorkItemActivityPayload<TContext> & {
    disableTask: () => Effect.Effect<
      void,
      TaskDoesNotExist | TaskDoesNotExistInStore | InvalidTaskStateTransition
    >;
  };

export type TaskOnEnablePayload<TContext> =
  DefaultTaskOrWorkItemActivityPayload<TContext> & {
    enableTask: () => Effect.Effect<
      {
        enqueueStartTask: (input?: unknown) => Effect.Effect<void>;
      },
      | TaskDoesNotExist
      | TaskDoesNotExistInStore
      | ConditionDoesNotExist
      | ConditionDoesNotExistInStore
      | InvalidTaskStateTransition
    >;
  };

export type TaskOnStartPayload<
  TContext,
  TPayload = unknown,
  TStartWorkItemInput = unknown
> = DefaultTaskOrWorkItemActivityPayload<TContext> & {
  startTask: () => Effect.Effect<
    {
      enqueueStartWorkItem(
        id: WorkItemId,
        ...input: undefined extends TStartWorkItemInput
          ? [TStartWorkItemInput?]
          : [TStartWorkItemInput]
      ): Effect.Effect<void>;
      initializeWorkItem: (
        ...payload: undefined extends TPayload ? [TPayload?] : [TPayload]
      ) => Effect.Effect<
        WorkItemInstance<TPayload>,
        TaskDoesNotExistInStore | InvalidTaskState
      >;
    },
    | TaskDoesNotExist
    | TaskDoesNotExistInStore
    | ConditionDoesNotExist
    | ConditionDoesNotExistInStore
    | InvalidTaskStateTransition
  >;
};

export type CompositeTaskOnStartPayload<
  TContext,
  TPayload = unknown,
  TStartWorkItemInput = unknown
> = DefaultTaskOrWorkItemActivityPayload<TContext> & {
  startTask: () => Effect.Effect<
    {
      enqueueStartWorkflow(
        id: WorkflowId,
        ...input: undefined extends TStartWorkItemInput
          ? [TStartWorkItemInput?]
          : [TStartWorkItemInput]
      ): Effect.Effect<void>;
      initializeWorkflow: (
        ...context: undefined extends TPayload ? [TPayload?] : [TPayload]
      ) => Effect.Effect<WorkflowInstance<TPayload>, TaskDoesNotExistInStore>;
    },
    | TaskDoesNotExist
    | TaskDoesNotExistInStore
    | ConditionDoesNotExist
    | ConditionDoesNotExistInStore
    | InvalidTaskStateTransition
  >;
};

export type TaskOnCompletePayload<TContext> =
  DefaultTaskOrWorkItemActivityPayload<TContext> & {
    completeTask: () => Effect.Effect<
      void,
      | TaskDoesNotExist
      | TaskDoesNotExistInStore
      | ConditionDoesNotExist
      | ConditionDoesNotExistInStore
      | InvalidTaskState
      | WorkflowDoesNotExist
      | WorkItemDoesNotExist
      | EndConditionDoesNotExist
      | InvalidTaskStateTransition
      | InvalidWorkflowStateTransition
      | InvalidWorkItemTransition
    >;
  };

export type TaskOnCancelPayload<TContext> =
  DefaultTaskOrWorkItemActivityPayload<TContext> & {
    cancelTask: () => Effect.Effect<
      void,
      | ConditionDoesNotExist
      | ConditionDoesNotExistInStore
      | EndConditionDoesNotExist
      | InvalidTaskState
      | InvalidTaskStateTransition
      | InvalidWorkflowStateTransition
      | InvalidWorkItemTransition
      | TaskDoesNotExist
      | TaskDoesNotExistInStore
      | WorkflowDoesNotExist
      | WorkItemDoesNotExist
    >;
  };

export type TaskOnFailPayload<TContext> =
  DefaultTaskOrWorkItemActivityPayload<TContext> & {
    failTask: () => Effect.Effect<
      void,
      | ConditionDoesNotExist
      | ConditionDoesNotExistInStore
      | EndConditionDoesNotExist
      | InvalidTaskState
      | InvalidTaskStateTransition
      | InvalidWorkflowStateTransition
      | InvalidWorkItemTransition
      | TaskDoesNotExist
      | TaskDoesNotExistInStore
      | WorkflowDoesNotExist
      | WorkItemDoesNotExist
    >;
  };

export interface TaskActivities<TContext> {
  onDisable: (payload: TaskOnDisablePayload<TContext>) => UnknownEffect;
  onEnable: (payload: TaskOnEnablePayload<TContext>) => UnknownEffect;
  onStart: (
    payload: TaskOnStartPayload<TContext, any>,
    input?: any
  ) => UnknownEffect;
  onComplete: (payload: TaskOnCompletePayload<TContext>) => UnknownEffect;
  onCancel: (payload: TaskOnCancelPayload<TContext>) => UnknownEffect;
  onFail: (payload: TaskOnFailPayload<TContext>) => UnknownEffect;
}
export type CompositeTaskActivities<TContext> = Omit<
  TaskActivities<TContext>,
  'onStart'
> & {
  onStart: (
    payload: CompositeTaskOnStartPayload<TContext, any>,
    input?: any
  ) => UnknownEffect;
};

export type WorkItemOnStartPayload<
  TContext,
  TPayload,
  TOnCompleteInput = unknown,
  TOnCancelInput = unknown,
  TOnFailInput = unknown
> = DefaultTaskOrWorkItemActivityPayload<TContext> & {
  getWorkItem(): Effect.Effect<
    WorkItemInstance<TPayload>,
    WorkItemDoesNotExist | TaskDoesNotExistInStore
  >;
  updateWorkItemPayload: (
    workItemPayload: TPayload
  ) => Effect.Effect<void, WorkItemDoesNotExist>;
  startWorkItem: () => Effect.Effect<
    {
      enqueueCompleteWorkItem(
        ...input: undefined extends TOnCompleteInput
          ? [TOnCompleteInput?]
          : [TOnCompleteInput]
      ): Effect.Effect<void>;
      enqueueCancelWorkItem(
        ...input: undefined extends TOnCancelInput
          ? [TOnCancelInput?]
          : [TOnCancelInput]
      ): Effect.Effect<void>;
      enqueueFailWorkItem(
        ...input: undefined extends TOnFailInput
          ? [TOnFailInput?]
          : [TOnFailInput]
      ): Effect.Effect<void>;
    },
    WorkItemDoesNotExist | InvalidWorkItemTransition
  >;
};

export type WorkItemOnCompletePayload<TContext, TPayload> =
  DefaultTaskOrWorkItemActivityPayload<TContext> & {
    getWorkItem(): Effect.Effect<
      WorkItemInstance<TPayload>,
      WorkItemDoesNotExist | TaskDoesNotExistInStore
    >;
    updateWorkItemPayload: (
      workItemPayload: TPayload
    ) => Effect.Effect<void, WorkItemDoesNotExist>;
    completeWorkItem: () => Effect.Effect<
      void,
      WorkItemDoesNotExist | InvalidWorkItemTransition
    >;
  };

export type WorkItemOnCancelPayload<TContext, TPayload> =
  DefaultTaskOrWorkItemActivityPayload<TContext> & {
    getWorkItem(): Effect.Effect<
      WorkItemInstance<TPayload>,
      WorkItemDoesNotExist | TaskDoesNotExistInStore
    >;
    updateWorkItemPayload: (
      workItemPayload: TPayload
    ) => Effect.Effect<void, WorkItemDoesNotExist>;
    cancelWorkItem: () => Effect.Effect<
      void,
      WorkItemDoesNotExist | InvalidWorkItemTransition
    >;
  };

export type WorkItemOnFailPayload<TContext, TPayload> =
  DefaultTaskOrWorkItemActivityPayload<TContext> & {
    getWorkItem(): Effect.Effect<
      WorkItemInstance<TPayload>,
      WorkItemDoesNotExist | TaskDoesNotExistInStore
    >;
    updateWorkItemPayload: (
      workItemPayload: TPayload
    ) => Effect.Effect<void, WorkItemDoesNotExist>;
    failWorkItem: () => Effect.Effect<
      void,
      WorkItemDoesNotExist | InvalidWorkItemTransition
    >;
  };
export interface WorkItemActivities<TContext, TPayload> {
  onStart: (
    payload: WorkItemOnStartPayload<TContext, TPayload, any, any, any>,
    input?: any
  ) => UnknownEffect;
  onComplete: (
    payload: WorkItemOnCompletePayload<TContext, TPayload>,
    input?: any
  ) => UnknownEffect;
  onCancel: (
    payload: WorkItemOnCancelPayload<TContext, TPayload>,
    input?: any
  ) => UnknownEffect;
  onFail: (
    payload: WorkItemOnFailPayload<TContext, TPayload>,
    input?: any
  ) => UnknownEffect;
}

export class IdGenerator extends Context.Tag('tasquencer/IdGenerator')<
  IdGenerator,
  {
    workflow: () => Effect.Effect<WorkflowId, never>;
    workItem: () => Effect.Effect<WorkItemId, never>;
  }
>() {}

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
  workflowName: string;
  taskName: TaskName;
  taskGeneration: number;
} | null;

export interface WorkflowInstance<
  TContext = unknown,
  TName extends string = string
> {
  parent: WorkflowInstanceParent;
  id: WorkflowId;
  name: TName;
  state: WorkflowInstanceState;
  context: TContext;
}

export const validWorkflowInstanceTransitions: Record<
  WorkflowInstanceState,
  Set<WorkflowInstanceState>
> = {
  initialized: new Set(['started', 'canceled']),
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
  | 'started'
  | 'completed'
  | 'canceled'
  | 'failed';

export interface TaskInstance {
  name: TaskName;
  workflowName: string;
  workflowId: WorkflowId;
  generation: number;
  state: TaskInstanceState;
}

export const validTaskInstanceTransitions: Record<
  TaskInstanceState,
  Set<TaskInstanceState>
> = {
  disabled: new Set(['enabled']),
  enabled: new Set(['disabled', 'started']),
  started: new Set(['completed', 'canceled', 'failed']),
  completed: new Set(['enabled']),
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
  workflowName: string;
  marking: number;
}

export type WorkItemInstanceState = WorkflowInstanceState;

export interface WorkItemInstance<
  TPayload = unknown,
  TWorkflowName extends string = string,
  TTaskName extends string = string
> {
  id: WorkItemId;
  taskName: TTaskName;
  taskGeneration: number;
  workflowId: WorkflowId;
  workflowName: TWorkflowName;
  state: WorkItemInstanceState;
  payload: TPayload;
}

export const validWorkItemInstanceStateTransitions: Record<
  WorkItemInstanceState,
  Set<WorkItemInstanceState>
> = {
  initialized: new Set(['started', 'canceled']),
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
  workItems: Record<WorkItemId, WorkItemInstance>;
  tasksToWorkItems: Record<TaskName, Record<number, WorkItemId[]>>;
  tasksToWorkflows: Record<TaskName, Record<number, WorkflowId[]>>;
}
export type Store = Record<WorkflowId, WorkflowState>;
export interface StorePersistableState<
  TWorkflowInstance extends WorkflowInstance = WorkflowInstance,
  TWorkItemInstance extends WorkItemInstance = WorkItemInstance,
  TTaskInstance extends TaskInstance = TaskInstance
> {
  workflows: TWorkflowInstance[];
  tasks: TTaskInstance[];
  conditions: ConditionInstance[];
  workItems: TWorkItemInstance[];
}

export const WorkflowContextSym = Symbol('WorkflowContext');
export type WorkflowContextSym = typeof WorkflowContextSym;
export const WorkflowOnStartSym = Symbol('WorkflowOnStart');
export type WorkflowOnStartSym = typeof WorkflowOnStartSym;
export const WorkflowOnCancelSym = Symbol('WorkflowOnCancel');
export type WorkflowOnCancelSym = typeof WorkflowOnCancelSym;
export const TaskOnStartSym = Symbol('TaskOnStart');
export type TaskOnStartSym = typeof TaskOnStartSym;
export const WorkItemPayloadSym = Symbol('WorkItemPayload');
export type WorkItemPayloadSym = typeof WorkItemPayloadSym;

export type GetSym<T, U extends symbol> = [T] extends [
  Record<string | number | symbol, any>
]
  ? T[U]
  : never;

export type ExecutionContextQueueItem =
  | {
      type: 'startTask';
      path: readonly string[];
      input: unknown;
    }
  | { type: 'startWorkflow'; path: readonly string[]; input: unknown }
  | {
      type: 'startWorkItem';
      path: readonly string[];
      input: unknown;
    }
  | { type: 'completeWorkItem'; path: readonly string[]; input: unknown }
  | { type: 'cancelWorkItem'; path: readonly string[]; input: unknown }
  | { type: 'failWorkItem'; path: readonly string[]; input: unknown };

export class ExecutionContext extends Context.Tag(
  'tasquencer/ExecutionContext'
)<
  ExecutionContext,
  {
    path: readonly string[];
    workflowId: WorkflowId;
    emitStateChanges: () => Effect.Effect<void>;
    defaultActivityPayload: {
      getWorkflowContext: () => Effect.Effect<unknown, WorkflowDoesNotExist>;
      updateWorkflowContext: UpdateWorkflowContext<unknown>;
    };
    queue: {
      offer: (item: ExecutionContextQueueItem) => Effect.Effect<void>;
    };
  }
>() {}

export type ShouldTaskCompleteFn<
  TContext,
  TWorkItemPayload,
  R = unknown,
  E = unknown
> = (payload: {
  getWorkflowContext: () => Effect.Effect<any, any, TContext>;
  workItems: WorkItemInstance<TWorkItemPayload>[];
}) => Effect.Effect<boolean, R, E>;

export type ShouldTaskFailFn<
  TContext,
  TWorkItemPayload,
  R = unknown,
  E = unknown
> = ShouldTaskCompleteFn<TContext, TWorkItemPayload, R, E>;

export type ShouldCompositeTaskCompleteFn<
  TContext,
  TChildWorkflowContext,
  R = unknown,
  E = unknown
> = (payload: {
  getWorkflowContext: () => Effect.Effect<TContext, any, any>;
  workflows: WorkflowInstance<TChildWorkflowContext>[];
}) => Effect.Effect<boolean, E, R>;

export type ShouldCompositeTaskFailFn<
  TContext,
  TChildWorkflowContext,
  R = unknown,
  E = unknown
> = ShouldCompositeTaskCompleteFn<TContext, TChildWorkflowContext, R, E>;

export type StateChange<
  TWorkflowInstance extends WorkflowInstance = WorkflowInstance,
  TWorkItemInstance extends WorkItemInstance = WorkItemInstance,
  TTaskInstance extends TaskInstance = TaskInstance
> =
  | { type: 'WORKFLOW_INITIALIZED'; workflow: TWorkflowInstance }
  | { type: 'WORKFLOW_STATE_UPDATED'; workflow: TWorkflowInstance }
  | { type: 'WORKFLOW_CONTEXT_UPDATED'; workflow: TWorkflowInstance }
  | { type: 'TASK_INITIALIZED'; task: TTaskInstance }
  | { type: 'TASK_STATE_UPDATED'; task: TTaskInstance }
  | { type: 'CONDITION_MARKING_UPDATED'; condition: ConditionInstance }
  | { type: 'CONDITION_INITIALIZED'; condition: ConditionInstance }
  | { type: 'WORK_ITEM_INITIALIZED'; workItem: TWorkItemInstance }
  | { type: 'WORK_ITEM_STATE_UPDATED'; workItem: TWorkItemInstance }
  | { type: 'WORK_ITEM_PAYLOAD_UPDATED'; workItem: TWorkItemInstance };

export interface StateChangeItem<
  TWorkflowInstance extends WorkflowInstance = WorkflowInstance,
  TWorkItemInstance extends WorkItemInstance = WorkItemInstance,
  TTask extends TaskInstance = TaskInstance
> {
  change: StateChange<TWorkflowInstance, TWorkItemInstance, TTask>;
  getState: () => StorePersistableState<
    TWorkflowInstance,
    TWorkItemInstance,
    TTask
  >;
}
export interface StateChangeLogger {
  log: (item: StateChangeItem) => void;
  drain: () => StateChangeItem[];
}

export type OnStateChangeFn<
  TWorkflowInstance extends WorkflowInstance = WorkflowInstance,
  TWorkItemInstance extends WorkItemInstance = WorkItemInstance,
  TTaskInstance extends TaskInstance = TaskInstance
> = (
  changes: StateChangeItem<
    TWorkflowInstance,
    TWorkItemInstance,
    TTaskInstance
  >[]
) => Effect.Effect<void>;

export interface ElementTypes {
  workflow: WorkflowInstance;
  workItem: WorkItemInstance;
  task: TaskInstance;
  condition: ConditionInstance;
}

export interface DefaultWorkflowActivityPayload<
  TContext,
  TParentWorkflowContext
> {
  getParentWorkflowContext: TParentWorkflowContext extends never
    ? never
    : () => Effect.Effect<
        TParentWorkflowContext,
        ParentWorkflowDoesNotExist | WorkflowDoesNotExist
      >;
  updateParentWorkflowContext: TParentWorkflowContext extends never
    ? never
    : (
        context:
          | TParentWorkflowContext
          | ((context: TParentWorkflowContext) => TParentWorkflowContext)
      ) => Effect.Effect<
        void,
        ParentWorkflowDoesNotExist | WorkflowDoesNotExist
      >;
  getWorkflowContext(): Effect.Effect<TContext, WorkflowDoesNotExist>;
  updateWorkflowContext: UpdateWorkflowContext<TContext>;
}

export type WorkflowOnStartPayload<TContext, TParentWorkflowContext> =
  DefaultWorkflowActivityPayload<TContext, TParentWorkflowContext> & {
    startWorkflow(): Effect.Effect<
      void,
      | ConditionDoesNotExist
      | WorkflowDoesNotExist
      | StartConditionDoesNotExist
      | InvalidWorkflowStateTransition
      | ConditionDoesNotExistInStore
      | TaskDoesNotExist
      | TaskDoesNotExistInStore
      | InvalidTaskStateTransition
    >;
  };

export type WorkflowOnCompletePayload<TContext, TParentWorkflowContext> =
  DefaultWorkflowActivityPayload<TContext, TParentWorkflowContext> & {
    completeWorkflow: () => Effect.Effect<
      void,
      | ConditionDoesNotExist
      | WorkflowDoesNotExist
      | InvalidWorkflowStateTransition
      | ConditionDoesNotExistInStore
      | TaskDoesNotExist
      | TaskDoesNotExistInStore
      | InvalidTaskStateTransition
      | InvalidTaskState
      | EndConditionDoesNotExist
      | WorkItemDoesNotExist
      | InvalidWorkItemTransition
    >;
  };

export type WorkflowOnCancelPayload<TContext, TParentWorkflowContext> =
  DefaultWorkflowActivityPayload<TContext, TParentWorkflowContext> & {
    cancelWorkflow: () => Effect.Effect<
      void,
      | ConditionDoesNotExist
      | ConditionDoesNotExistInStore
      | EndConditionDoesNotExist
      | InvalidTaskState
      | InvalidTaskStateTransition
      | InvalidWorkflowStateTransition
      | InvalidWorkItemTransition
      | TaskDoesNotExist
      | TaskDoesNotExistInStore
      | WorkflowDoesNotExist
      | WorkItemDoesNotExist
    >;
  };

export type WorkflowOnFailPayload<TContext, TParentWorkflowContext> =
  DefaultWorkflowActivityPayload<TContext, TParentWorkflowContext> & {
    failWorkflow: () => Effect.Effect<
      void,
      | TaskDoesNotExist
      | TaskDoesNotExistInStore
      | ConditionDoesNotExist
      | ConditionDoesNotExistInStore
      | InvalidTaskState
      | WorkflowDoesNotExist
      | WorkItemDoesNotExist
      | EndConditionDoesNotExist
      | InvalidTaskStateTransition
      | InvalidWorkflowStateTransition
      | InvalidWorkItemTransition
    >;
  };
export interface WorkflowActivities<
  TContext = unknown,
  TParentWorkflowContext = never
> {
  onStart: (
    payload: WorkflowOnStartPayload<TContext, TParentWorkflowContext>,
    input?: any
  ) => UnknownEffect;
  onComplete: (
    payload: WorkflowOnCompletePayload<TContext, TParentWorkflowContext>,
    input?: any
  ) => UnknownEffect;
  onCancel: (
    payload: WorkflowOnCancelPayload<TContext, TParentWorkflowContext>,
    input?: any
  ) => UnknownEffect;
  onFail: (
    payload: WorkflowOnFailPayload<TContext, TParentWorkflowContext>,
    input?: any
  ) => UnknownEffect;
}
