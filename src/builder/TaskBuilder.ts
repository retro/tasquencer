import { Effect } from 'effect';

import { Task } from '../elements/Task.js';
import { Workflow } from '../elements/Workflow.js';
import {
  JoinType,
  SplitType,
  TaskActivities,
  TaskAnyWorkItemHandlers,
  TaskOnCancelPayload,
  TaskOnDisablePayload,
  TaskOnEnablePayload,
  TaskOnExitPayload,
  TaskOnFirePayload,
} from '../types.js';
import {
  AnyWorkItemBuilder,
  ValidWorkItemBuilder,
  WorkItemBuilder,
  WorkItemBuilderE,
  WorkItemBuilderR,
  workItem,
} from './WorkItemBuilder.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type TaskBuilderUserContext<T> = T extends TaskBuilder<
  infer C,
  any,
  any,
  any
>
  ? C
  : never;
/* eslint-enable @typescript-eslint/no-explicit-any */

/* eslint-disable @typescript-eslint/no-explicit-any */
export type TaskBuilderContext<T> = T extends TaskBuilder<
  infer C,
  any,
  any,
  any
>
  ? C
  : never;
/* eslint-enable @typescript-eslint/no-explicit-any */

/* eslint-disable @typescript-eslint/no-explicit-any */
export type TaskBuilderSplitType<T> = T extends TaskBuilder<
  any,
  any,
  any,
  infer ST
>
  ? ST
  : never;
/* eslint-enable @typescript-eslint/no-explicit-any */

/* eslint-disable @typescript-eslint/no-explicit-any */
export type TaskBuilderActivitiesReturnType<T> = T extends TaskBuilder<
  any,
  any,
  any,
  any,
  infer AO
>
  ? AO
  : never;
/* eslint-enable @typescript-eslint/no-explicit-any */

/* eslint-disable @typescript-eslint/no-explicit-any */
export type TaskBuilderR<T> = T extends TaskBuilder<
  any,
  any,
  any,
  any,
  any,
  infer R
>
  ? R
  : never;
/* eslint-enable @typescript-eslint/no-explicit-any */

/* eslint-disable @typescript-eslint/no-explicit-any */
export type TaskBuilderE<T> = T extends TaskBuilder<
  any,
  any,
  any,
  any,
  any,
  any,
  infer E
>
  ? E
  : never;
/* eslint-enable @typescript-eslint/no-explicit-any */

export type AnyTaskBuilder<C extends object = object> = TaskBuilder<
  C,
  TaskActivities<C>,
  JoinType | undefined,
  SplitType | undefined
>;

export type InitializedTaskBuilder<C extends object = object> = TaskBuilder<
  C,
  TaskActivities<C>,
  undefined,
  undefined
>;

export interface ActivitiesReturnType {
  onFire: unknown;
  onExit: unknown;
}

export class TaskBuilder<
  C extends object,
  TA extends TaskActivities<C>,
  JT extends JoinType | undefined,
  ST extends SplitType | undefined,
  ART = ActivitiesReturnType,
  R = never,
  E = never
> {
  joinType: JoinType | undefined;
  splitType: SplitType | undefined;
  private workItemBuilder: AnyWorkItemBuilder = workItem();
  private Constructor: typeof Task = Task;
  private activities: TA = {} as TA;

  withJoinType<T extends JoinType | undefined>(
    joinType: T
  ): TaskBuilder<C, TA, T, ST, ART, R, E> {
    this.joinType = joinType;
    return this;
  }

  withSplitType<T extends SplitType | undefined>(
    splitType: T
  ): TaskBuilder<C, TA, JT, T, ART, R, E> {
    this.splitType = splitType;
    return this;
  }

  withConstructor(
    Constructor: typeof Task
  ): TaskBuilder<C, TA, JT, ST, ART, R, E> {
    this.Constructor = Constructor;
    return this;
  }

  initialize() {
    return this.onDisable(() => Effect.unit)
      .onEnable(() => Effect.unit)
      .onFire(({ input }) => Effect.succeed(input))
      .onExit(({ input }) => Effect.succeed(input))
      .onCancel(() => Effect.unit);
  }

  onDisable<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    F extends (payload: TaskOnDisablePayload<C>) => Effect.Effect<any, any, any>
  >(
    f: F
  ): TaskBuilder<
    C,
    TA,
    JT,
    ST,
    ART,
    R | Effect.Effect.Context<ReturnType<F>>,
    E | Effect.Effect.Error<ReturnType<F>>
  > {
    this.activities.onDisable = f;
    return this;
  }

  onEnable<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    F extends (payload: TaskOnEnablePayload<C>) => Effect.Effect<any, any, any>
  >(
    f: F
  ): TaskBuilder<
    C,
    TA,
    JT,
    ST,
    ART,
    R | Effect.Effect.Context<ReturnType<F>>,
    E | Effect.Effect.Error<ReturnType<F>>
  > {
    this.activities.onEnable = f;
    return this;
  }

  onFire<
    F extends (
      payload: TaskOnFirePayload<C>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) => Effect.Effect<any, any, any>
  >(
    f: F
  ): TaskBuilder<
    C,
    TA,
    JT,
    ST,
    ART & { onFire: Effect.Effect.Success<ReturnType<F>> },
    R | Effect.Effect.Context<ReturnType<F>>,
    E | Effect.Effect.Error<ReturnType<F>>
  > {
    this.activities.onFire = f;
    return this;
  }

  onExit<
    F extends (
      payload: TaskOnExitPayload<C>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) => Effect.Effect<any, any, any>
  >(
    f: F
  ): TaskBuilder<
    C,
    TA,
    JT,
    ST,
    ART & { onExit: Effect.Effect.Success<ReturnType<F>> },
    R | Effect.Effect.Context<ReturnType<F>>,
    E | Effect.Effect.Error<ReturnType<F>>
  > {
    this.activities.onExit = f;
    return this;
  }

  onCancel<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    F extends (payload: TaskOnCancelPayload<C>) => Effect.Effect<any, any, any>
  >(
    f: F
  ): TaskBuilder<
    C,
    TA,
    JT,
    ST,
    ART,
    R | Effect.Effect.Context<ReturnType<F>>,
    E | Effect.Effect.Error<ReturnType<F>>
  > {
    this.activities.onCancel = f;
    return this;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withWorkItem<W extends WorkItemBuilder<C, any>>(
    workItemBuilder: ValidWorkItemBuilder<W>
  ): TaskBuilder<
    C,
    TA,
    JT,
    ST,
    ART,
    R | WorkItemBuilderR<W>,
    E | WorkItemBuilderE<W>
  > {
    this.workItemBuilder = workItemBuilder;
    return this;
  }

  build(workflow: Workflow, name: string) {
    const { splitType, joinType, activities, Constructor } = this;

    const task = new Constructor(
      name,
      workflow,

      activities as unknown as TaskActivities,
      this.workItemBuilder.build() as TaskAnyWorkItemHandlers,
      {
        splitType,
        joinType,
      }
    );
    workflow.addTask(task);
  }
}

export function task<C extends object = object>() {
  return new TaskBuilder<C, TaskActivities, never, never>().initialize();
}

const wib = workItem<{ foo: string }, { bar: number }>()
  .initialPayloads(() => Effect.succeed([{ bar: 2 }]))
  .createPayload(() => Effect.succeed({ bar: 1 }));

/*const t = task<{ foo: string }>().withWorkItem(wib);

const t2 = task<{ foo: string }>().withWorkItem<{ bar: number }>((w) =>
  w
    .initialPayloads(() => Effect.succeed([{ bar: 2 }]))
    .createPayload(() => Effect.succeed({ bar: 1 }))
);
*/
