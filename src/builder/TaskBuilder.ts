import { Task } from '../elements/Task.js';
import { JoinType, SplitType } from '../types.js';
import * as AB from './ActivityBuilder.js';

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

interface TaskActivities {
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

export interface ActivityOutput {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onActivate: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onComplete: any;
}

export class TaskBuilder<
  C extends object,
  TA extends TaskActivities,
  JT extends JoinType | undefined,
  ST extends SplitType | undefined,
  AO extends ActivityOutput = ActivityOutput
> {
  joinType: JoinType | undefined;
  splitType: SplitType | undefined;
  private Constructor: typeof Task | undefined;
  private activities: TA = {} as TA;

  withJoinType<T extends JoinType | undefined>(
    joinType: T
  ): TaskBuilder<C, TA, T, ST, AO> {
    this.joinType = joinType;
    return this;
  }

  withSplitType<T extends SplitType | undefined>(
    splitType: T
  ): TaskBuilder<C, TA, JT, T, AO> {
    this.splitType = splitType;
    return this;
  }

  withConstructor(Constructor: typeof Task): TaskBuilder<C, TA, JT, ST, AO> {
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
  ): TaskBuilder<C, TA, JT, ST, AO> {
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
  ): TaskBuilder<C, TA, JT, ST, AO> {
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
    Omit<AO, 'onActivate'> & { onActivate: AB.ActivityOutput<A> }
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
    Omit<AO, 'onActivate'> & { onActivate: AB.ActivityOutput<ReturnType<A>> }
  >;

  onActivate<A extends AB.OnActivateActivity<C>>(
    input:
      | (A & ActivityBuilderWithValidContext<C, A>)
      | ((
          onActivate: AB.OnActivateActivity<C>
        ) => A & ActivityBuilderWithValidContext<C, A>)
  ): TaskBuilder<C, TA, JT, ST, AO> {
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
    Omit<AO, 'onComplete'> & { onComplete: AB.ActivityOutput<A> }
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
    Omit<AO, 'onComplete'> & { onComplete: AB.ActivityOutput<ReturnType<A>> }
  >;

  onComplete<A extends AB.OnCompleteActivity<C>>(
    input:
      | (A & ActivityBuilderWithValidContext<C, A>)
      | ((
          onComplete: AB.OnCompleteActivity<C>
        ) => A & ActivityBuilderWithValidContext<C, A>)
  ): TaskBuilder<C, TA, JT, ST, AO> {
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
  ): TaskBuilder<C, TA, JT, ST, AO> {
    if (input instanceof AB.ActivityBuilder) {
      this.activities.onCancel = input;
    } else {
      this.activities.onCancel = input(AB.onCancel<C>());
    }
    return this;
  }
}

export function task<C extends object = object>() {
  return new TaskBuilder<C, TaskActivities, never, never>().initialize();
}
