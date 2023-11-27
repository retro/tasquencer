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
  P = unknown
> = DefaultTaskOrWorkItemActivityPayload<C> & {
  fireTask: () => Effect.Effect<
    never,
    | TaskDoesNotExist
    | TaskDoesNotExistInStore
    | ConditionDoesNotExist
    | ConditionDoesNotExistInStore
    | InvalidTaskStateTransition,
    {
      initializeWorkItem: (
        payload: P
      ) => Effect.Effect<
        State,
        TaskDoesNotExistInStore | InvalidTaskState,
        WorkItem<P>
      >;
    }
  >;
};

export type CompositeTaskOnFirePayload<
  C,
  P = unknown
> = DefaultTaskOrWorkItemActivityPayload<C> & {
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
      ) => Effect.Effect<State, TaskDoesNotExist, WorkflowInstance<P>>;
    }
  >;
};

export type TaskOnExitPayload<C> = DefaultTaskOrWorkItemActivityPayload<C> & {
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    payload: TaskOnFirePayload<C, any>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    payload: CompositeTaskOnFirePayload<C, any>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    input?: any
  ) => Effect.Effect<unknown, unknown, unknown>;
};

export type WorkItemOnStartPayload<C, P> =
  DefaultTaskOrWorkItemActivityPayload<C> & {
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
        enqueueCompleteWorkItem(): Effect.Effect<never, never, void>;
        enqueueFailWorkItem(): Effect.Effect<never, never, void>;
        enqueueCancelWorkItem(): Effect.Effect<never, never, void>;
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
    payload: WorkItemOnStartPayload<C, P>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    input?: any
  ) => Effect.Effect<unknown, unknown, unknown>;
  onComplete: (
    payload: WorkItemOnCompletePayload<C, P>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    input?: any
  ) => Effect.Effect<unknown, unknown, unknown>;
  onCancel: (
    payload: WorkItemOnCancelPayload<C, P>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    input?: any
  ) => Effect.Effect<unknown, unknown, unknown>;
  onFail: (
    payload: WorkItemOnFailPayload<C, P>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  taskName: TaskName;
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

export const WorkflowContextSym = Symbol('WorkflowContext');
export type WorkflowContextSym = typeof WorkflowContextSym;
export const WorkflowOnStartSym = Symbol('WorkflowOnStart');
export type WorkflowOnStartSym = typeof WorkflowOnStartSym;
export const WorkflowOnCancelSym = Symbol('WorkflowOnCancel');
export type WorkflowOnCancelSym = typeof WorkflowOnCancelSym;
export const TaskOnFireSym = Symbol('TaskOnFire');
export type TaskOnFireSym = typeof TaskOnFireSym;

/*type T = {
  [WorkflowContextSym]: string;
  [WorkflowOnStartSym]: {
    context: string;
    input: number;
  };
  t1: {
    [TaskOnFireSym]: {
      context: string;
      input: number;
    };
    [k: string]: {
      onInitialize: {
        input: number;
        context: string;
        payload: boolean;
      };
    };
  };
  ct1: {
    [TaskOnFireSym]: {
      context: string;
      input: number;
    };
    [k: string]: {
      [WorkflowContextSym]: string;
      [WorkflowOnStartSym]: {
        context: string;
        input: number;
      };
      t1: {
        [TaskOnFireSym]: {
          context: string;
          input: number;
        };
        [k: string]: {
          onInitialize: {
            input: number;
            context: string;
            payload: boolean;
          };
        };
      };
      ct1: {
        [TaskOnFireSym]: {
          context: string;
          input: number;
        };
      };
    };
  };
};

*/
