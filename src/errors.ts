import { Data } from 'effect';

export class StartConditionDoesNotExist extends Data.TaggedClass(
  'StartConditionDoesNotExist'
)<{
  readonly workflowId: string;
}> {}

export class EndConditionDoesNotExist extends Data.TaggedClass(
  'EndConditionDoesNotExist'
)<{
  readonly workflowId: string;
}> {}
export class TaskDoesNotExist extends Data.TaggedClass('TaskDoesNotExist')<{
  readonly taskName: string;
  readonly workflowId: string;
}> {}

export class WorkItemDoesNotExist extends Data.TaggedClass(
  'WorkItemDoesNotExist'
)<{
  readonly workflowId: string;
  readonly workItemId: string;
}> {}

export class InvalidTaskStateTransition extends Data.TaggedClass(
  'InvalidTaskStateTransition'
)<{
  readonly taskName: string;
  readonly workflowId: string;
  readonly from: string;
  readonly to: string;
}> {}

export class InvalidWorkItemTransition extends Data.TaggedClass(
  'InvalidWorkItemTransition'
)<{
  readonly workItemId: string;
  readonly workflowId: string;
  readonly from: string;
  readonly to: string;
}> {}

export class InvalidTaskState extends Data.TaggedClass('InvalidTaskState')<{
  readonly taskName: string;
  readonly workflowId: string;
  readonly state: string;
}> {}

export class ConditionDoesNotExist extends Data.TaggedClass(
  'ConditionDoesNotExist'
)<{
  readonly conditionName: string;
  readonly workflowId: string;
}> {}

export class WorkflowDoesNotExist extends Data.TaggedClass(
  'WorkflowDoesNotExist'
)<{
  readonly workflowId: string;
}> {}

export class InvalidWorkflowStateTransition extends Data.TaggedClass(
  'InvalidWorkflowStateTransition'
)<{
  readonly workflowId: string;
  readonly from: string;
  readonly to: string;
}> {}
