import { Effect } from 'effect';
import { Get, Simplify } from 'type-fest';

import { CompositeTask } from '../elements/CompositeTask.js';
import { Workflow } from '../elements/Workflow.js';
import {
  ConditionDoesNotExist,
  EndConditionDoesNotExist,
  StartConditionDoesNotExist,
  TaskDoesNotExist,
} from '../errors.js';
import {
  CompositeTaskActivities,
  CompositeTaskOnStartPayload,
  ConditionInstance,
  ElementTypes,
  JoinType,
  ShouldCompositeTaskCompleteFn,
  ShouldCompositeTaskFailFn,
  SplitType,
  TaskInstance,
  TaskOnCancelPayload,
  TaskOnCompletePayload,
  TaskOnDisablePayload,
  TaskOnEnablePayload,
  TaskOnFailPayload,
  TaskOnStartSym,
  WorkItemInstance,
  WorkflowInstance,
  activeWorkflowInstanceStates,
} from '../types.js';
import {
  AnyWorkflowBuilder,
  AnyWorkflowBuilderWithCorrectParentContext,
  WorkflowBuilderC,
  WorkflowBuilderE,
  WorkflowBuilderElementTypes,
  WorkflowBuilderMetadata,
  WorkflowBuilderR,
} from './WorkflowBuilder.js';

export type CompositeTaskBuilderContext<T> = T extends CompositeTaskBuilder<
  infer C,
  any,
  any,
  any,
  any
>
  ? C
  : never;

export type CompositeTaskBuilderSplitType<T> = T extends CompositeTaskBuilder<
  any,
  any,
  any,
  any,
  infer ST,
  any,
  any,
  any,
  any,
  any
>
  ? ST
  : never;

export type CompositeTaskBuilderActivitiesReturnType<T> =
  T extends CompositeTaskBuilder<any, any, any, any, any, infer AO>
    ? AO
    : never;

export type CompositeTaskBuilderR<T> = T extends CompositeTaskBuilder<
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  infer R
>
  ? R
  : never;

export type CompositeTaskBuilderE<T> = T extends CompositeTaskBuilder<
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  infer E
>
  ? E
  : never;

export type AnyCompositeTaskBuilder<C = unknown> = CompositeTaskBuilder<
  C,
  any,
  CompositeTaskActivities<C>,
  JoinType | undefined,
  SplitType | undefined
>;

export type InitializedCompositeTaskBuilder<C> = CompositeTaskBuilder<
  C,
  object,
  CompositeTaskActivities<C>,
  undefined,
  undefined
>;

type CompositeTaskBuilderCTM<T> = T extends CompositeTaskBuilder<
  any,
  any,
  any,
  any,
  any,
  infer CTM,
  any
>
  ? CTM
  : never;

type CompositeTaskBuilderWIM<T> = T extends CompositeTaskBuilder<
  any,
  any,
  any,
  any,
  any,
  any,
  infer WIM
>
  ? WIM
  : never;

export type CompositeTaskBuilderMetadata<
  T extends CompositeTaskBuilder<
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any
  >
> = Simplify<
  CompositeTaskBuilderCTM<T> & Record<string, CompositeTaskBuilderWIM<T>>
>;

interface CompositeTaskActivityMetadata<I, R> {
  input: I;
  return: R;
}

export type CompositeTaskElementTypes<T> = T extends CompositeTaskBuilder<
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  infer ET,
  any,
  any
>
  ? ET
  : never;

export class CompositeTaskBuilder<
  C,
  WC,
  TA extends CompositeTaskActivities<C>,
  JT extends JoinType | undefined,
  ST extends SplitType | undefined,
  CTM = object,
  WM = never,
  ET extends ElementTypes = {
    workflow: WorkflowInstance;
    workItem: WorkItemInstance;
    condition: ConditionInstance;
    task: TaskInstance;
  },
  R = never,
  E = never
> {
  joinType: JoinType | undefined;
  splitType: SplitType | undefined;
  private activities: TA = {} as TA;
  private workflowBuilder: AnyWorkflowBuilder;
  private shouldComplete: ShouldCompositeTaskCompleteFn<any, any> = ({
    workflows,
  }) => {
    const hasActiveWorkflows = workflows.some((w) =>
      activeWorkflowInstanceStates.has(w.state)
    );
    const hasCompletedWorkflows = workflows.some(
      (w) => w.state === 'completed'
    );
    return Effect.succeed(
      workflows.length > 0 && !hasActiveWorkflows && hasCompletedWorkflows
    );
  };
  private shouldFail: ShouldCompositeTaskFailFn<any, any> = ({ workflows }) => {
    const hasFailedItems = workflows.some((w) => w.state === 'failed');
    return Effect.succeed(hasFailedItems);
  };

  constructor(workflowBuilder: AnyWorkflowBuilder) {
    this.workflowBuilder = workflowBuilder;
  }

  withJoinType<T extends JoinType | undefined>(
    joinType: T
  ): CompositeTaskBuilder<C, WC, TA, T, ST, CTM, WM, ET, R, E> {
    this.joinType = joinType;
    return this;
  }

  withSplitType<T extends SplitType | undefined>(
    splitType: T
  ): CompositeTaskBuilder<C, WC, TA, JT, T, CTM, WM, ET, R, E> {
    this.splitType = splitType;
    return this;
  }

  initialize() {
    return this.onDisable(() => Effect.unit)
      .onEnable(() => Effect.unit)
      .onStart((_, input) => Effect.succeed(input))
      .onComplete(() => Effect.unit)
      .onCancel(() => Effect.unit)
      .onFail(() => Effect.unit);
  }

  onDisable<
    F extends (payload: TaskOnDisablePayload<C>) => Effect.Effect<any, any, any>
  >(
    f: F
  ): CompositeTaskBuilder<
    C,
    WC,
    TA,
    JT,
    ST,
    CTM,
    WM,
    ET,
    R | Effect.Effect.Context<ReturnType<F>>,
    E | Effect.Effect.Error<ReturnType<F>>
  > {
    this.activities.onDisable = f;
    return this;
  }

  onEnable<
    F extends (payload: TaskOnEnablePayload<C>) => Effect.Effect<any, any, any>
  >(
    f: F
  ): CompositeTaskBuilder<
    C,
    WC,
    TA,
    JT,
    ST,
    CTM,
    WM,
    ET,
    R | Effect.Effect.Context<ReturnType<F>>,
    E | Effect.Effect.Error<ReturnType<F>>
  > {
    this.activities.onEnable = f;
    return this;
  }

  onStart<
    I,
    F extends (
      payload: CompositeTaskOnStartPayload<
        C,
        WC,
        Get<WM, ['onStart', 'input']>
      >,
      input: I
    ) => Effect.Effect<any, any, any>
  >(
    f: F
  ): CompositeTaskBuilder<
    C,
    WC,
    TA,
    JT,
    ST,
    Simplify<
      Omit<CTM, TaskOnStartSym> & {
        [TaskOnStartSym]: CompositeTaskActivityMetadata<
          Parameters<F>[1],
          Effect.Effect.Success<ReturnType<F>>
        >;
      }
    >,
    WM,
    ET,
    R | Effect.Effect.Context<ReturnType<F>>,
    E | Effect.Effect.Error<ReturnType<F>>
  > {
    this.activities.onStart = f;
    return this;
  }

  onComplete<
    F extends (
      payload: TaskOnCompletePayload<C>
    ) => Effect.Effect<any, any, any>
  >(
    f: F
  ): CompositeTaskBuilder<
    C,
    WC,
    TA,
    JT,
    ST,
    CTM,
    WM,
    ET,
    R | Effect.Effect.Context<ReturnType<F>>,
    E | Effect.Effect.Error<ReturnType<F>>
  > {
    this.activities.onComplete = f;
    return this;
  }

  onCancel<
    F extends (payload: TaskOnCancelPayload<C>) => Effect.Effect<any, any, any>
  >(
    f: F
  ): CompositeTaskBuilder<
    C,
    WC,
    TA,
    JT,
    ST,
    CTM,
    WM,
    ET,
    R | Effect.Effect.Context<ReturnType<F>>,
    E | Effect.Effect.Error<ReturnType<F>>
  > {
    this.activities.onCancel = f;
    return this;
  }

  onFail<
    F extends (payload: TaskOnFailPayload<C>) => Effect.Effect<any, any, any>
  >(
    f: F
  ): CompositeTaskBuilder<
    C,
    WC,
    TA,
    JT,
    ST,
    CTM,
    WM,
    ET,
    R | Effect.Effect.Context<ReturnType<F>>,
    E | Effect.Effect.Error<ReturnType<F>>
  > {
    this.activities.onFail = f;
    return this;
  }

  withShouldComplete<F extends ShouldCompositeTaskCompleteFn<C, WC>>(
    f: F
  ): CompositeTaskBuilder<
    C,
    WC,
    TA,
    JT,
    ST,
    CTM,
    WM,
    ET,
    R | Effect.Effect.Context<ReturnType<F>>,
    E | Effect.Effect.Error<ReturnType<F>>
  > {
    this.shouldComplete = f;
    return this;
  }

  withShouldFail<F extends ShouldCompositeTaskFailFn<C, WC>>(
    f: F
  ): CompositeTaskBuilder<
    C,
    WC,
    TA,
    JT,
    ST,
    CTM,
    WM,
    ET,
    R | Effect.Effect.Context<ReturnType<F>>,
    E | Effect.Effect.Error<ReturnType<F>>
  > {
    this.shouldFail = f;
    return this;
  }

  build(
    workflow: Workflow,
    name: string
  ): Effect.Effect<
    never,
    | StartConditionDoesNotExist
    | EndConditionDoesNotExist
    | ConditionDoesNotExist
    | TaskDoesNotExist,
    void
  > {
    const {
      splitType,
      joinType,
      activities,
      workflowBuilder,
      shouldComplete,
      shouldFail,
    } = this;
    return Effect.gen(function* ($) {
      const subWorkflow = yield* $(workflowBuilder.build());
      const compositeTask = new CompositeTask(
        name,
        workflow,
        subWorkflow,
        activities as unknown as CompositeTaskActivities<C>,
        shouldComplete as ShouldCompositeTaskCompleteFn<any, any, never, never>,
        shouldFail as ShouldCompositeTaskFailFn<any, any, never, never>,
        { joinType, splitType }
      );
      subWorkflow.setParentTask(compositeTask);
      workflow.addTask(compositeTask);
    });
  }
}

export interface InitialCompositeTaskFnReturnType<C> {
  withSubWorkflow: <W extends AnyWorkflowBuilder>(
    workflow: W & AnyWorkflowBuilderWithCorrectParentContext<W, C>
  ) => CompositeTaskBuilder<
    C,
    WorkflowBuilderC<W>,
    any,
    undefined,
    undefined,
    object,
    WorkflowBuilderMetadata<W>,
    WorkflowBuilderElementTypes<W>,
    WorkflowBuilderR<W>,
    WorkflowBuilderE<W>
  >;
}

export function compositeTask<C>() {
  return {
    withSubWorkflow<W extends AnyWorkflowBuilder>(
      workflow: W & AnyWorkflowBuilderWithCorrectParentContext<W, C>
    ) {
      return new CompositeTaskBuilder<
        C,
        WorkflowBuilderC<W>,
        CompositeTaskActivities<C>,
        undefined,
        undefined,
        object,
        WorkflowBuilderMetadata<W>,
        WorkflowBuilderElementTypes<W>,
        WorkflowBuilderR<W>,
        WorkflowBuilderE<W>
      >(workflow).initialize();
    },
  };
}
