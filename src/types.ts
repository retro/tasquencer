import * as Effect from '@effect/io/Effect';

import {
  ConditionFlowBuilder,
  OrXorTaskFlowBuilder,
  TaskFlowBuilder,
} from './builder/FlowBuilder.js';
import { AnyTaskBuilder } from './builder/TaskBuilder.js';

export type NotExtends<NS, N> = N extends NS ? never : N;

export type TaskState =
  | 'disabled'
  | 'enabled'
  | 'active'
  | 'completed'
  | 'canceled';

type JoinSplitType = 'and' | 'or' | 'xor';
export type SplitType = JoinSplitType;
export type JoinType = SplitType;

export type FlowType = 'task->condition' | 'condition->task';

export interface OutgoingTaskFlow {
  predicate?: (...args: any[]) => Effect.Effect<any, any, boolean>;
  order?: number;
  isDefault?: true;
}

export interface CancellationRegion {
  tasks?: string[];
  conditions?: string[];
}

export interface ConditionNode {
  isImplicit?: boolean;
}
export interface WorkflowBuilderDefinition {
  startCondition?: string;
  endCondition?: string;
  conditions: Record<string, ConditionNode>;
  tasks: Record<string, AnyTaskBuilder>;
  cancellationRegions: Record<string, CancellationRegion>;
  flows: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    conditions: Record<string, ConditionFlowBuilder<any>>;
    tasks: Record<
      string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      TaskFlowBuilder<any, any> | OrXorTaskFlowBuilder<any, any>
    >;
  };
}
