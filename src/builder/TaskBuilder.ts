import { Effect } from 'effect';
import { Get } from 'type-fest';

import { Task } from '../elements/Task.js';
import { Workflow } from '../elements/Workflow.js';
import {
  JoinType,
  ReplaceProp,
  ShouldTaskCompleteFn,
  ShouldTaskFailFn,
  SplitType,
  TaskActivities,
  TaskOnCancelPayload,
  TaskOnCompletePayload,
  TaskOnDisablePayload,
  TaskOnEnablePayload,
  TaskOnFailPayload,
  TaskOnStartPayload,
  UnknownAsUndefined,
  activeWorkItemInstanceStates,
} from '../types.js';
import {
  AnyWorkItemActivities,
  AnyWorkItemBuilder,
  DefaultWorkItemMetadata,
  GetWorkItemBuilderE,
  GetWorkItemBuilderR,
  GetWorkItemBuilderWorkItemMetadata,
  GetWorkItemPayload,
  InitializedWorkItemBuilder,
  WorkItemBuilder,
  workItem,
} from './WorkItemBuilder.js';

export type GetTaskBuilderContext<TTaskBuilder> =
  TTaskBuilder extends TaskBuilder<infer TContext, any, any, any>
    ? TContext
    : never;

export type GetTaskBuilderSplitType<TTaskBuilder> =
  TTaskBuilder extends TaskBuilder<any, any, any, infer TSplitType>
    ? TSplitType
    : never;

export type GetTaskBuilderActivitiesReturnType<TTaskBuilder> =
  TTaskBuilder extends TaskBuilder<
    any,
    any,
    any,
    any,
    any,
    infer TActivitiesReturnType
  >
    ? TActivitiesReturnType
    : never;

export type GetTaskBuilderR<TTaskBuilder> = TTaskBuilder extends TaskBuilder<
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

export type GetTaskBuilderE<TTaskBuilder> = TTaskBuilder extends TaskBuilder<
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

export type AnyTaskBuilder<TContext = any, TPayload = any> = TaskBuilder<
  TContext,
  TaskActivities<TContext, TPayload>,
  JoinType | undefined,
  SplitType | undefined
>;

export type InitializedTaskBuilder<TContext> = TaskBuilder<
  TContext,
  TaskActivities<TContext, any>,
  undefined,
  undefined
>;

interface TaskActivityMetadata<TInputType, TReturnType> {
  input: TInputType;
  return: TReturnType;
}

export type GetTaskBuilderTaskMetadata<TTaskBuilder> =
  TTaskBuilder extends TaskBuilder<
    any,
    any,
    any,
    any,
    any,
    infer TTTaskMetadata,
    any
  >
    ? TTTaskMetadata
    : never;

export type GetTaskBuilderWorkItemMetadata<TTaskBuilder> =
  TTaskBuilder extends TaskBuilder<
    any,
    any,
    any,
    any,
    any,
    any,
    infer TWorkItemMetadata
  >
    ? TWorkItemMetadata
    : never;

export type GetTaskBuilderWorkItemPayload<TTaskBuilder> =
  TTaskBuilder extends TaskBuilder<
    any,
    any,
    any,
    any,
    infer TWorkItemPayload,
    any,
    any,
    any,
    any
  >
    ? TWorkItemPayload
    : never;

export interface TaskMetadata {
  onStart: {
    input: unknown;
    return: unknown;
  };
}

export class TaskBuilder<
  TContext,
  TTaskActivities extends TaskActivities<TContext, any>,
  TJoinType extends JoinType | undefined,
  TSplitType extends SplitType | undefined,
  TWorkItemPayload = undefined,
  TTaskMetadata extends TaskMetadata = {
    onStart: { input: undefined; return: undefined };
  },
  TWorkItemMetadata = DefaultWorkItemMetadata,
  R = never,
  E = never
> {
  joinType: JoinType | undefined;
  splitType: SplitType | undefined;
  private activities: TTaskActivities = {} as TTaskActivities;
  private workItem: AnyWorkItemBuilder = workItem<undefined>();
  private shouldComplete: ShouldTaskCompleteFn<any, any> = ({ getWorkItems }) =>
    Effect.gen(function* () {
      const workItems = yield* getWorkItems();
      const hasActiveWorkItems = workItems.some((w) =>
        activeWorkItemInstanceStates.has(w.state)
      );
      const hasCompletedWorkItems = workItems.some(
        (w) => w.state === 'completed'
      );
      return (
        workItems.length > 0 && !hasActiveWorkItems && hasCompletedWorkItems
      );
    });

  private shouldFail: ShouldTaskCompleteFn<any, any> = ({ getWorkItems }) =>
    Effect.gen(function* () {
      const workItems = yield* getWorkItems();
      const hasFailedItems = workItems.some((w) => w.state === 'failed');
      return hasFailedItems;
    });

  withJoinType<TNewJoinType extends JoinType | undefined>(
    joinType: TNewJoinType
  ): TaskBuilder<
    TContext,
    TTaskActivities,
    TNewJoinType,
    TSplitType,
    TWorkItemPayload,
    TTaskMetadata,
    TWorkItemMetadata,
    R,
    E
  > {
    this.joinType = joinType;
    return this;
  }

  withSplitType<TNewSplitType extends SplitType | undefined>(
    splitType: TNewSplitType
  ): TaskBuilder<
    TContext,
    TTaskActivities,
    TJoinType,
    TNewSplitType,
    TWorkItemPayload,
    TTaskMetadata,
    TWorkItemMetadata,
    R,
    E
  > {
    this.splitType = splitType;
    return this;
  }

  withWorkItem<
    TWorkItemPayload,
    TWorkItemBuilder extends WorkItemBuilder<
      UnknownAsUndefined<TWorkItemPayload>,
      any
    >
  >(
    workItem: TWorkItemBuilder
  ): TaskBuilder<
    TContext,
    TTaskActivities,
    TJoinType,
    TSplitType,
    GetWorkItemPayload<TWorkItemBuilder>,
    TTaskMetadata,
    GetWorkItemBuilderWorkItemMetadata<TWorkItemBuilder>,
    R | GetWorkItemBuilderR<TWorkItemBuilder>,
    E | GetWorkItemBuilderE<TWorkItemBuilder>
  >;

  withWorkItem<
    TWorkItemPayload,
    TInitWorkItemBuilder extends (
      w: <TWorkItemPayload>() => InitializedWorkItemBuilder<TWorkItemPayload>
    ) => WorkItemBuilder<UnknownAsUndefined<TWorkItemPayload>, any>
  >(
    f: TInitWorkItemBuilder
  ): TaskBuilder<
    TContext,
    TTaskActivities,
    TJoinType,
    TSplitType,
    GetWorkItemPayload<ReturnType<TInitWorkItemBuilder>>,
    TTaskMetadata,
    GetWorkItemBuilderWorkItemMetadata<ReturnType<TInitWorkItemBuilder>>,
    R | GetWorkItemBuilderR<ReturnType<TInitWorkItemBuilder>>,
    E | GetWorkItemBuilderE<ReturnType<TInitWorkItemBuilder>>
  >;

  withWorkItem(
    input:
      | AnyWorkItemBuilder
      | ((w: () => AnyWorkItemBuilder) => AnyWorkItemBuilder)
  ) {
    this.workItem =
      input instanceof WorkItemBuilder ? input : input(() => workItem());
    return this;
  }

  initialize() {
    return this.onDisable(() => Effect.void)
      .onEnable(() => Effect.void)
      .onStart((_, input: undefined) => Effect.succeed(input))
      .onComplete(() => Effect.void)
      .onCancel(() => Effect.void)
      .onFail(() => Effect.void);
  }

  onDisable<
    TOnDisableActivity extends (
      payload: TaskOnDisablePayload<TContext>
    ) => Effect.Effect<any, any, any>
  >(
    f: TOnDisableActivity
  ): TaskBuilder<
    TContext,
    TTaskActivities,
    TJoinType,
    TSplitType,
    TWorkItemPayload,
    TTaskMetadata,
    TWorkItemMetadata,
    R | Effect.Effect.Context<ReturnType<TOnDisableActivity>>,
    E | Effect.Effect.Error<ReturnType<TOnDisableActivity>>
  > {
    this.activities.onDisable = f;
    return this;
  }

  onEnable<
    TOnEnableActivity extends (
      payload: TaskOnEnablePayload<TContext>
    ) => Effect.Effect<any, any, any>
  >(
    f: TOnEnableActivity
  ): TaskBuilder<
    TContext,
    TTaskActivities,
    TJoinType,
    TSplitType,
    TWorkItemPayload,
    TTaskMetadata,
    TWorkItemMetadata,
    R | Effect.Effect.Context<ReturnType<TOnEnableActivity>>,
    E | Effect.Effect.Error<ReturnType<TOnEnableActivity>>
  > {
    this.activities.onEnable = f;
    return this;
  }

  onStart<
    TOnStartActivityInput,
    TOnStartActivity extends (
      payload: TaskOnStartPayload<
        TContext,
        TWorkItemPayload,
        Get<TWorkItemMetadata, ['onStart', 'input']>
      >,
      input: TOnStartActivityInput
    ) => Effect.Effect<any, any, any>
  >(
    f: TOnStartActivity
  ): TaskBuilder<
    TContext,
    TTaskActivities,
    TJoinType,
    TSplitType,
    TWorkItemPayload,
    ReplaceProp<
      'onStart',
      TTaskMetadata,
      TaskActivityMetadata<
        Parameters<TOnStartActivity>[1],
        Effect.Effect.Success<ReturnType<TOnStartActivity>>
      >
    >,
    TWorkItemMetadata,
    R | Effect.Effect.Context<ReturnType<TOnStartActivity>>,
    E | Effect.Effect.Error<ReturnType<TOnStartActivity>>
  > {
    this.activities.onStart = f;
    return this;
  }

  onComplete<
    TOnCompleteActivity extends (
      payload: TaskOnCompletePayload<TContext, TWorkItemPayload>
    ) => Effect.Effect<any, any, any>
  >(
    f: TOnCompleteActivity
  ): TaskBuilder<
    TContext,
    TTaskActivities,
    TJoinType,
    TSplitType,
    TWorkItemPayload,
    TTaskMetadata,
    TWorkItemMetadata,
    R | Effect.Effect.Context<ReturnType<TOnCompleteActivity>>,
    E | Effect.Effect.Error<ReturnType<TOnCompleteActivity>>
  > {
    this.activities.onComplete = f;
    return this;
  }

  onCancel<
    TOnCancelActivity extends (
      payload: TaskOnCancelPayload<TContext, TWorkItemPayload>
    ) => Effect.Effect<any, any, any>
  >(
    f: TOnCancelActivity
  ): TaskBuilder<
    TContext,
    TTaskActivities,
    TJoinType,
    TSplitType,
    TWorkItemPayload,
    TTaskMetadata,
    TWorkItemMetadata,
    R | Effect.Effect.Context<ReturnType<TOnCancelActivity>>,
    E | Effect.Effect.Error<ReturnType<TOnCancelActivity>>
  > {
    this.activities.onCancel = f;
    return this;
  }

  onFail<
    TOnFailActivity extends (
      payload: TaskOnFailPayload<TContext, TWorkItemPayload>
    ) => Effect.Effect<any, any, any>
  >(
    f: TOnFailActivity
  ): TaskBuilder<
    TContext,
    TTaskActivities,
    TJoinType,
    TSplitType,
    TWorkItemPayload,
    TTaskMetadata,
    TWorkItemMetadata,
    R | Effect.Effect.Context<ReturnType<TOnFailActivity>>,
    E | Effect.Effect.Error<ReturnType<TOnFailActivity>>
  > {
    this.activities.onFail = f;
    return this;
  }

  withShouldComplete<
    TShouldComplete extends ShouldTaskCompleteFn<TContext, TWorkItemPayload>
  >(
    f: TShouldComplete
  ): TaskBuilder<
    TContext,
    TTaskActivities,
    TJoinType,
    TSplitType,
    TWorkItemPayload,
    TTaskMetadata,
    TWorkItemMetadata,
    R | Effect.Effect.Context<ReturnType<TShouldComplete>>,
    E | Effect.Effect.Error<ReturnType<TShouldComplete>>
  > {
    this.shouldComplete = f;
    return this;
  }

  withShouldFail<
    TShouldFail extends ShouldTaskFailFn<TContext, TWorkItemPayload>
  >(
    f: TShouldFail
  ): TaskBuilder<
    TContext,
    TTaskActivities,
    TJoinType,
    TSplitType,
    TWorkItemPayload,
    TTaskMetadata,
    TWorkItemMetadata,
    R | Effect.Effect.Context<ReturnType<TShouldFail>>,
    E | Effect.Effect.Error<ReturnType<TShouldFail>>
  > {
    this.shouldFail = f;
    return this;
  }

  build(workflow: Workflow, name: string) {
    const { splitType, joinType, activities, shouldComplete, shouldFail } =
      this;

    const task = new Task(
      name,
      workflow,

      activities as unknown as TaskActivities<any, any>,
      this.workItem.build() as AnyWorkItemActivities,
      shouldComplete as ShouldTaskCompleteFn<any, any, never, never>,
      shouldFail as ShouldTaskFailFn<any, any, never, never>,
      {
        splitType,
        joinType,
      }
    );
    workflow.addTask(task);

    return Effect.void;
  }
}

export function task<TContext>() {
  return new TaskBuilder<
    TContext,
    TaskActivities<TContext, undefined>,
    never,
    never
  >().initialize();
}

export function emptyTask<TContext>() {
  return task<TContext>().withShouldComplete(() => Effect.succeed(true));
}
