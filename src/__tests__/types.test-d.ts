import { Effect } from 'effect';
import { describe, expectTypeOf } from 'vitest';

import * as E from '../errors.js';
import * as T from '../types.js';

type Context = { context: boolean };

describe('types', () => {
  describe('UpdateWorkflowContext', () => {
    expectTypeOf<T.UpdateWorkflowContext<Context>>().toEqualTypeOf<
      (
        contextOrUpdater: Context | ((context: Context) => Context)
      ) => Effect.Effect<void, E.WorkflowDoesNotExist>
    >();
  });

  describe('DefaultTaskOrWorkItemActivityPayload', () => {
    expectTypeOf<
      T.DefaultTaskOrWorkItemActivityPayload<Context>
    >().toEqualTypeOf<{
      getWorkflowContext: () => Effect.Effect<Context, E.WorkflowDoesNotExist>;
      updateWorkflowContext: T.UpdateWorkflowContext<Context>;
    }>();
  });

  describe('TaskOnStartPayload', () => {
    expectTypeOf<T.TaskOnDisablePayload<Context>>().toEqualTypeOf<
      T.DefaultTaskOrWorkItemActivityPayload<Context> & {
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
      T.DefaultTaskOrWorkItemActivityPayload<Context> & {
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
          { payload: true },
          { startWorkItemInput: true }
        >
      >().toEqualTypeOf<
        T.DefaultTaskOrWorkItemActivityPayload<Context> & {
          startTask: () => Effect.Effect<
            {
              enqueueStartWorkItem(
                id: T.WorkItemId,
                input: { startWorkItemInput: true }
              ): Effect.Effect<void>;
              initializeWorkItem: (payload: {
                payload: true;
              }) => Effect.Effect<
                T.WorkItemInstance<{ payload: true }>,
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
        T.DefaultTaskOrWorkItemActivityPayload<Context> & {
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
        T.TaskOnStartPayload<Context, { payload: true }, undefined>
      >().toEqualTypeOf<
        T.DefaultTaskOrWorkItemActivityPayload<Context> & {
          startTask: () => Effect.Effect<
            {
              enqueueStartWorkItem(
                id: T.WorkItemId,
                input?: undefined
              ): Effect.Effect<void>;
              initializeWorkItem: (payload: {
                payload: true;
              }) => Effect.Effect<
                T.WorkItemInstance<{ payload: true }>,
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
        T.DefaultTaskOrWorkItemActivityPayload<Context> & {
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
          { payload: true },
          { startWorkflowInput: true }
        >
      >().toEqualTypeOf<
        T.DefaultTaskOrWorkItemActivityPayload<Context> & {
          startTask: () => Effect.Effect<
            {
              enqueueStartWorkflow(
                id: T.WorkflowId,
                input: { startWorkflowInput: true }
              ): Effect.Effect<void>;
              initializeWorkflow: (context: {
                payload: true;
              }) => Effect.Effect<
                T.WorkflowInstance<{ payload: true }>,
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
        T.CompositeTaskOnStartPayload<Context, { payload: true }, undefined>
      >().toEqualTypeOf<
        T.DefaultTaskOrWorkItemActivityPayload<Context> & {
          startTask: () => Effect.Effect<
            {
              enqueueStartWorkflow(
                id: T.WorkflowId,
                input?: undefined
              ): Effect.Effect<void>;
              initializeWorkflow: (context: {
                payload: true;
              }) => Effect.Effect<
                T.WorkflowInstance<{ payload: true }>,
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
          { startWorkflowInput: true }
        >
      >().toEqualTypeOf<
        T.DefaultTaskOrWorkItemActivityPayload<Context> & {
          startTask: () => Effect.Effect<
            {
              enqueueStartWorkflow(
                id: T.WorkflowId,
                input: { startWorkflowInput: true }
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
        T.DefaultTaskOrWorkItemActivityPayload<Context> & {
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
    expectTypeOf<T.TaskOnCompletePayload<Context>>().toEqualTypeOf<
      T.DefaultTaskOrWorkItemActivityPayload<Context> & {
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
    expectTypeOf<T.TaskOnCancelPayload<Context>>().toEqualTypeOf<
      T.DefaultTaskOrWorkItemActivityPayload<Context> & {
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

  describe('TaskOnFailPayload', () => {
    expectTypeOf<T.TaskOnFailPayload<Context>>().toEqualTypeOf<
      T.DefaultTaskOrWorkItemActivityPayload<Context> & {
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

  describe('TaskActivities', () => {
    expectTypeOf<T.TaskActivities<Context>>().toEqualTypeOf<{
      onDisable: (payload: T.TaskOnDisablePayload<Context>) => T.UnknownEffect;
      onEnable: (payload: T.TaskOnEnablePayload<Context>) => T.UnknownEffect;
      onStart: (
        payload: T.TaskOnStartPayload<Context, any>,
        input?: any
      ) => T.UnknownEffect;
      onComplete: (
        payload: T.TaskOnCompletePayload<Context>
      ) => T.UnknownEffect;
      onCancel: (payload: T.TaskOnCancelPayload<Context>) => T.UnknownEffect;
      onFail: (payload: T.TaskOnFailPayload<Context>) => T.UnknownEffect;
    }>();
  });

  describe('CompositeTaskActivities', () => {
    expectTypeOf<T.CompositeTaskActivities<Context>>().branded.toEqualTypeOf<{
      onDisable: (payload: T.TaskOnDisablePayload<Context>) => T.UnknownEffect;
      onEnable: (payload: T.TaskOnEnablePayload<Context>) => T.UnknownEffect;
      onStart: (
        payload: T.CompositeTaskOnStartPayload<Context, any>,
        input?: any
      ) => T.UnknownEffect;
      onComplete: (
        payload: T.TaskOnCompletePayload<Context>
      ) => T.UnknownEffect;
      onCancel: (payload: T.TaskOnCancelPayload<Context>) => T.UnknownEffect;
      onFail: (payload: T.TaskOnFailPayload<Context>) => T.UnknownEffect;
    }>();
  });

  describe('WorkItemOnStartPayload', () => {
    describe('TOnCompleteInput !== undefined, T.OnCancelInput !== undefined, TOnFailInput !== undefined', () => {
      expectTypeOf<
        T.WorkItemOnStartPayload<
          Context,
          { payload: true },
          { onCompleteInput: true },
          { onCancelInput: true },
          { onFailInput: true }
        >
      >().toEqualTypeOf<
        T.DefaultTaskOrWorkItemActivityPayload<Context> & {
          getWorkItem: () => Effect.Effect<
            T.WorkItemInstance<{ payload: true }>,
            E.WorkItemDoesNotExist | E.TaskDoesNotExistInStore
          >;
          updateWorkItemPayload: (payload: {
            payload: true;
          }) => Effect.Effect<void, E.WorkItemDoesNotExist>;
          startWorkItem: () => Effect.Effect<
            {
              enqueueCompleteWorkItem(input: {
                onCompleteInput: true;
              }): Effect.Effect<void>;
              enqueueCancelWorkItem(input: {
                onCancelInput: true;
              }): Effect.Effect<void>;
              enqueueFailWorkItem(input: {
                onFailInput: true;
              }): Effect.Effect<void>;
            },
            E.WorkItemDoesNotExist | E.InvalidWorkItemTransition
          >;
        }
      >();
    });

    describe('TOnCompleteInput === undefined, T.OnCancelInput !== undefined, TOnFailInput !== undefined', () => {
      expectTypeOf<
        T.WorkItemOnStartPayload<
          Context,
          { payload: true },
          undefined,
          { onCancelInput: true },
          { onFailInput: true }
        >
      >().toEqualTypeOf<
        T.DefaultTaskOrWorkItemActivityPayload<Context> & {
          getWorkItem: () => Effect.Effect<
            T.WorkItemInstance<{ payload: true }>,
            E.WorkItemDoesNotExist | E.TaskDoesNotExistInStore
          >;
          updateWorkItemPayload: (payload: {
            payload: true;
          }) => Effect.Effect<void, E.WorkItemDoesNotExist>;
          startWorkItem: () => Effect.Effect<
            {
              enqueueCompleteWorkItem(input?: undefined): Effect.Effect<void>;
              enqueueCancelWorkItem(input: {
                onCancelInput: true;
              }): Effect.Effect<void>;
              enqueueFailWorkItem(input: {
                onFailInput: true;
              }): Effect.Effect<void>;
            },
            E.WorkItemDoesNotExist | E.InvalidWorkItemTransition
          >;
        }
      >();
    });

    describe('TOnCompleteInput !== undefined, T.OnCancelInput === undefined, TOnFailInput !== undefined', () => {
      expectTypeOf<
        T.WorkItemOnStartPayload<
          Context,
          { payload: true },
          { onCompleteInput: true },
          undefined,
          { onFailInput: true }
        >
      >().toEqualTypeOf<
        T.DefaultTaskOrWorkItemActivityPayload<Context> & {
          getWorkItem: () => Effect.Effect<
            T.WorkItemInstance<{ payload: true }>,
            E.WorkItemDoesNotExist | E.TaskDoesNotExistInStore
          >;
          updateWorkItemPayload: (payload: {
            payload: true;
          }) => Effect.Effect<void, E.WorkItemDoesNotExist>;
          startWorkItem: () => Effect.Effect<
            {
              enqueueCompleteWorkItem(input: {
                onCompleteInput: true;
              }): Effect.Effect<void>;
              enqueueCancelWorkItem(input?: undefined): Effect.Effect<void>;
              enqueueFailWorkItem(input: {
                onFailInput: true;
              }): Effect.Effect<void>;
            },
            E.WorkItemDoesNotExist | E.InvalidWorkItemTransition
          >;
        }
      >();
    });

    describe('TOnCompleteInput !== undefined, T.OnCancelInput !== undefined, TOnFailInput === undefined', () => {
      expectTypeOf<
        T.WorkItemOnStartPayload<
          Context,
          { payload: true },
          { onCompleteInput: true },
          { onCancelInput: true },
          undefined
        >
      >().toEqualTypeOf<
        T.DefaultTaskOrWorkItemActivityPayload<Context> & {
          getWorkItem: () => Effect.Effect<
            T.WorkItemInstance<{ payload: true }>,
            E.WorkItemDoesNotExist | E.TaskDoesNotExistInStore
          >;
          updateWorkItemPayload: (payload: {
            payload: true;
          }) => Effect.Effect<void, E.WorkItemDoesNotExist>;
          startWorkItem: () => Effect.Effect<
            {
              enqueueCompleteWorkItem(input: {
                onCompleteInput: true;
              }): Effect.Effect<void>;
              enqueueCancelWorkItem(input: {
                onCancelInput: true;
              }): Effect.Effect<void>;
              enqueueFailWorkItem(input?: undefined): Effect.Effect<void>;
            },
            E.WorkItemDoesNotExist | E.InvalidWorkItemTransition
          >;
        }
      >();
    });

    describe('TOnCompleteInput === undefined, T.OnCancelInput === undefined, TOnFailInput === undefined', () => {
      expectTypeOf<
        T.WorkItemOnStartPayload<
          Context,
          { payload: true },
          undefined,
          undefined,
          undefined
        >
      >().toEqualTypeOf<
        T.DefaultTaskOrWorkItemActivityPayload<Context> & {
          getWorkItem: () => Effect.Effect<
            T.WorkItemInstance<{ payload: true }>,
            E.WorkItemDoesNotExist | E.TaskDoesNotExistInStore
          >;
          updateWorkItemPayload: (payload: {
            payload: true;
          }) => Effect.Effect<void, E.WorkItemDoesNotExist>;
          startWorkItem: () => Effect.Effect<
            {
              enqueueCompleteWorkItem(input?: undefined): Effect.Effect<void>;
              enqueueCancelWorkItem(input?: undefined): Effect.Effect<void>;
              enqueueFailWorkItem(input?: undefined): Effect.Effect<void>;
            },
            E.WorkItemDoesNotExist | E.InvalidWorkItemTransition
          >;
        }
      >();
    });
  });

  describe('WorkItemOnCompletePayload', () => {
    expectTypeOf<
      T.WorkItemOnCompletePayload<Context, { payload: true }>
    >().toEqualTypeOf<
      T.DefaultTaskOrWorkItemActivityPayload<Context> & {
        getWorkItem(): Effect.Effect<
          T.WorkItemInstance<{ payload: true }>,
          E.WorkItemDoesNotExist | E.TaskDoesNotExistInStore
        >;
        updateWorkItemPayload: (workItemPayload: {
          payload: true;
        }) => Effect.Effect<void, E.WorkItemDoesNotExist>;
        completeWorkItem: () => Effect.Effect<
          void,
          E.WorkItemDoesNotExist | E.InvalidWorkItemTransition
        >;
      }
    >();
  });

  describe('WorkItemOnCancelPayload', () => {
    expectTypeOf<
      T.WorkItemOnCancelPayload<Context, { payload: true }>
    >().toEqualTypeOf<
      T.DefaultTaskOrWorkItemActivityPayload<Context> & {
        getWorkItem(): Effect.Effect<
          T.WorkItemInstance<{ payload: true }>,
          E.WorkItemDoesNotExist | E.TaskDoesNotExistInStore
        >;
        updateWorkItemPayload: (workItemPayload: {
          payload: true;
        }) => Effect.Effect<void, E.WorkItemDoesNotExist>;
        cancelWorkItem: () => Effect.Effect<
          void,
          E.WorkItemDoesNotExist | E.InvalidWorkItemTransition
        >;
      }
    >();
  });

  describe('WorkItemOnFailPayload', () => {
    expectTypeOf<
      T.WorkItemOnFailPayload<Context, { payload: true }>
    >().toEqualTypeOf<
      T.DefaultTaskOrWorkItemActivityPayload<Context> & {
        getWorkItem(): Effect.Effect<
          T.WorkItemInstance<{ payload: true }>,
          E.WorkItemDoesNotExist | E.TaskDoesNotExistInStore
        >;
        updateWorkItemPayload: (workItemPayload: {
          payload: true;
        }) => Effect.Effect<void, E.WorkItemDoesNotExist>;
        failWorkItem: () => Effect.Effect<
          void,
          E.WorkItemDoesNotExist | E.InvalidWorkItemTransition
        >;
      }
    >();
  });

  describe('WorkItemActivities', () => {
    expectTypeOf<
      T.WorkItemActivities<Context, { payload: true }>
    >().toEqualTypeOf<{
      onStart: (
        payload: T.WorkItemOnStartPayload<
          Context,
          { payload: true },
          any,
          any,
          any
        >,
        input?: any
      ) => T.UnknownEffect;
      onComplete: (
        payload: T.WorkItemOnCompletePayload<Context, { payload: true }>,
        input?: any
      ) => T.UnknownEffect;
      onCancel: (
        payload: T.WorkItemOnCancelPayload<Context, { payload: true }>,
        input?: any
      ) => T.UnknownEffect;
      onFail: (
        payload: T.WorkItemOnFailPayload<Context, { payload: true }>,
        input?: any
      ) => T.UnknownEffect;
    }>();
  });

  describe('ShouldTaskCompleteFn', () => {
    expectTypeOf<
      T.ShouldTaskCompleteFn<
        Context,
        { workItemPayload: true },
        { R: true },
        { E: true }
      >
    >().toEqualTypeOf<
      (payload: {
        getWorkflowContext: () => Effect.Effect<Context, any, any>;
        workItems: T.WorkItemInstance<{ workItemPayload: true }>[];
      }) => Effect.Effect<boolean, { E: true }, { R: true }>
    >();
  });

  describe('ShouldTaskFailFn', () => {
    expectTypeOf<
      T.ShouldTaskFailFn<
        Context,
        { workItemPayload: true },
        { R: true },
        { E: true }
      >
    >().toEqualTypeOf<
      (payload: {
        getWorkflowContext: () => Effect.Effect<Context, any, any>;
        workItems: T.WorkItemInstance<{ workItemPayload: true }>[];
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
        workflows: T.WorkflowInstance<{ childWorkflowContext: true }>[];
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
        workflows: T.WorkflowInstance<{ childWorkflowContext: true }>[];
      }) => Effect.Effect<boolean, { E: true }, { R: true }>
    >();
  });

  describe('DefaultWorkflowActivityPayload', () => {
    describe('TParentWorkflowContext !== never', () => {
      expectTypeOf<
        T.DefaultWorkflowActivityPayload<
          Context,
          { parentWorkflowContext: true }
        >
      >().toEqualTypeOf<{
        getParentWorkflowContext: () => Effect.Effect<
          { parentWorkflowContext: true },
          E.ParentWorkflowDoesNotExist | E.WorkflowDoesNotExist
        >;
        updateParentWorkflowContext: (
          context:
            | { parentWorkflowContext: true }
            | ((context: { parentWorkflowContext: true }) => {
                parentWorkflowContext: true;
              })
        ) => Effect.Effect<
          void,
          E.ParentWorkflowDoesNotExist | E.WorkflowDoesNotExist
        >;
        getWorkflowContext: () => Effect.Effect<
          Context,
          E.WorkflowDoesNotExist
        >;
        updateWorkflowContext: T.UpdateWorkflowContext<Context>;
      }>();
    });

    describe('TParentWorkflowContext === never', () => {
      expectTypeOf<
        T.DefaultWorkflowActivityPayload<Context, never>
      >().toEqualTypeOf<{
        getParentWorkflowContext: never;
        updateParentWorkflowContext: never;
        getWorkflowContext: () => Effect.Effect<
          Context,
          E.WorkflowDoesNotExist
        >;
        updateWorkflowContext: T.UpdateWorkflowContext<Context>;
      }>();
    });
  });

  describe('WorkflowOnStartPayload', () => {
    expectTypeOf<
      T.WorkflowOnStartPayload<Context, { parentWorkflowContext: true }>
    >().toEqualTypeOf<
      T.DefaultWorkflowActivityPayload<
        Context,
        { parentWorkflowContext: true }
      > & {
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
    expectTypeOf<
      T.WorkflowOnCompletePayload<Context, { parentWorkflowContext: true }>
    >().toEqualTypeOf<
      T.DefaultWorkflowActivityPayload<
        Context,
        { parentWorkflowContext: true }
      > & {
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
    expectTypeOf<
      T.WorkflowOnCancelPayload<Context, { parentWorkflowContext: true }>
    >().toEqualTypeOf<
      T.DefaultWorkflowActivityPayload<
        Context,
        { parentWorkflowContext: true }
      > & {
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
    expectTypeOf<
      T.WorkflowOnFailPayload<Context, { parentWorkflowContext: true }>
    >().toEqualTypeOf<
      T.DefaultWorkflowActivityPayload<
        Context,
        { parentWorkflowContext: true }
      > & {
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
    expectTypeOf<
      T.WorkflowActivities<Context, { parentWorkflowContext: true }>
    >().toEqualTypeOf<{
      onStart: (
        payload: T.WorkflowOnStartPayload<
          Context,
          { parentWorkflowContext: true }
        >,
        input?: any
      ) => T.UnknownEffect;
      onComplete: (
        payload: T.WorkflowOnCompletePayload<
          Context,
          { parentWorkflowContext: true }
        >,
        input?: any
      ) => T.UnknownEffect;
      onCancel: (
        payload: T.WorkflowOnCancelPayload<
          Context,
          { parentWorkflowContext: true }
        >,
        input?: any
      ) => T.UnknownEffect;
      onFail: (
        payload: T.WorkflowOnFailPayload<
          Context,
          { parentWorkflowContext: true }
        >,
        input?: any
      ) => T.UnknownEffect;
    }>();
  });
});
