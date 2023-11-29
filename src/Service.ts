import { Effect, Match, Option, Queue, pipe } from 'effect';
import { Get } from 'type-fest';

import { State } from './State.js';
import { BaseTask } from './elements/BaseTask.js';
import { CompositeTask } from './elements/CompositeTask.js';
import { Task } from './elements/Task.js';
import { Workflow, WorkflowMetadata } from './elements/Workflow.js';
import {
  ConditionDoesNotExist,
  ConditionDoesNotExistInStore,
  EndConditionDoesNotExist,
  InvalidPath,
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
import * as StateImpl from './state/StateImpl.js';
import {
  ExecutionContext,
  ExecutionContextQueueItem,
  GetSym,
  IdGenerator,
  TaskName,
  TaskOnFireSym,
  WorkItem,
  WorkItemId,
  WorkItemPayloadSym,
  WorkflowContextSym,
  WorkflowId,
  WorkflowInstance,
} from './types.js';
import { nanoidIdGenerator } from './util.js';

function pathAsArray(path: string | string[] | readonly string[]) {
  return typeof path === 'string' ? path.split('.') : path;
}

// TODO: Think about refactoring this class so everything is in the Workflow class instead
export class Service<WorkflowMetadata, R = never, E = never> {
  constructor(
    private workflowId: WorkflowId,
    private workflow: Workflow,
    private state: State,
    private queue: Queue.Queue<ExecutionContextQueueItem>
  ) {}
  // TODO: Check if workflow was already started

  start(input?: unknown) {
    return this.startWorkflow([], input);
  }

  cancel() {
    return this.cancelWorkflow([]);
  }

  startWorkflow<I>(
    pathOrArray: readonly string[] | string,
    input?: I,
    executePostActions = true
  ) {
    const path = pathAsArray(pathOrArray);
    const self = this;

    return Effect.gen(function* ($) {
      const executionPlan = yield* $(
        self.workflowPathToExecutionPlan(pathAsArray(path))
      );

      const result = yield* $(
        executionPlan.workflow.workflow.start(executionPlan.workflow.id, input),
        Effect.provideService(
          ExecutionContext,
          self.makeExecutionContext({
            path,
            workflowId: executionPlan.workflow.id,
          })
        )
      );

      if (executePostActions) {
        yield* $(self.executePostActions());
      }

      return result;
    }).pipe(Effect.provideService(State, this.state));
  }

  initializeWorkflow<
    T extends string | readonly string[],
    M = Get<WorkflowMetadata, T>
  >(
    ...args: undefined extends GetSym<Get<M, string>, WorkflowContextSym>
      ? [T] | [T, GetSym<Get<M, string>, WorkflowContextSym>]
      : [T, GetSym<Get<M, string>, WorkflowContextSym>]
  ) {
    const [pathOrArray, input] = args;
    const path = pathAsArray(pathOrArray);
    const self = this;

    return Effect.gen(function* ($) {
      const executionPlan = yield* $(self.taskPathToExecutionPlan(path));
      if (executionPlan.task instanceof CompositeTask) {
        const result = yield* $(
          executionPlan.task.subWorkflow.initialize(input, {
            workflowId: executionPlan.workflow.id,
            taskName: executionPlan.taskName,
          })
        );
        return result as WorkflowInstance<
          GetSym<Get<M, string>, WorkflowContextSym>
        >;
      }
      return yield* $(Effect.fail(new InvalidPath({ path, pathType: 'task' })));
    }).pipe(Effect.provideService(State, this.state));
  }

  cancelWorkflow(path: string[] | string) {
    const self = this;

    return Effect.gen(function* ($) {
      const executionPlan = yield* $(
        self.workflowPathToExecutionPlan(pathAsArray(path))
      );

      const result = yield* $(
        executionPlan.workflow.workflow.cancel(executionPlan.workflow.id)
      );

      return result;
    }).pipe(Effect.provideService(State, this.state));
  }

  private unsafeFireTask(
    path: readonly string[],
    input: unknown,
    executePostActions: boolean
  ) {
    const self = this;
    return Effect.gen(function* ($) {
      const executionPlan = yield* $(self.taskPathToExecutionPlan(path));

      const result = yield* $(
        executionPlan.task.fire(executionPlan.workflow.id, input),
        self.decorateReturnType,
        Effect.provideService(State, self.state),
        Effect.provideService(
          ExecutionContext,
          self.makeExecutionContext({
            path,
            workflowId: executionPlan.workflow.id,
          })
        )
      );

      if (executePostActions) {
        yield* $(self.executePostActions());
      }

      return result;
    });
  }

  fireTask<
    T extends string | readonly string[],
    M = GetSym<Get<WorkflowMetadata, T>, TaskOnFireSym>
  >(
    ...args: undefined extends Get<M, 'input'>
      ? [T] | [T, Get<M, 'input'>]
      : [T, Get<M, 'input'>]
  ) {
    const [pathOrArray, input] = args;
    const path = pathAsArray(pathOrArray);

    return pipe(
      this.unsafeFireTask(path, input, true),
      Effect.map((r) => r as Get<M, 'return'>)
    );
  }

  private unsafeInitializeWorkItem(
    path: readonly string[],
    input: unknown,
    executePostActions: boolean
  ) {
    const self = this;
    return Effect.gen(function* ($) {
      const executionPlan = yield* $(self.taskPathToExecutionPlan(path));

      if (!(executionPlan.task instanceof Task)) {
        return yield* $(
          Effect.fail(new InvalidPath({ path, pathType: 'task' }))
        );
      }

      const result = yield* $(
        executionPlan.task.initializeWorkItem(executionPlan.workflow.id, input),
        self.decorateReturnType,
        Effect.provideService(State, self.state),
        Effect.provideService(
          ExecutionContext,
          self.makeExecutionContext({
            path,
            workflowId: executionPlan.workflow.id,
          })
        )
      );

      if (executePostActions) {
        yield* $(self.executePostActions());
      }

      return result;
    });
  }

  initializeWorkItem<
    T extends string | readonly string[],
    M = Get<Get<WorkflowMetadata, T>, string>
  >(
    ...args: undefined extends M
      ? [T] | [T, GetSym<M, WorkItemPayloadSym>]
      : [T, GetSym<M, WorkItemPayloadSym>]
  ) {
    const [pathOrArray, input] = args;
    const path = pathAsArray(pathOrArray);

    return pipe(
      this.unsafeInitializeWorkItem(path, input, true),
      Effect.map((r) => r as WorkItem<GetSym<M, WorkItemPayloadSym>>)
    );
  }

  private unsafeCompleteWorkItem(
    path: readonly string[],
    input: unknown,
    executePostActions: boolean
  ) {
    const self = this;
    return Effect.gen(function* ($) {
      const executionPlan = yield* $(self.workItemPathToExecutionPlan(path));

      const result = yield* $(
        executionPlan.task.completeWorkItem(
          executionPlan.workflow.id,
          executionPlan.workItemId,
          input
        ),
        self.decorateReturnType,
        Effect.provideService(State, self.state),
        Effect.provideService(
          ExecutionContext,
          self.makeExecutionContext({
            path,
            workflowId: executionPlan.workflow.id,
          })
        )
      );

      if (executePostActions) {
        yield* $(self.executePostActions());
      }

      return result;
    });
  }

  completeWorkItem<
    T extends string | readonly string[],
    M = Get<WorkflowMetadata, T>
  >(
    ...args: undefined extends Get<M, ['onComplete', 'input']>
      ? [T] | [T, Get<M, ['onComplete', 'input']>]
      : [T, Get<M, ['onComplete', 'input']>]
  ) {
    const [pathOrArray, input] = args;
    const path = pathAsArray(pathOrArray);

    return pipe(
      this.unsafeCompleteWorkItem(path, input, true),
      Effect.map((r) => r as Get<M, ['onComplete', 'return']>)
    );
  }

  private unsafeCancelWorkItem(
    path: readonly string[],
    input: unknown,
    executePostActions: boolean
  ) {
    const self = this;
    return Effect.gen(function* ($) {
      const executionPlan = yield* $(self.workItemPathToExecutionPlan(path));

      const result = yield* $(
        executionPlan.task.cancelWorkItem(
          executionPlan.workflow.id,
          executionPlan.workItemId,
          input
        ),
        self.decorateReturnType,
        Effect.provideService(State, self.state),
        Effect.provideService(
          ExecutionContext,
          self.makeExecutionContext({
            path,
            workflowId: executionPlan.workflow.id,
          })
        )
      );

      if (executePostActions) {
        yield* $(self.executePostActions());
      }

      return result;
    });
  }

  cancelWorkItem<
    T extends string | readonly string[],
    M = Get<WorkflowMetadata, T>
  >(
    ...args: undefined extends Get<M, ['onCancel', 'input']>
      ? [T] | [T, Get<M, ['onCancel', 'input']>]
      : [T, Get<M, ['onCancel', 'input']>]
  ) {
    const [pathOrArray, input] = args;
    const path = pathAsArray(pathOrArray);

    return pipe(
      this.unsafeCancelWorkItem(path, input, true),
      Effect.map((r) => r as Get<M, ['onCancel', 'return']>)
    );
  }

  private unsafeStartWorkItem(
    path: readonly string[],
    input: unknown,
    executePostActions: boolean
  ) {
    const self = this;
    return Effect.gen(function* ($) {
      const executionPlan = yield* $(self.workItemPathToExecutionPlan(path));

      const result = yield* $(
        executionPlan.task.startWorkItem(
          executionPlan.workflow.id,
          executionPlan.workItemId,
          input
        ),
        self.decorateReturnType,
        Effect.provideService(State, self.state),
        Effect.provideService(
          ExecutionContext,
          self.makeExecutionContext({
            path,
            workflowId: executionPlan.workflow.id,
          })
        )
      );

      if (executePostActions) {
        yield* $(self.executePostActions());
      }

      return result;
    });
  }

  startWorkItem<
    T extends string | readonly string[],
    M = Get<WorkflowMetadata, T>
  >(
    ...args: undefined extends Get<M, ['onStart', 'input']>
      ? [T] | [T, Get<M, ['onStart', 'input']>]
      : [T, Get<M, ['onStart', 'input']>]
  ) {
    const [pathOrArray, input] = args;
    const path = pathAsArray(pathOrArray);

    return pipe(
      this.unsafeStartWorkItem(path, input, true),
      Effect.map((r) => r as Get<M, ['onStart', 'return']>)
    );
  }

  private unsafeFailWorkItem(
    path: readonly string[],
    input: unknown,
    executePostActions: boolean
  ) {
    const self = this;
    return Effect.gen(function* ($) {
      const executionPlan = yield* $(self.workItemPathToExecutionPlan(path));

      const result = yield* $(
        executionPlan.task.failWorkItem(
          executionPlan.workflow.id,
          executionPlan.workItemId,
          input
        ),
        self.decorateReturnType,
        Effect.provideService(State, self.state),
        Effect.provideService(
          ExecutionContext,
          self.makeExecutionContext({
            path,
            workflowId: executionPlan.workflow.id,
          })
        )
      );

      if (executePostActions) {
        yield* $(self.executePostActions());
      }

      return result;
    });
  }

  failWorkItem<
    T extends string | readonly string[],
    M = Get<WorkflowMetadata, T>
  >(
    ...args: undefined extends Get<M, ['onFail', 'input']>
      ? [T] | [T, Get<M, ['onFail', 'input']>]
      : [T, Get<M, ['onFail', 'input']>]
  ) {
    const [pathOrArray, input] = args;
    const path = pathAsArray(pathOrArray);

    return pipe(
      this.unsafeFailWorkItem(path, input, true),
      Effect.map((r) => r as Get<M, ['onFail', 'return']>)
    );
  }

  getWorkItems(taskName: string) {
    return this.state.getWorkItems(this.workflowId, TaskName(taskName));
  }

  getWorkflowState() {
    return this.workflow
      .getState(this.workflowId)
      .pipe(Effect.provideService(State, this.state));
  }
  getWorkflowTasks() {
    return this.workflow
      .getTasks(this.workflowId)
      .pipe(Effect.provideService(State, this.state));
  }
  getWorkflowConditions() {
    return this.workflow
      .getConditions(this.workflowId)
      .pipe(Effect.provideService(State, this.state));
  }

  getFullState() {
    const self = this;
    return Effect.gen(function* ($) {
      const workflowState = yield* $(self.getWorkflowState());
      const workflowTasks = yield* $(self.getWorkflowTasks());
      const workflowConditions = yield* $(self.getWorkflowConditions());

      return {
        workflow: workflowState,
        tasks: workflowTasks,
        conditions: workflowConditions,
      };
    });
  }
  inspectState() {
    return this.state.inspect();
  }

  private runQueue(): Effect.Effect<
    R,
    | E
    | InvalidPath
    | TaskDoesNotExist
    | WorkItemDoesNotExist
    | TaskDoesNotExistInStore
    | InvalidWorkflowStateTransition
    | InvalidWorkItemTransition
    | InvalidTaskState
    | InvalidTaskStateTransition
    | ConditionDoesNotExist
    | ConditionDoesNotExistInStore
    | StartConditionDoesNotExist
    | EndConditionDoesNotExist
    | WorkflowDoesNotExist,
    void
  > {
    const self = this;

    return Effect.gen(function* ($) {
      while (true) {
        const item = yield* $(
          Queue.poll(self.queue),
          Effect.map(Option.getOrNull)
        );

        if (item === null) {
          return;
        }

        const match = pipe(
          Match.type<ExecutionContextQueueItem>(),
          Match.when({ type: 'fireTask' }, ({ path, input }) =>
            self.unsafeFireTask(path, input, false)
          ),
          Match.when(
            { type: 'startWorkflow' },
            ({ path, input }) => self.startWorkflow(path, input, false) // TODO: make unsafe version
          ),
          Match.when({ type: 'startWorkItem' }, ({ path, input }) =>
            self.unsafeStartWorkItem(path, input, false)
          ),
          Match.when({ type: 'completeWorkItem' }, ({ path, input }) =>
            self.unsafeCompleteWorkItem(path, input, false)
          ),
          Match.when({ type: 'cancelWorkItem' }, ({ path, input }) =>
            self.unsafeCancelWorkItem(path, input, false)
          ),
          Match.when({ type: 'failWorkItem' }, ({ path, input }) =>
            self.unsafeFailWorkItem(path, input, false)
          ),
          Match.exhaustive
        );

        yield* $(match(item));
      }
    });
  }

  private executePostActions() {
    return this.runQueue();
  }

  private makeExecutionContext(input: {
    path: readonly string[];
    workflowId: WorkflowId;
  }): ExecutionContext {
    const { queue, state } = this;
    return {
      ...input,
      defaultActivityPayload: {
        getWorkflowContext() {
          return state
            .getWorkflow(input.workflowId)
            .pipe(Effect.map((w) => w.context));
        },
        updateWorkflowContext(context: unknown) {
          return state.updateWorkflowContext(input.workflowId, context);
        },
      },
      queue: {
        offer(item: ExecutionContextQueueItem) {
          return queue.offer(item);
        },
      },
    };
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  private decorateReturnType<T extends Effect.Effect<any, any, any>>(
    payload: T
  ): Effect.Effect<
    Effect.Effect.Context<T> | R,
    Effect.Effect.Error<T> | E,
    Effect.Effect.Success<T>
  > {
    return payload;
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  private taskPathToExecutionPlan(path: readonly string[]) {
    if (path.length % 2 === 0) {
      // Path should contain an odd number of items: [taskName, workflowId, taskName...]
      return Effect.fail(new InvalidPath({ path, pathType: 'task' }));
    }

    const initialState: {
      index: number;
      current: Workflow | BaseTask;
      restPath: string[];
      taskNames: TaskName[];
      workflows: {
        workflow: Workflow;
        id: WorkflowId;
      }[];
    } = {
      index: 0,
      current: this.workflow,
      restPath: [...path],
      taskNames: [],
      workflows: [{ workflow: this.workflow, id: this.workflowId }],
    };
    return Effect.gen(function* ($) {
      const result = yield* $(
        Effect.iterate(initialState, {
          while: (state) => state.restPath.length > 0,
          body: (state) =>
            Effect.gen(function* ($) {
              if (state.index % 2 === 0 && state.current instanceof Workflow) {
                // Every even index should contain the TaskName
                const [taskName, ...restPath] = state.restPath;

                if (!taskName) {
                  return yield* $(
                    Effect.fail(new InvalidPath({ path, pathType: 'task' }))
                  );
                }

                const current = yield* $(state.current.getTask(taskName));

                return {
                  ...state,
                  current,
                  index: state.index + 1,
                  restPath,
                  taskNames: [...state.taskNames, TaskName(taskName)],
                };
              } else if (
                state.index % 2 === 1 &&
                state.current instanceof CompositeTask
              ) {
                // Every odd index should contain the WorkflowId
                const [workflowId, ...restPath] = state.restPath;

                if (!workflowId) {
                  return yield* $(
                    Effect.fail(new InvalidPath({ path, pathType: 'task' }))
                  );
                }

                const current = state.current.subWorkflow;

                return {
                  ...state,
                  current,
                  index: state.index + 1,
                  restPath,
                  workflows: [
                    ...state.workflows,
                    {
                      workflow: state.current.subWorkflow,
                      id: WorkflowId(workflowId),
                    },
                  ],
                };
              }

              return yield* $(
                Effect.fail(new InvalidPath({ path, pathType: 'task' }))
              );
            }),
        })
      );

      // Last path item should be a taskName
      if (!(result.current instanceof BaseTask)) {
        return yield* $(
          Effect.fail(new InvalidPath({ path, pathType: 'task' }))
        );
      }

      const workflow = result.workflows[result.workflows.length - 1];
      const taskName = result.taskNames[result.taskNames.length - 1];

      if (!workflow || !taskName) {
        return yield* $(
          Effect.fail(new InvalidPath({ path, pathType: 'task' }))
        );
      }

      return {
        queuesToRun: result.workflows.reverse(),
        workflow,
        taskName,
        task: result.current,
      };
    });
  }

  private workflowPathToExecutionPlan(path: readonly string[]) {
    if (path.length % 2 === 1) {
      // Path should contain an even number of items: [taskName, workflowId...]
      return Effect.fail(new InvalidPath({ path, pathType: 'workflow' }));
    }

    const initialState: {
      index: number;
      current: Workflow | BaseTask;
      restPath: string[];
      workflows: {
        workflow: Workflow;
        id: WorkflowId;
      }[];
    } = {
      index: 0,
      current: this.workflow,
      restPath: [...path],
      workflows: [{ workflow: this.workflow, id: this.workflowId }],
    };

    return Effect.gen(function* ($) {
      const result = yield* $(
        Effect.iterate(initialState, {
          while: (state) => state.restPath.length > 0,
          body: (state) =>
            Effect.gen(function* ($) {
              if (state.index % 2 === 0 && state.current instanceof Workflow) {
                // Every even index should contain the TaskName
                const [taskName, ...restPath] = state.restPath;

                if (!taskName) {
                  return yield* $(
                    Effect.fail(new InvalidPath({ path, pathType: 'workflow' }))
                  );
                }

                const current = yield* $(state.current.getTask(taskName));

                return {
                  ...state,
                  current,
                  index: state.index + 1,
                  restPath,
                };
              } else if (
                state.index % 2 === 1 &&
                state.current instanceof CompositeTask
              ) {
                // Every odd index should contain the WorkflowId
                const [workflowId, ...restPath] = state.restPath;

                if (!workflowId) {
                  return yield* $(
                    Effect.fail(new InvalidPath({ path, pathType: 'workflow' }))
                  );
                }

                const current = state.current.subWorkflow;

                return {
                  ...state,
                  current,
                  index: state.index + 1,
                  restPath,
                  workflows: [
                    ...state.workflows,
                    {
                      workflow: state.current.subWorkflow,
                      id: WorkflowId(workflowId),
                    },
                  ],
                };
              }

              return yield* $(
                Effect.fail(new InvalidPath({ path, pathType: 'workflow' }))
              );
            }),
        })
      );

      // Last path item should be a WorkflowId
      if (!(result.current instanceof Workflow)) {
        return yield* $(
          Effect.fail(new InvalidPath({ path, pathType: 'workflow' }))
        );
      }

      const workflow = result.workflows[result.workflows.length - 1];

      if (!workflow) {
        return yield* $(
          Effect.fail(new InvalidPath({ path, pathType: 'workflow' }))
        );
      }

      return {
        queuesToRun: result.workflows.reverse(),
        workflow,
      };
    });
  }

  private workItemPathToExecutionPlan(path: readonly string[]) {
    if (path.length % 2 === 1 || path.length === 0) {
      // Path should contain an even number of items, and last item should be the workItemId: [taskName, workflowId... taskName, workItemId]
      return Effect.fail(new InvalidPath({ path, pathType: 'workItem' }));
    }

    const initialState: {
      index: number;
      current: Workflow | BaseTask;
      restPath: string[];
      workItemId: WorkItemId | null;
      taskNames: TaskName[];
      workflows: {
        workflow: Workflow;
        id: WorkflowId;
      }[];
    } = {
      index: 0,
      current: this.workflow,
      restPath: [...path],
      workItemId: null,
      taskNames: [],
      workflows: [{ workflow: this.workflow, id: this.workflowId }],
    };

    return Effect.gen(function* ($) {
      const result = yield* $(
        Effect.iterate(initialState, {
          while: (state) => state.restPath.length > 0,
          body: (state) =>
            Effect.gen(function* ($) {
              if (state.index % 2 === 0 && state.current instanceof Workflow) {
                // Every even index should contain the TaskName
                const [taskName, ...restPath] = state.restPath;

                if (!taskName) {
                  return yield* $(
                    Effect.fail(new InvalidPath({ path, pathType: 'workItem' }))
                  );
                }

                const current = yield* $(state.current.getTask(taskName));

                if (restPath.length === 1 && restPath[0]) {
                  return {
                    ...state,
                    current,
                    index: state.index + 2,
                    restPath: [],
                    taskNames: [...state.taskNames, TaskName(taskName)],
                    workItemId: WorkItemId(restPath[0]),
                  };
                }

                return {
                  ...state,
                  current,
                  index: state.index + 1,
                  restPath,
                };
              } else if (
                state.index % 2 === 1 &&
                state.current instanceof CompositeTask
              ) {
                // Every odd index should contain the WorkflowId
                const [workflowId, ...restPath] = state.restPath;

                if (!workflowId) {
                  return yield* $(
                    Effect.fail(new InvalidPath({ path, pathType: 'workItem' }))
                  );
                }

                const current = state.current.subWorkflow;

                return {
                  ...state,
                  current,
                  index: state.index + 1,
                  restPath,
                  workflows: [
                    ...state.workflows,
                    {
                      workflow: state.current.subWorkflow,
                      id: WorkflowId(workflowId),
                    },
                  ],
                };
              }

              return yield* $(
                Effect.fail(new InvalidPath({ path, pathType: 'workItem' }))
              );
            }),
        })
      );

      // Last processed item should be a BaseTask, because when in case where we encounter a BaseTask, and there is only one item left in the path, we assume that the last item is the workItemId
      if (!(result.current instanceof Task)) {
        return yield* $(
          Effect.fail(new InvalidPath({ path, pathType: 'workItem' }))
        );
      }

      const workflow = result.workflows[result.workflows.length - 1];
      const taskName = result.taskNames[result.taskNames.length - 1];
      const workItemId = result.workItemId;

      if (!workflow || !taskName || !workItemId) {
        return yield* $(
          Effect.fail(new InvalidPath({ path, pathType: 'workItem' }))
        );
      }

      return {
        queuesToRun: result.workflows.reverse(),
        workflow,
        task: result.current,
        workItemId,
      };
    });
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type WorkflowR<T> = T extends Workflow<infer R, any, any> ? R : never;
type WorkflowE<T> = T extends Workflow<any, infer E, any> ? E : never;
type WorkflowContext<T> = T extends Workflow<any, any, infer C> ? C : never;
/* eslint-enable @typescript-eslint/no-explicit-any */

export function initialize<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  W extends Workflow<any, any, any, any, any>,
  R extends WorkflowR<W> = WorkflowR<W>,
  E extends WorkflowE<W> = WorkflowE<W>,
  C extends WorkflowContext<W> = WorkflowContext<W>
>(workflow: W, context: C) {
  return Effect.gen(function* ($) {
    const queue = yield* $(Queue.unbounded<ExecutionContextQueueItem>());
    const maybeIdGenerator = yield* $(Effect.serviceOption(IdGenerator));
    const idGenerator = Option.getOrElse(
      maybeIdGenerator,
      () => nanoidIdGenerator
    );

    const state = new StateImpl.StateImpl(idGenerator);

    const { id } = yield* $(
      workflow.initialize(context),
      Effect.provideService(State, state)
    );

    const interpreter = new Service<WorkflowMetadata<W>, R, E>(
      id,
      workflow,
      state,
      queue
    );

    return interpreter;
  });
}

/*export function resume<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  W extends Workflow<any, any, any, any, any>,
  R extends WorkflowR<W> = WorkflowR<W>,
  E extends WorkflowE<W> = WorkflowE<W>,
  C extends WorkflowContext<W> = WorkflowContext<W>
>(workflow: W, context: C) {
  return Effect.gen(function* ($) {
    const queue = yield* $(Queue.unbounded<ExecutionContextQueueItem>());

    return new Interpreter<
      WorkflowWorkflowMetadata<W>,
      WorkflowOnStartReturnType<W>,
      R,
      E
    >(workflow, context, queue);
  });
}*/