import { Effect } from 'effect';

import {
  WorkItemActivities,
  WorkItemOnCancelPayload,
  WorkItemOnCompletePayload,
  WorkItemOnFailPayload,
  WorkItemOnStartPayload,
} from '../types.js';

export interface WorkItemActivitiesReturnType {
  onStart: unknown;
  onComplete: unknown;
  onCancel: unknown;
  onFail: unknown;
}

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyWorkItemActivities = WorkItemActivities<any, any>;

export class WorkItemBuilder<
  C,
  P,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  WA extends WorkItemActivities<any, any>,
  ART = WorkItemActivitiesReturnType,
  R = never,
  E = never
> {
  private activities: WA = {} as WA;

  initialize() {
    return this.onStart(({ startWorkItem }) =>
      Effect.gen(function* ($) {
        yield* $(startWorkItem());
      })
    )
      .onComplete(({ completeWorkItem }) => completeWorkItem())
      .onCancel(({ cancelWorkItem }) => cancelWorkItem())
      .onFail(({ failWorkItem }) => failWorkItem());
  }

  onStart<
    F extends (
      payload: WorkItemOnStartPayload<C, P>,
      input?: unknown
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) => Effect.Effect<any, any, any>
  >(
    f: F
  ): WorkItemBuilder<
    C,
    P,
    WA,
    ART,
    R | Effect.Effect.Context<ReturnType<F>>,
    E | Effect.Effect.Error<ReturnType<F>>
  > {
    this.activities.onStart = f;
    return this;
  }

  onComplete<
    F extends (
      payload: WorkItemOnCompletePayload<C, P>,
      input?: unknown
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) => Effect.Effect<any, any, any>
  >(
    f: F
  ): WorkItemBuilder<
    C,
    P,
    WA,
    ART,
    R | Effect.Effect.Context<ReturnType<F>>,
    E | Effect.Effect.Error<ReturnType<F>>
  > {
    this.activities.onComplete = f;
    return this;
  }

  onCancel<
    F extends (
      payload: WorkItemOnCancelPayload<C, P>,
      input?: unknown
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) => Effect.Effect<any, any, any>
  >(
    f: F
  ): WorkItemBuilder<
    C,
    P,
    WA,
    ART,
    R | Effect.Effect.Context<ReturnType<F>>,
    E | Effect.Effect.Error<ReturnType<F>>
  > {
    this.activities.onCancel = f;
    return this;
  }

  onFail<
    F extends (
      payload: WorkItemOnFailPayload<C, P>,
      input?: unknown
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) => Effect.Effect<any, any, any>
  >(
    f: F
  ): WorkItemBuilder<
    C,
    P,
    WA,
    ART,
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
