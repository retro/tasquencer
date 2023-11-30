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
    conditions: Record<string, ConditionFlowBuilder<any>>;
    tasks: Record<
      string,
      TaskFlowBuilder<any, any> | OrXorTaskFlowBuilder<any, any>
    >;
  };
}

export interface DefaultTaskOrWorkItemActivityPayload<C> {
  getWorkflowContext(): Effect.Effect<never, WorkflowDoesNotExist, C>;
  updateWorkflowContext(
    context: C
  ): Effect.Effect<never, WorkflowDoesNotExist, void>;
}

export interface WorkflowOnStartPayload<C> {
  getWorkflowContext(): Effect.Effect<never, WorkflowDoesNotExist, C>;
  updateWorkflowContext(
    context: C
  ): Effect.Effect<never, WorkflowDoesNotExist, void>;
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
  getWorkflowContext(): Effect.Effect<never, WorkflowDoesNotExist, C>;
  updateWorkflowContext(
    context: C
  ): Effect.Effect<never, WorkflowDoesNotExist, void>;
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

export type TaskOnDisablePayload<C> =
  DefaultTaskOrWorkItemActivityPayload<C> & {
    disableTask: () => Effect.Effect<
      never,
      TaskDoesNotExist | TaskDoesNotExistInStore | InvalidTaskStateTransition,
      void
    >;
  };

export type TaskOnEnablePayload<C> = DefaultTaskOrWorkItemActivityPayload<C> & {
  enableTask: () => Effect.Effect<
    never,
    | TaskDoesNotExist
    | TaskDoesNotExistInStore
    | ConditionDoesNotExist
    | ConditionDoesNotExistInStore
    | InvalidTaskStateTransition,
    {
      enqueueFireTask: (input?: unknown) => Effect.Effect<never, never, void>;
    }
  >;
};

export type TaskOnFirePayload<
  C,
  P = unknown,
  SWI = unknown
> = DefaultTaskOrWorkItemActivityPayload<C> & {
  fireTask: () => Effect.Effect<
    never,
    | TaskDoesNotExist
    | TaskDoesNotExistInStore
    | ConditionDoesNotExist
    | ConditionDoesNotExistInStore
    | InvalidTaskStateTransition,
    {
      enqueueStartWorkItem(
        id: WorkItemId,
        ...input: undefined extends SWI ? [SWI?] : [SWI]
      ): Effect.Effect<never, never, void>;
      initializeWorkItem: (
        payload: P
      ) => Effect.Effect<
        never,
        TaskDoesNotExistInStore | InvalidTaskState,
        WorkItem<P>
      >;
    }
  >;
};

export type CompositeTaskOnFirePayload<
  C,
  P = unknown,
  SWI = unknown
> = DefaultTaskOrWorkItemActivityPayload<C> & {
  fireTask: () => Effect.Effect<
    never,
    | TaskDoesNotExist
    | TaskDoesNotExistInStore
    | ConditionDoesNotExist
    | ConditionDoesNotExistInStore
    | InvalidTaskStateTransition,
    {
      enqueueStartWorkflow(
        id: WorkflowId,
        ...input: undefined extends SWI ? [SWI?] : [SWI]
      ): Effect.Effect<never, never, void>;
      initializeWorkflow: (
        payload: P
      ) => Effect.Effect<never, TaskDoesNotExistInStore, WorkflowInstance<P>>;
    }
  >;
};

export type TaskOnExitPayload<C> = DefaultTaskOrWorkItemActivityPayload<C> & {
  exitTask: () => Effect.Effect<
    never,
    | ConditionDoesNotExist
    | ConditionDoesNotExistInStore
    | EndConditionDoesNotExist
    | InvalidTaskStateTransition
    | InvalidWorkflowStateTransition
    | TaskDoesNotExist
    | TaskDoesNotExistInStore
    | WorkflowDoesNotExist,
    void
  >;
};

export type TaskOnCancelPayload<C> = DefaultTaskOrWorkItemActivityPayload<C> & {
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

export interface TaskActivities<C> {
  onDisable: (
    payload: TaskOnDisablePayload<C>
  ) => Effect.Effect<unknown, unknown, unknown>;
  onEnable: (
    payload: TaskOnEnablePayload<C>
  ) => Effect.Effect<unknown, unknown, unknown>;
  onFire: (
    payload: TaskOnFirePayload<C, any>,

    input?: any
  ) => Effect.Effect<unknown, unknown, unknown>;
  onExit: (
    payload: TaskOnExitPayload<C>
  ) => Effect.Effect<unknown, unknown, unknown>;
  onCancel: (
    payload: TaskOnCancelPayload<C>
  ) => Effect.Effect<unknown, unknown, unknown>;
}
export type CompositeTaskActivities<C> = Omit<TaskActivities<C>, 'onFire'> & {
  onFire: (
    payload: CompositeTaskOnFirePayload<C, any>,

    input?: any
  ) => Effect.Effect<unknown, unknown, unknown>;
};

export type WorkItemOnStartPayload<
  C,
  P,
  OCOI = unknown,
  OCAI = unknown,
  OFI = unknown
> = DefaultTaskOrWorkItemActivityPayload<C> & {
  getWorkItem(): Effect.Effect<
    never,
    WorkItemDoesNotExist | TaskDoesNotExistInStore,
    WorkItem<P>
  >;
  updateWorkItem: (
    workItemPayload: P
  ) => Effect.Effect<never, WorkItemDoesNotExist, void>;
  startWorkItem: () => Effect.Effect<
    never,
    WorkItemDoesNotExist | InvalidWorkItemTransition,
    {
      enqueueCompleteWorkItem(
        ...input: undefined extends OCOI ? [OCOI?] : [OCOI]
      ): Effect.Effect<never, never, void>;
      enqueueCancelWorkItem(
        ...input: undefined extends OCAI ? [OCAI?] : [OCAI]
      ): Effect.Effect<never, never, void>;
      enqueueFailWorkItem(
        ...input: undefined extends OFI ? [OFI?] : [OFI]
      ): Effect.Effect<never, never, void>;
    }
  >;
};

export type WorkItemOnCompletePayload<C, P> =
  DefaultTaskOrWorkItemActivityPayload<C> & {
    getWorkItem(): Effect.Effect<
      never,
      WorkItemDoesNotExist | TaskDoesNotExistInStore,
      WorkItem<P>
    >;
    updateWorkItem: (
      workItemPayload: P
    ) => Effect.Effect<never, WorkItemDoesNotExist, void>;
    completeWorkItem: () => Effect.Effect<
      never,
      WorkItemDoesNotExist | InvalidWorkItemTransition,
      void
    >;
  };

export type WorkItemOnCancelPayload<C, P> =
  DefaultTaskOrWorkItemActivityPayload<C> & {
    getWorkItem(): Effect.Effect<
      never,
      WorkItemDoesNotExist | TaskDoesNotExistInStore,
      WorkItem<P>
    >;
    updateWorkItem: (
      workItemPayload: P
    ) => Effect.Effect<never, WorkItemDoesNotExist, void>;
    cancelWorkItem: () => Effect.Effect<
      never,
      WorkItemDoesNotExist | InvalidWorkItemTransition,
      void
    >;
  };

export type WorkItemOnFailPayload<C, P> =
  DefaultTaskOrWorkItemActivityPayload<C> & {
    getWorkItem(): Effect.Effect<
      never,
      WorkItemDoesNotExist | TaskDoesNotExistInStore,
      WorkItem<P>
    >;
    updateWorkItem: (
      workItemPayload: P
    ) => Effect.Effect<never, WorkItemDoesNotExist, void>;
    failWorkItem: () => Effect.Effect<
      never,
      WorkItemDoesNotExist | InvalidWorkItemTransition,
      void
    >;
  };
export interface WorkItemActivities<C, P> {
  onStart: (
    payload: WorkItemOnStartPayload<C, P, any, any, any>,
    input?: any
  ) => Effect.Effect<unknown, unknown, unknown>;
  onComplete: (
    payload: WorkItemOnCompletePayload<C, P>,
    input?: any
  ) => Effect.Effect<unknown, unknown, unknown>;
  onCancel: (
    payload: WorkItemOnCancelPayload<C, P>,
    input?: any
  ) => Effect.Effect<unknown, unknown, unknown>;
  onFail: (
    payload: WorkItemOnFailPayload<C, P>,
    input?: any
  ) => Effect.Effect<unknown, unknown, unknown>;
}

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
  workflowName: string;
  taskName: TaskName;
  taskGeneration: number;
} | null;

export interface WorkflowInstance<C = unknown> {
  parent: WorkflowInstanceParent;
  id: WorkflowId;
  name: string;
  state: WorkflowInstanceState;
  context: C;
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
  workflowName: string;
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
  workflowName: string;
  marking: number;
}

export type WorkItemState = WorkflowInstanceState;

export interface WorkItem<
  P = unknown,
  WN extends string = string,
  TN extends TaskName = TaskName
> {
  id: WorkItemId;
  taskName: TN;
  taskGeneration: number;
  workflowId: WorkflowId;
  workflowName: WN;
  state: WorkItemState;
  payload: P;
}

export const validWorkItemStateTransitions: Record<
  WorkItemState,
  Set<WorkItemState>
> = {
  initialized: new Set(['started', 'canceled']), // TODO: remove completed from here
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
export interface StorePersistableState {
  workflows: WorkflowInstance[];
  tasks: TaskInstance[];
  conditions: ConditionInstance[];
  workItems: WorkItem[];
}

export const WorkflowContextSym = Symbol('WorkflowContext');
export type WorkflowContextSym = typeof WorkflowContextSym;
export const WorkflowOnStartSym = Symbol('WorkflowOnStart');
export type WorkflowOnStartSym = typeof WorkflowOnStartSym;
export const WorkflowOnCancelSym = Symbol('WorkflowOnCancel');
export type WorkflowOnCancelSym = typeof WorkflowOnCancelSym;
export const TaskOnFireSym = Symbol('TaskOnFire');
export type TaskOnFireSym = typeof TaskOnFireSym;
export const WorkItemPayloadSym = Symbol('WorkItemPayload');
export type WorkItemPayloadSym = typeof WorkItemPayloadSym;

export type GetSym<T, U extends symbol> = [T] extends [
  Record<string | number | symbol, any>
]
  ? T[U]
  : never;

export type ExecutionContextQueueItem =
  | {
      type: 'fireTask';
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
export interface ExecutionContext {
  path: readonly string[];
  workflowId: WorkflowId;
  defaultActivityPayload: {
    getWorkflowContext: () => Effect.Effect<
      never,
      WorkflowDoesNotExist,
      unknown
    >;
    updateWorkflowContext: (
      context: unknown
    ) => Effect.Effect<never, WorkflowDoesNotExist, void>;
  };
  queue: {
    offer: (
      item: ExecutionContextQueueItem
    ) => Effect.Effect<never, never, void>;
  };
}

export const ExecutionContext = Context.Tag<ExecutionContext>();

export type ShouldTaskExitFn<C, WIP, R = unknown, E = unknown> = (payload: {
  getWorkflowContext: () => Effect.Effect<any, any, C>;
  workItems: WorkItem<WIP>[];
}) => Effect.Effect<R, E, boolean>;

export type ShouldCompositeTaskExitFn<
  C,
  WC,
  R = unknown,
  E = unknown
> = (payload: {
  getWorkflowContext: () => Effect.Effect<any, any, C>;
  workflows: WorkflowInstance<WC>[];
}) => Effect.Effect<R, E, boolean>;

export type StateChange =
  | { type: 'WORKFLOW_INITIALIZED'; workflow: WorkflowInstance }
  | { type: 'WORKFLOW_STATE_UPDATED'; workflow: WorkflowInstance }
  | { type: 'WORKFLOW_CONTEXT_UPDATED'; workflow: WorkflowInstance }
  | { type: 'CONDITION_MARKING_UPDATED'; condition: ConditionInstance }
  | { type: 'TASK_STATE_UPDATED'; task: TaskInstance }
  | { type: 'WORK_ITEM_INITIALIZED'; workItem: WorkItem }
  | { type: 'WORK_ITEM_STATE_UPDATED'; workItem: WorkItem }
  | { type: 'WORK_ITEM_PAYLOAD_UPDATED'; workItem: WorkItem };

export interface StateChangeItem {
  change: StateChange;
  getState: () => StorePersistableState;
}
export interface StateChangeLogger {
  log: (item: StateChangeItem) => void;
  drain: () => StateChangeItem[];
}

export type OnStateChangeFn = (
  changes: StateChangeItem[]
) => Effect.Effect<never, never, void>;
