import { Effect } from 'effect';

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
  CompositeTaskOnFirePayload,
  JoinType,
  SplitType,
  TaskOnCancelPayload,
  TaskOnDisablePayload,
  TaskOnEnablePayload,
  TaskOnExitPayload,
} from '../types.js';
import {
  AnyWorkflowBuilder,
  WorkflowBuilderC,
  WorkflowBuilderE,
  WorkflowBuilderR,
} from './WorkflowBuilder.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type CompositeTaskBuilderContext<T> = T extends CompositeTaskBuilder<
  infer C,
  any,
  any,
  any,
  any
>
  ? C
  : never;
/* eslint-enable @typescript-eslint/no-explicit-any */

/* eslint-disable @typescript-eslint/no-explicit-any */
export type CompositeTaskBuilderSplitType<T> = T extends CompositeTaskBuilder<
  any,
  any,
  any,
  any,
  infer ST
>
  ? ST
  : never;
/* eslint-enable @typescript-eslint/no-explicit-any */

/* eslint-disable @typescript-eslint/no-explicit-any */
export type CompositeTaskBuilderActivitiesReturnType<T> =
  T extends CompositeTaskBuilder<any, any, any, any, any, infer AO>
    ? AO
    : never;
/* eslint-enable @typescript-eslint/no-explicit-any */

/* eslint-disable @typescript-eslint/no-explicit-any */
export type CompositeTaskBuilderR<T> = T extends CompositeTaskBuilder<
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
/* eslint-enable @typescript-eslint/no-explicit-any */

/* eslint-disable @typescript-eslint/no-explicit-any */
export type CompositeTaskBuilderE<T> = T extends CompositeTaskBuilder<
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
/* eslint-enable @typescript-eslint/no-explicit-any */

export type AnyCompositeTaskBuilder<C extends object = object> =
  CompositeTaskBuilder<
    C,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any,
    CompositeTaskActivities<C>,
    JoinType | undefined,
    SplitType | undefined
  >;

export type InitializedCompositeTaskBuilder<C extends object = object> =
  CompositeTaskBuilder<
    C,
    object,
    CompositeTaskActivities<C>,
    undefined,
    undefined
  >;

export interface CompositeTaskActivitiesReturnType {
  onFire: unknown;
}

export class CompositeTaskBuilder<
  C extends object,
  WC extends object,
  TA extends CompositeTaskActivities<C>,
  JT extends JoinType | undefined,
  ST extends SplitType | undefined,
  ART = CompositeTaskActivitiesReturnType,
  R = never,
  E = never
> {
  joinType: JoinType | undefined;
  splitType: SplitType | undefined;
  private activities: TA = {} as TA;
  private workflowBuilder: AnyWorkflowBuilder;

  constructor(workflowBuilder: AnyWorkflowBuilder) {
    this.workflowBuilder = workflowBuilder;
  }

  withJoinType<T extends JoinType | undefined>(
    joinType: T
  ): CompositeTaskBuilder<C, WC, TA, T, ST, ART, R, E> {
    this.joinType = joinType;
    return this;
  }

  withSplitType<T extends SplitType | undefined>(
    splitType: T
  ): CompositeTaskBuilder<C, WC, TA, JT, T, ART, R, E> {
    this.splitType = splitType;
    return this;
  }

  initialize() {
    return this.onDisable(() => Effect.unit)
      .onEnable(() => Effect.unit)
      .onFire((_, input) => Effect.succeed(input))
      .onExit(() => Effect.unit)
      .onCancel(() => Effect.unit);
  }

  onDisable<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    F extends (payload: TaskOnDisablePayload<C>) => Effect.Effect<any, any, any>
  >(
    f: F
  ): CompositeTaskBuilder<
    C,
    WC,
    TA,
    JT,
    ST,
    ART,
    R | Effect.Effect.Context<ReturnType<F>>,
    E | Effect.Effect.Error<ReturnType<F>>
  > {
    this.activities.onDisable = f;
    return this;
  }

  onEnable<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    F extends (payload: TaskOnEnablePayload<C>) => Effect.Effect<any, any, any>
  >(
    f: F
  ): CompositeTaskBuilder<
    C,
    WC,
    TA,
    JT,
    ST,
    ART,
    R | Effect.Effect.Context<ReturnType<F>>,
    E | Effect.Effect.Error<ReturnType<F>>
  > {
    this.activities.onEnable = f;
    return this;
  }

  onFire<
    F extends (
      payload: CompositeTaskOnFirePayload<C, WC>,
      input?: unknown
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) => Effect.Effect<any, any, any>
  >(
    f: F
  ): CompositeTaskBuilder<
    C,
    WC,
    TA,
    JT,
    ST,
    ART & { onFire: Effect.Effect.Success<ReturnType<F>> },
    R | Effect.Effect.Context<ReturnType<F>>,
    E | Effect.Effect.Error<ReturnType<F>>
  > {
    this.activities.onFire = f;
    return this;
  }

  onExit<
    F extends (
      payload: TaskOnExitPayload<C>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) => Effect.Effect<any, any, any>
  >(
    f: F
  ): CompositeTaskBuilder<
    C,
    WC,
    TA,
    JT,
    ST,
    ART,
    R | Effect.Effect.Context<ReturnType<F>>,
    E | Effect.Effect.Error<ReturnType<F>>
  > {
    this.activities.onExit = f;
    return this;
  }

  onCancel<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    F extends (payload: TaskOnCancelPayload<C>) => Effect.Effect<any, any, any>
  >(
    f: F
  ): CompositeTaskBuilder<
    C,
    WC,
    TA,
    JT,
    ST,
    ART,
    R | Effect.Effect.Context<ReturnType<F>>,
    E | Effect.Effect.Error<ReturnType<F>>
  > {
    this.activities.onCancel = f;
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
    const { splitType, joinType, activities, workflowBuilder } = this;
    return Effect.gen(function* ($) {
      const subWorkflow = yield* $(workflowBuilder.build());
      const compositeTask = new CompositeTask(
        name,
        workflow,
        subWorkflow,
        activities as unknown as CompositeTaskActivities,
        { joinType, splitType }
      );
      subWorkflow.setParentTask(compositeTask);
      workflow.addTask(compositeTask);
    });
  }
}

export interface InitialCompositeTaskFnReturnType<C extends object> {
  withSubWorkflow: (w: AnyWorkflowBuilder) => AnyCompositeTaskBuilder<C>;
}

export function compositeTask<C extends object>() {
  return {
    withSubWorkflow<W extends AnyWorkflowBuilder>(workflow: W) {
      return new CompositeTaskBuilder<
        C,
        WorkflowBuilderC<W>,
        CompositeTaskActivities<C>,
        undefined,
        undefined,
        CompositeTaskActivitiesReturnType,
        WorkflowBuilderR<W>,
        WorkflowBuilderE<W>
      >(workflow).initialize();
    },
  };
}
