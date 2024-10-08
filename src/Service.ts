import { Chunk, Context, Effect, Match, Option, Queue, pipe } from 'effect';
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
  InvalidResumableState,
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
  ElementTypes,
  ExecutionContext,
  ExecutionContextQueueItem,
  GetSym,
  IdGenerator,
  OnStateChangeFn,
  StateChangeItem,
  StateChangeLogger,
  StorePersistableState,
  TaskName,
  TaskOnStartSym,
  WorkItemId,
  WorkItemInstance,
  WorkItemPayloadSym,
  WorkflowContextSym,
  WorkflowId,
  WorkflowInstance,
} from './types.js';
import { nanoidIdGenerator } from './util.js';

function pathAsArray(path: string | string[] | readonly string[]) {
  return typeof path === 'string' ? path.split('.') : path;
}

export class Service<
  TWorkflowMetadata,
  TElementTypes extends ElementTypes = ElementTypes,
  R = never,
  E = never
> {
  private onStateChangeListener: OnStateChangeFn | undefined;

  constructor(
    private workflowId: WorkflowId,
    private workflow: Workflow,
    private state: Context.Tag.Service<State>,
    private queue: Queue.Queue<ExecutionContextQueueItem>,
    private stateChangeLogger: StateChangeLogger
  ) {}

  onStateChange(
    fn: OnStateChangeFn<
      TElementTypes['workflow'],
      TElementTypes['workItem'],
      TElementTypes['task']
    >
  ) {
    const changeLog = this.stateChangeLogger.drain();
    this.onStateChangeListener = fn;
    if (changeLog.length) {
      fn(changeLog);
    }
  }

  unsafeStartWorkflow(
    pathOrArray: readonly string[] | string,
    input?: unknown,
    executePostActions = true
  ) {
    const path = pathAsArray(pathOrArray);
    const self = this;

    return Effect.gen(function* () {
      const executionPlan = yield* self.workflowPathToExecutionPlan(
        pathAsArray(path)
      );

      const result: unknown = yield* executionPlan.workflow.workflow
        .start(executionPlan.workflow.id, input)
        .pipe(
          Effect.provideService(
            ExecutionContext,
            self.makeExecutionContext({
              path,
              workflowId: executionPlan.workflow.id,
            })
          )
        );

      if (executePostActions) {
        yield* self.executePostActions();
      }

      return result;
    }).pipe(Effect.provideService(State, this.state));
  }

  startWorkflow<
    T extends string | readonly string[],
    M = NonNullable<Get<TWorkflowMetadata, T>>
  >(
    ...args: undefined extends Get<M, ['onStart', 'input']>
      ? [T] | [T, Get<M, ['onStart', 'input']>]
      : [T, Get<M, ['onStart', 'input']>]
  ) {
    const [pathOrArray, input] = args;
    return this.unsafeStartWorkflow(pathOrArray, input).pipe(
      Effect.map((r) => r as Get<M, ['onStart', 'return']>)
    );
  }

  start<I extends Get<TWorkflowMetadata, ['onStart', 'input']>>(
    ...input: undefined extends I ? [I?] : [I]
  ) {
    return this.unsafeStartWorkflow([], input).pipe(
      Effect.map((r) => r as Get<TWorkflowMetadata, ['onStart', 'return']>)
    );
  }

  unsafeCancelWorkflow(
    pathOrArray: readonly string[] | string,
    input?: unknown,
    executePostActions = true
  ) {
    const path = pathAsArray(pathOrArray);
    const self = this;

    return Effect.gen(function* () {
      const executionPlan = yield* self.workflowPathToExecutionPlan(
        pathAsArray(path)
      );

      yield* executionPlan.workflow.workflow
        .cancel(executionPlan.workflow.id, input)
        .pipe(
          Effect.provideService(
            ExecutionContext,
            self.makeExecutionContext({
              path,
              workflowId: executionPlan.workflow.id,
            })
          )
        );

      if (executePostActions) {
        yield* self.executePostActions();
      }

      return;
    }).pipe(Effect.provideService(State, this.state));
  }

  cancelWorkflow<
    T extends string | readonly string[],
    M = NonNullable<Get<TWorkflowMetadata, T>>
  >(
    ...args: undefined extends Get<M, ['onCancel', 'input']>
      ? [T] | [T, Get<M, ['onCancel', 'input']>]
      : [T, Get<M, ['onCancel', 'input']>]
  ) {
    const [pathOrArray, input] = args;
    return this.unsafeCancelWorkflow(pathOrArray, input).pipe(
      Effect.map((r) => r as Get<M, ['onCancel', 'return']>)
    );
  }

  cancel<I extends Get<TWorkflowMetadata, ['onCancel', 'input']>>(
    ...input: undefined extends I ? [I?] : [I]
  ) {
    return this.unsafeCancelWorkflow([], input).pipe(
      Effect.map((r) => r as Get<TWorkflowMetadata, ['onCancel', 'return']>)
    );
  }

  initializeWorkflow<
    T extends string | readonly string[],
    M = NonNullable<Get<Get<TWorkflowMetadata, T>, string>>
  >(
    ...args: undefined extends GetSym<M, WorkflowContextSym>
      ? [T] | [T, GetSym<M, WorkflowContextSym>]
      : [T, GetSym<M, WorkflowContextSym>]
  ) {
    const [pathOrArray, input] = args;
    const path = pathAsArray(pathOrArray);
    const self = this;

    return Effect.gen(function* () {
      const executionPlan = yield* self.taskPathToExecutionPlan(path);
      if (executionPlan.task instanceof CompositeTask) {
        const result = yield* executionPlan.task.subWorkflow.initialize(input, {
          workflowId: executionPlan.workflow.id,
          workflowName: executionPlan.workflow.workflow.name,
          taskName: executionPlan.taskName,
          taskGeneration: executionPlan.taskData.generation,
        });

        yield* self.executePostActions();

        return result as WorkflowInstance<GetSym<M, WorkflowContextSym>>;
      }
      return yield* Effect.fail(new InvalidPath({ path, pathType: 'task' }));
    }).pipe(Effect.provideService(State, this.state));
  }

  unsafeUpdateWorkflowContext(path: readonly string[], context: unknown) {
    const self = this;

    return Effect.gen(function* () {
      const executionPlan = yield* self.workflowPathToExecutionPlan(path);

      yield* self.state.updateWorkflowContext(
        executionPlan.workflow.id,
        context
      );
    }).pipe(Effect.provideService(State, this.state));
  }

  updateWorkflowContext<
    T extends string | readonly string[],
    M = NonNullable<Get<TWorkflowMetadata, T>>
  >(
    ...args: undefined extends GetSym<M, WorkflowContextSym>
      ? [T] | [T, GetSym<M, WorkflowContextSym>]
      : [T, GetSym<M, WorkflowContextSym>]
  ) {
    const [pathOrArray, input] = args;
    const path = pathAsArray(pathOrArray);
    return this.unsafeUpdateWorkflowContext(path, input);
  }

  unsafeStartTask(
    path: readonly string[],
    input: unknown,
    executePostActions: boolean
  ) {
    const self = this;
    return Effect.gen(function* () {
      const executionPlan = yield* self.taskPathToExecutionPlan(path);

      const result = yield* executionPlan.task
        .start(executionPlan.workflow.id, input)
        .pipe(
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
        yield* self.executePostActions();
      }

      return result;
    });
  }

  startTask<
    T extends string | readonly string[],
    M = GetSym<NonNullable<Get<TWorkflowMetadata, T>>, TaskOnStartSym>
  >(
    ...args: undefined extends Get<M, 'input'>
      ? [T] | [T, Get<M, 'input'>]
      : [T, Get<M, 'input'>]
  ) {
    const [pathOrArray, input] = args;
    const path = pathAsArray(pathOrArray);

    return pipe(
      this.unsafeStartTask(path, input, true),
      Effect.map((r) => r as Get<M, 'return'>)
    );
  }

  unsafeInitializeWorkItem(
    path: readonly string[],
    input: unknown,
    executePostActions: boolean
  ) {
    const self = this;
    return Effect.gen(function* () {
      const executionPlan = yield* self.taskPathToExecutionPlan(path);

      if (!(executionPlan.task instanceof Task)) {
        return yield* Effect.fail(new InvalidPath({ path, pathType: 'task' }));
      }

      const result = yield* executionPlan.task
        .initializeWorkItem(executionPlan.workflow.id, input)
        .pipe(
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
        yield* self.executePostActions();
      }

      return result;
    });
  }

  initializeWorkItem<
    T extends string | readonly string[],
    M = NonNullable<Get<Get<TWorkflowMetadata, T>, string>>
  >(
    ...args: undefined extends GetSym<M, WorkItemPayloadSym>
      ? [T] | [T, GetSym<M, WorkItemPayloadSym>]
      : [T, GetSym<M, WorkItemPayloadSym>]
  ) {
    const [pathOrArray, input] = args;
    const path = pathAsArray(pathOrArray);

    return pipe(
      this.unsafeInitializeWorkItem(path, input, true),
      Effect.map((r) => r as WorkItemInstance<GetSym<M, WorkItemPayloadSym>>)
    );
  }

  unsafeCompleteWorkItem(
    path: readonly string[],
    input: unknown,
    executePostActions: boolean
  ) {
    const self = this;
    return Effect.gen(function* () {
      const executionPlan = yield* self.workItemPathToExecutionPlan(path);

      const result = yield* executionPlan.task
        .completeWorkItem(
          executionPlan.workflow.id,
          executionPlan.workItemId,
          input
        )
        .pipe(
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
        yield* self.executePostActions();
      }

      return result;
    });
  }

  completeWorkItem<
    T extends string | readonly string[],
    M = NonNullable<Get<TWorkflowMetadata, T>>
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

  unsafeCancelWorkItem(
    path: readonly string[],
    input: unknown,
    executePostActions: boolean
  ) {
    const self = this;
    return Effect.gen(function* () {
      const executionPlan = yield* self.workItemPathToExecutionPlan(path);

      const result = yield* executionPlan.task
        .cancelWorkItem(
          executionPlan.workflow.id,
          executionPlan.workItemId,
          input
        )
        .pipe(
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
        yield* self.executePostActions();
      }

      return result;
    });
  }

  cancelWorkItem<
    T extends string | readonly string[],
    M = NonNullable<Get<TWorkflowMetadata, T>>
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

  unsafeStartWorkItem(
    path: readonly string[],
    input: unknown,
    executePostActions: boolean
  ) {
    const self = this;
    return Effect.gen(function* () {
      const executionPlan = yield* self.workItemPathToExecutionPlan(path);

      const result = yield* executionPlan.task
        .startWorkItem(
          executionPlan.workflow.id,
          executionPlan.workItemId,
          input
        )
        .pipe(
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
        yield* self.executePostActions();
      }

      return result;
    });
  }

  startWorkItem<
    T extends string | readonly string[],
    M = NonNullable<Get<TWorkflowMetadata, T>>
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

  unsafeFailWorkItem(
    path: readonly string[],
    input: unknown,
    executePostActions: boolean
  ) {
    const self = this;
    return Effect.gen(function* () {
      const executionPlan = yield* self.workItemPathToExecutionPlan(path);

      const result = yield* executionPlan.task
        .failWorkItem(
          executionPlan.workflow.id,
          executionPlan.workItemId,
          input
        )
        .pipe(
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
        yield* self.executePostActions();
      }

      return result;
    });
  }

  failWorkItem<
    T extends string | readonly string[],
    M = NonNullable<Get<TWorkflowMetadata, T>>
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

  unsafeUpdateWorkItemPayload(path: readonly string[], payload: unknown) {
    const self = this;

    return Effect.gen(function* () {
      const executionPlan = yield* self.workItemPathToExecutionPlan(path);

      yield* self.state.updateWorkItemPayload(
        executionPlan.workflow.id,
        executionPlan.task.name,
        executionPlan.workItemId,
        payload
      );
    }).pipe(Effect.provideService(State, this.state));
  }

  updateWorkItemPayload<
    T extends string | readonly string[],
    M = NonNullable<Get<TWorkflowMetadata, T>>
  >(
    ...args: undefined extends GetSym<M, WorkItemPayloadSym>
      ? [T] | [T, GetSym<M, WorkItemPayloadSym>]
      : [T, GetSym<M, WorkItemPayloadSym>]
  ) {
    const [pathOrArray, input] = args;
    const path = pathAsArray(pathOrArray);
    return this.unsafeUpdateWorkItemPayload(path, input);
  }

  getState() {
    const self = this;
    return Effect.gen(function* () {
      return (yield* self.state.getState()) as StorePersistableState<TElementTypes['workflow'], TElementTypes['workItem'], TElementTypes['task']>;
    });
  }

  private emitStateChanges() {
    const stateChanges = this.stateChangeLogger.drain();
    if (stateChanges.length && this.onStateChangeListener) {
      return this.onStateChangeListener(stateChanges);
    } else {
      return Effect.void;
    }
  }

  private runQueue(): Effect.Effect<
    void,
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
    R
  > {
    const self = this;

    return Effect.gen(function* () {
      while (true) {
        yield* self.emitStateChanges();

        const queued = yield* Queue.takeAll(self.queue).pipe(
          Effect.map(Chunk.toReadonlyArray)
        );

        if (queued.length === 0) {
          return;
        }

        const queuedFx = queued.map((item) => {
          const match = pipe(
            Match.type<ExecutionContextQueueItem>(),
            Match.when({ type: 'startTask' }, ({ path, input }) =>
              self.unsafeStartTask(path, input, false)
            ),
            Match.when({ type: 'startWorkflow' }, ({ path, input }) =>
              self.unsafeStartWorkflow(path, input, false)
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

          return Effect.gen(function* () {
            yield* match(item);
            yield* self.emitStateChanges();
            yield* self.executePostActions();
          });
        });

        yield* Effect.all(queuedFx, {
          concurrency: 'inherit',
          batching: 'inherit',
          discard: true,
        });
      }
    });
  }

  private executePostActions() {
    return this.runQueue();
  }

  private makeExecutionContext(input: {
    path: readonly string[];
    workflowId: WorkflowId;
  }): Context.Tag.Service<ExecutionContext> {
    const self = this;
    return {
      ...input,
      emitStateChanges: () => self.emitStateChanges(),
      defaultActivityPayload: {
        getWorkflowContext() {
          return self.state
            .getWorkflow(input.workflowId)
            .pipe(Effect.map((w) => w.context));
        },
        updateWorkflowContext(contextOrUpdater: unknown) {
          return Effect.gen(function* () {
            if (typeof contextOrUpdater === 'function') {
              const workflow = yield* self.state.getWorkflow(input.workflowId);
              return yield* self.state
                .updateWorkflowContext(
                  input.workflowId,
                  contextOrUpdater(workflow.context)
                )
                .pipe(Effect.tap(() => self.emitStateChanges()));
            }
            return yield* self.state
              .updateWorkflowContext(input.workflowId, contextOrUpdater)
              .pipe(Effect.tap(() => self.emitStateChanges()));
          });
        },
      },
      queue: {
        offer(item: ExecutionContextQueueItem) {
          return self.queue.offer(item);
        },
      },
    };
  }

  private decorateReturnType<T extends Effect.Effect<any, any, any>>(
    payload: T
  ): Effect.Effect<
    Effect.Effect.Success<T>,
    Effect.Effect.Error<T> | E,
    Effect.Effect.Context<T> | Exclude<R, State>
  > {
    return payload;
  }

  private taskPathToExecutionPlan(path: readonly string[]) {
    if (path.length % 2 === 0) {
      // Path should contain an odd number of items: [taskName, workflowId, taskName...]
      return Effect.fail(new InvalidPath({ path, pathType: 'task' }));
    }

    const self = this;
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

    return Effect.gen(function* () {
      const result = yield* Effect.iterate(initialState, {
        while: (state) => state.restPath.length > 0,
        body: (state) =>
          Effect.gen(function* () {
            if (state.index % 2 === 0 && state.current instanceof Workflow) {
              // Every even index should contain the TaskName
              const [taskName, ...restPath] = state.restPath;

              if (!taskName) {
                return yield* Effect.fail(
                  new InvalidPath({ path, pathType: 'task' })
                );
              }

              const current = yield* state.current.getTask(taskName);

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
                return yield* Effect.fail(
                  new InvalidPath({ path, pathType: 'task' })
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

            return yield* Effect.fail(
              new InvalidPath({ path, pathType: 'task' })
            );
          }),
      });

      // Last path item should be a taskName
      if (!(result.current instanceof BaseTask)) {
        return yield* Effect.fail(new InvalidPath({ path, pathType: 'task' }));
      }

      const workflow = result.workflows[result.workflows.length - 1];
      const taskName = result.taskNames[result.taskNames.length - 1];

      if (!workflow || !taskName) {
        return yield* Effect.fail(new InvalidPath({ path, pathType: 'task' }));
      }

      const taskData = yield* self.state.getTask(workflow.id, taskName);

      return {
        workflow,
        taskName,
        taskData,
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

    return Effect.gen(function* () {
      const result = yield* Effect.iterate(initialState, {
        while: (state) => state.restPath.length > 0,
        body: (state) =>
          Effect.gen(function* () {
            if (state.index % 2 === 0 && state.current instanceof Workflow) {
              // Every even index should contain the TaskName
              const [taskName, ...restPath] = state.restPath;

              if (!taskName) {
                return yield* Effect.fail(
                  new InvalidPath({ path, pathType: 'workflow' })
                );
              }

              const current = yield* state.current.getTask(taskName);

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
                return yield* Effect.fail(
                  new InvalidPath({ path, pathType: 'workflow' })
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

            return yield* Effect.fail(
              new InvalidPath({ path, pathType: 'workflow' })
            );
          }),
      });

      // Last path item should be a WorkflowId
      if (!(result.current instanceof Workflow)) {
        return yield* Effect.fail(
          new InvalidPath({ path, pathType: 'workflow' })
        );
      }

      const workflow = result.workflows[result.workflows.length - 1];

      if (!workflow) {
        return yield* Effect.fail(
          new InvalidPath({ path, pathType: 'workflow' })
        );
      }

      return {
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

    return Effect.gen(function* () {
      const result = yield* Effect.iterate(initialState, {
        while: (state) => state.restPath.length > 0,
        body: (state) =>
          Effect.gen(function* () {
            if (state.index % 2 === 0 && state.current instanceof Workflow) {
              // Every even index should contain the TaskName
              const [taskName, ...restPath] = state.restPath;

              if (!taskName) {
                return yield* Effect.fail(
                  new InvalidPath({ path, pathType: 'workItem' })
                );
              }

              const current = yield* state.current.getTask(taskName);

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
                return yield* Effect.fail(
                  new InvalidPath({ path, pathType: 'workItem' })
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

            return yield* Effect.fail(
              new InvalidPath({ path, pathType: 'workItem' })
            );
          }),
      });

      // Last processed item should be a BaseTask, because when in case where we encounter a BaseTask, and there is only one item left in the path, we assume that the last item is the workItemId and complete the loop
      if (!(result.current instanceof Task)) {
        return yield* Effect.fail(
          new InvalidPath({ path, pathType: 'workItem' })
        );
      }

      const workflow = result.workflows[result.workflows.length - 1];
      const taskName = result.taskNames[result.taskNames.length - 1];
      const workItemId = result.workItemId;

      if (!workflow || !taskName || !workItemId) {
        return yield* Effect.fail(
          new InvalidPath({ path, pathType: 'workItem' })
        );
      }

      return {
        workflow,
        task: result.current,
        workItemId,
      };
    });
  }
}

function makeStateChangeLogger(): StateChangeLogger {
  let stateChanges: StateChangeItem[] = [];
  return {
    log: (item) => {
      stateChanges.push(item);
    },
    drain: () => {
      const result = stateChanges;
      stateChanges = [];
      return result;
    },
  };
}

type WorkflowR<T> = T extends Workflow<infer R, any, any> ? R : never;
type WorkflowE<T> = T extends Workflow<any, infer E, any> ? E : never;
type WorkflowContext<T> = T extends Workflow<any, any, infer C> ? C : never;
type WorkflowElementTypes<T> = T extends Workflow<any, any, any, any, infer ET>
  ? ET
  : never;

type IsOptional<T> = T extends never
  ? true
  : undefined extends T
  ? true
  : false;

export function initialize<
  W extends Workflow<any, any, any, any, any>,
  R extends WorkflowR<W> = WorkflowR<W>,
  E extends WorkflowE<W> = WorkflowE<W>,
  C extends WorkflowContext<W> = WorkflowContext<W>
>(...args: IsOptional<C> extends true ? [W] | [W, C?] : [W, C]) {
  const [workflow, context] = args;
  return Effect.gen(function* () {
    const queue = yield* Queue.unbounded<ExecutionContextQueueItem>();
    const maybeIdGenerator = yield* Effect.serviceOption(IdGenerator);
    const idGenerator = Option.getOrElse(
      maybeIdGenerator,
      () => nanoidIdGenerator
    );
    const stateChangeLogger = makeStateChangeLogger();

    const state = new StateImpl.StateImpl(idGenerator, stateChangeLogger);

    const { id } = yield* workflow
      .initialize(context)
      .pipe(Effect.provideService(State, state));

    const interpreter = new Service<
      WorkflowMetadata<W>,
      WorkflowElementTypes<W>,
      R,
      E
    >(id, workflow, state, queue, stateChangeLogger);

    return interpreter;
  });
}

export function resume<
  W extends Workflow<any, any, any, any, any>,
  R extends WorkflowR<W> = WorkflowR<W>,
  E extends WorkflowE<W> = WorkflowE<W>,
  ET extends WorkflowElementTypes<W> = WorkflowElementTypes<W>
>(
  workflow: W,
  resumableState: StorePersistableState<
    ET['workflow'],
    ET['workItem'],
    ET['task']
  >
) {
  return Effect.gen(function* () {
    const queue = yield* Queue.unbounded<ExecutionContextQueueItem>();
    const maybeIdGenerator = yield* Effect.serviceOption(IdGenerator);
    const idGenerator = Option.getOrElse(
      maybeIdGenerator,
      () => nanoidIdGenerator
    );

    const stateChangeLogger = makeStateChangeLogger();

    const state = new StateImpl.StateImpl(
      idGenerator,
      stateChangeLogger,
      resumableState
    );
    const rootWorkflows = resumableState.workflows.filter((w) => !w.parent);
    const rootWorkflow = rootWorkflows[0];

    if (!rootWorkflow || rootWorkflows.length > 1) {
      return yield* Effect.fail(new InvalidResumableState({}));
    }

    const interpreter = new Service<WorkflowMetadata<W>, ET, R, E>(
      rootWorkflow.id,
      workflow,
      state,
      queue,
      stateChangeLogger
    );

    return interpreter;
  });
}
