import { JoinType, SplitType } from '../types.js';
import * as Activity from './activity.js';

class Task {
  constructor(private readonly name: string) {}
}

interface TaskActivities {
  onDisable: Activity.OnDisableActivity;
  onEnable: Activity.OnEnableActivity;
  onActivate: Activity.OnActivateActivity;
  onComplete: Activity.OnCompleteActivity;
  onCancel: Activity.OnCancelActivity;
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

export type AnyTaskBuilder = TaskBuilder<
  object,
  TaskActivities,
  JoinType | undefined,
  SplitType | undefined
>;

export class TaskBuilder<
  C extends object,
  TA extends TaskActivities,
  JT extends JoinType | undefined,
  ST extends SplitType | undefined
> {
  private joinType: JoinType | undefined;
  private splitType: SplitType | undefined;
  private Constructor: typeof Task | undefined;
  private activities: TA = {} as TA;

  constructor(params?: {
    joinType?: JT;
    splitType?: ST;
    Constructor?: typeof Task;
  }) {
    this.joinType = params?.joinType;
    this.splitType = params?.splitType;
    this.Constructor = params?.Constructor;
  }

  initialize() {
    return this.onDisable(Activity.onDisable())
      .onEnable(Activity.onEnable())
      .onActivate(Activity.onActivate())
      .onComplete(Activity.onComplete())
      .onCancel(Activity.onCancel());
  }

  onDisable<A extends Activity.OnDisableActivity>(
    activity: A
  ): TaskBuilder<C & Activity.ActivityUserContext<A>, TA, JT, ST> {
    this.activities.onDisable = activity;
    return this;
  }

  onEnable<A extends Activity.OnEnableActivity>(
    activity: A
  ): TaskBuilder<C & Activity.ActivityUserContext<A>, TA, JT, ST> {
    this.activities.onEnable = activity;
    return this;
  }

  onActivate<A extends Activity.OnActivateActivity>(
    activity: A
  ): TaskBuilder<C & Activity.ActivityUserContext<A>, TA, JT, ST> {
    this.activities.onActivate = activity;
    return this;
  }

  onComplete<A extends Activity.OnCompleteActivity>(
    activity: A
  ): TaskBuilder<C & Activity.ActivityUserContext<A>, TA, JT, ST> {
    this.activities.onComplete = activity;
    return this;
  }

  onCancel<A extends Activity.OnCancelActivity>(
    activity: A
  ): TaskBuilder<C & Activity.ActivityUserContext<A>, TA, JT, ST> {
    this.activities.onCancel = activity;
    return this;
  }
  build(name: string) {
    const TaskConstructor = this.Constructor ?? Task;
    return new TaskConstructor(name);
  }
}

export function task<JT extends JoinType, ST extends SplitType>(params?: {
  joinType?: JT;
  splitType?: ST;
  Constructor?: typeof Task;
}) {
  return new TaskBuilder<object, TaskActivities, JT, ST>(params).initialize();
}
