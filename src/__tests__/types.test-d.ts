import { Effect } from 'effect';
import { describe, expectTypeOf } from 'vitest';

import * as E from '../errors.js';
import * as T from '../types.js';

type Context = { context: boolean };
type ChildContext = { childContext: boolean };
type WorkItemPayload = { payload: boolean };

describe('types', () => {
  describe('UpdateWorkflowContext', () => {
    expectTypeOf<T.UpdateWorkflowContext<Context>>().toEqualTypeOf<
      (
        contextOrUpdater: Context | ((context: Context) => Context)
      ) => Effect.Effect<void, E.WorkflowDoesNotExist>
    >();
  });

  describe('DefaultTaskOrWorkItemActivityPayload', () => {
    expectTypeOf<T.DefaultTaskActivityPayload<Context>>().toEqualTypeOf<{
      getWorkflowContext: () => Effect.Effect<Context, E.WorkflowDoesNotExist>;
      updateWorkflowContext: T.UpdateWorkflowContext<Context>;
    }>();
  });

  describe('TaskOnStartPayload', () => {
    expectTypeOf<T.TaskOnDisablePayload<Context>>().toEqualTypeOf<
      T.DefaultTaskActivityPayload<Context> & {
        disableTask: () => Effect.Effect<
          void,
          | E.TaskDoesNotExist
          | E.TaskDoesNotExistInStore
          | E.InvalidTaskStateTransition
        >;
      }
    >();
  });

  describe('TaskOnEnablePayload', () => {
    expectTypeOf<T.TaskOnEnablePayload<Context>>().toEqualTypeOf<
      T.DefaultTaskActivityPayload<Context> & {
        enableTask: () => Effect.Effect<
          {
            enqueueStartTask: (input?: unknown) => Effect.Effect<void>;
          },
          | E.TaskDoesNotExist
          | E.TaskDoesNotExistInStore
          | E.ConditionDoesNotExist
          | E.ConditionDoesNotExistInStore
          | E.InvalidTaskStateTransition
        >;
      }
    >();
  });

  describe('TaskOnStartPayload', () => {
    describe('TPayload !== undefined, TStartWorkItemInput !== undefined', () => {
      expectTypeOf<
        T.TaskOnStartPayload<
          Context,
          WorkItemPayload,
          { startWorkItemInput: true }
        >
      >().toEqualTypeOf<
        T.DefaultTaskActivityPayload<Context> & {
          startTask: () => Effect.Effect<
            {
              enqueueStartWorkItem(
                id: T.WorkItemId,
                input: { startWorkItemInput: true }
              ): Effect.Effect<void>;
              initializeWorkItem: (
                payload: WorkItemPayload
              ) => Effect.Effect<
                T.WorkItemInstance<WorkItemPayload>,
                E.TaskDoesNotExistInStore | E.InvalidTaskState
              >;
            },
            | E.TaskDoesNotExist
            | E.TaskDoesNotExistInStore
            | E.ConditionDoesNotExist
            | E.ConditionDoesNotExistInStore
            | E.InvalidTaskStateTransition
          >;
        }
      >();
    });

    describe('TPayload === undefined, TStartWorkItemInput !== undefined', () => {
      expectTypeOf<
        T.TaskOnStartPayload<Context, undefined, { startWorkItemInput: true }>
      >().toEqualTypeOf<
        T.DefaultTaskActivityPayload<Context> & {
          startTask: () => Effect.Effect<
            {
              enqueueStartWorkItem(
                id: T.WorkItemId,
                input: { startWorkItemInput: true }
              ): Effect.Effect<void>;
              initializeWorkItem: (
                payload?: undefined
              ) => Effect.Effect<
                T.WorkItemInstance<undefined>,
                E.TaskDoesNotExistInStore | E.InvalidTaskState
              >;
            },
            | E.TaskDoesNotExist
            | E.TaskDoesNotExistInStore
            | E.ConditionDoesNotExist
            | E.ConditionDoesNotExistInStore
            | E.InvalidTaskStateTransition
          >;
        }
      >();
    });

    describe('TPayload !== undefined, TStartWorkItemInput === undefined', () => {
      expectTypeOf<
        T.TaskOnStartPayload<Context, WorkItemPayload, undefined>
      >().toEqualTypeOf<
        T.DefaultTaskActivityPayload<Context> & {
          startTask: () => Effect.Effect<
            {
              enqueueStartWorkItem(
                id: T.WorkItemId,
                input?: undefined
              ): Effect.Effect<void>;
              initializeWorkItem: (
                payload: WorkItemPayload
              ) => Effect.Effect<
                T.WorkItemInstance<WorkItemPayload>,
                E.TaskDoesNotExistInStore | E.InvalidTaskState
              >;
            },
            | E.TaskDoesNotExist
            | E.TaskDoesNotExistInStore
            | E.ConditionDoesNotExist
            | E.ConditionDoesNotExistInStore
            | E.InvalidTaskStateTransition
          >;
        }
      >();
    });

    describe('TPayload === undefined, TStartWorkItemInput === undefined', () => {
      expectTypeOf<
        T.TaskOnStartPayload<Context, undefined, undefined>
      >().toEqualTypeOf<
        T.DefaultTaskActivityPayload<Context> & {
          startTask: () => Effect.Effect<
            {
              enqueueStartWorkItem(
                id: T.WorkItemId,
                input?: undefined
              ): Effect.Effect<void>;
              initializeWorkItem: (
                payload?: undefined
              ) => Effect.Effect<
                T.WorkItemInstance<undefined>,
                E.TaskDoesNotExistInStore | E.InvalidTaskState
              >;
            },
            | E.TaskDoesNotExist
            | E.TaskDoesNotExistInStore
            | E.ConditionDoesNotExist
            | E.ConditionDoesNotExistInStore
            | E.InvalidTaskStateTransition
          >;
        }
      >();
    });
  });

  describe('CompositeTaskOnStartPayload', () => {
    describe('TPayload !== undefined, TStartWorkflowInput !== undefined', () => {
      expectTypeOf<
        T.CompositeTaskOnStartPayload<
          Context,
          WorkItemPayload,
          { startWorkflowInput: boolean }
        >
      >().toEqualTypeOf<
        T.DefaultTaskActivityPayload<Context> & {
          startTask: () => Effect.Effect<
            {
              enqueueStartWorkflow(
                id: T.WorkflowId,
                input: { startWorkflowInput: boolean }
              ): Effect.Effect<void>;
              initializeWorkflow: (
                context: WorkItemPayload
              ) => Effect.Effect<
                T.WorkflowInstance<WorkItemPayload>,
                E.TaskDoesNotExistInStore
              >;
            },
            | E.TaskDoesNotExist
            | E.TaskDoesNotExistInStore
            | E.ConditionDoesNotExist
            | E.ConditionDoesNotExistInStore
            | E.InvalidTaskStateTransition
          >;
        }
      >();
    });
    describe('TPayload !== undefined, TStartWorkflowInput === undefined', () => {
      expectTypeOf<
        T.CompositeTaskOnStartPayload<Context, WorkItemPayload, undefined>
      >().toEqualTypeOf<
        T.DefaultTaskActivityPayload<Context> & {
          startTask: () => Effect.Effect<
            {
              enqueueStartWorkflow(
                id: T.WorkflowId,
                input?: undefined
              ): Effect.Effect<void>;
              initializeWorkflow: (
                context: WorkItemPayload
              ) => Effect.Effect<
                T.WorkflowInstance<WorkItemPayload>,
                E.TaskDoesNotExistInStore
              >;
            },
            | E.TaskDoesNotExist
            | E.TaskDoesNotExistInStore
            | E.ConditionDoesNotExist
            | E.ConditionDoesNotExistInStore
            | E.InvalidTaskStateTransition
          >;
        }
      >();
    });
    describe('TPayload === undefined, TStartWorkflowInput !== undefined', () => {
      expectTypeOf<
        T.CompositeTaskOnStartPayload<
          Context,
          undefined,
          { startWorkflowInput: boolean }
        >
      >().toEqualTypeOf<
        T.DefaultTaskActivityPayload<Context> & {
          startTask: () => Effect.Effect<
            {
              enqueueStartWorkflow(
                id: T.WorkflowId,
                input: { startWorkflowInput: boolean }
              ): Effect.Effect<void>;
              initializeWorkflow: (
                context?: undefined
              ) => Effect.Effect<
                T.WorkflowInstance<undefined>,
                E.TaskDoesNotExistInStore
              >;
            },
            | E.TaskDoesNotExist
            | E.TaskDoesNotExistInStore
            | E.ConditionDoesNotExist
            | E.ConditionDoesNotExistInStore
            | E.InvalidTaskStateTransition
          >;
        }
      >();
    });
    describe('TPayload === undefined, TStartWorkflowInput === undefined', () => {
      expectTypeOf<
        T.CompositeTaskOnStartPayload<Context, undefined, undefined>
      >().toEqualTypeOf<
        T.DefaultTaskActivityPayload<Context> & {
          startTask: () => Effect.Effect<
            {
              enqueueStartWorkflow(
                id: T.WorkflowId,
                input?: undefined
              ): Effect.Effect<void>;
              initializeWorkflow: (
                context?: undefined
              ) => Effect.Effect<
                T.WorkflowInstance<undefined>,
                E.TaskDoesNotExistInStore
              >;
            },
            | E.TaskDoesNotExist
            | E.TaskDoesNotExistInStore
            | E.ConditionDoesNotExist
            | E.ConditionDoesNotExistInStore
            | E.InvalidTaskStateTransition
          >;
        }
      >();
    });
  });

  describe('TaskOnCompletePayload', () => {
    expectTypeOf<
      T.TaskOnCompletePayload<Context, WorkItemPayload>
    >().toEqualTypeOf<
      T.DefaultTaskActivityPayload<Context> & {
        getWorkItems: () => Effect.Effect<
          T.WorkItemInstance<WorkItemPayload>[],
          E.TaskDoesNotExistInStore
        >;
        completeTask: () => Effect.Effect<
          void,
          | E.TaskDoesNotExist
          | E.TaskDoesNotExistInStore
          | E.ConditionDoesNotExist
          | E.ConditionDoesNotExistInStore
          | E.InvalidTaskState
          | E.WorkflowDoesNotExist
          | E.WorkItemDoesNotExist
          | E.EndConditionDoesNotExist
          | E.InvalidTaskStateTransition
          | E.InvalidWorkflowStateTransition
          | E.InvalidWorkItemTransition
        >;
      }
    >();
  });

  describe('CompositeTaskOnCompletePayload', () => {
    expectTypeOf<
      T.CompositeTaskOnCompletePayload<Context, ChildContext>
    >().toEqualTypeOf<
      T.DefaultTaskActivityPayload<Context> & {
        getWorkflows: () => Effect.Effect<
          T.WorkflowInstance<ChildContext>[],
          E.TaskDoesNotExistInStore
        >;
        completeTask: () => Effect.Effect<
          void,
          | E.TaskDoesNotExist
          | E.TaskDoesNotExistInStore
          | E.ConditionDoesNotExist
          | E.ConditionDoesNotExistInStore
          | E.InvalidTaskState
          | E.WorkflowDoesNotExist
          | E.WorkItemDoesNotExist
          | E.EndConditionDoesNotExist
          | E.InvalidTaskStateTransition
          | E.InvalidWorkflowStateTransition
          | E.InvalidWorkItemTransition
        >;
      }
    >();
  });

  describe('TaskOnCancelPayload', () => {
    expectTypeOf<
      T.TaskOnCancelPayload<Context, WorkItemPayload>
    >().toEqualTypeOf<
      T.DefaultTaskActivityPayload<Context> & {
        getWorkItems: () => Effect.Effect<
          T.WorkItemInstance<WorkItemPayload>[],
          E.TaskDoesNotExistInStore
        >;
        cancelTask: () => Effect.Effect<
          void,
          | E.TaskDoesNotExist
          | E.TaskDoesNotExistInStore
          | E.ConditionDoesNotExist
          | E.ConditionDoesNotExistInStore
          | E.InvalidTaskState
          | E.WorkflowDoesNotExist
          | E.WorkItemDoesNotExist
          | E.EndConditionDoesNotExist
          | E.InvalidTaskStateTransition
          | E.InvalidWorkflowStateTransition
          | E.InvalidWorkItemTransition
        >;
      }
    >();
  });

  describe('CompositeTaskOnCancelPayload', () => {
    expectTypeOf<
      T.CompositeTaskOnCancelPayload<Context, ChildContext>
    >().toEqualTypeOf<
      T.DefaultTaskActivityPayload<Context> & {
        getWorkflows: () => Effect.Effect<
          T.WorkflowInstance<ChildContext>[],
          E.TaskDoesNotExistInStore
        >;
        cancelTask: () => Effect.Effect<
          void,
          | E.ConditionDoesNotExist
          | E.ConditionDoesNotExistInStore
          | E.EndConditionDoesNotExist
          | E.InvalidTaskState
          | E.InvalidTaskStateTransition
          | E.InvalidWorkflowStateTransition
          | E.InvalidWorkItemTransition
          | E.TaskDoesNotExist
          | E.TaskDoesNotExistInStore
          | E.WorkflowDoesNotExist
          | E.WorkItemDoesNotExist
        >;
      }
    >();
  });

  describe('TaskOnFailPayload', () => {
    expectTypeOf<T.TaskOnFailPayload<Context, WorkItemPayload>>().toEqualTypeOf<
      T.DefaultTaskActivityPayload<Context> & {
        getWorkItems: () => Effect.Effect<
          T.WorkItemInstance<WorkItemPayload>[],
          E.TaskDoesNotExistInStore
        >;
        failTask: () => Effect.Effect<
          void,
          | E.TaskDoesNotExist
          | E.TaskDoesNotExistInStore
          | E.ConditionDoesNotExist
          | E.ConditionDoesNotExistInStore
          | E.InvalidTaskState
          | E.WorkflowDoesNotExist
          | E.WorkItemDoesNotExist
          | E.EndConditionDoesNotExist
          | E.InvalidTaskStateTransition
          | E.InvalidWorkflowStateTransition
          | E.InvalidWorkItemTransition
        >;
      }
    >();
  });

  describe('CompositeTaskOnFailPayload', () => {
    expectTypeOf<
      T.CompositeTaskOnFailPayload<Context, ChildContext>
    >().toEqualTypeOf<
      T.DefaultTaskActivityPayload<Context> & {
        getWorkflows: () => Effect.Effect<
          T.WorkflowInstance<ChildContext>[],
          E.TaskDoesNotExistInStore
        >;
        failTask: () => Effect.Effect<
          void,
          | E.ConditionDoesNotExist
          | E.ConditionDoesNotExistInStore
          | E.EndConditionDoesNotExist
          | E.InvalidTaskState
          | E.InvalidTaskStateTransition
          | E.InvalidWorkflowStateTransition
          | E.InvalidWorkItemTransition
          | E.TaskDoesNotExist
          | E.TaskDoesNotExistInStore
          | E.WorkflowDoesNotExist
          | E.WorkItemDoesNotExist
        >;
      }
    >();
  });

  describe('TaskActivities', () => {
    expectTypeOf<
      T.TaskActivities<Context, WorkItemPayload>
    >().branded.toEqualTypeOf<{
      onDisable: (payload: T.TaskOnDisablePayload<Context>) => T.UnknownEffect;
      onEnable: (payload: T.TaskOnEnablePayload<Context>) => T.UnknownEffect;
      onStart: (
        payload: T.TaskOnStartPayload<Context, any>,
        input?: any
      ) => T.UnknownEffect;
      onComplete: (
        payload: T.TaskOnCompletePayload<Context, WorkItemPayload>
      ) => T.UnknownEffect;
      onCancel: (
        payload: T.TaskOnCancelPayload<Context, WorkItemPayload>
      ) => T.UnknownEffect;
      onFail: (
        payload: T.TaskOnFailPayload<Context, WorkItemPayload>
      ) => T.UnknownEffect;
    }>();
  });

  describe('CompositeTaskActivities', () => {
    expectTypeOf<
      T.CompositeTaskActivities<Context, ChildContext>
    >().branded.toEqualTypeOf<{
      onDisable: (payload: T.TaskOnDisablePayload<Context>) => T.UnknownEffect;
      onEnable: (payload: T.TaskOnEnablePayload<Context>) => T.UnknownEffect;
      onStart: (
        payload: T.CompositeTaskOnStartPayload<Context, any>,
        input?: any
      ) => T.UnknownEffect;
      onComplete: (
        payload: T.CompositeTaskOnCompletePayload<Context, ChildContext>
      ) => T.UnknownEffect;
      onCancel: (
        payload: T.CompositeTaskOnCancelPayload<Context, ChildContext>
      ) => T.UnknownEffect;
      onFail: (
        payload: T.CompositeTaskOnFailPayload<Context, ChildContext>
      ) => T.UnknownEffect;
    }>();
  });

  describe('WorkItemOnStartPayload', () => {
    describe('TOnCompleteInput !== undefined, T.OnCancelInput !== undefined, TOnFailInput !== undefined', () => {
      expectTypeOf<
        T.WorkItemOnStartPayload<
          WorkItemPayload,
          { onCompleteInput: boolean },
          { onCancelInput: boolean },
          { onFailInput: boolean }
        >
      >().toEqualTypeOf<{
        getWorkItem: () => Effect.Effect<
          T.WorkItemInstance<WorkItemPayload>,
          E.WorkItemDoesNotExist | E.TaskDoesNotExistInStore
        >;
        updateWorkItemPayload: (
          payload: WorkItemPayload
        ) => Effect.Effect<void, E.WorkItemDoesNotExist>;
        startWorkItem: () => Effect.Effect<
          {
            enqueueCompleteWorkItem(input: {
              onCompleteInput: boolean;
            }): Effect.Effect<void>;
            enqueueCancelWorkItem(input: {
              onCancelInput: boolean;
            }): Effect.Effect<void>;
            enqueueFailWorkItem(input: {
              onFailInput: boolean;
            }): Effect.Effect<void>;
          },
          E.WorkItemDoesNotExist | E.InvalidWorkItemTransition
        >;
      }>();
    });

    describe('TOnCompleteInput === undefined, T.OnCancelInput !== undefined, TOnFailInput !== undefined', () => {
      expectTypeOf<
        T.WorkItemOnStartPayload<
          WorkItemPayload,
          undefined,
          { onCancelInput: boolean },
          { onFailInput: boolean }
        >
      >().toEqualTypeOf<{
        getWorkItem: () => Effect.Effect<
          T.WorkItemInstance<WorkItemPayload>,
          E.WorkItemDoesNotExist | E.TaskDoesNotExistInStore
        >;
        updateWorkItemPayload: (
          payload: WorkItemPayload
        ) => Effect.Effect<void, E.WorkItemDoesNotExist>;
        startWorkItem: () => Effect.Effect<
          {
            enqueueCompleteWorkItem(input?: undefined): Effect.Effect<void>;
            enqueueCancelWorkItem(input: {
              onCancelInput: boolean;
            }): Effect.Effect<void>;
            enqueueFailWorkItem(input: {
              onFailInput: boolean;
            }): Effect.Effect<void>;
          },
          E.WorkItemDoesNotExist | E.InvalidWorkItemTransition
        >;
      }>();
    });

    describe('TOnCompleteInput !== undefined, T.OnCancelInput === undefined, TOnFailInput !== undefined', () => {
      expectTypeOf<
        T.WorkItemOnStartPayload<
          WorkItemPayload,
          { onCompleteInput: boolean },
          undefined,
          { onFailInput: boolean }
        >
      >().toEqualTypeOf<{
        getWorkItem: () => Effect.Effect<
          T.WorkItemInstance<WorkItemPayload>,
          E.WorkItemDoesNotExist | E.TaskDoesNotExistInStore
        >;
        updateWorkItemPayload: (
          payload: WorkItemPayload
        ) => Effect.Effect<void, E.WorkItemDoesNotExist>;
        startWorkItem: () => Effect.Effect<
          {
            enqueueCompleteWorkItem(input: {
              onCompleteInput: boolean;
            }): Effect.Effect<void>;
            enqueueCancelWorkItem(input?: undefined): Effect.Effect<void>;
            enqueueFailWorkItem(input: {
              onFailInput: boolean;
            }): Effect.Effect<void>;
          },
          E.WorkItemDoesNotExist | E.InvalidWorkItemTransition
        >;
      }>();
    });

    describe('TOnCompleteInput !== undefined, T.OnCancelInput !== undefined, TOnFailInput === undefined', () => {
      expectTypeOf<
        T.WorkItemOnStartPayload<
          WorkItemPayload,
          { onCompleteInput: boolean },
          { onCancelInput: boolean },
          undefined
        >
      >().toEqualTypeOf<{
        getWorkItem: () => Effect.Effect<
          T.WorkItemInstance<WorkItemPayload>,
          E.WorkItemDoesNotExist | E.TaskDoesNotExistInStore
        >;
        updateWorkItemPayload: (
          payload: WorkItemPayload
        ) => Effect.Effect<void, E.WorkItemDoesNotExist>;
        startWorkItem: () => Effect.Effect<
          {
            enqueueCompleteWorkItem(input: {
              onCompleteInput: boolean;
            }): Effect.Effect<void>;
            enqueueCancelWorkItem(input: {
              onCancelInput: boolean;
            }): Effect.Effect<void>;
            enqueueFailWorkItem(input?: undefined): Effect.Effect<void>;
          },
          E.WorkItemDoesNotExist | E.InvalidWorkItemTransition
        >;
      }>();
    });

    describe('TOnCompleteInput === undefined, T.OnCancelInput === undefined, TOnFailInput === undefined', () => {
      expectTypeOf<
        T.WorkItemOnStartPayload<
          WorkItemPayload,
          undefined,
          undefined,
          undefined
        >
      >().toEqualTypeOf<{
        getWorkItem: () => Effect.Effect<
          T.WorkItemInstance<WorkItemPayload>,
          E.WorkItemDoesNotExist | E.TaskDoesNotExistInStore
        >;
        updateWorkItemPayload: (
          payload: WorkItemPayload
        ) => Effect.Effect<void, E.WorkItemDoesNotExist>;
        startWorkItem: () => Effect.Effect<
          {
            enqueueCompleteWorkItem(input?: undefined): Effect.Effect<void>;
            enqueueCancelWorkItem(input?: undefined): Effect.Effect<void>;
            enqueueFailWorkItem(input?: undefined): Effect.Effect<void>;
          },
          E.WorkItemDoesNotExist | E.InvalidWorkItemTransition
        >;
      }>();
    });
  });

  describe('WorkItemOnCompletePayload', () => {
    expectTypeOf<T.WorkItemOnCompletePayload<WorkItemPayload>>().toEqualTypeOf<{
      getWorkItem(): Effect.Effect<
        T.WorkItemInstance<WorkItemPayload>,
        E.WorkItemDoesNotExist | E.TaskDoesNotExistInStore
      >;
      updateWorkItemPayload: (
        workItemPayload: WorkItemPayload
      ) => Effect.Effect<void, E.WorkItemDoesNotExist>;
      completeWorkItem: () => Effect.Effect<
        void,
        E.WorkItemDoesNotExist | E.InvalidWorkItemTransition
      >;
    }>();
  });

  describe('WorkItemOnCancelPayload', () => {
    expectTypeOf<T.WorkItemOnCancelPayload<WorkItemPayload>>().toEqualTypeOf<{
      getWorkItem(): Effect.Effect<
        T.WorkItemInstance<WorkItemPayload>,
        E.WorkItemDoesNotExist | E.TaskDoesNotExistInStore
      >;
      updateWorkItemPayload: (
        workItemPayload: WorkItemPayload
      ) => Effect.Effect<void, E.WorkItemDoesNotExist>;
      cancelWorkItem: () => Effect.Effect<
        void,
        E.WorkItemDoesNotExist | E.InvalidWorkItemTransition
      >;
    }>();
  });

  describe('WorkItemOnFailPayload', () => {
    expectTypeOf<T.WorkItemOnFailPayload<WorkItemPayload>>().toEqualTypeOf<{
      getWorkItem(): Effect.Effect<
        T.WorkItemInstance<WorkItemPayload>,
        E.WorkItemDoesNotExist | E.TaskDoesNotExistInStore
      >;
      updateWorkItemPayload: (
        workItemPayload: WorkItemPayload
      ) => Effect.Effect<void, E.WorkItemDoesNotExist>;
      failWorkItem: () => Effect.Effect<
        void,
        E.WorkItemDoesNotExist | E.InvalidWorkItemTransition
      >;
    }>();
  });

  describe('WorkItemActivities', () => {
    expectTypeOf<T.WorkItemActivities<WorkItemPayload>>().toEqualTypeOf<{
      onStart: (
        payload: T.WorkItemOnStartPayload<WorkItemPayload, any, any, any>,
        input?: any
      ) => T.UnknownEffect;
      onComplete: (
        payload: T.WorkItemOnCompletePayload<WorkItemPayload>,
        input?: any
      ) => T.UnknownEffect;
      onCancel: (
        payload: T.WorkItemOnCancelPayload<WorkItemPayload>,
        input?: any
      ) => T.UnknownEffect;
      onFail: (
        payload: T.WorkItemOnFailPayload<WorkItemPayload>,
        input?: any
      ) => T.UnknownEffect;
    }>();
  });

  describe('ShouldTaskCompleteFn', () => {
    expectTypeOf<
      T.ShouldTaskCompleteFn<Context, WorkItemPayload, { R: true }, { E: true }>
    >().toEqualTypeOf<
      (payload: {
        getWorkflowContext: () => Effect.Effect<Context, any, any>;
        getWorkItems: () => Effect.Effect<
          T.WorkItemInstance<WorkItemPayload>[],
          E.TaskDoesNotExistInStore
        >;
      }) => Effect.Effect<boolean, { E: true }, { R: true }>
    >();
  });

  describe('ShouldTaskFailFn', () => {
    expectTypeOf<
      T.ShouldTaskFailFn<Context, WorkItemPayload, { R: true }, { E: true }>
    >().toEqualTypeOf<
      (payload: {
        getWorkflowContext: () => Effect.Effect<Context, any, any>;
        getWorkItems: () => Effect.Effect<
          T.WorkItemInstance<WorkItemPayload>[],
          E.TaskDoesNotExistInStore
        >;
      }) => Effect.Effect<boolean, { E: true }, { R: true }>
    >();
  });

  describe('ShouldCompositeTaskCompleteFn', () => {
    expectTypeOf<
      T.ShouldCompositeTaskCompleteFn<
        Context,
        { childWorkflowContext: true },
        { R: true },
        { E: true }
      >
    >().toEqualTypeOf<
      (payload: {
        getWorkflowContext: () => Effect.Effect<Context, any, any>;
        getWorkflows: () => Effect.Effect<
          T.WorkflowInstance<{ childWorkflowContext: true }>[],
          E.TaskDoesNotExistInStore
        >;
      }) => Effect.Effect<boolean, { E: true }, { R: true }>
    >();
  });

  describe('ShouldCompositeTaskFailFn', () => {
    expectTypeOf<
      T.ShouldCompositeTaskFailFn<
        Context,
        { childWorkflowContext: true },
        { R: true },
        { E: true }
      >
    >().toEqualTypeOf<
      (payload: {
        getWorkflowContext: () => Effect.Effect<Context, any, any>;
        getWorkflows: () => Effect.Effect<
          T.WorkflowInstance<{ childWorkflowContext: true }>[],
          E.TaskDoesNotExistInStore
        >;
      }) => Effect.Effect<boolean, { E: true }, { R: true }>
    >();
  });

  describe('DefaultWorkflowActivityPayload', () => {
    expectTypeOf<T.DefaultWorkflowActivityPayload<Context>>().toEqualTypeOf<{
      getWorkflowContext: () => Effect.Effect<Context, E.WorkflowDoesNotExist>;
      updateWorkflowContext: T.UpdateWorkflowContext<Context>;
    }>();
  });

  describe('WorkflowOnStartPayload', () => {
    expectTypeOf<T.WorkflowOnStartPayload<Context>>().toEqualTypeOf<
      T.DefaultWorkflowActivityPayload<Context> & {
        startWorkflow: () => Effect.Effect<
          void,
          | E.ConditionDoesNotExist
          | E.WorkflowDoesNotExist
          | E.StartConditionDoesNotExist
          | E.InvalidWorkflowStateTransition
          | E.ConditionDoesNotExistInStore
          | E.TaskDoesNotExist
          | E.TaskDoesNotExistInStore
          | E.InvalidTaskStateTransition
        >;
      }
    >();
  });

  describe('WorkflowOnCompletePayload', () => {
    expectTypeOf<T.WorkflowOnCompletePayload<Context>>().toEqualTypeOf<
      T.DefaultWorkflowActivityPayload<Context> & {
        completeWorkflow: () => Effect.Effect<
          void,
          | E.ConditionDoesNotExist
          | E.WorkflowDoesNotExist
          | E.InvalidWorkflowStateTransition
          | E.ConditionDoesNotExistInStore
          | E.TaskDoesNotExist
          | E.TaskDoesNotExistInStore
          | E.InvalidTaskStateTransition
          | E.InvalidTaskState
          | E.EndConditionDoesNotExist
          | E.WorkItemDoesNotExist
          | E.InvalidWorkItemTransition
        >;
      }
    >();
  });

  describe('WorkflowOnCancelPayload', () => {
    expectTypeOf<T.WorkflowOnCancelPayload<Context>>().toEqualTypeOf<
      T.DefaultWorkflowActivityPayload<Context> & {
        cancelWorkflow: () => Effect.Effect<
          void,
          | E.ConditionDoesNotExist
          | E.WorkflowDoesNotExist
          | E.InvalidWorkflowStateTransition
          | E.ConditionDoesNotExistInStore
          | E.TaskDoesNotExist
          | E.TaskDoesNotExistInStore
          | E.InvalidTaskStateTransition
          | E.InvalidTaskState
          | E.EndConditionDoesNotExist
          | E.WorkItemDoesNotExist
          | E.InvalidWorkItemTransition
        >;
      }
    >();
  });

  describe('WorkflowOnFailPayload', () => {
    expectTypeOf<T.WorkflowOnFailPayload<Context>>().toEqualTypeOf<
      T.DefaultWorkflowActivityPayload<Context> & {
        failWorkflow: () => Effect.Effect<
          void,
          | E.ConditionDoesNotExist
          | E.WorkflowDoesNotExist
          | E.InvalidWorkflowStateTransition
          | E.ConditionDoesNotExistInStore
          | E.TaskDoesNotExist
          | E.TaskDoesNotExistInStore
          | E.InvalidTaskStateTransition
          | E.InvalidTaskState
          | E.EndConditionDoesNotExist
          | E.WorkItemDoesNotExist
          | E.InvalidWorkItemTransition
        >;
      }
    >();
  });

  describe('WorkflowActivities', () => {
    expectTypeOf<T.WorkflowActivities<Context>>().toEqualTypeOf<{
      onStart: (
        payload: T.WorkflowOnStartPayload<Context>,
        input?: any
      ) => T.UnknownEffect;
      onComplete: (
        payload: T.WorkflowOnCompletePayload<Context>,
        input?: any
      ) => T.UnknownEffect;
      onCancel: (
        payload: T.WorkflowOnCancelPayload<Context>,
        input?: any
      ) => T.UnknownEffect;
      onFail: (
        payload: T.WorkflowOnFailPayload<Context>,
        input?: any
      ) => T.UnknownEffect;
    }>();
  });
});
