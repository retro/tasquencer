import { Effect } from 'effect';
import { Simplify } from 'type-fest';

import {
  WorkItemActivities,
  WorkItemOnCancelPayload,
  WorkItemOnCompletePayload,
  WorkItemOnFailPayload,
  WorkItemOnStartPayload,
} from '../types.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type AnyWorkItemBuilder = WorkItemBuilder<
  any,
  any,
  WorkItemActivities<any, any>
>;
/* eslint-enable @typescript-eslint/no-explicit-any */

/* eslint-disable @typescript-eslint/no-explicit-any */
export type WorkItemBuilderP<T> = T extends WorkItemBuilder<any, infer P, any>
  ? P
  : never;
/* eslint-enable @typescript-eslint/no-explicit-any */

/* eslint-disable @typescript-eslint/no-explicit-any */
export type WorkItemBuilderR<T> = T extends WorkItemBuilder<
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
/* eslint-enable @typescript-eslint/no-explicit-any */

/* eslint-disable @typescript-eslint/no-explicit-any */
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
/* eslint-enable @typescript-eslint/no-explicit-any */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyWorkItemActivities = WorkItemActivities<any, any>;

interface WorkItemActivityMetadata<I, P, R> {
  input: I;
  returnType: R;
  payload: P;
}

export interface DefaultWIM {
  onStart: WorkItemActivityMetadata<undefined, undefined, undefined>;
  onComplete: WorkItemActivityMetadata<undefined, undefined, undefined>;
  onCancel: WorkItemActivityMetadata<undefined, undefined, undefined>;
  onFail: WorkItemActivityMetadata<undefined, undefined, undefined>;
}

export interface InitializedWIM<P> {
  onStart: WorkItemActivityMetadata<undefined, P, undefined>;
  onComplete: WorkItemActivityMetadata<undefined, P, undefined>;
  onCancel: WorkItemActivityMetadata<undefined, P, undefined>;
  onFail: WorkItemActivityMetadata<undefined, P, undefined>;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export type InitializedWorkItemBuilder<C, P> = WorkItemBuilder<
  C,
  P,
  WorkItemActivities<any, any>,
  InitializedWIM<P>
>;
/* eslint-enable @typescript-eslint/no-explicit-any */

export class WorkItemBuilder<
  C,
  P,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  WIA extends WorkItemActivities<any, any>,
  WIM = {
    payload: P;
  },
  R = never,
  E = never
> {
  private activities: WIA = {} as WIA;

  initialize() {
    return this.onStart(({ startWorkItem }, _input?: undefined) =>
      Effect.gen(function* ($) {
        yield* $(startWorkItem());
      })
    )
      .onComplete(({ completeWorkItem }, _input?: undefined) =>
        completeWorkItem()
      )
      .onCancel(({ cancelWorkItem }, _input?: undefined) => cancelWorkItem())
      .onFail(({ failWorkItem }, _input?: undefined) => failWorkItem());
  }

  onStart<
    I,
    F extends (
      payload: WorkItemOnStartPayload<C, P>,
      input: I
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
          I,
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
          I,
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
      input: I
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
          I,
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
          I,
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
