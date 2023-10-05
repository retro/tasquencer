import { IdGenerator, WorkflowItem } from '../stateManager/types.js';

import { Effect } from 'effect';

interface WorkflowState {
  tasks: Record<string, string>;
  conditions: Record<string, string>;
}

function workflowItemToWorkflowState(
  workflowItem: WorkflowItem | undefined
): WorkflowState {
  return {
    tasks: Object.fromEntries(
      Object.entries(workflowItem?.tasks ?? {}).map(([, value]) => [
        value.name,
        value.id,
      ])
    ),
    conditions: Object.fromEntries(
      Object.entries(workflowItem?.conditions ?? {}).map(([, value]) => [
        value.name,
        value.id,
      ])
    ),
  };
}

export class IdProvider {
  private readonly state: WorkflowState;
  private readonly idGenerator: IdGenerator;
  constructor(
    workflowItem: WorkflowItem | undefined,
    idGenerator: IdGenerator
  ) {
    this.state = workflowItemToWorkflowState(workflowItem);
    this.idGenerator = idGenerator;
  }
  getTaskId(name: string) {
    const prevId = this.state.tasks[name];
    return prevId ? Effect.succeed(prevId) : this.idGenerator.next('task');
  }
  getConditionId(name: string) {
    const prevId = this.state.conditions[name];
    return prevId ? Effect.succeed(prevId) : this.idGenerator.next('condition');
  }
}
