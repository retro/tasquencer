import * as Effect from '@effect/io/Effect';

import { TaskState } from '../types.js';

type ActivityTypeWithInput = 'activate' | 'complete';
type ActivityTypeWithoutInput = 'disable' | 'enable' | 'cancel';
export type ActivityType = ActivityTypeWithInput | ActivityTypeWithoutInput;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyEffect = Effect.Effect<any, any, any>;

export type ActivityReturnEffect<
  T extends ActivityBuilder<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Effect.Effect<any, any, any>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Effect.Effect<any, any, any>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Effect.Effect<any, any, any>
  >
> = T extends ActivityBuilder<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  infer BRT,
  infer FRT,
  infer ART
>
  ? Effect.Effect<
      | (unknown extends Effect.Effect.Context<BRT>
          ? never
          : Effect.Effect.Context<BRT>)
      | (unknown extends Effect.Effect.Context<FRT>
          ? never
          : Effect.Effect.Context<FRT>)
      | (unknown extends Effect.Effect.Context<ART>
          ? never
          : Effect.Effect.Context<ART>),
      | (unknown extends Effect.Effect.Error<BRT>
          ? never
          : Effect.Effect.Error<BRT>)
      | (unknown extends Effect.Effect.Error<FRT>
          ? never
          : Effect.Effect.Error<FRT>)
      | (unknown extends Effect.Effect.Error<ART>
          ? never
          : Effect.Effect.Error<ART>),
      Effect.Effect.Success<ART>
    >
  : never;

interface DefaultActivityContext {
  getTaskId: () => Effect.Effect<never, never, string>;
  getTaskName: () => Effect.Effect<never, never, string>;
  getWorkflowId: () => Effect.Effect<never, never, string>;
  getTaskState: () => Effect.Effect<never, never, TaskState>;
}
interface ActivityContext {
  disable: DefaultActivityContext;
  enable: DefaultActivityContext & {
    activateTask: () => Effect.Effect<never, never, void>;
  };
  activate: DefaultActivityContext & {
    completeTask: (input?: unknown) => Effect.Effect<never, never, void>;
  };
  complete: DefaultActivityContext;
  cancel: DefaultActivityContext;
}

interface ActivityCallbacks {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  before: (...args: any[]) => AnyEffect;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fn: (...args: any[]) => AnyEffect;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  after: (...args: any[]) => AnyEffect;
}

export type ActivityUserContext<T> = T extends ActivityBuilder<
  ActivityType,
  infer C,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Effect.Effect<any, any, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Effect.Effect<any, any, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Effect.Effect<any, any, any>
>
  ? C
  : never;

export class ActivityBuilder<
  AT extends ActivityType,
  C extends object, // User context
  FI, // Fn input
  AI, // After input
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  BRT extends Effect.Effect<any, any, any>, // Before return type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  FRT extends Effect.Effect<any, any, any>, // Fn return type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
  ART extends Effect.Effect<any, any, any> // After return type
> {
  readonly callbacks: ActivityCallbacks = {} as ActivityCallbacks;
  constructor(private readonly activityType: AT) {}
  initialize() {
    return this.before(({ input }) => Effect.succeed(input))
      .fn(({ input }) => Effect.succeed(input))
      .after(({ input }) => Effect.succeed(input));
  }
  before<
    CB extends (
      payload: ActivityContext[AT] & {
        context: C;
        input: AT extends ActivityTypeWithInput ? unknown : undefined;
      }
    ) => Effect.Effect<unknown, unknown, unknown>
  >(
    cb: CB
  ): ActivityBuilder<
    AT,
    C,
    Effect.Effect.Success<ReturnType<CB>>,
    Effect.Effect.Success<ReturnType<CB>>,
    ReturnType<CB>,
    ReturnType<CB>,
    ReturnType<CB>
  > {
    this.callbacks.before = cb;
    return this;
  }
  fn<
    CB extends (
      payload: ActivityContext[AT] & { context: C; input: FI }
    ) => Effect.Effect<unknown, unknown, unknown>
  >(
    cb: CB
  ): ActivityBuilder<
    AT,
    C,
    Effect.Effect.Success<BRT>,
    Effect.Effect.Success<ReturnType<CB>>,
    BRT,
    ReturnType<CB>,
    ReturnType<CB>
  > {
    this.callbacks.fn = cb;
    return this;
  }

  after<
    CB extends (
      payload: ActivityContext[AT] & { context: C; input: AI }
    ) => Effect.Effect<unknown, unknown, unknown>
  >(
    cb: CB
  ): ActivityBuilder<
    AT,
    C,
    FI,
    unknown extends Effect.Effect.Success<FRT>
      ? Effect.Effect.Success<BRT>
      : Effect.Effect.Success<FRT>,
    BRT,
    FRT,
    ReturnType<CB>
  > {
    this.callbacks.after = cb;
    return this;
  }
}

function activityBuilder<AT extends ActivityType, C extends object>(
  activityType: AT & ActivityType
) {
  return new ActivityBuilder<
    AT,
    C,
    unknown,
    unknown,
    Effect.Effect<unknown, unknown, unknown>,
    Effect.Effect<unknown, unknown, unknown>,
    Effect.Effect<unknown, unknown, unknown>
  >(activityType).initialize();
}

function makeActivityBuilder<AT extends ActivityType>(activityType: AT) {
  return function <C extends object>() {
    return activityBuilder<AT, C>(activityType);
  };
}

type MakeActivityBuilderType<
  T extends ActivityType,
  C extends object
> = ActivityBuilder<
  T,
  C,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Effect.Effect<any, any, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Effect.Effect<any, any, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Effect.Effect<any, any, any>
>;

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
