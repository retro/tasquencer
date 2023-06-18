import * as Effect from '@effect/io/Effect';

import { TaskState } from '../types.js';

type ActivityTypeWithInput = 'activate' | 'complete';
type ActivityTypeWithoutInput = 'disable' | 'enable' | 'cancel';
export type ActivityType = ActivityTypeWithInput | ActivityTypeWithoutInput;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyEffect = Effect.Effect<any, any, any>;

interface DefaultActivityContext {
  getTaskId: () => Effect.Effect<never, never, string>;
  getWorkflowId: () => Effect.Effect<never, never, string>;
  getTaskState: () => Effect.Effect<never, never, TaskState>;
}
interface ActivityContext {
  disable: DefaultActivityContext;
  enable: DefaultActivityContext & {
    activateTask: (payload: unknown) => Effect.Effect<never, never, void>;
  };
  activate: DefaultActivityContext & {
    completeTask: (payload: unknown) => Effect.Effect<never, never, void>;
    cancelTask: (payload: unknown) => Effect.Effect<never, never, void>;
  };
  complete: DefaultActivityContext;
  cancel: DefaultActivityContext;
}

interface ActivityCallbacks {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  before: (...args: any[]) => AnyEffect;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  procedure: (...args: any[]) => AnyEffect;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  after: (...args: any[]) => AnyEffect;
}

export type ActivityOutput<T> = T extends ActivityBuilder<
  ActivityType,
  object,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  infer O
>
  ? O
  : never;

export type ActivityUserContext<T> = T extends ActivityBuilder<
  ActivityType,
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SuccessReturnType<T extends (...args: any[]) => AnyEffect> =
  Effect.Effect.Success<ReturnType<T>>;

export class ActivityBuilder<
  AT extends ActivityType,
  C extends object, // User context
  PI, // Procedure input
  AI, // After input
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  O // Output
> {
  private readonly callbacks: ActivityCallbacks = {} as ActivityCallbacks;
  constructor(private readonly activityType: AT) {}
  initialize() {
    return this.before(({ input }) => Effect.succeed(input))
      .procedure(({ input }) => Effect.succeed(input))
      .after(({ input }) => Effect.succeed(input));
  }
  before<
    CB extends (
      payload: ActivityContext[AT] & {
        context: C;
        input: AT extends ActivityTypeWithInput ? unknown : undefined;
      }
    ) => AnyEffect
  >(
    cb: CB
  ): ActivityBuilder<
    AT,
    C,
    SuccessReturnType<CB>,
    SuccessReturnType<CB>,
    SuccessReturnType<CB>
  > {
    this.callbacks.before = cb;
    return this;
  }
  procedure<
    CB extends (
      payload: ActivityContext[AT] & { context: C; input: PI }
    ) => AnyEffect
  >(
    cb: CB
  ): ActivityBuilder<AT, C, PI, SuccessReturnType<CB>, SuccessReturnType<CB>> {
    this.callbacks.procedure = cb;
    return this;
  }

  after<
    CB extends (
      payload: ActivityContext[AT] & { context: C; input: AI }
    ) => AnyEffect
  >(cb: CB): ActivityBuilder<AT, C, PI, AI, SuccessReturnType<CB>> {
    this.callbacks.after = cb;
    return this;
  }
}

function activityBuilder<AT extends ActivityType, C extends object>(
  activityType: AT & ActivityType
) {
  return new ActivityBuilder<AT, C, unknown, unknown, unknown>(
    activityType
  ).initialize();
}

function makeActivityBuilder<AT extends ActivityType>(activityType: AT) {
  return function <C extends object>() {
    return activityBuilder<AT, C>(activityType);
  };
}

type MakeActivityBuilderType<
  T extends ActivityType,
  C extends object
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
> = ActivityBuilder<T, C, any, any, any>;

export type OnDisableActivity<C extends object = object> =
  MakeActivityBuilderType<'disable', C>;
export type OnEnableActivity<C extends object = object> =
  MakeActivityBuilderType<'enable', C>;
export type OnActivateActivity<C extends object = object> =
  MakeActivityBuilderType<'activate', C>;
export type OnCompleteActivity<C extends object = object> =
  MakeActivityBuilderType<'complete', C>;
export type OnCancelActivity<C extends object = object> =
  MakeActivityBuilderType<'cancel', C>;

const onDisable = makeActivityBuilder('disable');
const onEnable = makeActivityBuilder('enable');
const onActivate = makeActivityBuilder('activate');
const onComplete = makeActivityBuilder('complete');
const onCancel = makeActivityBuilder('cancel');

export { onDisable, onEnable, onActivate, onComplete, onCancel };
