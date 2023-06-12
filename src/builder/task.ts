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

interface ActivityOutput {
  onDisable: any;
  onEnable: any;
  onActivate: any;
  onComplete: any;
  onCancel: any;
}

export class TaskBuilder<
  C extends object,
  TA extends TaskActivities,
  JT extends JoinType | undefined,
  ST extends SplitType | undefined,
  AO extends ActivityOutput = ActivityOutput
> {
  readonly joinType: JoinType | undefined;
  readonly splitType: SplitType | undefined;
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
    input: A | ((onDisable: typeof Activity.onDisable) => A)
  ): TaskBuilder<
    C & Activity.ActivityUserContext<A>,
    TA,
    JT,
    ST,
    AO & { onDisable: Activity.ActivityOutput<A> }
  > {
    if (input instanceof Activity.ActivityBuilder) {
      this.activities.onDisable = input;
    } else {
      this.activities.onDisable = input(Activity.onDisable);
    }
    return this;
  }

  onEnable<A extends Activity.OnEnableActivity>(
    input: A | ((onEnable: typeof Activity.onEnable) => A)
  ): TaskBuilder<
    C & Activity.ActivityUserContext<A>,
    TA,
    JT,
    ST,
    AO & { onEnable: Activity.ActivityOutput<A> }
  > {
    if (input instanceof Activity.ActivityBuilder) {
      this.activities.onEnable = input;
    } else {
      this.activities.onEnable = input(Activity.onEnable);
    }
    return this;
  }

  onActivate<A extends Activity.OnActivateActivity>(
    input: A | ((onActivate: typeof Activity.onActivate) => A)
  ): TaskBuilder<
    C & Activity.ActivityUserContext<A>,
    TA,
    JT,
    ST,
    AO & { onActivate: Activity.ActivityOutput<A> }
  > {
    if (input instanceof Activity.ActivityBuilder) {
      this.activities.onActivate = input;
    } else {
      this.activities.onActivate = input(Activity.onActivate);
    }
    return this;
  }

  onComplete<A extends Activity.OnCompleteActivity>(
    input: A | ((onComplete: typeof Activity.onComplete) => A)
  ): TaskBuilder<
    C & Activity.ActivityUserContext<A>,
    TA,
    JT,
    ST,
    AO & { onComplete: Activity.ActivityOutput<A> }
  > {
    if (input instanceof Activity.ActivityBuilder) {
      this.activities.onComplete = input;
    } else {
      this.activities.onComplete = input(Activity.onComplete);
    }
    return this;
  }

  onCancel<A extends Activity.OnCancelActivity>(
    input: A | ((onCancel: typeof Activity.onCancel) => A)
  ): TaskBuilder<
    C & Activity.ActivityUserContext<A>,
    TA,
    JT,
    ST,
    AO & { onCancel: Activity.ActivityOutput<A> }
  > {
    if (input instanceof Activity.ActivityBuilder) {
      this.activities.onCancel = input;
    } else {
      this.activities.onCancel = input(Activity.onCancel);
    }
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
