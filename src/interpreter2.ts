import * as Data from '@effect/data/Data';
import { pipe } from '@effect/data/Function';
import * as Effect from '@effect/io/Effect';

import { WNet } from './WNet.js';
import { StateManager } from './state-manager/types.js';
import type { Net } from './types.js';

/*export type onStart = (
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
export const onCancel = Context.Tag<onCancel>();*/

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

export class Interpreter {
  constructor(private wNet: WNet, private stateManager: StateManager) {}
  start() {
    return pipe(
      Effect.succeed(this.stateManager),
      Effect.tap(() => this.wNet.startCondition.incrementMarking()),
      Effect.flatMap((stateManager) => stateManager.getState()),
      Effect.map(() => this)
    );
  }

  activateTask(taskName: string) {
    return pipe(
      this.wNet.tasks[taskName].isEnabled(),
      Effect.ifEffect(
        pipe(
          Effect.succeed(this.stateManager),
          Effect.tap(() => this.wNet.tasks[taskName].activate()),
          Effect.flatMap((stateManager) => stateManager.getState()),
          Effect.map(() => this)
        ),
        Effect.fail(TaskNotEnabledError())
      )
    );
  }
  completeTask(taskName: string) {
    return pipe(
      this.wNet.tasks[taskName].isActive(),
      Effect.ifEffect(
        pipe(
          Effect.succeed(this.stateManager),
          Effect.tap(() => this.wNet.tasks[taskName].complete()),
          Effect.flatMap((stateManager) => stateManager.getState()),
          Effect.map(() => this)
        ),
        Effect.fail(TaskNotActivatedError())
      )
    );
  }
  getState() {
    return this.stateManager.getState();
  }
}

export function makeInterpreter(net: Net) {
  return Effect.gen(function* ($) {
    const stateManager = yield* $(StateManager);
    const wNet = new WNet(stateManager, net);

    return new Interpreter(wNet, stateManager);
  });
}
