import * as Context from '@effect/data/Context';
import * as Data from '@effect/data/Data';
import * as Duration from '@effect/data/Duration';
import { dual, identity, pipe } from '@effect/data/Function';
import * as HashMap from '@effect/data/HashMap';
import * as HashSet from '@effect/data/HashSet';
import * as Option from '@effect/data/Option';
import * as Struct from '@effect/data/Struct';
import * as Effect from '@effect/io/Effect';
import * as Layer from '@effect/io/Layer';
import * as Ref from '@effect/io/Ref';
import * as R from 'remeda';

import { WNet } from './WNet.js';
import {
  isJoinSatisfied,
  isTaskActivated,
  isTaskEnabled,
} from './interpreter/predicates.js';
import { Memory } from './state-manager/memory.js';
import { StateManager } from './state-manager/types.js';
import type { CancellationRegion, InterpreterState, Net } from './types.js';

export type onStart = (
  state: InterpreterState
) => Effect.Effect<never, never, void>;
export const onStart = Context.Tag<onStart>();

export type onActivate = (
  state: InterpreterState
) => Effect.Effect<never, never, void>;
export const onActivate = Context.Tag<onActivate>();

export type onComplete = (
  state: InterpreterState
) => Effect.Effect<never, never, void>;
export const onComplete = Context.Tag<onComplete>();

export type onCancel = (
  state: InterpreterState
) => Effect.Effect<never, never, void>;
export const onCancel = Context.Tag<onCancel>();

interface TaskNotEnabledError extends Data.Case {
  readonly _tag: 'TaskNotEnabledError';
}
const TaskNotEnabledError = Data.tagged<TaskNotEnabledError>(
  'TaskNotEnabledError'
);

interface TaskNotActivatedError extends Data.Case {
  readonly _tag: 'TaskNotActivatedError';
}
const TaskNotActivatedError = Data.tagged<TaskNotActivatedError>(
  'TaskNotActivatedError'
);

const INITIAL_INTERPRETER_STATE: InterpreterState = Data.struct({
  markings: HashMap.empty<string, number>(),
  enabledTasks: HashSet.empty<string>(),
  activeTasks: HashSet.empty<string>(),
});

interface JSInterpreterState {
  markings: Record<string, number>;
  enabledTasks: Set<string>;
  activeTasks: Set<string>;
}

function JSInterpreterStateToInterpreterState(
  jsState: JSInterpreterState
): InterpreterState {
  return Data.struct({
    markings: HashMap.fromIterable(Object.entries(jsState.markings)),
    enabledTasks: HashSet.fromIterable(jsState.enabledTasks),
    activeTasks: HashSet.fromIterable(jsState.activeTasks),
  });
}

export class Interpreter {
  constructor(
    private net: Net,
    private wNet: WNet,
    private stateManager: StateManager,
    private onStart: Option.Option<onStart>,
    private onActivate: Option.Option<onActivate>,
    private onComplete: Option.Option<onComplete>
  ) {}
  start() {
    return pipe(
      Effect.succeed(this.stateManager),
      Effect.tap(() => this.wNet.startCondition.incrementMarking()),
      Effect.flatMap((stateManager) => stateManager.getState()),
      Effect.tap((state) =>
        Option.match(
          this.onStart,
          () => Effect.unit(),
          (f) => f(state)
        )
      ),
      Effect.map(() => this)
    );
  }

  resume(state: InterpreterState) {
    return pipe(
      Effect.succeed(this.stateManager),
      Effect.tap((stateManager) => stateManager.resume(state)),
      Effect.map(() => this)
    );
  }

  resumeFromJSState(state: JSInterpreterState) {
    return this.resume(JSInterpreterStateToInterpreterState(state));
  }

  activateTask(taskName: string) {
    return pipe(
      this.getState(),
      Effect.map((state) => isTaskEnabled(state, taskName)),
      Effect.ifEffect(
        pipe(
          Effect.succeed(this.stateManager),
          Effect.tap(() => this.wNet.tasks[taskName].activate()),
          Effect.flatMap((stateManager) => stateManager.getState()),
          Effect.tap((state) =>
            Option.match(
              this.onActivate,
              () => Effect.unit(),
              (f) => f(state)
            )
          ),
          Effect.map(() => this)
        ),
        Effect.fail(TaskNotEnabledError())
      )
    );
  }
  completeTask(taskName: string) {
    return pipe(
      this.getState(),
      Effect.map((state) => isTaskActivated(state, taskName)),
      Effect.ifEffect(
        pipe(
          Effect.succeed(this.stateManager),
          Effect.tap(() => this.wNet.tasks[taskName].complete()),
          Effect.flatMap((stateManager) => stateManager.getState()),
          Effect.tap((state) =>
            Option.match(
              this.onComplete,
              () => Effect.unit(),
              (f) => f(state)
            )
          ),
          Effect.map(() => this)
        ),
        Effect.fail(TaskNotActivatedError())
      )
    );
  }
  getState() {
    return this.stateManager.getState();
  }
  getJSState() {
    return pipe(
      this.getState(),
      Effect.map((state) => {
        return {
          markings: Object.fromEntries(state.markings),
          enabledTasks: new Set(state.enabledTasks),
          activeTasks: new Set(state.activeTasks),
        };
      })
    );
  }
}

export function makeInterpreter(net: Net) {
  return Effect.gen(function* ($) {
    const stateRef = yield* $(
      Ref.make<InterpreterState>(INITIAL_INTERPRETER_STATE)
    );

    const stateManager = new Memory(net, stateRef);

    const wNet = new WNet(stateManager, net);

    const onStartCb = yield* $(Effect.serviceOption(onStart));
    const onActivateCb = yield* $(Effect.serviceOption(onActivate));
    const onCompleteCb = yield* $(Effect.serviceOption(onComplete));
    /*const onCancelCb = yield* $(Effect.serviceOption(onCancel));*/

    return new Interpreter(
      net,
      wNet,
      stateManager,
      onStartCb,
      onActivateCb,
      onCompleteCb
    );
  });
}
