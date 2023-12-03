import { Effect } from 'effect';
import { Get, Simplify } from 'type-fest';

import { Task } from '../elements/Task.js';
import { Workflow } from '../elements/Workflow.js';
import {
  JoinType,
  ShouldTaskCompleteFn,
  SplitType,
  TaskActivities,
  TaskOnCancelPayload,
  TaskOnCompletePayload,
  TaskOnDisablePayload,
  TaskOnEnablePayload,
  TaskOnStartPayload,
  TaskOnStartSym,
  activeWorkItemInstanceStates,
} from '../types.js';
import {
  AnyWorkItemActivities,
  AnyWorkItemBuilder,
  DefaultWIM,
  InitializedWorkItemBuilder,
  WorkItemBuilder,
  WorkItemBuilderE,
  WorkItemBuilderP,
  WorkItemBuilderR,
  WorkItemBuilderWIM,
  workItem,
} from './WorkItemBuilder.js';

export type TaskBuilderContext<T> = T extends TaskBuilder<
  infer C,
  any,
  any,
  any
>
  ? C
  : never;

export type TaskBuilderSplitType<T> = T extends TaskBuilder<
  any,
  any,
  any,
  infer ST
>
  ? ST
  : never;

export type TaskBuilderActivitiesReturnType<T> = T extends TaskBuilder<
  any,
  any,
  any,
  any,
  any,
  infer AO
>
  ? AO
  : never;

export type TaskBuilderR<T> = T extends TaskBuilder<
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

export type TaskBuilderE<T> = T extends TaskBuilder<
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

export type AnyTaskBuilder<C = any> = TaskBuilder<
  C,
  TaskActivities<C>,
  JoinType | undefined,
  SplitType | undefined
>;

export type InitializedTaskBuilder<C> = TaskBuilder<
  C,
  TaskActivities<C>,
  undefined,
  undefined
>;

interface TaskActivityMetadata<I, R> {
  input: I;
  return: R;
}

type TaskBuilderTM<T> = T extends TaskBuilder<
  any,
  any,
  any,
  any,
  any,
  infer TM,
  any
>
  ? TM
  : never;

type TaskBuilderWIM<T> = T extends TaskBuilder<
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

export type TaskBuilderWIP<T> = T extends TaskBuilder<
  any,
  any,
  any,
  any,
  infer WIP,
  any,
  any,
  any,
  any
>
  ? WIP
  : never;

export type TaskBuilderMetadata<T extends AnyTaskBuilder> = Simplify<
  TaskBuilderTM<T> & Record<string, TaskBuilderWIM<T>>
>;

export class TaskBuilder<
  C,
  TA extends TaskActivities<C>,
  JT extends JoinType | undefined,
  ST extends SplitType | undefined,
  WIP = undefined,
  TM = object,
  WIM = DefaultWIM,
  R = never,
  E = never
> {
  joinType: JoinType | undefined;
  splitType: SplitType | undefined;
  private activities: TA = {} as TA;
  private workItem: AnyWorkItemBuilder = workItem<C, undefined>();
  private shouldComplete: ShouldTaskCompleteFn<any, any> = ({ workItems }) => {
    const hasActiveWorkItems = workItems.some((w) =>
      activeWorkItemInstanceStates.has(w.state)
    );
    return Effect.succeed(workItems.length > 0 && !hasActiveWorkItems);
  };

  withJoinType<T extends JoinType | undefined>(
    joinType: T
  ): TaskBuilder<C, TA, T, ST, WIP, TM, WIM, R, E> {
    this.joinType = joinType;
    return this;
  }

  withSplitType<T extends SplitType | undefined>(
    splitType: T
  ): TaskBuilder<C, TA, JT, T, WIP, TM, WIM, R, E> {
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
  ): TaskBuilder<
    C,
    TA,
    JT,
    ST,
    WIP,
    TM,
    WIM,
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
  ): TaskBuilder<
    C,
    TA,
    JT,
    ST,
    WIP,
    TM,
    WIM,
    R | Effect.Effect.Context<ReturnType<F>>,
    E | Effect.Effect.Error<ReturnType<F>>
  > {
    this.activities.onEnable = f;
    return this;
  }

  onStart<
    I,
    F extends (
      payload: TaskOnStartPayload<C, WIP, Get<WIM, ['onStart', 'input']>>,
      input: I
    ) => Effect.Effect<any, any, any>
  >(
    f: F
  ): TaskBuilder<
    C,
    TA,
    JT,
    ST,
    WIP,
    Simplify<
      Omit<TM, TaskOnStartSym> & {
        [TaskOnStartSym]: TaskActivityMetadata<
          Parameters<F>[1],
          Effect.Effect.Success<ReturnType<F>>
        >;
      }
    >,
    WIM,
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
  ): TaskBuilder<
    C,
    TA,
    JT,
    ST,
    WIP,
    TM,
    WIM,
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
  ): TaskBuilder<
    C,
    TA,
    JT,
    ST,
    WIP,
    TM,
    WIM,
    R | Effect.Effect.Context<ReturnType<F>>,
    E | Effect.Effect.Error<ReturnType<F>>
  > {
    this.activities.onCancel = f;
    return this;
  }

  withWorkItem<P, W extends WorkItemBuilder<C, P, any>>(
    workItem: W
  ): TaskBuilder<
    C,
    TA,
    JT,
    ST,
    P,
    TM,
    WorkItemBuilderWIM<W>,
    R | WorkItemBuilderR<W>,
    E | WorkItemBuilderE<W>
  >;

  withWorkItem<
    P,
    F extends (
      w: <P>() => InitializedWorkItemBuilder<C, P>
    ) => WorkItemBuilder<C, P, any>
  >(
    f: F
  ): TaskBuilder<
    C,
    TA,
    JT,
    ST,
    WorkItemBuilderP<ReturnType<F>>,
    TM,
    WorkItemBuilderWIM<ReturnType<F>>,
    R | WorkItemBuilderR<ReturnType<F>>,
    E | WorkItemBuilderE<ReturnType<F>>
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

  withShouldComplete<F extends ShouldTaskCompleteFn<C, WIP>>(
    f: F
  ): TaskBuilder<
    C,
    TA,
    JT,
    ST,
    WIP,
    TM,
    WIM,
    R | Effect.Effect.Context<ReturnType<F>>,
    E | Effect.Effect.Error<ReturnType<F>>
  > {
    this.shouldComplete = f;
    return this;
  }

  build(workflow: Workflow, name: string) {
    const { splitType, joinType, activities, shouldComplete } = this;

    const task = new Task(
      name,
      workflow,

      activities as unknown as TaskActivities<any>,
      this.workItem.build() as AnyWorkItemActivities,
      shouldComplete as ShouldTaskCompleteFn<any, any, never, never>,
      {
        splitType,
        joinType,
      }
    );
    workflow.addTask(task);

    return Effect.unit;
  }
}

export function task<C>() {
  return new TaskBuilder<C, TaskActivities<C>, never, never>().initialize();
}

export function emptyTask<C>() {
  return task<C>().withShouldComplete(() => Effect.succeed(true));
}
