import * as Data from '@effect/data/Data';

export interface TaskDoesNotExist extends Data.Case {
  readonly _tag: 'TaskDoesNotExist';
}
export const TaskDoesNotExist =
  Data.tagged<TaskDoesNotExist>('TaskDoesNotExist');

export interface StartConditionDoesNotExist extends Data.Case {
  readonly _tag: 'StartConditionDoesNotExist';
}
export const StartConditionDoesNotExist =
  Data.tagged<StartConditionDoesNotExist>('StartConditionDoesNotExist');

export interface EndConditionDoesNotExist extends Data.Case {
  readonly _tag: 'EndConditionDoesNotExist';
}
export const EndConditionDoesNotExist = Data.tagged<EndConditionDoesNotExist>(
  'EndConditionDoesNotExist'
);

export interface WorkflowNotInitialized extends Data.Case {
  readonly _tag: 'WorkflowNotInitialized';
}
export const WorkflowNotInitialized = Data.tagged<WorkflowNotInitialized>(
  'WorkflowNotInitialized'
);

export interface ConditionDoesNotExist extends Data.Case {
  readonly _tag: 'ConditionDoesNotExist';
}
export const ConditionDoesNotExist = Data.tagged<ConditionDoesNotExist>(
  'ConditionDoesNotExist'
);
