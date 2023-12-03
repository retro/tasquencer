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
  JoinType,
  ShouldCompositeTaskCompleteFn,
  SplitType,
  TaskOnCancelPayload,
  TaskOnCompletePayload,
  TaskOnDisablePayload,
  TaskOnEnablePayload,
  TaskOnStartSym,
  WorkItemInstance,
  WorkflowAndWorkItemTypes,
  WorkflowInstance,
  activeWorkflowInstanceStates,
} from '../types.js';
import {
  AnyWorkflowBuilder,
  AnyWorkflowBuilderWithCorrectParentContext,
  WorkflowBuilderC,
  WorkflowBuilderE,
  WorkflowBuilderMetadata,
  WorkflowBuilderR,
  WorkflowBuilderWorkflowAndWorkItemTypes,
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

export type CompositeTaskWorkflowAndWorkItemTypes<T> =
  T extends CompositeTaskBuilder<
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    infer WWAIT,
    any,
    any
  >
    ? WWAIT
    : never;

export class CompositeTaskBuilder<
  C,
  WC,
  TA extends CompositeTaskActivities<C>,
  JT extends JoinType | undefined,
  ST extends SplitType | undefined,
  CTM = object,
  WM = never,
  WWAIT extends WorkflowAndWorkItemTypes = {
    workflow: WorkflowInstance;
    workItem: WorkItemInstance;
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
    return Effect.succeed(workflows.length > 0 && !hasActiveWorkflows);
  };

  constructor(workflowBuilder: AnyWorkflowBuilder) {
    this.workflowBuilder = workflowBuilder;
  }

  withJoinType<T extends JoinType | undefined>(
    joinType: T
  ): CompositeTaskBuilder<C, WC, TA, T, ST, CTM, WM, WWAIT, R, E> {
    this.joinType = joinType;
    return this;
  }

  withSplitType<T extends SplitType | undefined>(
    splitType: T
  ): CompositeTaskBuilder<C, WC, TA, JT, T, CTM, WM, WWAIT, R, E> {
    this.splitType = splitType;
    return this;
  }

  initialize() {
    return this.onDisable(() => Effect.unit)
      .onEnable(() => Effect.unit)
      .onStart((_, input) => Effect.succeed(input))
      .onComplete(() => Effect.unit)
      .onCancel(() => Effect.unit);
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
    WWAIT,
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
    WWAIT,
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
    WWAIT,
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
    WWAIT,
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
    WWAIT,
    R | Effect.Effect.Context<ReturnType<F>>,
    E | Effect.Effect.Error<ReturnType<F>>
  > {
    this.activities.onCancel = f;
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
    WWAIT,
    R | Effect.Effect.Context<ReturnType<F>>,
    E | Effect.Effect.Error<ReturnType<F>>
  > {
    this.shouldComplete = f;
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
    const { splitType, joinType, activities, workflowBuilder, shouldComplete } =
      this;
    return Effect.gen(function* ($) {
      const subWorkflow = yield* $(workflowBuilder.build());
      const compositeTask = new CompositeTask(
        name,
        workflow,
        subWorkflow,
        activities as unknown as CompositeTaskActivities<C>,
        shouldComplete as ShouldCompositeTaskCompleteFn<any, any, never, never>,
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
    any,
    any,
    undefined,
    undefined,
    object,
    WorkflowBuilderMetadata<W>,
    WorkflowBuilderWorkflowAndWorkItemTypes<W>,
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
        WorkflowBuilderWorkflowAndWorkItemTypes<W>,
        WorkflowBuilderR<W>,
        WorkflowBuilderE<W>
      >(workflow).initialize();
    },
  };
}
