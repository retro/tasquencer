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

export type UpdateWorkflowContext<TContext> = (
  contextOrUpdater: TContext | ((context: TContext) => TContext)
) => Effect.Effect<void, WorkflowDoesNotExist>;

export interface DefaultTaskActivityPayload<TContext> {
  getWorkflowContext: () => Effect.Effect<TContext, WorkflowDoesNotExist>;
  updateWorkflowContext: UpdateWorkflowContext<TContext>;
}

export type TaskOnDisablePayload<TContext> =
  DefaultTaskActivityPayload<TContext> & {
    disableTask: () => Effect.Effect<
      void,
      TaskDoesNotExist | TaskDoesNotExistInStore | InvalidTaskStateTransition
    >;
  };

export type TaskOnEnablePayload<TContext> =
  DefaultTaskActivityPayload<TContext> & {
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
  TPayload,
  TWorkItemOnStartInput = unknown
> = DefaultTaskActivityPayload<TContext> & {
  startTask: () => Effect.Effect<
    {
      enqueueStartWorkItem: (
        id: WorkItemId,
        ...input: undefined extends TWorkItemOnStartInput
          ? [TWorkItemOnStartInput?]
          : [TWorkItemOnStartInput]
      ) => Effect.Effect<void>;
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
  TChildWorkflowContext,
  TWorkflowOnStartInput = unknown
> = DefaultTaskActivityPayload<TContext> & {
  startTask: () => Effect.Effect<
    {
      enqueueStartWorkflow: (
        id: WorkflowId,
        ...input: undefined extends TWorkflowOnStartInput
          ? [TWorkflowOnStartInput?]
          : [TWorkflowOnStartInput]
      ) => Effect.Effect<void>;
      initializeWorkflow: (
        ...context: undefined extends TChildWorkflowContext
          ? [TChildWorkflowContext?]
          : [TChildWorkflowContext]
      ) => Effect.Effect<
        WorkflowInstance<TChildWorkflowContext>,
        TaskDoesNotExistInStore
      >;
    },
    | TaskDoesNotExist
    | TaskDoesNotExistInStore
    | ConditionDoesNotExist
    | ConditionDoesNotExistInStore
    | InvalidTaskStateTransition
  >;
};

export type TaskOnCompletePayload<TContext, TPayload> =
  DefaultTaskActivityPayload<TContext> & {
    getWorkItems: () => Effect.Effect<
      WorkItemInstance<TPayload>[],
      TaskDoesNotExistInStore
    >;
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

export type CompositeTaskOnCompletePayload<TContext, TChildWorkflowContext> =
  DefaultTaskActivityPayload<TContext> & {
    getWorkflows: () => Effect.Effect<
      WorkflowInstance<TChildWorkflowContext>[],
      TaskDoesNotExistInStore
    >;
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

export type TaskOnCancelPayload<TContext, TPayload> =
  DefaultTaskActivityPayload<TContext> & {
    getWorkItems: () => Effect.Effect<
      WorkItemInstance<TPayload>[],
      TaskDoesNotExistInStore
    >;
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

export type CompositeTaskOnCancelPayload<TContext, TChildWorkflowContext> =
  DefaultTaskActivityPayload<TContext> & {
    getWorkflows: () => Effect.Effect<
      WorkflowInstance<TChildWorkflowContext>[],
      TaskDoesNotExistInStore
    >;
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

export type TaskOnFailPayload<TContext, TPayload> =
  DefaultTaskActivityPayload<TContext> & {
    getWorkItems: () => Effect.Effect<
      WorkItemInstance<TPayload>[],
      TaskDoesNotExistInStore
    >;
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

export type CompositeTaskOnFailPayload<TContext, TChildWorkflowContext> =
  DefaultTaskActivityPayload<TContext> & {
    getWorkflows: () => Effect.Effect<
      WorkflowInstance<TChildWorkflowContext>[],
      TaskDoesNotExistInStore
    >;
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

export interface TaskActivities<TContext, TPayload> {
  onDisable: (payload: TaskOnDisablePayload<TContext>) => UnknownEffect;
  onEnable: (payload: TaskOnEnablePayload<TContext>) => UnknownEffect;
  onStart: (
    payload: TaskOnStartPayload<TContext, TPayload>,
    input?: any
  ) => UnknownEffect;
  onComplete: (
    payload: TaskOnCompletePayload<TContext, TPayload>
  ) => UnknownEffect;
  onCancel: (payload: TaskOnCancelPayload<TContext, TPayload>) => UnknownEffect;
  onFail: (payload: TaskOnFailPayload<TContext, TPayload>) => UnknownEffect;
}

export type CompositeTaskActivities<TContext, TChildWorkflowContext> = {
  onDisable: (payload: TaskOnDisablePayload<TContext>) => UnknownEffect;
  onEnable: (payload: TaskOnEnablePayload<TContext>) => UnknownEffect;
  onStart: (
    payload: CompositeTaskOnStartPayload<TContext, TChildWorkflowContext>,
    input?: any
  ) => UnknownEffect;
  onComplete: (
    payload: CompositeTaskOnCompletePayload<TContext, TChildWorkflowContext>
  ) => UnknownEffect;
  onCancel: (
    payload: CompositeTaskOnCancelPayload<TContext, TChildWorkflowContext>
  ) => UnknownEffect;
  onFail: (
    payload: CompositeTaskOnFailPayload<TContext, TChildWorkflowContext>
  ) => UnknownEffect;
};

export type WorkItemOnStartPayload<
  TPayload,
  TOnCompleteInput = unknown,
  TOnCancelInput = unknown,
  TOnFailInput = unknown
> = {
  getWorkItem: () => Effect.Effect<
    WorkItemInstance<TPayload>,
    WorkItemDoesNotExist | TaskDoesNotExistInStore
  >;
  updateWorkItemPayload: (
    workItemPayload: TPayload
  ) => Effect.Effect<void, WorkItemDoesNotExist>;
  startWorkItem: () => Effect.Effect<
    {
      enqueueCompleteWorkItem: (
        ...input: undefined extends TOnCompleteInput
          ? [TOnCompleteInput?]
          : [TOnCompleteInput]
      ) => Effect.Effect<void>;
      enqueueCancelWorkItem: (
        ...input: undefined extends TOnCancelInput
          ? [TOnCancelInput?]
          : [TOnCancelInput]
      ) => Effect.Effect<void>;
      enqueueFailWorkItem: (
        ...input: undefined extends TOnFailInput
          ? [TOnFailInput?]
          : [TOnFailInput]
      ) => Effect.Effect<void>;
    },
    WorkItemDoesNotExist | InvalidWorkItemTransition
  >;
};

export type WorkItemOnCompletePayload<TPayload> = {
  getWorkItem: () => Effect.Effect<
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

export type WorkItemOnCancelPayload<TPayload> = {
  getWorkItem: () => Effect.Effect<
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

export type WorkItemOnFailPayload<TPayload> = {
  getWorkItem: () => Effect.Effect<
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
export interface WorkItemActivities<TPayload> {
  onStart: (
    payload: WorkItemOnStartPayload<TPayload, any, any, any>,
    input?: any
  ) => UnknownEffect;
  onComplete: (
    payload: WorkItemOnCompletePayload<TPayload>,
    input?: any
  ) => UnknownEffect;
  onCancel: (
    payload: WorkItemOnCancelPayload<TPayload>,
    input?: any
  ) => UnknownEffect;
  onFail: (
    payload: WorkItemOnFailPayload<TPayload>,
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
  getWorkflowContext: () => Effect.Effect<TContext, any, any>;
  getWorkItems: () => Effect.Effect<
    WorkItemInstance<TWorkItemPayload>[],
    TaskDoesNotExistInStore
  >;
}) => Effect.Effect<boolean, E, R>;

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
  getWorkflows: () => Effect.Effect<
    WorkflowInstance<TChildWorkflowContext>[],
    TaskDoesNotExistInStore
  >;
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

export interface DefaultWorkflowActivityPayload<TContext> {
  getWorkflowContext: () => Effect.Effect<TContext, WorkflowDoesNotExist>;
  updateWorkflowContext: UpdateWorkflowContext<TContext>;
}

export type WorkflowOnStartPayload<TContext> =
  DefaultWorkflowActivityPayload<TContext> & {
    startWorkflow: () => Effect.Effect<
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

export type WorkflowOnCompletePayload<TContext> =
  DefaultWorkflowActivityPayload<TContext> & {
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

export type WorkflowOnCancelPayload<TContext> =
  DefaultWorkflowActivityPayload<TContext> & {
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

export type WorkflowOnFailPayload<TContext> =
  DefaultWorkflowActivityPayload<TContext> & {
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
export interface WorkflowActivities<TContext = unknown> {
  onStart: (
    payload: WorkflowOnStartPayload<TContext>,
    input?: any
  ) => UnknownEffect;
  onComplete: (
    payload: WorkflowOnCompletePayload<TContext>,
    input?: any
  ) => UnknownEffect;
  onCancel: (
    payload: WorkflowOnCancelPayload<TContext>,
    input?: any
  ) => UnknownEffect;
  onFail: (
    payload: WorkflowOnFailPayload<TContext>,
    input?: any
  ) => UnknownEffect;
}
