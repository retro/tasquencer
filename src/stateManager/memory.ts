import * as Effect from '@effect/io/Effect';
import * as Ref from '@effect/io/Ref';
import { type Draft, create } from 'mutative';

import type { Condition } from '../elements/Condition.js';
import type { Task } from '../elements/Task.js';
import { WorkflowNotInitialized } from '../elements/Workflow.js';
import { TaskState } from '../types.js';
import {
  type ConditionItem,
  IdGenerator,
  type StateManager,
  type TaskItem,
  type WorkflowItem,
  WorkflowState,
} from './types.js';

type WorkflowStateRef = Ref.Ref<WorkflowState>;

function getInitialWorkflowState(): WorkflowItem {
  return {
    tasks: {},
    conditions: {},
  };
}

function getInitialConditionItem(condition: Condition): ConditionItem {
  return {
    id: condition.id,
    name: condition.name,
    marking: 0,
  };
}

function getInitialTaskItem(task: Task): TaskItem {
  return {
    id: task.id,
    name: task.name,
    state: 'disabled',
  };
}

function updateStoreRef(
  storeRef: WorkflowStateRef,
  updateFn: (draft: Draft<WorkflowState>) => unknown
) {
  return Ref.update(storeRef, (state) => {
    return create(state, (draft) => {
      updateFn(draft);
    });
  });
}

function getWorkflowStateById(storeRef: WorkflowStateRef, workflowId: string) {
  return Effect.gen(function* ($) {
    const store = yield* $(Ref.get(storeRef));
    const workflow = store[workflowId];
    if (workflow) {
      return workflow;
    }
    return yield* $(Effect.fail(WorkflowNotInitialized()));
  });
}

function getTaskState(storeRef: WorkflowStateRef, task: Task) {
  return Effect.gen(function* ($) {
    const workflowState = yield* $(
      getWorkflowStateById(storeRef, task.workflow.id)
    );
    return workflowState.tasks[task.id];
  });
}

function getConditionState(storeRef: WorkflowStateRef, condition: Condition) {
  return Effect.gen(function* ($) {
    const workflowState = yield* $(
      getWorkflowStateById(storeRef, condition.workflow.id)
    );
    return workflowState.conditions[condition.id];
  });
}

export class Memory implements StateManager {
  constructor(
    private readonly storeRef: WorkflowStateRef,
    private readonly idGenerator: IdGenerator
  ) {}

  initializeWorkflow(id: string) {
    const { storeRef } = this;
    return Effect.gen(function* ($) {
      yield* $(
        updateStoreRef(storeRef, (draft) => {
          draft[id] = getInitialWorkflowState();
        })
      );
    });
  }

  incrementConditionMarking(condition: Condition) {
    const { storeRef } = this;
    return Effect.gen(function* ($) {
      // We want to error out if the workflow is not initialized
      getWorkflowStateById(storeRef, condition.workflow.id);

      return yield* $(
        updateStoreRef(storeRef, (draft) => {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const workflow = draft[condition.workflow.id]!;
          const conditionItem =
            workflow.conditions[condition.id] ??
            getInitialConditionItem(condition);
          conditionItem.marking = conditionItem.marking + 1;
          workflow.conditions[condition.id] = conditionItem;
        })
      );
    });
  }
  decrementConditionMarking(condition: Condition) {
    const { storeRef } = this;
    return Effect.gen(function* ($) {
      // We want to error out if the workflow is not initialized
      getWorkflowStateById(storeRef, condition.workflow.id);

      return yield* $(
        updateStoreRef(storeRef, (draft) => {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const workflow = draft[condition.workflow.id]!;
          const conditionItem =
            workflow.conditions[condition.id] ??
            getInitialConditionItem(condition);
          conditionItem.marking = conditionItem.marking - 1;
          workflow.conditions[condition.id] = conditionItem;
        })
      );
    });
  }
  emptyConditionMarking(condition: Condition) {
    const { storeRef } = this;
    return Effect.gen(function* ($) {
      // We want to error out if the workflow is not initialized
      getWorkflowStateById(storeRef, condition.workflow.id);

      return yield* $(
        updateStoreRef(storeRef, (draft) => {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const workflow = draft[condition.workflow.id]!;
          const conditionItem =
            workflow.conditions[condition.id] ??
            getInitialConditionItem(condition);
          conditionItem.marking = 0;
          workflow.conditions[condition.id] = conditionItem;
        })
      );
    });
  }
  getConditionMarking(condition: Condition) {
    const { storeRef } = this;
    return Effect.gen(function* ($) {
      const conditionState = yield* $(getConditionState(storeRef, condition));

      return conditionState?.marking ?? 0;
    });
  }

  updateTaskState(task: Task, taskState: TaskState) {
    const { storeRef } = this;
    return Effect.gen(function* ($) {
      // We want to error out if the workflow is not initialized
      getWorkflowStateById(storeRef, task.workflow.id);

      return yield* $(
        updateStoreRef(storeRef, (draft) => {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const workflow = draft[task.workflow.id]!;
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const taskItem = workflow.tasks[task.id] ?? getInitialTaskItem(task);
          taskItem.state = taskState;
          workflow.tasks[task.id] = taskItem;
        })
      );
    });
  }

  enableTask(task: Task) {
    return this.updateTaskState(task, 'enabled');
  }
  disableTask(task: Task) {
    return this.updateTaskState(task, 'disabled');
  }
  activateTask(task: Task) {
    return this.updateTaskState(task, 'active');
  }
  completeTask(task: Task) {
    return this.updateTaskState(task, 'completed');
  }
  cancelTask(task: Task) {
    return this.updateTaskState(task, 'canceled');
  }
  getTaskState(task: Task) {
    const { storeRef } = this;
    return Effect.gen(function* ($) {
      const taskState = yield* $(getTaskState(storeRef, task));

      return taskState?.state ?? 'disabled';
    });
  }

  getWorkflowState(workflowId: string) {
    const { storeRef } = this;
    return Effect.gen(function* ($) {
      const workflow = yield* $(getWorkflowStateById(storeRef, workflowId));
      return {
        tasks: workflow.tasks,
        conditions: workflow.conditions,
      };
    });
  }
}

export function createMemory() {
  return Effect.gen(function* ($) {
    const idGenerator = yield* $(IdGenerator);
    const storeRef = yield* $(Ref.make({}));

    return new Memory(storeRef, idGenerator);
  });
}
