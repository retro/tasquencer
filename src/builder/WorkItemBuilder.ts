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
  WorkItemActivities<any>
>;

export type WorkItemPayload<TWorkItemBuilder> =
  TWorkItemBuilder extends WorkItemBuilder<
    infer TWorkItemPayload,
    any,
    any,
    any,
    any
  >
    ? TWorkItemPayload
    : never;

export type WorkItemBuilderR<TWorkItemBuilder> =
  TWorkItemBuilder extends WorkItemBuilder<any, any, any, infer R> ? R : never;

export type WorkItemBuilderE<TWorkItemBuilder> =
  TWorkItemBuilder extends WorkItemBuilder<any, any, any, any, infer E>
    ? E
    : never;

export type WorkItemBuilderWorkItemMetadata<TWorkItemBuilder> =
  TWorkItemBuilder extends WorkItemBuilder<
    any,
    any,
    infer TWorkItemMetadata,
    any,
    any
  >
    ? TWorkItemMetadata
    : never;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyWorkItemActivities = WorkItemActivities<any>;

interface WorkItemActivityMetadata<TInput, TPayload, TReturn> {
  input: TInput;
  payload: TPayload;
  return: TReturn;
}

export interface DefaultWorkItemMetadata {
  [WorkItemPayloadSym]: undefined;
  onStart: WorkItemActivityMetadata<undefined, undefined, undefined>;
  onComplete: WorkItemActivityMetadata<undefined, undefined, undefined>;
  onCancel: WorkItemActivityMetadata<undefined, undefined, undefined>;
  onFail: WorkItemActivityMetadata<undefined, undefined, undefined>;
}

export interface InitializedWorkItemMetadata<TPayload> {
  [WorkItemPayloadSym]: TPayload;
  onStart: WorkItemActivityMetadata<undefined, TPayload, undefined>;
  onComplete: WorkItemActivityMetadata<undefined, TPayload, undefined>;
  onCancel: WorkItemActivityMetadata<undefined, TPayload, undefined>;
  onFail: WorkItemActivityMetadata<undefined, TPayload, undefined>;
}

export type InitializedWorkItemBuilder<TPayload> = WorkItemBuilder<
  TPayload,
  WorkItemActivities<any>,
  InitializedWorkItemMetadata<TPayload>
>;

export class WorkItemBuilder<
  TPayload,
  TWorkItemActivities extends WorkItemActivities<any>,
  TWorkItemMetadata = {
    [WorkItemPayloadSym]: TPayload;
  },
  R = never,
  E = never
> {
  private activities: TWorkItemActivities = {} as TWorkItemActivities;

  initialize() {
    return this.onStart((_, _input?: undefined) => Effect.succeed(_input))
      .onComplete((_, _input?: undefined) => Effect.succeed(_input))
      .onCancel((_, _input?: undefined) => Effect.succeed(_input))
      .onFail((_, _input?: undefined) => Effect.succeed(_input));
  }

  onStart<
    TOnStartInput,
    TOnStartActivity extends (
      payload: WorkItemOnStartPayload<
        TPayload,
        Get<TWorkItemMetadata, ['onComplete', 'input']>,
        Get<TWorkItemMetadata, ['onCancel', 'input']>,
        Get<TWorkItemMetadata, ['onFail', 'input']>
      >,
      input: TOnStartInput
    ) => Effect.Effect<any, any, any>
  >(
    f: TOnStartActivity
  ): WorkItemBuilder<
    TPayload,
    TWorkItemActivities,
    Simplify<
      Omit<TWorkItemMetadata, 'onStart'> & {
        onStart: WorkItemActivityMetadata<
          Parameters<TOnStartActivity>[1],
          TPayload,
          Effect.Effect.Success<ReturnType<TOnStartActivity>>
        >;
      }
    >,
    R | Effect.Effect.Context<ReturnType<TOnStartActivity>>,
    E | Effect.Effect.Error<ReturnType<TOnStartActivity>>
  > {
    this.activities.onStart = f;
    return this;
  }

  onComplete<
    TOnCompleteActivityInput,
    TOnCompleteActivity extends (
      payload: WorkItemOnCompletePayload<TPayload>,
      input: TOnCompleteActivityInput
    ) => Effect.Effect<any, any, any>
  >(
    f: TOnCompleteActivity
  ): WorkItemBuilder<
    TPayload,
    TWorkItemActivities,
    Simplify<
      Omit<TWorkItemMetadata, 'onComplete'> & {
        onComplete: WorkItemActivityMetadata<
          Parameters<TOnCompleteActivity>[1],
          TPayload,
          Effect.Effect.Success<ReturnType<TOnCompleteActivity>>
        >;
      }
    >,
    R | Effect.Effect.Context<ReturnType<TOnCompleteActivity>>,
    E | Effect.Effect.Error<ReturnType<TOnCompleteActivity>>
  > {
    this.activities.onComplete = f;
    return this;
  }

  onCancel<
    TOnCancelActivityInput,
    TOnCancelActivity extends (
      payload: WorkItemOnCancelPayload<TPayload>,
      input?: TOnCancelActivityInput
    ) => Effect.Effect<any, any, any>
  >(
    f: TOnCancelActivity
  ): WorkItemBuilder<
    TPayload,
    TWorkItemActivities,
    Simplify<
      Omit<TWorkItemMetadata, 'onCancel'> & {
        onCancel: WorkItemActivityMetadata<
          Parameters<TOnCancelActivity>[1],
          TPayload,
          Effect.Effect.Success<ReturnType<TOnCancelActivity>>
        >;
      }
    >,
    R | Effect.Effect.Context<ReturnType<TOnCancelActivity>>,
    E | Effect.Effect.Error<ReturnType<TOnCancelActivity>>
  > {
    this.activities.onCancel = f;
    return this;
  }

  onFail<
    TOnFailActivityInput,
    TOnFailActivity extends (
      payload: WorkItemOnFailPayload<TPayload>,
      input: TOnFailActivityInput
    ) => Effect.Effect<any, any, any>
  >(
    f: TOnFailActivity
  ): WorkItemBuilder<
    TPayload,
    TWorkItemActivities,
    Simplify<
      Omit<TWorkItemMetadata, 'onFail'> & {
        onFail: WorkItemActivityMetadata<
          Parameters<TOnFailActivity>[1],
          TPayload,
          Effect.Effect.Success<ReturnType<TOnFailActivity>>
        >;
      }
    >,
    R | Effect.Effect.Context<ReturnType<TOnFailActivity>>,
    E | Effect.Effect.Error<ReturnType<TOnFailActivity>>
  > {
    this.activities.onFail = f;
    return this;
  }

  build() {
    return this.activities;
  }
}

export function workItem<TPayload>() {
  return new WorkItemBuilder<
    TPayload,
    WorkItemActivities<TPayload>
  >().initialize();
}
