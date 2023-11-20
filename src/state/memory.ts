import { Effect, Ref } from 'effect';

import {
  ConditionDoesNotExist,
  InvalidTaskStateTransition,
  InvalidWorkItemTransition,
  InvalidWorkflowStateTransition,
  TaskDoesNotExist,
  WorkItemDoesNotExist,
  WorkflowDoesNotExist,
} from '../errors.js';
import { IdGenerator } from '../stateManager/types.js';
import {
  ConditionInstance,
  ConditionName,
  State,
  StateManager,
  TaskInstance,
  TaskInstanceState,
  TaskName,
  WorkItem,
  WorkItemId,
  WorkItemState,
  WorkflowInstanceId,
  WorkflowInstanceState,
  isValidTaskInstanceTransition,
  validWorkItemStateTransitions,
  validWorkflowInstanceTransitions,
} from './types.js';

export class Memory implements StateManager {
  private stateRef: Ref.Ref<State>;
  private idGenerator: IdGenerator;

  constructor(stateRef: Ref.Ref<State>, idGenerator: IdGenerator) {
    this.stateRef = stateRef;
    this.idGenerator = idGenerator;
  }

  initializeWorkflow(payload: {
    id: WorkflowInstanceId;
    name: string;
    tasks: TaskName[];
    conditions: ConditionName[];
  }) {
    return Ref.update(this.stateRef, (state) => {
      const workflowId = payload.id;

      const workflowTasks = payload.tasks.reduce<
        Record<TaskName, TaskInstance>
      >((acc, task) => {
        acc[task] = {
          name: task,
          workflowId,
          generation: 0,
          state: 'disabled',
        };
        return acc;
      }, {});

      const workflowConditions = payload.conditions.reduce<
        Record<ConditionName, ConditionInstance>
      >((acc, condition) => {
        acc[condition] = { name: condition, workflowId, marking: 0 };
        return acc;
      }, {});

      return {
        ...state,
        [workflowId]: {
          workflow: {
            id: workflowId,
            name: payload.name,
            state: 'running',
          },
          tasks: workflowTasks,
          conditions: workflowConditions,
          workItems: {},
          tasksToWorkItems: {},
        },
      };
    });
  }

  getWorkflow(workflowId: WorkflowInstanceId) {
    const self = this;
    return Effect.gen(function* ($) {
      const state = yield* $(Ref.get(self.stateRef));
      const workflow = state[workflowId]?.workflow;

      if (!workflow) {
        return yield* $(Effect.fail(new WorkflowDoesNotExist({ workflowId })));
      }
      return workflow;
    });
  }

  getTasks(workflowId: WorkflowInstanceId) {
    return Ref.get(this.stateRef).pipe(
      Effect.map((state) => {
        return Object.values(state[workflowId]?.tasks ?? {});
      })
    );
  }

  getConditions(id: WorkflowInstanceId) {
    return Ref.get(this.stateRef).pipe(
      Effect.map((state) => {
        return Object.values(state[id]?.conditions ?? {});
      })
    );
  }

  getTask(workflowId: WorkflowInstanceId, taskName: TaskName) {
    const { stateRef } = this;
    return Effect.gen(function* ($) {
      const state = yield* $(Ref.get(stateRef));
      const task = state[workflowId]?.tasks[taskName];

      if (!task) {
        return yield* $(
          Effect.fail(new TaskDoesNotExist({ taskName, workflowId }))
        );
      }

      return task;
    });
  }

  getTaskState(workflowId: WorkflowInstanceId, taskName: TaskName) {
    return this.getTask(workflowId, taskName).pipe(
      Effect.map((task) => task.state)
    );
  }

  getCondition(workflowId: WorkflowInstanceId, conditionName: ConditionName) {
    const { stateRef } = this;
    return Effect.gen(function* ($) {
      const state = yield* $(Ref.get(stateRef));
      const condition = state[workflowId]?.conditions[conditionName];

      if (!condition || condition.workflowId !== workflowId) {
        return yield* $(
          Effect.fail(new ConditionDoesNotExist({ conditionName, workflowId }))
        );
      }

      return condition;
    });
  }

  getConditionMarking(
    workflowId: WorkflowInstanceId,
    conditionName: ConditionName
  ) {
    return this.getCondition(workflowId, conditionName).pipe(
      Effect.map((condition) => condition.marking)
    );
  }

  updateWorkflowState(
    workflowId: WorkflowInstanceId,
    workflowState: Exclude<WorkflowInstanceState, 'running'>
  ) {
    const self = this;
    return Effect.gen(function* ($) {
      const workflow = yield* $(self.getWorkflow(workflowId));

      if (
        !validWorkflowInstanceTransitions[workflow.state].has(workflowState)
      ) {
        return yield* $(
          Effect.fail(
            new InvalidWorkflowStateTransition({
              workflowId,
              from: workflow.state,
              to: workflowState,
            })
          )
        );
      }

      return yield* $(
        Ref.update(self.stateRef, (state) => {
          return {
            ...state,
            [workflowId]: {
              ...state[workflowId],
              workflow: {
                ...state[workflowId]?.workflow,
                state: workflowState,
              },
            },
          };
        })
      );
    });
  }

  updateTaskState(
    workflowId: WorkflowInstanceId,
    taskName: TaskName,
    nextTaskState: TaskInstanceState
  ) {
    const self = this;

    return Effect.gen(function* ($) {
      const task = yield* $(self.getTask(workflowId, taskName));

      if (!isValidTaskInstanceTransition(task.state, nextTaskState)) {
        return yield* $(
          Effect.fail(
            new InvalidTaskStateTransition({
              workflowId,
              taskName,
              from: task.state,
              to: nextTaskState,
            })
          )
        );
      }

      return yield* $(
        Ref.update(self.stateRef, (state) => {
          return {
            ...state,
            [workflowId]: {
              ...state[workflowId],
              tasks: {
                ...state[workflowId]?.tasks,
                [taskName]: {
                  ...state[workflowId]?.tasks[taskName],
                  generation:
                    nextTaskState === 'fired'
                      ? task.generation + 1
                      : task.generation,
                  state: nextTaskState,
                },
              },
            },
          };
        })
      );
    });
  }

  enableTask(workflowId: WorkflowInstanceId, taskName: TaskName) {
    return this.updateTaskState(workflowId, taskName, 'enabled');
  }

  disableTask(workflowId: WorkflowInstanceId, taskName: TaskName) {
    return this.updateTaskState(workflowId, taskName, 'disabled');
  }

  fireTask(workflowId: WorkflowInstanceId, taskName: TaskName) {
    return this.updateTaskState(workflowId, taskName, 'fired');
  }

  exitTask(workflowId: WorkflowInstanceId, taskName: TaskName) {
    return this.updateTaskState(workflowId, taskName, 'exited');
  }

  cancelTask(workflowId: WorkflowInstanceId, taskName: TaskName) {
    return this.updateTaskState(workflowId, taskName, 'canceled');
  }

  failTask(workflowId: WorkflowInstanceId, taskName: TaskName) {
    return this.updateTaskState(workflowId, taskName, 'failed');
  }

  updateCondition(
    workflowId: WorkflowInstanceId,
    conditionName: ConditionName,
    f: (condition: ConditionInstance) => ConditionInstance
  ) {
    const self = this;

    return Effect.gen(function* ($) {
      const condition = yield* $(self.getCondition(workflowId, conditionName));

      return yield* $(
        Ref.update(self.stateRef, (state) => {
          return {
            ...state,
            [workflowId]: {
              ...state[workflowId],
              conditions: {
                ...state[workflowId]?.conditions,
                [conditionName]: f(condition),
              },
            },
          };
        })
      );
    });
  }

  incrementConditionMarking(
    workflowId: WorkflowInstanceId,
    conditionName: ConditionName
  ) {
    return this.updateCondition(workflowId, conditionName, (condition) => {
      return { ...condition, marking: condition.marking + 1 };
    });
  }

  decrementConditionMarking(
    workflowId: WorkflowInstanceId,
    conditionName: ConditionName
  ) {
    return this.updateCondition(workflowId, conditionName, (condition) => {
      return { ...condition, marking: Math.max(condition.marking - 1, 0) };
    });
  }

  emptyConditionMarking(
    workflowId: WorkflowInstanceId,
    conditionName: ConditionName
  ) {
    return this.updateCondition(workflowId, conditionName, (condition) => {
      return { ...condition, marking: 0 };
    });
  }

  createWorkItem(workflowId: WorkflowInstanceId, taskName: TaskName) {
    const self = this;
    return Effect.gen(function* ($) {
      const workItemId = WorkItemId(
        yield* $(self.idGenerator.next('workItem'))
      );
      const task = yield* $(self.getTask(workflowId, taskName));
      const workItem: WorkItem = {
        taskName,
        id: workItemId,
        state: 'running',
      };
      return yield* $(
        Ref.update(self.stateRef, (state) => {
          return {
            ...state,
            [workflowId]: {
              ...state[workflowId],
              workItems: {
                ...state[workflowId]?.workItems,
                [workItemId]: workItem,
              },
              tasksToWorkItems: {
                ...state[workflowId]?.tasksToWorkItems,
                [taskName]: {
                  ...state[workflowId]?.tasksToWorkItems[taskName],
                  [task.generation]: [
                    ...(state[workflowId]?.tasksToWorkItems[taskName]?.[
                      task.generation
                    ] ?? []),
                    workItemId,
                  ],
                },
              },
            },
          };
        })
      );
    });
  }

  getWorkItem(
    workflowId: WorkflowInstanceId,
    taskName: TaskName,
    workItemId: WorkItemId
  ) {
    const self = this;
    return Effect.gen(function* ($) {
      const state = yield* $(Ref.get(self.stateRef));
      const workItem = state[workflowId]?.workItems[workItemId];

      if (!workItem || workItem.taskName !== taskName) {
        return yield* $(
          Effect.fail(new WorkItemDoesNotExist({ workflowId, workItemId }))
        );
      }

      return workItem;
    });
  }

  updateWorkItemState(
    workflowId: WorkflowInstanceId,
    taskName: TaskName,
    workItemId: WorkItemId,
    nextState: WorkItemState
  ) {
    const self = this;
    return Effect.gen(function* ($) {
      const workItem = yield* $(
        self.getWorkItem(workflowId, taskName, workItemId)
      );

      if (!validWorkItemStateTransitions[workItem.state].has(nextState)) {
        return yield* $(
          Effect.fail(
            new InvalidWorkItemTransition({
              workflowId,
              workItemId,
              from: workItem.state,
              to: nextState,
            })
          )
        );
      }

      return yield* $(
        Ref.update(self.stateRef, (state) => {
          return {
            ...state,
            [workflowId]: {
              ...state[workflowId],
              workItems: {
                ...state[workflowId]?.workItems,
                [workItemId]: {
                  ...state[workflowId]?.workItems[workItemId],
                  state: nextState,
                },
              },
            },
          };
        })
      );
    });
  }

  getWorkItems(
    workflowId: WorkflowInstanceId,
    taskName: TaskName,
    workItemState?: WorkItemState
  ) {
    const self = this;
    return Effect.gen(function* ($) {
      const task = yield* $(self.getTask(workflowId, taskName));
      return yield* $(
        Ref.get(self.stateRef).pipe(
          Effect.map((state) => {
            const workItemIds =
              state[workflowId]?.tasksToWorkItems[taskName]?.[
                task.generation
              ] ?? [];
            return workItemIds.reduce<WorkItem[]>((acc, workItemId) => {
              const workItem = state[workflowId]?.workItems[workItemId];
              if (workItem) {
                workItemState
                  ? workItemState === workItem.state && acc.push(workItem)
                  : acc.push(workItem);
              }
              return acc;
            }, []);
          })
        )
      );
    });
  }
}

export function make() {
  return Effect.gen(function* ($) {
    const stateRef = yield* $(Ref.make({}));
    const idGenerator = yield* $(IdGenerator);
    return new Memory(stateRef, idGenerator);
  });
}
