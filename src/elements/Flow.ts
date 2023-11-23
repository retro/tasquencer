import { Effect } from 'effect';

import { BaseTask } from './BaseTask.js';
import { Condition } from './Condition.js';

export class ConditionToTaskFlow {
  readonly order = 0;
  readonly predicate: undefined;
  constructor(
    readonly priorElement: Condition,
    readonly nextElement: BaseTask
  ) {}
}

export interface TaskToConditionFlowProps {
  order?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  predicate?: (...args: any[]) => Effect.Effect<never, never, boolean>;
  isDefault?: boolean;
}

export class TaskToConditionFlow {
  readonly order: number;
  readonly isDefault: boolean = false;
  readonly predicate: // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ((...args: any[]) => Effect.Effect<never, never, boolean>) | undefined;
  constructor(
    readonly priorElement: BaseTask,
    readonly nextElement: Condition,
    props: TaskToConditionFlowProps = {}
  ) {
    this.order = props.isDefault ? Infinity : props.order ?? Infinity;
    this.predicate = props.predicate;
    this.isDefault = props.isDefault ?? false;
  }
}
