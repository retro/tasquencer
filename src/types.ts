import * as Effect from '@effect/io/Effect';

import { AnyTaskBuilder } from './builder/TaskBuilder.js';

export type Prettify<T> = {
  [K in keyof T]: T[K];
} & object;

export type Without<T, U> = {
  [P in Exclude<keyof T, keyof U>]?: never;
};

export type XOR<T, U> = T | U extends object
  ? Prettify<Without<T, U> & U> | Prettify<Without<U, T> & T>
  : T | U;

export interface ConditionNode {
  name: string;
  isImplicit?: boolean;
}

type JoinSplitType = 'and' | 'or' | 'xor';
export type SplitType = JoinSplitType;
export type JoinType = SplitType;

export interface TaskNode {
  name: string;
  splitType?: SplitType;
  joinType?: JoinType;
}

export interface CancellationRegion {
  tasks?: string[];
  conditions?: string[];
}

export type RemoveIndex<T> = {
  [K in keyof T as string extends K
    ? never
    : number extends K
    ? never
    : K]: T[K];
};

export type KnownKeys<T> = keyof RemoveIndex<T>;

export type Identity<T> = T extends object
  ? {
      [P in keyof T]: Identity<T[P]>;
    }
  : T;

export type KnownIdentity<T> = T extends object
  ? {
      [P in KnownKeys<T>]: KnownIdentity<T[P]>;
    }
  : T;

export type FlowType = 'task->condition' | 'condition->task';

export interface Flow {
  predicate?: (context: unknown, net: BuilderNet) => boolean;
  order?: number;
  isDefault?: true;
}

export interface PredicateFlow<Context> {
  order: number;
  predicate: (context: Context) => Effect.Effect<any, any, boolean>;
}

export interface DefaultFlow {
  isDefault: true;
}

export type FlowProps<T> = Omit<T, 'from' | 'to' | 'type'>;

export interface BuilderNet {
  startCondition?: string;
  endCondition?: string;
  conditions: Record<string, ConditionNode>;
  tasks: Record<string, AnyTaskBuilder>;
  cancellationRegions: Record<string, CancellationRegion>;
  flows: {
    tasks: Record<string, Record<string, Flow>>;
    conditions: Record<string, Set<string>>;
  };
}

export interface Net extends BuilderNet {
  startCondition: string;
  endCondition: string;
  incomingFlows: {
    tasks: Record<string, Set<string>>;
    conditions: Record<string, Set<string>>;
  };
}

export type ImplicitConditionName<
  N1 extends string,
  N2 extends string
> = `implicit:${N1}->${N2}`;

export type NotExtends<NS, N> = N extends NS ? never : N;

export type WTaskState =
  | 'disabled'
  | 'enabled'
  | 'active'
  | 'completed'
  | 'canceled';
