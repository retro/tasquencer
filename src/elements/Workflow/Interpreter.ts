import { Effect } from 'effect';

import { State } from '../../State.js';
import { InvalidTaskStateTransition } from '../../errors.js';
import {
  TaskActionsService,
  WorkItemId,
  WorkflowId,
  WorkflowInstanceParent,
  finalWorkflowInstanceStates,
} from '../../types.js';
import { Task } from '../Task.js';
import { Workflow } from '../Workflow.js';

type QueueItem =
  | { type: 'fire'; taskName: string; input: unknown }
  | { type: 'exit'; taskName: string; input: unknown };

export class Interpreter {
  private queues = new Map<string, QueueItem[]>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly workflow: Workflow<any, any, any, any, any>) {}

  initializeWorkflow(
    context: unknown,
    parent: WorkflowInstanceParent | null = null
  ) {
    return this.workflow.initialize(context, parent);
  }

  startWorkflow(workflowId: WorkflowId, input: unknown) {
    const self = this;
    return Effect.gen(function* ($) {
      const defaultActivityPayload = yield* $(
        self.getDefaultActivityPayload(workflowId)
      );
      const performStart = yield* $(
        Effect.once(
          Effect.gen(function* ($) {
            yield* $(self.workflow.start(workflowId));
            const startCondition = yield* $(self.workflow.getStartCondition());
            yield* $(
              Effect.succeed(startCondition),
              Effect.tap((s) => s.incrementMarking(workflowId)),
              Effect.tap((s) => s.enableTasks(workflowId)),
              Effect.provideService(
                TaskActionsService,
                self.getTaskActionsService(workflowId)
              )
            );

            yield* $(self.runQueue(workflowId));
            yield* $(self.maybeEnd(workflowId));
          })
        )
      );

      const result = yield* $(
        self.workflow.onStart(
          {
            ...defaultActivityPayload,
            startWorkflow: () => performStart,
          },
          input
        ) as Effect.Effect<never, never, unknown>
      );

      yield* $(performStart);

      return result;
    });
  }

  cancelWorkflow(workflowId: WorkflowId) {
    return this.workflow.cancel(workflowId);
  }

  maybeEnd(workflowId: WorkflowId) {
    const self = this;
    return Effect.gen(function* ($) {
      const workflowState = yield* $(self.workflow.getState(workflowId));
      const isEndReached = yield* $(self.workflow.isEndReached(workflowId));
      if (
        isEndReached &&
        !finalWorkflowInstanceStates.has(workflowState.state)
      ) {
        const defaultActivityPayload = yield* $(
          self.getDefaultActivityPayload(workflowId)
        );
        const performEnd = yield* $(Effect.once(self.workflow.end(workflowId)));

        yield* $(
          self.workflow.onEnd({
            ...defaultActivityPayload,
            endWorkflow() {
              return performEnd;
            },
          }) as Effect.Effect<never, never, unknown>
        );

        yield* $(performEnd);
      }
    });
  }

  fireTaskWithoutRunningQueue(
    workflowId: WorkflowId,
    taskName: string,
    input: unknown
  ) {
    const self = this;

    return Effect.gen(function* ($) {
      const task = yield* $(self.workflow.getTask(taskName));
      const taskState = yield* $(task.getTaskState(workflowId));
      const isEnabled = yield* $(task.isEnabled(workflowId));
      console.log('TASK STATE', taskState);
      if (!isEnabled) {
        yield* $(
          Effect.fail(
            new InvalidTaskStateTransition({
              workflowId: workflowId,
              taskName,
              from: taskState,
              to: 'fired',
            })
          )
        );
      }
      const output: unknown = yield* $(
        task.fire(workflowId, input),
        Effect.provideService(
          TaskActionsService,
          self.getTaskActionsService(workflowId)
        )
      );

      return output;
    });
  }

  fireTask(workflowId: WorkflowId, taskName: string, input?: unknown) {
    const self = this;
    console.log('FIRE TASK', workflowId, taskName, input);
    return Effect.gen(function* ($) {
      const output = yield* $(
        self.fireTaskWithoutRunningQueue(workflowId, taskName, input)
      );

      return output;
    });
  }

  exitTaskWithoutRunningQueue(
    workflowId: WorkflowId,
    taskName: string,
    input: unknown
  ) {
    const self = this;

    return Effect.gen(function* ($) {
      const task = yield* $(self.workflow.getTask(taskName));
      const taskState = yield* $(task.getTaskState(workflowId));
      const isFired = yield* $(task.isFired(workflowId));
      if (!isFired) {
        yield* $(
          Effect.fail(
            new InvalidTaskStateTransition({
              workflowId: workflowId,
              taskName,
              from: taskState,
              to: 'exited',
            })
          )
        );
      }
      const output: unknown = yield* $(
        task.exit(workflowId, input),
        Effect.provideService(
          TaskActionsService,
          self.getTaskActionsService(workflowId)
        )
      );

      return output;
    });
  }

  exitTask(workflowId: WorkflowId, taskName: string, input?: unknown) {
    const self = this;

    return Effect.gen(function* ($) {
      const output = yield* $(
        self.exitTaskWithoutRunningQueue(workflowId, taskName, input)
      );

      yield* $(self.runQueue(workflowId));
      yield* $(self.maybeEnd(workflowId));

      return output;
    });
  }

  maybeExitTaskWithoutRunningQueue(workflowId: WorkflowId, taskName: string) {
    const self = this;

    return Effect.gen(function* ($) {
      const task = yield* $(self.workflow.getTask(taskName));
      const taskState = yield* $(task.getTaskState(workflowId));
      const isFired = yield* $(task.isFired(workflowId));
      if (!isFired) {
        yield* $(
          Effect.fail(
            new InvalidTaskStateTransition({
              workflowId: workflowId,
              taskName,
              from: taskState,
              to: 'exited',
            })
          )
        );
      }
      const output: unknown = yield* $(
        task.maybeExit(workflowId),
        Effect.provideService(
          TaskActionsService,
          self.getTaskActionsService(workflowId)
        )
      );

      return output;
    });
  }

  maybeExitTask(workflowId: WorkflowId, taskName: string) {
    const self = this;

    return Effect.gen(function* ($) {
      const output = yield* $(
        self.maybeExitTaskWithoutRunningQueue(workflowId, taskName)
      );

      yield* $(self.runQueue(workflowId));
      yield* $(self.maybeEnd(workflowId));

      return output;
    });
  }

  getWorkItems(workflowId: WorkflowId, taskName: string) {
    const { workflow } = this;
    return Effect.gen(function* ($) {
      const task = yield* $(workflow.getTask(taskName));
      if (task instanceof Task) {
        return yield* $(task.getWorkItems(workflowId));
      }
      return []; // TODO: Should fail
    });
  }

  completeWorkItem(
    workflowId: WorkflowId,
    taskName: string,
    workItemId: WorkItemId
  ) {
    const self = this;
    return Effect.gen(function* ($) {
      const task = yield* $(self.workflow.getTask(taskName));
      if (task instanceof Task) {
        const result = yield* $(
          task.completeWorkItem(workflowId, workItemId),
          Effect.provideService(
            TaskActionsService,
            self.getTaskActionsService(workflowId)
          )
        );
        yield* $(self.runQueue(workflowId));
        yield* $(self.maybeEnd(workflowId));
        return result;
      } else {
        return; // TODO: Should fail
      }
    });
  }

  addToQueue(workflowId: WorkflowId, item: QueueItem) {
    if (!this.queues.get(workflowId)) {
      this.queues.set(workflowId, []);
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this.queues.get(workflowId)!.push(item);
    return Effect.unit;
  }

  runQueue(workflowId: WorkflowId) {
    const self = this;
    return Effect.gen(function* ($) {
      while (self.queues.get(workflowId)) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const queue = self.queues.get(workflowId)!;
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        self.queues.delete(workflowId);
        for (const item of queue) {
          switch (item.type) {
            case 'fire':
              yield* $(
                self.fireTaskWithoutRunningQueue(
                  workflowId,
                  item.taskName,
                  item.input
                )
              );
              break;
            case 'exit':
              yield* $(
                self.exitTaskWithoutRunningQueue(
                  workflowId,
                  item.taskName,
                  item.input
                )
              );
              break;
          }
        }
      }
    });
  }

  runQueueAndMaybeEnd(workflowId: WorkflowId) {
    const self = this;
    return Effect.gen(function* ($) {
      yield* $(self.runQueue(workflowId));
      yield* $(self.maybeEnd(workflowId));
    });
  }

  getTaskActionsService(workflowId: WorkflowId) {
    const self = this;
    return {
      fireTask(taskName: string, input?: unknown) {
        return self.addToQueue(workflowId, { type: 'fire', taskName, input });
      },
      exitTask(taskName: string, input?: unknown) {
        return self.addToQueue(workflowId, { type: 'exit', taskName, input });
      },
    };
  }

  getDefaultActivityPayload(workflowId: WorkflowId) {
    return Effect.gen(function* ($) {
      const stateManager = yield* $(State);
      return {
        getWorkflowContext() {
          return stateManager
            .getWorkflow(workflowId)
            .pipe(Effect.map((w) => w.context));
        },
        updateWorkflowContext(context: unknown) {
          return stateManager.updateWorkflowContext(workflowId, context);
        },
      };
    });
  }
}
