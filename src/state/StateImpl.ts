import { Effect, Ref } from 'effect';

import { State } from '../State.js';
import {
  ConditionDoesNotExistInStore,
  InvalidTaskStateTransition,
  InvalidWorkItemTransition,
  InvalidWorkflowStateTransition,
  TaskDoesNotExistInStore,
  WorkItemDoesNotExist,
  WorkflowDoesNotExist,
} from '../errors.js';
import {
  ConditionInstance,
  ConditionName,
  IdGenerator,
  Store,
  TaskInstance,
  TaskInstanceState,
  TaskName,
  WorkItem,
  WorkItemId,
  WorkItemState,
  WorkflowId,
  WorkflowInstance,
  WorkflowInstanceParent,
  WorkflowInstanceState,
  isValidTaskInstanceTransition,
  validWorkItemStateTransitions,
  validWorkflowInstanceTransitions,
} from '../types.js';

export class StateImpl implements State {
  private stateRef: Ref.Ref<Store>;
  private idGenerator: IdGenerator;

  constructor(stateRef: Ref.Ref<Store>, idGenerator: IdGenerator) {
    this.stateRef = stateRef;
    this.idGenerator = idGenerator;
  }

  initializeWorkflow(
    payload: {
      name: string;
      tasks: TaskName[];
      conditions: ConditionName[];
    },
    parent: WorkflowInstanceParent = null
  ) {
    const { idGenerator, stateRef } = this;
    return Effect.gen(function* ($) {
      const workflowId = yield* $(idGenerator.workflow());
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

      const workflow: WorkflowInstance = {
        parent,
        id: workflowId,
        name: payload.name,
        state: 'running',
      };

      yield* $(
        Ref.update(stateRef, (state) => {
          return {
            ...state,
            [workflowId]: {
              workflow,
              tasks: workflowTasks,
              conditions: workflowConditions,
              workItems: {},
              tasksToWorkItems: {},
            },
          };
        })
      );

      return workflow;
    });
  }

  getWorkflow(workflowId: WorkflowId) {
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

  getTasks(workflowId: WorkflowId) {
    return Ref.get(this.stateRef).pipe(
      Effect.map((state) => {
        return Object.values(state[workflowId]?.tasks ?? {});
      })
    );
  }

  getConditions(id: WorkflowId) {
    return Ref.get(this.stateRef).pipe(
      Effect.map((state) => {
        return Object.values(state[id]?.conditions ?? {});
      })
    );
  }

  getTask(workflowId: WorkflowId, taskName: TaskName) {
    const { stateRef } = this;
    return Effect.gen(function* ($) {
      const state = yield* $(Ref.get(stateRef));
      const task = state[workflowId]?.tasks[taskName];

      if (!task) {
        return yield* $(
          Effect.fail(new TaskDoesNotExistInStore({ taskName, workflowId }))
        );
      }

      return task;
    });
  }

  getTaskState(workflowId: WorkflowId, taskName: TaskName) {
    return this.getTask(workflowId, taskName).pipe(
      Effect.map((task) => task.state)
    );
  }

  getCondition(workflowId: WorkflowId, conditionName: ConditionName) {
    const { stateRef } = this;
    return Effect.gen(function* ($) {
      const state = yield* $(Ref.get(stateRef));
      const condition = state[workflowId]?.conditions[conditionName];

      if (!condition || condition.workflowId !== workflowId) {
        return yield* $(
          Effect.fail(
            new ConditionDoesNotExistInStore({ conditionName, workflowId })
          )
        );
      }

      return condition;
    });
  }

  getConditionMarking(workflowId: WorkflowId, conditionName: ConditionName) {
    return this.getCondition(workflowId, conditionName).pipe(
      Effect.map((condition) => condition.marking)
    );
  }

  updateWorkflowState(
    workflowId: WorkflowId,
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
    workflowId: WorkflowId,
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

  enableTask(workflowId: WorkflowId, taskName: TaskName) {
    return this.updateTaskState(workflowId, taskName, 'enabled');
  }

  disableTask(workflowId: WorkflowId, taskName: TaskName) {
    return this.updateTaskState(workflowId, taskName, 'disabled');
  }

  fireTask(workflowId: WorkflowId, taskName: TaskName) {
    return this.updateTaskState(workflowId, taskName, 'fired');
  }

  exitTask(workflowId: WorkflowId, taskName: TaskName) {
    return this.updateTaskState(workflowId, taskName, 'exited');
  }

  cancelTask(workflowId: WorkflowId, taskName: TaskName) {
    return this.updateTaskState(workflowId, taskName, 'canceled');
  }

  failTask(workflowId: WorkflowId, taskName: TaskName) {
    return this.updateTaskState(workflowId, taskName, 'failed');
  }

  updateCondition(
    workflowId: WorkflowId,
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
    workflowId: WorkflowId,
    conditionName: ConditionName
  ) {
    return this.updateCondition(workflowId, conditionName, (condition) => {
      return { ...condition, marking: condition.marking + 1 };
    });
  }

  decrementConditionMarking(
    workflowId: WorkflowId,
    conditionName: ConditionName
  ) {
    return this.updateCondition(workflowId, conditionName, (condition) => {
      return { ...condition, marking: Math.max(condition.marking - 1, 0) };
    });
  }

  emptyConditionMarking(workflowId: WorkflowId, conditionName: ConditionName) {
    return this.updateCondition(workflowId, conditionName, (condition) => {
      return { ...condition, marking: 0 };
    });
  }

  createWorkItem(
    workflowId: WorkflowId,
    taskName: TaskName,
    payload: unknown = null
  ) {
    const self = this;
    return Effect.gen(function* ($) {
      const workItemId = yield* $(self.idGenerator.workItem());

      const task = yield* $(self.getTask(workflowId, taskName));
      const workItem: WorkItem = {
        taskName,
        id: workItemId,
        state: 'initialized',
        payload,
      };
      yield* $(
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
      return workItem;
    });
  }

  getWorkItem(
    workflowId: WorkflowId,
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
    workflowId: WorkflowId,
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
    workflowId: WorkflowId,
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

  inspect() {
    return Ref.get(this.stateRef);
  }
}

export function make(idGenerator: IdGenerator) {
  return Effect.gen(function* ($) {
    const stateRef = yield* $(Ref.make({}));
    return new StateImpl(stateRef, idGenerator);
  });
}
