import { Effect } from 'effect';

import {
  TaskName,
  WorkItem,
  WorkItemId,
  WorkflowInstanceId,
} from '../state/types.js';
import { TaskState } from '../types.js';

export interface WorkItemActivitiesReturnType {
  onInitialize: unknown;
  onStart: unknown;
  onComplete: unknown;
  onCancel: unknown;
  onFail: unknown;
}

export interface WorkItemOnPayload<C extends object, P> {
  context: C;
  workflow: {
    id: WorkflowInstanceId;
  };
  task: {
    name: TaskName;
    generation: number;
    state: TaskState;
  };
  workItem: WorkItem<P>;
  getWorkItems: () => Effect.Effect<never, never, WorkItem<P>[]>;
  startWorkItem: (id: WorkItemId) => Effect.Effect<never, never, void>;
  completeWorkItem: (id: WorkItemId) => Effect.Effect<never, never, void>;
  failWorkItem: (id: WorkItemId) => Effect.Effect<never, never, void>;
  cancelWorkItem: (id: WorkItemId) => Effect.Effect<never, never, void>;
  createWokItem: (payload: P) => Effect.Effect<never, never, WorkItem<P>>;
}

export interface WorkItemActivities<C extends object, P> {
  onInitialize: (
    payload: WorkItemOnPayload<C, P>
  ) => Effect.Effect<unknown, unknown, unknown>;
  onStart: (
    payload: WorkItemOnPayload<C, P>
  ) => Effect.Effect<unknown, unknown, unknown>;
  onComplete: (
    payload: WorkItemOnPayload<C, P>
  ) => Effect.Effect<unknown, unknown, unknown>;
  onCancel: (
    payload: WorkItemOnPayload<C, P>
  ) => Effect.Effect<unknown, unknown, unknown>;
  onFail: (
    payload: WorkItemOnPayload<C, P>
  ) => Effect.Effect<unknown, unknown, unknown>;
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
  C extends object,
  P,
  WA extends WorkItemActivities<C, P>,
  ART = WorkItemActivitiesReturnType,
  R = never,
  E = never
> {
  private activities: WA = {} as WA;

  initialize() {
    return this.onInitialize(({ workItem }) => Effect.succeed(workItem))
      .onStart(({ workItem }) => Effect.succeed(workItem))
      .onComplete(({ workItem }) => Effect.succeed(workItem))
      .onCancel(({ workItem }) => Effect.succeed(workItem))
      .onFail(({ workItem }) => Effect.succeed(workItem));
  }

  onInitialize<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    F extends (payload: WorkItemOnPayload<C, P>) => Effect.Effect<any, any, any>
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
    this.activities.onInitialize = f;
    return this;
  }

  onStart<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    F extends (payload: WorkItemOnPayload<C, P>) => Effect.Effect<any, any, any>
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    F extends (payload: WorkItemOnPayload<C, P>) => Effect.Effect<any, any, any>
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    F extends (payload: WorkItemOnPayload<C, P>) => Effect.Effect<any, any, any>
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    F extends (payload: WorkItemOnPayload<C, P>) => Effect.Effect<any, any, any>
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

export function workItem<C extends object, P>() {
  return new WorkItemBuilder<C, P, WorkItemActivities<C, P>>().initialize();
}
