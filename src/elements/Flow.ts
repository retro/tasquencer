import * as Effect from '@effect/io/Effect';

import { Condition } from './Condition.js';
import { Task } from './Task.js';

export class ConditionToTaskFlow {
  readonly order = 0;
  readonly predicate: undefined;
  constructor(readonly priorElement: Condition, readonly nextElement: Task) {}
}

export class TaskToConditionFlow {
  readonly order: number;
  readonly isDefault: boolean = false;
  readonly predicate: // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ((...args: any[]) => Effect.Effect<any, any, boolean>) | undefined;
  constructor(
    readonly priorElement: Task,
    readonly nextElement: Condition,
    props: {
      order?: number;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      predicate?: (...args: any[]) => Effect.Effect<any, any, boolean>;
      isDefault?: boolean;
    } = {}
  ) {
    this.order = props.isDefault ? Infinity : props.order ?? Infinity;
    this.predicate = props.predicate;
    this.isDefault = props.isDefault ?? false;
  }
}
