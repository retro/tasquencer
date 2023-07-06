import * as Effect from '@effect/io/Effect';

import { Task } from '../elements/Task.js';
import { Workflow } from '../elements/Workflow.js';
import { JoinType, SplitType } from '../types.js';
import * as AB from './ActivityBuilder.js';
import { IdProvider } from './IdProvider.js';

type ActivityBuilderWithValidContext<C, A> = C extends AB.ActivityUserContext<A>
  ? A
  : never;

export type TaskBuilderUserContext<T> = T extends TaskBuilder<
  infer C,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any
>
  ? C
  : never;

export interface TaskActivities {
  onDisable: AB.OnDisableActivity;
  onEnable: AB.OnEnableActivity;
  onActivate: AB.OnActivateActivity;
  onComplete: AB.OnCompleteActivity;
  onCancel: AB.OnCancelActivity;
}

export type TaskBuilderContext<T> = T extends TaskBuilder<
  infer C,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any
>
  ? C
  : never;

export type TaskBuilderSplitType<T> = T extends TaskBuilder<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  infer ST
>
  ? ST
  : never;

export type TaskBuilderActivityOutputs<T> = T extends TaskBuilder<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  infer AO
>
  ? AO
  : never;

export type AnyTaskBuilder<C extends object = object> = TaskBuilder<
  C,
  TaskActivities,
  JoinType | undefined,
  SplitType | undefined
>;

export type InitializedTaskBuilder<C extends object = object> = TaskBuilder<
  C,
  TaskActivities,
  undefined,
  undefined
>;

export interface ActivitiesReturnEffect {
  onActivate: Effect.Effect<unknown, unknown, unknown>;
  onComplete: Effect.Effect<unknown, unknown, unknown>;
}

export class TaskBuilder<
  C extends object,
  TA extends TaskActivities,
  JT extends JoinType | undefined,
  ST extends SplitType | undefined,
  ARE extends ActivitiesReturnEffect = ActivitiesReturnEffect
> {
  joinType: JoinType | undefined;
  splitType: SplitType | undefined;
  private Constructor: typeof Task | undefined;
  private activities: TA = {} as TA;

  withJoinType<T extends JoinType | undefined>(
    joinType: T
  ): TaskBuilder<C, TA, T, ST, ARE> {
    this.joinType = joinType;
    return this;
  }

  withSplitType<T extends SplitType | undefined>(
    splitType: T
  ): TaskBuilder<C, TA, JT, T, ARE> {
    this.splitType = splitType;
    return this;
  }

  withConstructor(Constructor: typeof Task): TaskBuilder<C, TA, JT, ST, ARE> {
    this.Constructor = Constructor;
    return this;
  }

  initialize() {
    return this.onDisable(AB.onDisable<C>())
      .onEnable(AB.onEnable<C>())
      .onActivate(AB.onActivate<C>())
      .onComplete(AB.onComplete<C>())
      .onCancel(AB.onCancel<C>());
  }

  onDisable<A extends AB.OnDisableActivity<C>>(
    input:
      | (A & ActivityBuilderWithValidContext<C, A>)
      | ((
          onDisable: AB.OnDisableActivity<C>
        ) => A & ActivityBuilderWithValidContext<C, A>)
  ): TaskBuilder<C, TA, JT, ST, ARE> {
    if (input instanceof AB.ActivityBuilder) {
      this.activities.onDisable = input;
    } else {
      this.activities.onDisable = input(AB.onDisable<C>());
    }
    return this;
  }

  onEnable<A extends AB.OnEnableActivity<C>>(
    input:
      | (A & ActivityBuilderWithValidContext<C, A>)
      | ((
          onEnable: AB.OnEnableActivity<C>
        ) => A & ActivityBuilderWithValidContext<C, A>)
  ): TaskBuilder<C, TA, JT, ST, ARE> {
    if (input instanceof AB.ActivityBuilder) {
      this.activities.onEnable = input;
    } else {
      this.activities.onEnable = input(AB.onEnable<C>());
    }
    return this;
  }

  onActivate<A extends AB.OnActivateActivity<C>>(
    input: A
  ): TaskBuilder<
    C,
    TA,
    JT,
    ST,
    Omit<ARE, 'onActivate'> & { onActivate: AB.ActivityReturnEffect<A> }
  >;

  onActivate<
    A extends (onActivate: AB.OnActivateActivity<C>) => AB.OnActivateActivity<C>
  >(
    input: A
  ): TaskBuilder<
    C,
    TA,
    JT,
    ST,
    Omit<ARE, 'onActivate'> & {
      onActivate: AB.ActivityReturnEffect<ReturnType<A>>;
    }
  >;

  onActivate<A extends AB.OnActivateActivity<C>>(
    input:
      | (A & ActivityBuilderWithValidContext<C, A>)
      | ((
          onActivate: AB.OnActivateActivity<C>
        ) => A & ActivityBuilderWithValidContext<C, A>)
  ): TaskBuilder<C, TA, JT, ST, ARE> {
    if (input instanceof AB.ActivityBuilder) {
      this.activities.onActivate = input;
    } else {
      this.activities.onActivate = input(AB.onActivate<C>());
    }
    return this;
  }

  onComplete<A extends AB.OnCompleteActivity<C>>(
    input: A
  ): TaskBuilder<
    C,
    TA,
    JT,
    ST,
    Omit<ARE, 'onComplete'> & { onComplete: AB.ActivityReturnEffect<A> }
  >;

  onComplete<
    A extends (onComplete: AB.OnCompleteActivity<C>) => AB.OnCompleteActivity<C>
  >(
    input: A
  ): TaskBuilder<
    C,
    TA,
    JT,
    ST,
    Omit<ARE, 'onComplete'> & {
      onComplete: AB.ActivityReturnEffect<ReturnType<A>>;
    }
  >;

  onComplete<A extends AB.OnCompleteActivity<C>>(
    input:
      | (A & ActivityBuilderWithValidContext<C, A>)
      | ((
          onComplete: AB.OnCompleteActivity<C>
        ) => A & ActivityBuilderWithValidContext<C, A>)
  ): TaskBuilder<C, TA, JT, ST, ARE> {
    if (input instanceof AB.ActivityBuilder) {
      this.activities.onComplete = input;
    } else {
      this.activities.onComplete = input(AB.onComplete<C>());
    }
    return this;
  }

  onCancel<A extends AB.OnCancelActivity<C>>(
    input:
      | (A & ActivityBuilderWithValidContext<C, A>)
      | ((
          onCancel: AB.OnCancelActivity<C>
        ) => A & ActivityBuilderWithValidContext<C, A>)
  ): TaskBuilder<C, TA, JT, ST, ARE> {
    if (input instanceof AB.ActivityBuilder) {
      this.activities.onCancel = input;
    } else {
      this.activities.onCancel = input(AB.onCancel<C>());
    }
    return this;
  }

  build(workflow: Workflow, name: string, idProvider: IdProvider) {
    const { splitType, joinType, activities } = this;
    return Effect.gen(function* ($) {
      const task = new Task(
        yield* $(idProvider.getTaskId(name)),
        name,
        workflow,
        activities,
        {
          splitType,
          joinType,
        }
      );
      workflow.addTask(task);
    });
  }
}

export function task<C extends object = object>() {
  return new TaskBuilder<C, TaskActivities, never, never>().initialize();
}
