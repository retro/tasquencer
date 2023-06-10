import * as Effect from '@effect/io/Effect';
import { ArgumentsType } from 'vitest';

import { JoinType, SplitType } from './types.js';

export type Prettify<T> = {
  [K in keyof T]: T[K];
} & object;

interface OnCallbacks {
  onDisabled: (...args: any[]) => any;
  onEnabled: (...args: any[]) => any;
  onActivated: (...args: any[]) => any;
  onCompleted: (...args: any[]) => any;
  onCanceled: (...args: any[]) => any;
}

class TaskBuilder<TC extends object, O extends OnCallbacks> {
  private joinType: JoinType | undefined;
  private splitType: SplitType | undefined;
  private Constructor: typeof Task | undefined;
  private onCallbacks: O = {} as O;

  constructor(params?: {
    joinType?: JoinType;
    splitType?: SplitType;
    Constructor?: typeof Task;
  }) {
    this.joinType = params?.joinType;
    this.splitType = params?.splitType;
    this.Constructor = params?.Constructor;
  }

  initializeCallbacks() {
    return this.onDisabled((_context) => Effect.unit())
      .onEnabled((_context) => Effect.unit())
      .onActivated((_context) => Effect.unit())
      .onCompleted((_context) => Effect.unit())
      .onCanceled((_context) => Effect.unit());
  }

  onDisabled<C extends object, R extends Effect.Effect<any, any, any>>(
    callback: (context: C) => R
  ): TaskBuilder<
    TC & C,
    Omit<O, 'onDisabled'> & {
      onDisabled: typeof callback;
    }
  > {
    this.onCallbacks.onDisabled = callback;
    return this;
  }

  onEnabled<C extends object, R extends Effect.Effect<any, any, any>>(
    callback: (context: C) => R
  ): TaskBuilder<
    TC & C,
    Omit<O, 'onEnabled'> & {
      onEnabled: typeof callback;
    }
  > {
    this.onCallbacks.onEnabled = callback;
    return this;
  }

  onActivated<C extends object, P, R extends Effect.Effect<any, any, any>>(
    callback: (context: C, payload: P) => R
  ): TaskBuilder<
    TC & C,
    Omit<O, 'onActivated'> & {
      onActivated: typeof callback;
    }
  > {
    this.onCallbacks.onActivated = callback;
    return this;
  }

  onCompleted<
    C extends object,
    P extends unknown[] & { length: 0 | 1 },
    R extends Effect.Effect<any, any, any>
  >(
    callback: (context: C, ...payload: P) => R
  ): TaskBuilder<
    TC & C,
    Omit<O, 'onCompleted'> & {
      onCompleted: P['length'] extends 1
        ? (context: C, payload: P[0]) => R
        : (context: C) => R;
    }
  > {
    this.onCallbacks.onCompleted = callback;
    return this;
  }

  onCanceled<C extends object, R extends Effect.Effect<any, any, any>>(
    callback: (context: C) => R
  ): TaskBuilder<
    TC & C,
    Omit<O, 'onCanceled'> & {
      onCanceled: typeof callback;
    }
  > {
    this.onCallbacks.onCanceled = callback;
    return this;
  }

  build<C extends TC>(context: C) {
    const TaskConstructor = this.Constructor ?? Task;
    return new TaskConstructor<
      Prettify<C>,
      {
        [K in keyof O]: O[K];
      }
    >(context, this.onCallbacks);
  }
}

function task(params?: { joinType?: JoinType; splitType?: SplitType }) {
  return new TaskBuilder(params).initializeCallbacks();
}

class Task<C, O extends OnCallbacks> {
  constructor(private readonly context: C, private readonly onCallbacks: O) {}
  activate(
    payload: ArgumentsType<O['onActivated']>[1]
  ): ReturnType<O['onActivated']> {
    return this.onCallbacks.onActivated(this.context, payload);
  }
  complete(
    ...args: ArgumentsType<O['onCompleted']>['length'] extends 1
      ? []
      : [ArgumentsType<O['onCompleted']>[1]]
  ): ReturnType<O['onCompleted']> {
    const payload = args[0];
    return this.onCallbacks.onCompleted(this.context, payload);
  }
}

const t = task()
  .onActivated((_context, foo: string) => {
    return Effect.succeed(foo);
  })
  .onCompleted((_context, foo: string) => {
    return Effect.succeed(foo);
  });

const tt = t.build({ foo: 'bar' }).complete('A');

function a(foo: string, bar: string) {}

type B = ArgumentsType<typeof a>['length'] extends 1 ? string : never;
