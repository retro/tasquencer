import { Effect } from 'effect';

import {
  IdGenerator,
  StorePersistableState,
  WorkItemId,
  WorkflowId,
} from '../index.js';

export function makeIdGenerator(): IdGenerator {
  const ids = {
    workItem: 0,
    workflow: 0,
  };
  return {
    workflow() {
      ids.workflow++;
      return Effect.succeed(WorkflowId(`workflow-${ids.workflow}`));
    },
    workItem() {
      ids.workItem++;
      return Effect.succeed(WorkItemId(`workItem-${ids.workItem}`));
    },
  };
}

export function getEnabledTaskNames(state: StorePersistableState) {
  const tasks = state.tasks
    .filter((t) => t.state === 'enabled')
    .map((t) => t.name);
  return new Set(tasks);
}
