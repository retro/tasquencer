import * as Effect from '@effect/io/Effect';
import * as Ref from '@effect/io/Ref';
import { type Draft, create } from 'mutative';

import type { Condition } from '../Condition.js';
import type { Task } from '../Task.js';
import { WTaskState } from '../types.js';
import {
  ConditionItem,
  StateManager,
  TaskItem,
  WorkflowItem,
  WorkflowState,
} from './types.js';

function getInitialWorkflowState(): WorkflowItem {
  return {
    tasks: {},
    conditions: {},
  };
}

function getInitialConditionItem(condition: Condition): ConditionItem {
  return {
    name: condition.name,
    marking: 0,
  };
}

function getInitialTaskItem(task: Task): TaskItem {
  return {
    name: task.name,
    state: 'disabled',
  };
}
function updateStoreRef(
  storeRef: Ref.Ref<WorkflowState>,
  updateFn: (draft: Draft<WorkflowState>) => unknown
) {
  return Ref.update(storeRef, (state) =>
    create(state, (draft) => {
      updateFn(draft);
    })
  );
}

export class Memory implements StateManager {
  constructor(private readonly storeRef: Ref.Ref<WorkflowState>) {}

  initializeWorkflow() {
    const { storeRef } = this;
    return Effect.gen(function* ($) {
      const id = 'workflow-id';
      yield* $(
        updateStoreRef(storeRef, (draft) => {
          draft[id] = getInitialWorkflowState();
        })
      );
      return id;
    });
  }

  incrementConditionMarking(condition: Condition) {
    const { storeRef } = this;
    return Effect.gen(function* ($) {
      const workflowID = yield* $(condition.workflow.getID());

      return yield* $(
        // TODO: validate that workflow exists
        updateStoreRef(storeRef, (draft) => {
          const workflow = draft[workflowID];
          const conditionItem =
            workflow.conditions[condition.name] ??
            getInitialConditionItem(condition);
          conditionItem.marking = conditionItem.marking + 1;
          workflow.conditions[condition.name] = conditionItem;
        })
      );
    });
  }
  decrementConditionMarking(condition: Condition) {
    const { storeRef } = this;
    return Effect.gen(function* ($) {
      const workflowID = yield* $(condition.workflow.getID());

      return yield* $(
        // TODO: validate that workflow exists
        // TODO: validate that condition exists and has positive marking
        updateStoreRef(storeRef, (draft) => {
          const workflow = draft[workflowID];
          const conditionItem =
            workflow.conditions[condition.name] ??
            getInitialConditionItem(condition);
          conditionItem.marking = conditionItem.marking - 1;
          workflow.conditions[condition.name] = conditionItem;
        })
      );
    });
  }
  emptyConditionMarking(condition: Condition) {
    const { storeRef } = this;
    return Effect.gen(function* ($) {
      const workflowID = yield* $(condition.workflow.getID());

      return yield* $(
        // TODO: validate that workflow exists
        updateStoreRef(storeRef, (draft) => {
          const workflow = draft[workflowID];
          const conditionItem =
            workflow.conditions[condition.name] ??
            getInitialConditionItem(condition);
          conditionItem.marking = 0;
          workflow.conditions[condition.name] = conditionItem;
        })
      );
    });
  }
  getConditionMarking(condition: Condition) {
    const { storeRef } = this;
    return Effect.gen(function* ($) {
      // TODO: validate that workflow exists
      const workflowID = yield* $(condition.workflow.getID());
      const workflow = yield* $(Ref.get(storeRef));
      return workflow[workflowID]?.conditions[condition.name]?.marking ?? 0;
    });
  }

  updateTaskState(task: Task, taskState: WTaskState) {
    const { storeRef } = this;
    return Effect.gen(function* ($) {
      const workflowID = yield* $(task.workflow.getID());

      return yield* $(
        updateStoreRef(storeRef, (draft) => {
          const workflow = draft[workflowID];
          const taskItem =
            workflow.tasks[task.name] ?? getInitialTaskItem(task);
          taskItem.state = taskState;
          workflow.tasks[task.name] = taskItem;
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
    return this.updateTaskState(task, 'cancelled');
  }
  getTaskState(task: Task) {
    const { storeRef } = this;
    return Effect.gen(function* ($) {
      const workflowID = yield* $(task.workflow.getID());
      const store = yield* $(Ref.get(storeRef));
      return store[workflowID]?.tasks[task.name]?.state ?? 'disabled';
    });
  }

  getWorkflowState(workflowID: string) {
    const { storeRef } = this;
    return Effect.gen(function* ($) {
      const state = yield* $(Ref.get(storeRef));
      return state[workflowID];
    });
  }
}

export function createMemory(initialState?: WorkflowState) {
  return Effect.gen(function* ($) {
    const storeRef = yield* $(Ref.make(initialState ?? {}));

    return new Memory(storeRef);
  });
}
