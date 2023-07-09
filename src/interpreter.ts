import { pipe } from '@effect/data/Function';
import * as Option from '@effect/data/Option';
import * as Effect from '@effect/io/Effect';
import * as Queue from '@effect/io/Queue';
import * as Match from '@effect/match';

import { ActivitiesReturnType } from './builder/TaskBuilder.js';
import {
  Workflow,
  WorkflowTasksActivitiesOutputs,
} from './elements/Workflow.js';
import { TaskNotActiveError, TaskNotEnabledError } from './errors.js';
import { TaskActionsService } from './types.js';

type QueueItem =
  | { type: 'activate'; taskName: string; input: unknown }
  | { type: 'complete'; taskName: string; input: unknown };

// TODO: Think about refactoring this class so everything is in the Workflow class instead
export class Interpreter<
  TasksActivitiesOutputs extends Record<string, ActivitiesReturnType>,
  OnStartReturnType = unknown,
  R = never,
  E = never
> {
  constructor(
    private workflow: Workflow,
    private context: object,
    private queue: Queue.Queue<QueueItem>
  ) {}
  // TODO: Check if workflow was already started
  private _start(input: unknown) {
    const self = this;
    return Effect.gen(function* ($) {
      const performStart = yield* $(
        Effect.once(
          Effect.gen(function* ($) {
            yield* $(self.workflow.initialize());

            const startCondition = yield* $(self.workflow.getStartCondition());
            yield* $(
              Effect.succeed(startCondition),
              Effect.tap((s) => s.incrementMarking()),
              Effect.tap((s) => s.enableTasks(self.context)),
              Effect.provideService(
                TaskActionsService,
                self.getTaskActionsService()
              )
            );

            yield* $(self.runQueue());
            yield* $(self.maybeEnd());
          })
        )
      );

      const result = yield* $(
        self.workflow.onStart({
          context: self.context,
          input,
          getWorkflowId() {
            return Effect.succeed(self.workflow.id);
          },
          startWorkflow() {
            return performStart;
          },
        }) as Effect.Effect<never, never, unknown>
      );

      yield* $(performStart);

      return result;
    });
  }

  start<I>(input?: I) {
    return this._start(input) as Effect.Effect<
      | Effect.Effect.Context<
          ReturnType<Interpreter<TasksActivitiesOutputs>['_start']>
        >
      | R,
      | Effect.Effect.Error<
          ReturnType<Interpreter<TasksActivitiesOutputs>['_start']>
        >
      | E,
      unknown extends I
        ? undefined
        : unknown extends OnStartReturnType
        ? I
        : OnStartReturnType
    >;
  }

  private maybeEnd() {
    const { workflow, context } = this;
    return Effect.gen(function* ($) {
      if (yield* $(workflow.isEndReached())) {
        const performEnd = yield* $(Effect.once(workflow.end()));

        yield* $(
          workflow.onEnd({
            context,
            getWorkflowId() {
              return Effect.succeed(workflow.id);
            },
            endWorkflow() {
              return performEnd;
            },
          }) as Effect.Effect<never, never, unknown>
        );

        yield* $(performEnd);
      }
    });
  }

  private activateTaskWithoutRunningQueue(taskName: string, input: unknown) {
    const self = this;

    return Effect.gen(function* ($) {
      const task = yield* $(self.workflow.getTask(taskName));
      const isEnabled = yield* $(task.isEnabled());
      if (!isEnabled) {
        yield* $(Effect.fail(TaskNotEnabledError()));
      }
      const output: unknown = yield* $(
        task.activate(self.context, input),
        Effect.provideService(TaskActionsService, self.getTaskActionsService())
      );

      return output;
    });
  }

  _activateTask(taskName: string, input?: unknown) {
    const self = this;

    return Effect.gen(function* ($) {
      const output = yield* $(
        self.activateTaskWithoutRunningQueue(taskName, input)
      );

      yield* $(self.runQueue());

      return output;
    });
  }

  activateTask<T extends keyof TasksActivitiesOutputs, I>(
    taskName: T & string,
    input?: I
  ) {
    return this._activateTask(taskName, input) as unknown as Effect.Effect<
      R,
      E,
      unknown extends I
        ? undefined
        : unknown extends TasksActivitiesOutputs[T]['onActivate']
        ? I
        : TasksActivitiesOutputs[T]['onActivate']
    >;
  }

  private completeTaskWithoutRunningQueue(taskName: string, input: unknown) {
    const self = this;

    return Effect.gen(function* ($) {
      const task = yield* $(self.workflow.getTask(taskName));
      const isActive = yield* $(task.isActive());
      if (!isActive) {
        yield* $(Effect.fail(TaskNotActiveError()));
      }
      const output: unknown = yield* $(
        task.complete(self.context, input),
        Effect.provideService(TaskActionsService, self.getTaskActionsService())
      );

      return output;
    });
  }

  _completeTask(taskName: string, input?: unknown) {
    const self = this;

    return Effect.gen(function* ($) {
      const output = yield* $(
        self.completeTaskWithoutRunningQueue(taskName, input)
      );

      yield* $(self.runQueue());
      yield* $(self.maybeEnd());

      return output;
    });
  }

  completeTask<T extends keyof TasksActivitiesOutputs, I>(
    taskName: T & string,
    input?: I
  ) {
    return this._completeTask(taskName, input) as unknown as Effect.Effect<
      R,
      E,
      unknown extends I
        ? undefined
        : unknown extends TasksActivitiesOutputs[T]['onComplete']
        ? I
        : TasksActivitiesOutputs[T]['onComplete']
    >;
  }

  _executeTask(taskName: string, input?: unknown) {
    const self = this;

    return Effect.gen(function* ($) {
      const task = yield* $(self.workflow.getTask(taskName));
      const isActive = yield* $(task.isActive());
      if (!isActive) {
        yield* $(Effect.fail(TaskNotActiveError()));
      }
      const output: unknown = yield* $(
        task.execute(self.context, input),
        Effect.provideService(TaskActionsService, self.getTaskActionsService())
      );

      yield* $(self.runQueue());
      yield* $(self.maybeEnd());

      return output;
    });
  }

  executeTask<T extends keyof TasksActivitiesOutputs, I>(
    taskName: T & string,
    input?: I
  ) {
    return this._executeTask(taskName, input) as unknown as Effect.Effect<
      R,
      E,
      unknown extends I
        ? undefined
        : unknown extends TasksActivitiesOutputs[T]['onExecute']
        ? I
        : TasksActivitiesOutputs[T]['onExecute']
    >;
  }

  private getTaskActionsService() {
    const { queue } = this;
    return {
      activateTask(taskName: string, input?: unknown) {
        return pipe(
          Queue.offer(queue, { type: 'activate', taskName, input }),
          Effect.asUnit
        );
      },
      completeTask(taskName: string, input?: unknown) {
        return pipe(
          Queue.offer(queue, { type: 'complete', taskName, input }),
          Effect.asUnit
        );
      },
    };
  }

  private _cancelWorkflow() {
    return this.workflow.cancel(this.context);
  }

  cancelWorkflow() {
    return this._cancelWorkflow() as Effect.Effect<
      | Effect.Effect.Context<
          ReturnType<Interpreter<TasksActivitiesOutputs>['_cancelWorkflow']>
        >
      | R,
      | Effect.Effect.Error<
          ReturnType<Interpreter<TasksActivitiesOutputs>['_cancelWorkflow']>
        >
      | E,
      Effect.Effect.Success<
        ReturnType<Interpreter<TasksActivitiesOutputs>['_cancelWorkflow']>
      >
    >;
  }

  private runQueue() {
    const self = this;
    return Effect.gen(function* ($) {
      while (true) {
        const item = yield* $(
          Queue.poll(self.queue),
          Effect.map(Option.getOrNull)
        );

        if (item === null) {
          break;
        }

        const match = pipe(
          Match.type<QueueItem>(),
          Match.when({ type: 'activate' }, ({ taskName, input }) =>
            self.activateTaskWithoutRunningQueue(taskName, input)
          ),
          Match.when({ type: 'complete' }, ({ taskName, input }) =>
            self.completeTaskWithoutRunningQueue(taskName, input)
          ),
          Match.exhaustive
        );

        yield* $(match(item));
      }
    });
  }

  getWorkflowState() {
    return this.workflow.getState();
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type WorkflowR<T> = T extends Workflow<infer R, any, any> ? R : never;
type WorkflowE<T> = T extends Workflow<any, infer E, any> ? E : never;
type WorkflowContext<T> = T extends Workflow<any, any, infer C> ? C : never;
type WorkflowOnStartReturnType<T> = T extends Workflow<
  any,
  any,
  any,
  any,
  infer R
>
  ? R
  : never;
/* eslint-enable @typescript-eslint/no-explicit-any */

export function make<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  W extends Workflow<any, any, any, any, any>,
  R extends WorkflowR<W> = WorkflowR<W>,
  E extends WorkflowE<W> = WorkflowE<W>,
  C extends WorkflowContext<W> = WorkflowContext<W>
>(workflow: W, context: C) {
  return Effect.gen(function* ($) {
    const queue = yield* $(Queue.unbounded<QueueItem>());

    return new Interpreter<
      WorkflowTasksActivitiesOutputs<W>,
      WorkflowOnStartReturnType<W>,
      R,
      E
    >(workflow, context, queue);
  });
}
