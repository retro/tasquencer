import { Effect, Match, Option, Queue, pipe } from 'effect';

import { TaskActivitiesReturnType } from './builder/TaskBuilder.js';
import {
  Workflow,
  WorkflowTasksActivitiesOutputs,
} from './elements/Workflow.js';
import { InvalidTaskStateTransition } from './errors.js';
import { WorkItemId } from './state/types.js';
import { TaskActionsService } from './types.js';

type QueueItem =
  | { type: 'fire'; taskName: string; input: unknown }
  | { type: 'exit'; taskName: string; input: unknown };

// TODO: Think about refactoring this class so everything is in the Workflow class instead
export class Interpreter<
  TasksActivitiesOutputs extends Record<string, TaskActivitiesReturnType>,
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

  private fireTaskWithoutRunningQueue(taskName: string, input: unknown) {
    const self = this;

    return Effect.gen(function* ($) {
      const task = yield* $(self.workflow.getTask(taskName));
      const taskState = yield* $(task.getState());
      const isEnabled = yield* $(task.isEnabled());
      if (!isEnabled) {
        yield* $(
          Effect.fail(
            new InvalidTaskStateTransition({
              workflowId: self.workflow.id,
              taskName,
              from: taskState,
              to: 'fired',
            })
          )
        );
      }
      const output: unknown = yield* $(
        task.fire(self.context, input),
        Effect.provideService(TaskActionsService, self.getTaskActionsService())
      );

      return output;
    });
  }

  _fireTask(taskName: string, input?: unknown) {
    const self = this;

    return Effect.gen(function* ($) {
      const output = yield* $(
        self.fireTaskWithoutRunningQueue(taskName, input)
      );

      yield* $(self.runQueue());

      return output;
    });
  }

  fireTask<T extends keyof TasksActivitiesOutputs, I>(
    taskName: T & string,
    input?: I
  ) {
    return this._fireTask(taskName, input) as unknown as Effect.Effect<
      R,
      E,
      unknown extends I
        ? undefined
        : unknown extends TasksActivitiesOutputs[T]['onFire']
        ? I
        : TasksActivitiesOutputs[T]['onFire']
    >;
  }

  private exitTaskWithoutRunningQueue(taskName: string, input: unknown) {
    const self = this;

    return Effect.gen(function* ($) {
      const task = yield* $(self.workflow.getTask(taskName));
      const taskState = yield* $(task.getState());
      const isFired = yield* $(task.isFired());
      if (!isFired) {
        yield* $(
          Effect.fail(
            new InvalidTaskStateTransition({
              workflowId: self.workflow.id,
              taskName,
              from: taskState,
              to: 'exited',
            })
          )
        );
      }
      const output: unknown = yield* $(
        task.exit(self.context, input),
        Effect.provideService(TaskActionsService, self.getTaskActionsService())
      );

      return output;
    });
  }

  _exitTask(taskName: string, input?: unknown) {
    const self = this;

    return Effect.gen(function* ($) {
      const output = yield* $(
        self.exitTaskWithoutRunningQueue(taskName, input)
      );

      yield* $(self.runQueue());
      yield* $(self.maybeEnd());

      return output;
    });
  }

  /* exitTask<T extends keyof TasksActivitiesOutputs, I>(
    taskName: T & string,
    input?: I
  ) {
    return this._exitTask(taskName, input) as unknown as Effect.Effect<
      R,
      E,
      unknown extends I
        ? undefined
        : unknown extends TasksActivitiesOutputs[T]['onExit']
        ? I
        : TasksActivitiesOutputs[T]['onExit']
    >;
  }*/

  getWorkItems(taskName: string) {
    const { workflow } = this;
    return Effect.gen(function* ($) {
      const task = yield* $(workflow.getTask(taskName));
      return yield* $(task.getWorkItems());
    });
  }

  completeWorkItem(taskName: string, workItemId: WorkItemId) {
    const self = this;
    return Effect.gen(function* ($) {
      const task = yield* $(self.workflow.getTask(taskName));
      const result = yield* $(
        task.completeWorkItem(workItemId),
        Effect.provideService(TaskActionsService, self.getTaskActionsService())
      );
      yield* $(self.runQueue());
      yield* $(self.maybeEnd());
      return result;
    });
  }

  private getTaskActionsService() {
    const { queue } = this;
    return {
      fireTask(taskName: string, input?: unknown) {
        return pipe(
          Queue.offer(queue, { type: 'fire', taskName, input }),
          Effect.asUnit
        );
      },
      exitTask(taskName: string, input?: unknown) {
        return pipe(
          Queue.offer(queue, { type: 'exit', taskName, input }),
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
          Match.when({ type: 'fire' }, ({ taskName, input }) =>
            self.fireTaskWithoutRunningQueue(taskName, input)
          ),
          Match.when({ type: 'exit' }, ({ taskName, input }) =>
            self.exitTaskWithoutRunningQueue(taskName, input)
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
  getWorkflowTasks() {
    return this.workflow.getTasks();
  }
  getWorkflowConditions() {
    return this.workflow.getConditions();
  }

  getFullState() {
    const self = this;
    return Effect.gen(function* ($) {
      const workflowState = yield* $(self.getWorkflowState());
      const workflowTasks = yield* $(self.getWorkflowTasks());
      const workflowConditions = yield* $(self.getWorkflowConditions());

      return {
        workflow: workflowState,
        tasks: workflowTasks,
        conditions: workflowConditions,
      };
    });
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
