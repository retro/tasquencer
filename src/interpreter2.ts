import * as Data from '@effect/data/Data';
import * as Effect from '@effect/io/Effect';

import { OrXorTaskFlowBuilder } from './builder/FlowBuilder.js';
import { ActivityOutput } from './builder/TaskBuilder.js';
import {
  WorkflowBuilder,
  WorkflowTasksActivitiesOutputs,
} from './builder/WorkflowBuilder.js';
import { Condition } from './elements/Condition.js';
import { ConditionToTaskFlow, TaskToConditionFlow } from './elements/Flow.js';
import { Task } from './elements/Task.js';
import { Workflow } from './elements/Workflow.js';
import { IdGenerator, StateManager } from './stateManager/types.js';

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

export class Interpreter<
  TasksActivitiesOutputs extends Record<string, ActivityOutput>
> {
  constructor(
    private workflow: Workflow,
    private stateManager: StateManager,
    private context: object
  ) {}
  start() {
    const { workflow } = this;
    return Effect.gen(function* ($) {
      yield* $(workflow.initialize());
      const startCondition = yield* $(workflow.getStartCondition());
      yield* $(startCondition.incrementMarking());
    });
  }
  resume() {
    const { workflow } = this;
    return Effect.gen(function* ($) {
      yield* $(workflow.resume());
    });
  }

  activateTask<T extends keyof TasksActivitiesOutputs>(
    taskName: T & string,
    _payload: unknown = undefined
  ) {
    const { workflow } = this;
    return Effect.gen(function* ($) {
      const task = yield* $(workflow.getTask(taskName));
      const isEnabled = yield* $(task.isEnabled());
      if (isEnabled) {
        const output = yield* $(task.activate());
        return output as TasksActivitiesOutputs[T]['onActivate'];
      } else {
        yield* $(Effect.fail(TaskNotEnabledError()));
      }
    });
  }

  completeTask<T extends keyof TasksActivitiesOutputs>(
    taskName: T & string,
    _payload: unknown = undefined
  ) {
    const { workflow } = this;
    return Effect.gen(function* ($) {
      const task = yield* $(workflow.getTask(taskName));
      const isActive = yield* $(task.isActive());
      if (isActive) {
        const output = yield* $(task.complete());
        return output as TasksActivitiesOutputs[T]['onComplete'];
      } else {
        yield* $(Effect.fail(TaskNotActivatedError()));
      }
    });
  }

  getState() {
    const { workflow, stateManager } = this;
    return Effect.gen(function* ($) {
      return yield* $(stateManager.getWorkflowState(workflow));
    });
  }
}

export function make<
  W extends Workflow,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  C extends W extends Workflow<infer WC> ? WC : object
>(workflow: W, context: C) {
  return Effect.gen(function* ($) {
    const stateManager = yield* $(StateManager);

    return new Interpreter<{
      [K in keyof WorkflowTasksActivitiesOutputs<W>]: WorkflowTasksActivitiesOutputs<W>[K];
    }>(workflow, stateManager, context);
  });
}
