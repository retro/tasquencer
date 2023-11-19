import { Effect } from 'effect';

import { Task } from '../elements/Task.js';
import { Workflow } from '../elements/Workflow.js';
import {
  JoinType,
  SplitType,
  TaskActivities,
  TaskOnActivatePayload,
  TaskOnCancelPayload,
  TaskOnCompletePayload,
  TaskOnDisablePayload,
  TaskOnEnablePayload,
  TaskOnExecutePayload,
} from '../types.js';
import { IdProvider } from './IdProvider.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type CompositeTaskBuilderUserContext<T> = T extends CompositeTaskBuilder<
  infer C,
  any,
  any,
  any
>
  ? C
  : never;
/* eslint-enable @typescript-eslint/no-explicit-any */

/* eslint-disable @typescript-eslint/no-explicit-any */
export type CompositeTaskBuilderContext<T> = T extends CompositeTaskBuilder<
  infer C,
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
  infer ST
>
  ? ST
  : never;
/* eslint-enable @typescript-eslint/no-explicit-any */

/* eslint-disable @typescript-eslint/no-explicit-any */
export type CompositeTaskBuilderActivitiesReturnType<T> =
  T extends CompositeTaskBuilder<any, any, any, any, infer AO> ? AO : never;
/* eslint-enable @typescript-eslint/no-explicit-any */

/* eslint-disable @typescript-eslint/no-explicit-any */
export type CompositeTaskBuilderR<T> = T extends CompositeTaskBuilder<
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
  infer E
>
  ? E
  : never;
/* eslint-enable @typescript-eslint/no-explicit-any */

export type AnyCompositeTaskBuilder<C extends object = object> =
  CompositeTaskBuilder<
    C,
    TaskActivities<C>,
    JoinType | undefined,
    SplitType | undefined
  >;

export type CompositeInitializedTaskBuilder<C extends object = object> =
  CompositeTaskBuilder<C, TaskActivities<C>, undefined, undefined>;

export interface ActivitiesReturnType {
  onActivate: unknown;
  onComplete: unknown;
  onExecute: unknown;
}

export class CompositeTaskBuilder<
  C extends object,
  TA extends TaskActivities<C>,
  JT extends JoinType | undefined,
  ST extends SplitType | undefined,
  ART = ActivitiesReturnType,
  R = never,
  E = never
> {
  joinType: JoinType | undefined;
  splitType: SplitType | undefined;
  private Constructor: typeof Task = Task;
  private activities: TA = {} as TA;

  withJoinType<T extends JoinType | undefined>(
    joinType: T
  ): CompositeTaskBuilder<C, TA, T, ST, ART, R, E> {
    this.joinType = joinType;
    return this;
  }

  withSplitType<T extends SplitType | undefined>(
    splitType: T
  ): CompositeTaskBuilder<C, TA, JT, T, ART, R, E> {
    this.splitType = splitType;
    return this;
  }

  withConstructor(
    Constructor: typeof Task
  ): CompositeTaskBuilder<C, TA, JT, ST, ART, R, E> {
    this.Constructor = Constructor;
    return this;
  }

  initialize() {
    return this.onDisable(() => Effect.unit)
      .onEnable(() => Effect.unit)
      .onActivate(({ input }) => Effect.succeed(input))
      .onComplete(({ input }) => Effect.succeed(input))
      .onCancel(() => Effect.unit);
  }

  onDisable<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    F extends (payload: TaskOnDisablePayload<C>) => Effect.Effect<any, any, any>
  >(
    f: F
  ): CompositeTaskBuilder<
    C,
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

  onActivate<
    F extends (
      payload: TaskOnActivatePayload<C>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) => Effect.Effect<any, any, any>
  >(
    f: F
  ): CompositeTaskBuilder<
    C,
    TA,
    JT,
    ST,
    ART & { onActivate: Effect.Effect.Success<ReturnType<F>> },
    R | Effect.Effect.Context<ReturnType<F>>,
    E | Effect.Effect.Error<ReturnType<F>>
  > {
    this.activities.onActivate = f;
    return this;
  }

  onExecute<
    F extends (
      payload: TaskOnExecutePayload<C>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) => Effect.Effect<any, any, any>
  >(
    f: F
  ): CompositeTaskBuilder<
    C,
    TA,
    JT,
    ST,
    ART & { onExecute: Effect.Effect.Success<ReturnType<F>> },
    R | Effect.Effect.Context<ReturnType<F>>,
    E | Effect.Effect.Error<ReturnType<F>>
  > {
    this.activities.onExecute = f;
    return this;
  }

  onComplete<
    F extends (
      payload: TaskOnCompletePayload<C>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) => Effect.Effect<any, any, any>
  >(
    f: F
  ): CompositeTaskBuilder<
    C,
    TA,
    JT,
    ST,
    ART & { onComplete: Effect.Effect.Success<ReturnType<F>> },
    R | Effect.Effect.Context<ReturnType<F>>,
    E | Effect.Effect.Error<ReturnType<F>>
  > {
    this.activities.onComplete = f;
    return this;
  }

  onCancel<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    F extends (payload: TaskOnCancelPayload<C>) => Effect.Effect<any, any, any>
  >(
    f: F
  ): CompositeTaskBuilder<
    C,
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

  build(workflow: Workflow, name: string, idProvider: IdProvider) {
    const { splitType, joinType, activities, Constructor } = this;
    return Effect.gen(function* ($) {
      const task = new Constructor(
        yield* $(idProvider.getTaskId(name)),
        name,
        workflow,
        activities as unknown as TaskActivities,
        {
          splitType,
          joinType,
        }
      );
      workflow.addTask(task);
    });
  }
  toJSONSerializable() {
    return {
      joinType: this.joinType,
      splitType: this.splitType,
    };
  }
}

export function compositeTask<C extends object = object>() {
  return new CompositeTaskBuilder<
    C,
    TaskActivities,
    never,
    never
  >().initialize();
}
