import { Chunk, Context, Effect, Match, Option, Queue, pipe } from 'effect';
import { Get, PartialOnUndefinedDeep } from 'type-fest';

import { State } from './State.js';
import { BaseTask } from './elements/BaseTask.js';
import { CompositeTask } from './elements/CompositeTask.js';
import { Task } from './elements/Task.js';
import { GetWorkflowMetadata, Workflow } from './elements/Workflow.js';
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
  IdGenerator,
  NeverAsUndefined,
  OnStateChangeFn,
  StateChangeEmitter,
  StateChangeItem,
  StorePersistableState,
  TaskName,
  WorkItemId,
  WorkItemInstance,
  WorkflowBuilderMetadata,
  WorkflowBuilderMetadataCompositeTaskPayloads,
  WorkflowBuilderMetadataTaskPayloads,
  WorkflowBuilderMetadataWorkItemPayloads,
  WorkflowBuilderMetadataWorkflowPayloads,
  WorkflowId,
  WorkflowInstance,
} from './types.js';
import { nanoidIdGenerator } from './util.js';

function resolvePath(path: string, params: Record<string, string>) {
  const pathArray = path.split('.');
  const result: string[] = [];
  for (const part of pathArray) {
    if (part.startsWith('$')) {
      const paramName = part.slice(1);
      result.push(params[paramName] ?? '');
    } else {
      result.push(part);
    }
  }
  return result;
}

function pathAsArray(path: string | string[] | readonly string[]) {
  return typeof path === 'string' ? path.split('.') : path;
}

export class Service<
  TWorkflowMetadata extends WorkflowBuilderMetadata,
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
    private stateChangeEmitter: StateChangeEmitter
  ) {}

  onStateChange(
    fn: OnStateChangeFn<
      TElementTypes['workflow'],
      TElementTypes['workItem'],
      TElementTypes['task']
    >
  ) {
    const changeLog = this.stateChangeEmitter.drain();
    this.onStateChangeListener = fn;
    if (changeLog.length) {
      fn(changeLog);
    }
  }

  initializeWorkflow<
    TPath extends keyof WorkflowBuilderMetadataCompositeTaskPayloads<TWorkflowMetadata> &
      string,
    TPayload = Get<
      WorkflowBuilderMetadataCompositeTaskPayloads<TWorkflowMetadata>,
      [TPath]
    >
  >(
    path: TPath,
    payload: PartialOnUndefinedDeep<{
      params: NeverAsUndefined<Get<TPayload, ['params']>>;
      context: NeverAsUndefined<Get<TPayload, ['workflowContext']>>;
    }>
  ) {
    const { params, context } = payload;
    const resolvedPath = resolvePath(path, params ?? {});
    const self = this;

    return Effect.gen(function* () {
      const executionPlan = yield* self.taskPathToExecutionPlan(resolvedPath);
      if (executionPlan.task instanceof CompositeTask) {
        const result = yield* executionPlan.task.subWorkflow.initialize(
          context,
          {
            workflowId: executionPlan.workflow.id,
            workflowName: executionPlan.workflow.workflow.name,
            taskName: executionPlan.taskName,
            taskGeneration: executionPlan.taskData.generation,
          }
        );

        yield* self.executePostActions();

        return result as WorkflowInstance<Get<TPayload, ['workflowContext']>>;
      }
      return yield* Effect.fail(
        new InvalidPath({ path: resolvedPath, pathType: 'workflow' })
      );
    }).pipe(Effect.provideService(State, this.state));
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
    TPath extends keyof WorkflowBuilderMetadataWorkflowPayloads<TWorkflowMetadata> &
      string,
    TPayload = Get<
      WorkflowBuilderMetadataWorkflowPayloads<TWorkflowMetadata>,
      [TPath]
    >
  >(
    path: TPath,
    payload: PartialOnUndefinedDeep<{
      params: Get<TPayload, ['params']>;
      input: Get<TPayload, ['metadata', 'onStart', 'input']>;
    }>
  ) {
    const { params, input } = payload;
    return this.unsafeStartWorkflow(
      resolvePath(path, params ?? {}),
      input
    ).pipe(
      Effect.map((r) => r as Get<TPayload, ['metadata', 'onStart', 'return']>)
    );
  }

  startRootWorkflow<I extends Get<TWorkflowMetadata, ['onStart', 'input']>>(
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
    TPath extends keyof WorkflowBuilderMetadataWorkflowPayloads<TWorkflowMetadata> &
      string,
    TPayload = Get<
      WorkflowBuilderMetadataWorkflowPayloads<TWorkflowMetadata>,
      [TPath]
    >
  >(
    path: TPath,
    payload: PartialOnUndefinedDeep<{
      params: Get<TPayload, ['params']>;
      input: Get<TPayload, ['metadata', 'onCancel', 'input']>;
    }>
  ) {
    const { params, input } = payload;
    return this.unsafeCancelWorkflow(
      resolvePath(path, params ?? {}),
      input
    ).pipe(
      Effect.map((r) => r as Get<TPayload, ['metadata', 'onCancel', 'return']>)
    );
  }

  cancelRootWorkflow<I extends Get<TWorkflowMetadata, ['onCancel', 'input']>>(
    ...input: undefined extends I ? [I?] : [I]
  ) {
    return this.unsafeCancelWorkflow([], input).pipe(
      Effect.map((r) => r as Get<TWorkflowMetadata, ['onCancel', 'return']>)
    );
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
    TPath extends keyof WorkflowBuilderMetadataWorkflowPayloads<TWorkflowMetadata> &
      string,
    TPayload = Get<
      WorkflowBuilderMetadataWorkflowPayloads<TWorkflowMetadata>,
      [TPath]
    >
  >(
    path: TPath,
    payload: PartialOnUndefinedDeep<{
      params: Get<TPayload, ['params']>;
      context: Get<TPayload, ['metadata', 'context']>;
    }>
  ) {
    const { params, context } = payload;
    return this.unsafeUpdateWorkflowContext(
      resolvePath(path, params ?? {}),
      context
    );
  }

  updateRootWorkflowContext<
    TPath extends keyof WorkflowBuilderMetadataWorkflowPayloads<TWorkflowMetadata> &
      string
  >(
    path: TPath,
    payload: PartialOnUndefinedDeep<{
      context: Get<TWorkflowMetadata, ['metadata', 'context']>;
    }>
  ) {
    const self = this;
    return Effect.gen(function* () {
      const executionPlan = yield* self.workflowPathToExecutionPlan(
        pathAsArray(path)
      );

      yield* self.state.updateWorkflowContext(
        executionPlan.workflow.id,
        payload.context
      );
    }).pipe(Effect.provideService(State, this.state));
  }

  unsafeGetWorkflowState(path: readonly string[]) {
    const self = this;

    return Effect.gen(function* () {
      const executionPlan = yield* self.workflowPathToExecutionPlan(path);

      return yield* self.state.getWorkflow(executionPlan.workflow.id);
    }).pipe(Effect.provideService(State, this.state));
  }

  getWorkflowState<
    TPath extends keyof WorkflowBuilderMetadataWorkflowPayloads<TWorkflowMetadata> &
      string,
    TPayload = Get<
      WorkflowBuilderMetadataWorkflowPayloads<TWorkflowMetadata>,
      [TPath]
    >
  >(
    path: TPath,
    payload: PartialOnUndefinedDeep<{
      params: Get<TPayload, ['params']>;
    }>
  ) {
    const self = this;
    return Effect.gen(function* () {
      return yield* self.unsafeGetWorkflowState(
        resolvePath(path, payload.params ?? {})
      );
    }).pipe(
      Effect.map(
        (r) => r as WorkflowInstance<Get<TPayload, ['metadata', 'context']>>
      )
    );
  }

  getRootWorkflowState() {
    const self = this;
    return Effect.gen(function* () {
      return yield* self.unsafeGetWorkflowState([]);
    }).pipe(
      Effect.map(
        (r) =>
          r as WorkflowInstance<Get<TWorkflowMetadata, ['metadata', 'context']>>
      )
    );
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
    TPath extends keyof WorkflowBuilderMetadataTaskPayloads<TWorkflowMetadata>,
    TPayload = WorkflowBuilderMetadataTaskPayloads<TWorkflowMetadata>[TPath]
  >(
    path: TPath & string,
    payload: PartialOnUndefinedDeep<{
      params: NeverAsUndefined<Get<TPayload, ['params']>>;
      input: Get<TPayload, ['metadata', 'onStart', 'input']>;
    }>
  ) {
    const { input, params } = payload;

    return pipe(
      this.unsafeStartTask(resolvePath(path, params ?? {}), input, true),
      Effect.map((r) => r as Get<TPayload, ['metadata', 'onStart', 'return']>)
    );
  }

  startCompositeTask<
    TPath extends keyof WorkflowBuilderMetadataCompositeTaskPayloads<TWorkflowMetadata>,
    TPayload = WorkflowBuilderMetadataCompositeTaskPayloads<TWorkflowMetadata>[TPath]
  >(
    path: TPath & string,
    payload: PartialOnUndefinedDeep<{
      params: NeverAsUndefined<Get<TPayload, ['params']>>;
      input: Get<TPayload, ['metadata', 'onStart', 'input']>;
    }>
  ) {
    const { input, params } = payload;

    return pipe(
      this.unsafeStartTask(resolvePath(path, params ?? {}), input, true),
      Effect.map((r) => r as Get<TPayload, ['metadata', 'onStart', 'return']>)
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
    TPath extends keyof WorkflowBuilderMetadataTaskPayloads<TWorkflowMetadata> &
      string,
    TPayload = Get<
      WorkflowBuilderMetadataTaskPayloads<TWorkflowMetadata>,
      [TPath]
    >
  >(
    path: TPath,
    payload: PartialOnUndefinedDeep<{
      params: NeverAsUndefined<Get<TPayload, ['params']>>;
      payload: NeverAsUndefined<Get<TPayload, ['workItemPayload']>>;
    }>
  ) {
    const { params, payload: workItemPayload } = payload;

    return pipe(
      this.unsafeInitializeWorkItem(
        resolvePath(path, params ?? {}),
        workItemPayload,
        true
      ),
      Effect.map(
        (r) =>
          r as WorkItemInstance<
            NeverAsUndefined<Get<TPayload, ['workItemPayload']>>
          >
      )
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
    TPath extends keyof WorkflowBuilderMetadataWorkItemPayloads<TWorkflowMetadata> &
      string,
    TPayload = Get<
      WorkflowBuilderMetadataWorkItemPayloads<TWorkflowMetadata>,
      [TPath]
    >
  >(
    path: TPath,
    payload: PartialOnUndefinedDeep<{
      params: Get<TPayload, ['params']>;
      input: Get<TPayload, ['metadata', 'onStart', 'input']>;
    }>
  ) {
    const { params, input } = payload;

    return pipe(
      this.unsafeStartWorkItem(resolvePath(path, params ?? {}), input, true),
      Effect.map((r) => r as Get<TPayload, ['metadata', 'onStart', 'return']>)
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
    TPath extends keyof WorkflowBuilderMetadataWorkItemPayloads<TWorkflowMetadata> &
      string,
    TPayload = Get<
      WorkflowBuilderMetadataWorkItemPayloads<TWorkflowMetadata>,
      [TPath]
    >
  >(
    path: TPath,
    payload: PartialOnUndefinedDeep<{
      params: Get<TPayload, ['params']>;
      input: Get<TPayload, ['metadata', 'onComplete', 'input']>;
    }>
  ) {
    const { params, input } = payload;

    return pipe(
      this.unsafeCompleteWorkItem(resolvePath(path, params ?? {}), input, true),
      Effect.map(
        (r) => r as Get<TPayload, ['metadata', 'onComplete', 'return']>
      )
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
    TPath extends keyof WorkflowBuilderMetadataWorkItemPayloads<TWorkflowMetadata> &
      string,
    TPayload = Get<
      WorkflowBuilderMetadataWorkItemPayloads<TWorkflowMetadata>,
      [TPath]
    >
  >(
    path: TPath,
    payload: PartialOnUndefinedDeep<{
      params: Get<TPayload, ['params']>;
      input: Get<TPayload, ['metadata', 'onCancel', 'input']>;
    }>
  ) {
    const { params, input } = payload;

    return pipe(
      this.unsafeCancelWorkItem(resolvePath(path, params ?? {}), input, true),
      Effect.map((r) => r as Get<TPayload, ['metadata', 'onCancel', 'return']>)
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
    TPath extends keyof WorkflowBuilderMetadataWorkItemPayloads<TWorkflowMetadata> &
      string,
    TPayload = Get<
      WorkflowBuilderMetadataWorkItemPayloads<TWorkflowMetadata>,
      [TPath]
    >
  >(
    path: TPath,
    payload: PartialOnUndefinedDeep<{
      params: Get<TPayload, ['params']>;
      input: Get<TPayload, ['metadata', 'onCancel', 'input']>;
    }>
  ) {
    const { params, input } = payload;

    return pipe(
      this.unsafeFailWorkItem(resolvePath(path, params ?? {}), input, true),
      Effect.map((r) => r as Get<TPayload, ['metadata', 'onCancel', 'input']>)
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
    TPath extends keyof WorkflowBuilderMetadataWorkItemPayloads<TWorkflowMetadata> &
      string,
    TPayload = Get<
      WorkflowBuilderMetadataWorkItemPayloads<TWorkflowMetadata>,
      [TPath]
    >
  >(
    path: TPath,
    payload: PartialOnUndefinedDeep<{
      params: Get<TPayload, ['params']>;
      payload: Get<TPayload, ['metadata', 'payload']>;
    }>
  ) {
    const { params, payload: workItemPayload } = payload;
    return this.unsafeUpdateWorkItemPayload(
      resolvePath(path, params ?? {}),
      workItemPayload
    );
  }

  unsafeGetWorkItemState(path: readonly string[]) {
    const self = this;

    return Effect.gen(function* () {
      const executionPlan = yield* self.workItemPathToExecutionPlan(path);

      return yield* self.state.getWorkItem(
        executionPlan.workflow.id,
        executionPlan.task.name,
        executionPlan.workItemId
      );
    }).pipe(Effect.provideService(State, this.state));
  }

  getWorkItemState<
    TPath extends keyof WorkflowBuilderMetadataWorkItemPayloads<TWorkflowMetadata> &
      string,
    TPayload = Get<
      WorkflowBuilderMetadataWorkItemPayloads<TWorkflowMetadata>,
      [TPath]
    >
  >(
    path: TPath,
    payload: PartialOnUndefinedDeep<{
      params: Get<TPayload, ['params']>;
    }>
  ) {
    const self = this;
    return Effect.gen(function* () {
      return yield* self.unsafeGetWorkItemState(
        resolvePath(path, payload.params ?? {})
      );
    }).pipe(
      Effect.map(
        (r) => r as WorkItemInstance<Get<TPayload, ['metadata', 'payload']>>
      )
    );
  }

  getState() {
    const self = this;
    return Effect.gen(function* () {
      return (yield* self.state.getState()) as StorePersistableState<TElementTypes['workflow'], TElementTypes['workItem'], TElementTypes['task']>;
    });
  }

  private emitStateChanges() {
    const stateChanges = this.stateChangeEmitter.drain();
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
        getWorkflowContext: () =>
          self.state
            .getWorkflow(input.workflowId)
            .pipe(Effect.map((w) => w.context)),
        updateWorkflowContext: (contextOrUpdater: unknown) =>
          Effect.gen(function* () {
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
          }),
      },
      queue: {
        offer: (item: ExecutionContextQueueItem) => self.queue.offer(item),
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

function makeStateChangeEmitter(): StateChangeEmitter {
  let stateChanges: StateChangeItem[] = [];
  return {
    emit: (item) => {
      stateChanges.push(item);
    },
    drain: () => {
      const result = stateChanges;
      stateChanges = [];
      return result;
    },
  };
}

type GetWorkflowR<T> = T extends Workflow<infer R, any, any> ? R : never;
type GetWorkflowE<T> = T extends Workflow<any, infer E, any> ? E : never;
type GetWorkflowContext<T> = T extends Workflow<any, any, infer C> ? C : never;
type GetWorkflowElementTypes<T> = T extends Workflow<
  any,
  any,
  any,
  any,
  infer ET
>
  ? ET
  : never;

type IsOptional<T> = T extends never
  ? true
  : undefined extends T
  ? true
  : false;

export function initialize<
  TWorkflow extends Workflow<any, any, any, any, any>,
  TWorkflowR extends GetWorkflowR<TWorkflow> = GetWorkflowR<TWorkflow>,
  TWorkflowE extends GetWorkflowE<TWorkflow> = GetWorkflowE<TWorkflow>,
  TWorkflowContext extends GetWorkflowContext<TWorkflow> = GetWorkflowContext<TWorkflow>,
  TWorkflowMetadata extends WorkflowBuilderMetadata = GetWorkflowMetadata<TWorkflow>
>(
  ...args: IsOptional<TWorkflowContext> extends true
    ? [TWorkflow] | [TWorkflow, TWorkflowContext?]
    : [TWorkflow, TWorkflowContext]
) {
  const [workflow, context] = args;
  return Effect.gen(function* () {
    const queue = yield* Queue.unbounded<ExecutionContextQueueItem>();
    const maybeIdGenerator = yield* Effect.serviceOption(IdGenerator);
    const idGenerator = Option.getOrElse(
      maybeIdGenerator,
      () => nanoidIdGenerator
    );
    const stateChangeLogger = makeStateChangeEmitter();

    const state = new StateImpl.StateImpl(idGenerator, stateChangeLogger);

    const { id } = yield* workflow
      .initialize(context)
      .pipe(Effect.provideService(State, state));

    const interpreter = new Service<
      TWorkflowMetadata,
      GetWorkflowElementTypes<TWorkflow>,
      TWorkflowR,
      TWorkflowE
    >(id, workflow, state, queue, stateChangeLogger);

    return interpreter;
  });
}

export function resume<
  TWorkflow extends Workflow<any, any, any, any, any>,
  TWorkflowR extends GetWorkflowR<TWorkflow> = GetWorkflowR<TWorkflow>,
  TWorkflowE extends GetWorkflowE<TWorkflow> = GetWorkflowE<TWorkflow>,
  TWorkflowElementTypes extends GetWorkflowElementTypes<TWorkflow> = GetWorkflowElementTypes<TWorkflow>,
  TWorkflowMetadata extends WorkflowBuilderMetadata = GetWorkflowMetadata<TWorkflow>
>(
  workflow: TWorkflow,
  resumableState: StorePersistableState<
    TWorkflowElementTypes['workflow'],
    TWorkflowElementTypes['workItem'],
    TWorkflowElementTypes['task']
  >
) {
  return Effect.gen(function* () {
    const queue = yield* Queue.unbounded<ExecutionContextQueueItem>();
    const maybeIdGenerator = yield* Effect.serviceOption(IdGenerator);
    const idGenerator = Option.getOrElse(
      maybeIdGenerator,
      () => nanoidIdGenerator
    );

    const stateChangeEmitter = makeStateChangeEmitter();

    const state = new StateImpl.StateImpl(
      idGenerator,
      stateChangeEmitter,
      resumableState
    );
    const rootWorkflows = resumableState.workflows.filter((w) => !w.parent);
    const rootWorkflow = rootWorkflows[0];

    if (!rootWorkflow || rootWorkflows.length > 1) {
      return yield* Effect.fail(new InvalidResumableState({}));
    }

    const interpreter = new Service<
      TWorkflowMetadata,
      TWorkflowElementTypes,
      TWorkflowR,
      TWorkflowE
    >(rootWorkflow.id, workflow, state, queue, stateChangeEmitter);

    return interpreter;
  });
}
