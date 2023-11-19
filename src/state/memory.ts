import { Effect, Ref } from 'effect';

import {
  ConditionDoesNotExist,
  InvalidTaskStateTransition,
  InvalidWorkflowStateTransition,
  TaskDoesNotExist,
  WorkflowDoesNotExist,
} from '../errors.js';
import {
  ConditionInstance,
  ConditionName,
  State,
  StateManager,
  TaskInstance,
  TaskInstanceState,
  TaskName,
  WorkflowInstanceId,
  WorkflowInstanceState,
  validTaskInstanceTransitions,
  validWorkflowInstanceTransitions,
} from './types.js';

function getInitialState(): State {
  return {
    workflows: {},
    tasks: {},
    conditions: {},
    workItems: {},
    workflowsToTasks: {},
    workflowsToConditions: {},
    tasksToWorkItems: {},
  };
}

export class Memory implements StateManager {
  private stateRef: Ref.Ref<State>;

  constructor(stateRef: Ref.Ref<State>) {
    this.stateRef = stateRef;
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

      const existingWorkflowsToTasks = state.workflowsToTasks[workflowId] ?? [];
      const existingWorkflowsToConditions =
        state.workflowsToConditions[workflowId] ?? [];

      return {
        ...state,
        workflows: {
          ...state.workflows,
          [workflowId]: {
            id: workflowId,
            name: payload.name,
            state: 'running',
          },
        },
        tasks: { ...state.tasks, ...workflowTasks },
        conditions: { ...state.conditions, ...workflowConditions },
        workflowsToTasks: {
          ...state.workflowsToTasks,
          [workflowId]: [
            ...existingWorkflowsToTasks,
            ...Object.keys(workflowTasks),
          ],
        },
        workflowsToConditions: {
          ...state.workflowsToConditions,
          [workflowId]: [
            ...existingWorkflowsToConditions,
            ...Object.keys(workflowConditions),
          ],
        },
      };
    });
  }

  getWorkflow(id: WorkflowInstanceId) {
    const self = this;
    return Effect.gen(function* ($) {
      const state = yield* $(Ref.get(self.stateRef));
      const workflow = state.workflows[id];

      if (!workflow) {
        return yield* $(
          Effect.fail(new WorkflowDoesNotExist({ workflowId: id }))
        );
      }
      return workflow;
    });
  }

  getWorkflowTasks(id: WorkflowInstanceId) {
    return Ref.get(this.stateRef).pipe(
      Effect.map((state) => {
        const taskNames = state.workflowsToTasks[id] ?? [];
        return taskNames.reduce<TaskInstance[]>((acc, taskName) => {
          const task = state.tasks[taskName];
          if (task) {
            acc.push(task);
          }
          return acc;
        }, []);
      })
    );
  }

  getWorkflowConditions(id: WorkflowInstanceId) {
    return Ref.get(this.stateRef).pipe(
      Effect.map((state) => {
        const conditionNames = state.workflowsToConditions[id] ?? [];
        return conditionNames.reduce<ConditionInstance[]>((acc, name) => {
          const condition = state.conditions[name];
          if (condition) {
            acc.push(condition);
          }
          return acc;
        }, []);
      })
    );
  }

  getWorkflowTask(workflowId: WorkflowInstanceId, taskName: TaskName) {
    const { stateRef } = this;
    return Effect.gen(function* ($) {
      const state = yield* $(Ref.get(stateRef));
      const task = state.tasks[taskName];

      if (!task || task.workflowId !== workflowId) {
        return yield* $(
          Effect.fail(new TaskDoesNotExist({ taskName, workflowId }))
        );
      }

      return task;
    });
  }

  getWorkflowTaskState(workflowId: WorkflowInstanceId, taskName: TaskName) {
    return this.getWorkflowTask(workflowId, taskName).pipe(
      Effect.map((task) => task.state)
    );
  }

  getWorkflowCondition(
    workflowId: WorkflowInstanceId,
    conditionName: ConditionName
  ) {
    const { stateRef } = this;
    return Effect.gen(function* ($) {
      const state = yield* $(Ref.get(stateRef));
      const condition = state.conditions[conditionName];

      if (!condition || condition.workflowId !== workflowId) {
        return yield* $(
          Effect.fail(new ConditionDoesNotExist({ conditionName, workflowId }))
        );
      }

      return condition;
    });
  }

  getWorkflowConditionMarking(
    workflowId: WorkflowInstanceId,
    conditionName: ConditionName
  ) {
    return this.getWorkflowCondition(workflowId, conditionName).pipe(
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
            workflows: {
              ...state.workflows,
              [workflowId]: { ...workflow, state: workflowState },
            },
          };
        })
      );
    });
  }

  updateWorkflowTaskState(
    workflowId: WorkflowInstanceId,
    taskName: TaskName,
    taskState: TaskInstanceState
  ) {
    const self = this;

    return Effect.gen(function* ($) {
      const task = yield* $(self.getWorkflowTask(workflowId, taskName));

      if (!validTaskInstanceTransitions[task.state].has(taskState)) {
        return yield* $(
          Effect.fail(
            new InvalidTaskStateTransition({
              workflowId,
              taskName,
              from: task.state,
              to: taskState,
            })
          )
        );
      }

      return yield* $(
        Ref.update(self.stateRef, (state) => {
          return {
            ...state,
            tasks: {
              ...state.tasks,
              [taskName]: { ...task, state: taskState },
            },
          };
        })
      );
    });
  }

  enableWorkflowTask(workflowId: WorkflowInstanceId, taskName: TaskName) {
    return this.updateWorkflowTaskState(workflowId, taskName, 'enabled');
  }

  disableWorkflowTask(workflowId: WorkflowInstanceId, taskName: TaskName) {
    return this.updateWorkflowTaskState(workflowId, taskName, 'disabled');
  }

  fireWorkflowTask(workflowId: WorkflowInstanceId, taskName: TaskName) {
    return this.updateWorkflowTaskState(workflowId, taskName, 'fired');
  }

  completeWorkflowTask(workflowId: WorkflowInstanceId, taskName: TaskName) {
    return this.updateWorkflowTaskState(workflowId, taskName, 'completed');
  }

  cancelWorkflowTask(workflowId: WorkflowInstanceId, taskName: TaskName) {
    return this.updateWorkflowTaskState(workflowId, taskName, 'canceled');
  }

  failWorkflowTask(workflowId: WorkflowInstanceId, taskName: TaskName) {
    return this.updateWorkflowTaskState(workflowId, taskName, 'failed');
  }

  updateWorkflowCondition(
    workflowId: WorkflowInstanceId,
    conditionName: ConditionName,
    f: (condition: ConditionInstance) => ConditionInstance
  ) {
    const self = this;

    return Effect.gen(function* ($) {
      const condition = yield* $(
        self.getWorkflowCondition(workflowId, conditionName)
      );

      return yield* $(
        Ref.update(self.stateRef, (state) => {
          return {
            ...state,
            conditions: { ...state.conditions, [conditionName]: f(condition) },
          };
        })
      );
    });
  }

  incrementWorkflowConditionMarking(
    workflowId: WorkflowInstanceId,
    conditionName: ConditionName
  ) {
    return this.updateWorkflowCondition(
      workflowId,
      conditionName,
      (condition) => {
        return { ...condition, marking: condition.marking + 1 };
      }
    );
  }

  decrementWorkflowConditionMarking(
    workflowId: WorkflowInstanceId,
    conditionName: ConditionName
  ) {
    return this.updateWorkflowCondition(
      workflowId,
      conditionName,
      (condition) => {
        return { ...condition, marking: Math.max(condition.marking - 1, 0) };
      }
    );
  }

  emptyWorkflowConditionMarking(
    workflowId: WorkflowInstanceId,
    conditionName: ConditionName
  ) {
    return this.updateWorkflowCondition(
      workflowId,
      conditionName,
      (condition) => {
        return { ...condition, marking: 0 };
      }
    );
  }
}

export function make() {
  return Effect.gen(function* ($) {
    const stateRef = yield* $(Ref.make(getInitialState()));
    return new Memory(stateRef);
  });
}
