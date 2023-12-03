import { Effect } from 'effect';
import { Get, Simplify } from 'type-fest';

import {
  WorkItemActivities,
  WorkItemOnCancelPayload,
  WorkItemOnCompletePayload,
  WorkItemOnFailPayload,
  WorkItemOnStartPayload,
  WorkItemPayloadSym,
} from '../types.js';

export type AnyWorkItemBuilder = WorkItemBuilder<
  any,
  any,
  WorkItemActivities<any, any>
>;

export type WorkItemBuilderP<T> = T extends WorkItemBuilder<any, infer P, any>
  ? P
  : never;

export type WorkItemBuilderR<T> = T extends WorkItemBuilder<
  any,
  any,
  any,
  any,
  infer R
>
  ? R
  : never;

export type WorkItemBuilderE<T> = T extends WorkItemBuilder<
  any,
  any,
  any,
  any,
  any,
  infer E
>
  ? E
  : never;

export type WorkItemBuilderWIM<T> = T extends WorkItemBuilder<
  any,
  any,
  any,
  infer WIM,
  any,
  any
>
  ? WIM
  : never;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyWorkItemActivities = WorkItemActivities<any, any>;

interface WorkItemActivityMetadata<I, P, R> {
  input: I;
  return: R;
  payload: P;
}

export interface DefaultWIM {
  [WorkItemPayloadSym]: undefined;
  onStart: WorkItemActivityMetadata<undefined, undefined, undefined>;
  onComplete: WorkItemActivityMetadata<undefined, undefined, undefined>;
  onCancel: WorkItemActivityMetadata<undefined, undefined, undefined>;
  onFail: WorkItemActivityMetadata<undefined, undefined, undefined>;
}

export interface InitializedWIM<P> {
  [WorkItemPayloadSym]: P;
  onStart: WorkItemActivityMetadata<undefined, P, undefined>;
  onComplete: WorkItemActivityMetadata<undefined, P, undefined>;
  onCancel: WorkItemActivityMetadata<undefined, P, undefined>;
  onFail: WorkItemActivityMetadata<undefined, P, undefined>;
}

export type InitializedWorkItemBuilder<C, P> = WorkItemBuilder<
  C,
  P,
  WorkItemActivities<any, any>,
  InitializedWIM<P>
>;

export class WorkItemBuilder<
  C,
  P,
  WIA extends WorkItemActivities<any, any>,
  WIM = {
    [WorkItemPayloadSym]: P;
  },
  R = never,
  E = never
> {
  private activities: WIA = {} as WIA;

  initialize() {
    return this.onStart((_, _input?: undefined) => Effect.succeed(_input))
      .onComplete((_, _input?: undefined) => Effect.succeed(_input))
      .onCancel((_, _input?: undefined) => Effect.succeed(_input))
      .onFail((_, _input?: undefined) => Effect.succeed(_input));
  }

  onStart<
    I,
    F extends (
      payload: WorkItemOnStartPayload<
        C,
        P,
        Get<WIM, ['onComplete', 'input']>,
        Get<WIM, ['onCancel', 'input']>,
        Get<WIM, ['onFail', 'input']>
      >,
      input: I
    ) => Effect.Effect<any, any, any>
  >(
    f: F
  ): WorkItemBuilder<
    C,
    P,
    WIA,
    Simplify<
      Omit<WIM, 'onStart'> & {
        onStart: WorkItemActivityMetadata<
          Parameters<F>[1],
          P,
          Effect.Effect.Success<ReturnType<F>>
        >;
      }
    >,
    R | Effect.Effect.Context<ReturnType<F>>,
    E | Effect.Effect.Error<ReturnType<F>>
  > {
    this.activities.onStart = f;
    return this;
  }

  onComplete<
    I,
    F extends (
      payload: WorkItemOnCompletePayload<C, P>,
      input: I
    ) => Effect.Effect<any, any, any>
  >(
    f: F
  ): WorkItemBuilder<
    C,
    P,
    WIA,
    Simplify<
      Omit<WIM, 'onComplete'> & {
        onComplete: WorkItemActivityMetadata<
          Parameters<F>[1],
          P,
          Effect.Effect.Success<ReturnType<F>>
        >;
      }
    >,
    R | Effect.Effect.Context<ReturnType<F>>,
    E | Effect.Effect.Error<ReturnType<F>>
  > {
    this.activities.onComplete = f;
    return this;
  }

  onCancel<
    I,
    F extends (
      payload: WorkItemOnCancelPayload<C, P>,
      input?: I
    ) => Effect.Effect<any, any, any>
  >(
    f: F
  ): WorkItemBuilder<
    C,
    P,
    WIA,
    Simplify<
      Omit<WIM, 'onCancel'> & {
        onCancel: WorkItemActivityMetadata<
          Parameters<F>[1],
          P,
          Effect.Effect.Success<ReturnType<F>>
        >;
      }
    >,
    R | Effect.Effect.Context<ReturnType<F>>,
    E | Effect.Effect.Error<ReturnType<F>>
  > {
    this.activities.onCancel = f;
    return this;
  }

  onFail<
    I,
    F extends (
      payload: WorkItemOnFailPayload<C, P>,
      input: I
    ) => Effect.Effect<any, any, any>
  >(
    f: F
  ): WorkItemBuilder<
    C,
    P,
    WIA,
    Simplify<
      Omit<WIM, 'onFail'> & {
        onFail: WorkItemActivityMetadata<
          Parameters<F>[1],
          P,
          Effect.Effect.Success<ReturnType<F>>
        >;
      }
    >,
    R | Effect.Effect.Context<ReturnType<F>>,
    E | Effect.Effect.Error<ReturnType<F>>
  > {
    this.activities.onFail = f;
    return this;
  }

  build() {
    return this.activities;
  }
}

export function workItem<C, P>() {
  return new WorkItemBuilder<C, P, WorkItemActivities<C, P>>().initialize();
}
