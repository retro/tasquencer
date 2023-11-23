/*export interface StateManager {
  initializeWorkflow(payload: {
    id: WorkflowInstanceId;
    name: string;
    tasks: TaskName[];
    conditions: ConditionName[];
  }): Effect.Effect<never, never, void>;

  getWorkflow(
    id: WorkflowInstanceId
  ): Effect.Effect<never, WorkflowDoesNotExist, WorkflowInstance>;

  getTasks(id: WorkflowInstanceId): Effect.Effect<never, never, TaskInstance[]>;

  getConditions(
    id: WorkflowInstanceId
  ): Effect.Effect<never, never, ConditionInstance[]>;

  getTask(
    workflowId: WorkflowInstanceId,
    taskName: TaskName
  ): Effect.Effect<never, TaskDoesNotExist, TaskInstance>;

  getTaskState(
    workflowId: WorkflowInstanceId,
    taskName: TaskName
  ): Effect.Effect<never, TaskDoesNotExist, TaskInstanceState>;

  getCondition(
    workflowId: WorkflowInstanceId,
    conditionName: ConditionName
  ): Effect.Effect<never, ConditionDoesNotExist, ConditionInstance>;

  getConditionMarking(
    workflowId: WorkflowInstanceId,
    conditionName: ConditionName
  ): Effect.Effect<never, ConditionDoesNotExist, number>;

  updateWorkflowState(
    workflowId: WorkflowInstanceId,
    workflowState: Exclude<WorkflowInstanceState, 'running'>
  ): Effect.Effect<
    never,
    WorkflowDoesNotExist | InvalidWorkflowStateTransition,
    void
  >;

  updateTaskState(
    workflowId: WorkflowInstanceId,
    taskName: TaskName,
    taskState: TaskInstanceState
  ): Effect.Effect<never, TaskDoesNotExist | InvalidTaskStateTransition, void>;

  enableTask(
    workflowId: WorkflowInstanceId,
    taskName: TaskName
  ): Effect.Effect<never, TaskDoesNotExist | InvalidTaskStateTransition, void>;

  disableTask(
    workflowId: WorkflowInstanceId,
    taskName: TaskName
  ): Effect.Effect<never, TaskDoesNotExist | InvalidTaskStateTransition, void>;

  fireTask(
    workflowId: WorkflowInstanceId,
    taskName: TaskName
  ): Effect.Effect<never, TaskDoesNotExist | InvalidTaskStateTransition, void>;

  exitTask(
    workflowId: WorkflowInstanceId,
    taskName: TaskName
  ): Effect.Effect<never, TaskDoesNotExist | InvalidTaskStateTransition, void>;

  cancelTask(
    workflowId: WorkflowInstanceId,
    taskName: TaskName
  ): Effect.Effect<never, TaskDoesNotExist | InvalidTaskStateTransition, void>;

  failTask(
    workflowId: WorkflowInstanceId,
    taskName: TaskName
  ): Effect.Effect<never, TaskDoesNotExist | InvalidTaskStateTransition, void>;

  updateCondition(
    workflowId: WorkflowInstanceId,
    conditionName: ConditionName,
    f: (condition: ConditionInstance) => ConditionInstance
  ): Effect.Effect<never, ConditionDoesNotExist, void>;

  incrementConditionMarking(
    workflowId: WorkflowInstanceId,
    conditionName: ConditionName
  ): Effect.Effect<never, ConditionDoesNotExist, void>;

  decrementConditionMarking(
    workflowId: WorkflowInstanceId,
    conditionName: ConditionName
  ): Effect.Effect<never, ConditionDoesNotExist, void>;

  emptyConditionMarking(
    workflowId: WorkflowInstanceId,
    conditionName: ConditionName
  ): Effect.Effect<never, ConditionDoesNotExist, void>;

  createWorkItem(
    workflowId: WorkflowInstanceId,
    taskName: TaskName,
    payload: unknown
  ): Effect.Effect<never, TaskDoesNotExist, WorkItem>;

  getWorkItem(
    workflowId: WorkflowInstanceId,
    taskName: TaskName,
    workItemId: WorkItemId
  ): Effect.Effect<never, WorkItemDoesNotExist, WorkItem>;

  updateWorkItemState(
    workflowId: WorkflowInstanceId,
    taskName: TaskName,
    workItemId: WorkItemId,
    nextState: WorkItemState
  ): Effect.Effect<
    never,
    InvalidWorkItemTransition | WorkItemDoesNotExist,
    void
  >;

  getWorkItems(
    workflowId: WorkflowInstanceId,
    taskName: TaskName,
    workItemState?: WorkItemState
  ): Effect.Effect<never, TaskDoesNotExist, WorkItem[]>;
}

export const StateManager = Context.Tag<StateManager>();*/
