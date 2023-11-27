import { Effect } from 'effect';
import { Simplify } from 'type-fest';

import { Condition } from '../elements/Condition.js';
import { Workflow } from '../elements/Workflow.js';
import {
  EndConditionDoesNotExist,
  StartConditionDoesNotExist,
} from '../errors.js';
import {
  ConditionNode,
  NotExtends,
  WorkflowBuilderDefinition,
  WorkflowContextSym,
  WorkflowOnEndPayload,
  WorkflowOnStartPayload,
} from '../types.js';
import * as CTB from './CompositeTaskBuilder.js';
import {
  ConditionFlowBuilder,
  OrXorTaskFlowBuilder,
  TaskFlowBuilder,
  ValidOrXorTaskFlow,
} from './FlowBuilder.js';
import * as TB from './TaskBuilder.js';

type TaskWithValidContext<C, T> = C extends TB.TaskBuilderContext<T>
  ? T
  : never;

type CompositeTaskWithValidContext<C, T> =
  C extends CTB.CompositeTaskBuilderContext<T> ? T : never;

type IsXorOrOrJoinSplit<T> = T extends never
  ? never
  : T extends 'or' | 'xor'
  ? true
  : never;

/* eslint-disable @typescript-eslint/no-explicit-any */
export type AnyWorkflowBuilder = WorkflowBuilder<
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any
>;
/* eslint-enable @typescript-eslint/no-explicit-any */

/* eslint-disable @typescript-eslint/no-explicit-any */
export type WorkflowBuilderC<T> = T extends WorkflowBuilder<
  infer C,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any
>
  ? C
  : never;
/* eslint-enable @typescript-eslint/no-explicit-any */

/* eslint-disable @typescript-eslint/no-explicit-any */
export type WorkflowBuilderR<T> = T extends WorkflowBuilder<
  any,
  infer R,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any
>
  ? R
  : never;
/* eslint-enable @typescript-eslint/no-explicit-any */

/* eslint-disable @typescript-eslint/no-explicit-any */
export type WorkflowBuilderE<T> = T extends WorkflowBuilder<
  any,
  any,
  infer E,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any
>
  ? E
  : never;
/* eslint-enable @typescript-eslint/no-explicit-any */

/* eslint-disable @typescript-eslint/no-explicit-any */
export type WorkflowBuilderTaskActivitiesOutputs<T> = T extends WorkflowBuilder<
  any,
  any,
  any,
  any,
  any,
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
export type WorkflowBuilderMetadata<T> = T extends WorkflowBuilder<
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  infer M,
  any
>
  ? M
  : never;
/* eslint-enable @typescript-eslint/no-explicit-any */

// TODO: implement invariant checking
export class WorkflowBuilder<
  WBContext,
  R,
  E,
  WBTasks = never,
  WBConditions = never,
  WBCancellationRegions = never,
  WBTasksWithOrXorSplit = never,
  WBConnectedTasks = never,
  WBConnectedConditions = never,
  Metadata = { [WorkflowContextSym]: WBContext },
  OnStartReturnType = unknown
> {
  readonly name: string;
  readonly definition: WorkflowBuilderDefinition;
  onStartFn?: (
    payload: WorkflowOnStartPayload<WBContext>,
    input: unknown
  ) => Effect.Effect<unknown, unknown, unknown>;
  onEndFn?: (
    payload: WorkflowOnEndPayload<WBContext>
  ) => Effect.Effect<unknown, unknown, unknown>;

  constructor(name: string) {
    this.name = name;
    this.definition = {
      conditions: {},
      tasks: {},
      cancellationRegions: {},
      flows: { conditions: {}, tasks: {} },
    };
  }

  private addConditionUnsafe(conditionName: string, props?: ConditionNode) {
    const condition: ConditionNode = props ?? {};
    this.definition.conditions[conditionName] = condition;

    return this;
  }

  initialize() {
    return this.onStart((_, input) => Effect.succeed(input)).onEnd(
      () => Effect.unit
    );
  }

  condition<CN extends string>(
    conditionName: CN & NotExtends<WBTasks | WBConditions, CN>
  ): WorkflowBuilder<
    WBContext,
    R,
    E,
    WBTasks,
    WBConditions | CN,
    WBCancellationRegions,
    WBTasksWithOrXorSplit,
    WBConnectedTasks,
    WBConnectedConditions,
    Metadata,
    OnStartReturnType
  > {
    return this.addConditionUnsafe(conditionName);
  }

  startCondition<CN extends string>(
    conditionName: CN & NotExtends<WBTasks | WBConditions, CN>
  ): WorkflowBuilder<
    WBContext,
    R,
    E,
    WBTasks,
    WBConditions | CN,
    WBCancellationRegions,
    WBTasksWithOrXorSplit,
    WBConnectedTasks,
    WBConnectedConditions,
    Metadata,
    OnStartReturnType
  > {
    this.definition.startCondition = conditionName;
    return this.addConditionUnsafe(conditionName);
  }

  endCondition<CN extends string>(
    conditionName: CN & NotExtends<WBTasks | WBConditions, CN>
  ): WorkflowBuilder<
    WBContext,
    R,
    E,
    WBTasks,
    WBConditions | CN,
    WBCancellationRegions,
    WBTasksWithOrXorSplit,
    WBConnectedTasks,
    WBConnectedConditions,
    Metadata,
    OnStartReturnType
  > {
    this.definition.endCondition = conditionName;
    return this.addConditionUnsafe(conditionName);
  }

  task<
    TN extends string,
    T extends TB.AnyTaskBuilder,
    X extends IsXorOrOrJoinSplit<TB.TaskBuilderSplitType<T>> extends never
      ? never
      : TN
  >(
    taskName: TN & NotExtends<WBTasks | WBConditions, TN>,
    task: T & TaskWithValidContext<WBContext, T>
  ): WorkflowBuilder<
    WBContext,
    R | TB.TaskBuilderR<T>,
    E | TB.TaskBuilderE<T>,
    WBTasks | TN,
    WBConditions,
    WBCancellationRegions,
    WBTasksWithOrXorSplit | X,
    WBConnectedTasks,
    WBConnectedConditions,
    Simplify<
      Metadata & {
        [tn in TN]: TB.TaskBuilderMetadata<T>;
      }
    >,
    OnStartReturnType
  >;
  task<
    TN extends string,
    T extends (
      t: () => TB.InitializedTaskBuilder<WBContext>
    ) => TB.AnyTaskBuilder<WBContext>,
    X extends IsXorOrOrJoinSplit<
      TB.TaskBuilderSplitType<ReturnType<T>>
    > extends never
      ? never
      : TN
  >(
    taskName: TN & NotExtends<WBTasks | WBConditions, TN>,
    task: T
  ): WorkflowBuilder<
    WBContext,
    R | TB.TaskBuilderR<ReturnType<T>>,
    E | TB.TaskBuilderE<ReturnType<T>>,
    WBTasks | TN,
    WBConditions,
    WBCancellationRegions,
    WBTasksWithOrXorSplit | X,
    WBConnectedTasks,
    WBConnectedConditions,
    Simplify<
      Metadata & {
        [tn in TN]: TB.TaskBuilderMetadata<ReturnType<T>>;
      }
    >,
    OnStartReturnType
  >;
  task<TN extends string>(
    taskName: string & NotExtends<WBTasks | WBConditions, TN>
  ): WorkflowBuilder<
    WBContext,
    R,
    E,
    WBTasks | TN,
    WBConditions,
    WBCancellationRegions,
    WBTasksWithOrXorSplit,
    WBConnectedTasks,
    WBConnectedConditions,
    Simplify<
      Metadata & {
        [tn in TN]: TB.TaskBuilderMetadata<TB.AnyTaskBuilder>;
      }
    >,
    OnStartReturnType
  >;
  task(
    taskName: string,
    input?:
      | TB.AnyTaskBuilder
      | ((t: () => TB.AnyTaskBuilder) => TB.AnyTaskBuilder)
  ) {
    if (!input) {
      this.definition.tasks[taskName] = TB.task<WBContext>();
    } else if (input instanceof TB.TaskBuilder) {
      this.definition.tasks[taskName] = input;
    } else {
      this.definition.tasks[taskName] = input(() => TB.task<WBContext>());
    }

    return this;
  }

  compositeTask<
    TN extends string,
    T extends CTB.AnyCompositeTaskBuilder,
    X extends IsXorOrOrJoinSplit<
      CTB.CompositeTaskBuilderSplitType<T>
    > extends never
      ? never
      : TN
  >(
    compositeTaskName: TN & NotExtends<WBTasks | WBConditions, TN>,
    compositeTask: T & CompositeTaskWithValidContext<WBContext, T>
  ): WorkflowBuilder<
    WBContext,
    R | CTB.CompositeTaskBuilderR<T>,
    E | CTB.CompositeTaskBuilderE<T>,
    WBTasks | TN,
    WBConditions,
    WBCancellationRegions,
    WBTasksWithOrXorSplit | X,
    WBConnectedTasks,
    WBConnectedConditions,
    Metadata & {
      [tn in TN]: CTB.CompositeTaskBuilderMetadata<T>;
    },
    OnStartReturnType
  >;
  compositeTask<
    TN extends string,
    T extends (
      t: () => CTB.InitializedCompositeTaskBuilder<WBContext>
    ) => CTB.AnyCompositeTaskBuilder<WBContext>,
    X extends IsXorOrOrJoinSplit<
      CTB.CompositeTaskBuilderSplitType<ReturnType<T>>
    > extends never
      ? never
      : TN
  >(
    compositeTaskName: TN & NotExtends<WBTasks | WBConditions, TN>,
    compositeTask: T
  ): WorkflowBuilder<
    WBContext,
    R | CTB.CompositeTaskBuilderR<ReturnType<T>>,
    E | CTB.CompositeTaskBuilderE<ReturnType<T>>,
    WBTasks | TN,
    WBConditions,
    WBCancellationRegions,
    WBTasksWithOrXorSplit | X,
    WBConnectedTasks,
    WBConnectedConditions,
    Metadata & {
      [tn in TN]: CTB.CompositeTaskBuilderMetadata<ReturnType<T>>;
    },
    OnStartReturnType
  >;
  compositeTask(
    compositeTaskName: string,
    input:
      | CTB.AnyCompositeTaskBuilder
      | ((
          t: () => CTB.InitialCompositeTaskFnReturnType<WBContext>
        ) => CTB.AnyCompositeTaskBuilder)
  ) {
    if (input instanceof CTB.CompositeTaskBuilder) {
      this.definition.tasks[compositeTaskName] = input;
    } else {
      this.definition.tasks[compositeTaskName] = input(() =>
        CTB.compositeTask<WBContext>()
      );
    }

    return this;
  }

  cancellationRegion<
    TN extends WBTasks,
    TNS extends Exclude<WBTasks, TN>[],
    CNS extends WBConditions[]
  >(
    taskName: TN & NotExtends<WBCancellationRegions, TN> & string,
    toCancel: { tasks?: TNS & string[]; conditions?: CNS & string[] }
  ): WorkflowBuilder<
    WBContext,
    R,
    E,
    WBTasks | TN,
    WBConditions,
    WBCancellationRegions | TN,
    WBTasksWithOrXorSplit,
    WBConnectedTasks,
    WBConnectedConditions,
    Metadata,
    OnStartReturnType
  > {
    this.definition.cancellationRegions[taskName] = toCancel;
    return this;
  }

  connectCondition<CN extends WBConditions>(
    conditionName: CN & NotExtends<WBConnectedConditions, CN> & string,
    builder: (
      to: ConditionFlowBuilder<WBTasks>
    ) => ConditionFlowBuilder<WBTasks>
  ): WorkflowBuilder<
    WBContext,
    R,
    E,
    WBTasks,
    WBConditions,
    WBCancellationRegions,
    WBTasksWithOrXorSplit,
    WBConnectedTasks,
    WBConnectedConditions | CN,
    Metadata,
    OnStartReturnType
  > {
    this.definition.flows.conditions[conditionName] = builder(
      new ConditionFlowBuilder(conditionName)
    );
    return this;
  }

  connectTask<TN extends WBTasksWithOrXorSplit, D, R1, E1>(
    taskName: TN & NotExtends<WBConnectedTasks, TN> & string,
    builder: (
      to: OrXorTaskFlowBuilder<
        WBConditions,
        WBTasks,
        never,
        never,
        never,
        WBContext
      >
    ) => ValidOrXorTaskFlow<
      OrXorTaskFlowBuilder<WBConditions, WBTasks, R1, E1, D, WBContext>
    >
  ): WorkflowBuilder<
    WBContext,
    R | R1,
    E | E1,
    WBTasks,
    WBConditions,
    WBCancellationRegions,
    WBTasksWithOrXorSplit,
    WBConnectedTasks | TN,
    WBConnectedConditions,
    Metadata,
    OnStartReturnType
  >;

  connectTask<TN extends WBTasks>(
    taskName: TN & NotExtends<WBConnectedTasks, TN> & string,
    builder: (
      to: TaskFlowBuilder<WBConditions, WBTasks>
    ) => TaskFlowBuilder<WBConditions, WBTasks>
  ): WorkflowBuilder<
    WBContext,
    R,
    E,
    WBTasks,
    WBConditions,
    WBCancellationRegions,
    WBTasksWithOrXorSplit,
    WBConnectedTasks | TN,
    WBConnectedConditions,
    Metadata,
    OnStartReturnType
  >;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  connectTask(taskName: string, builder: (...any: any[]) => any) {
    if (
      this.definition.tasks[taskName]?.splitType === 'or' ||
      this.definition.tasks[taskName]?.splitType === 'xor'
    ) {
      const flow = new OrXorTaskFlowBuilder<
        WBConditions,
        WBTasks,
        never,
        never
      >(taskName);
      const result: OrXorTaskFlowBuilder<
        WBConditions,
        WBTasks,
        unknown,
        unknown,
        true,
        WBContext
      > = builder(flow);
      this.definition.flows.tasks[taskName] = result;
    } else {
      const flow = new TaskFlowBuilder<WBConditions, WBTasks>(taskName);
      const result: TaskFlowBuilder<WBConditions, WBTasks> = builder(flow);
      this.definition.flows.tasks[taskName] = result;
    }
    return this;
  }
  onStart<
    F extends (
      payload: WorkflowOnStartPayload<WBContext>,
      input: unknown
    ) => Effect.Effect<unknown, unknown, unknown>
  >(
    f: F
  ): WorkflowBuilder<
    WBContext,
    R | Effect.Effect.Context<ReturnType<F>>,
    E | Effect.Effect.Error<ReturnType<F>>,
    WBTasks,
    WBConditions,
    WBCancellationRegions,
    WBTasksWithOrXorSplit,
    WBConnectedTasks,
    WBConnectedConditions,
    Metadata,
    Effect.Effect.Success<ReturnType<F>>
  > {
    this.onStartFn = f;
    return this;
  }
  onEnd<
    F extends (
      payload: WorkflowOnEndPayload<WBContext>
    ) => Effect.Effect<unknown, unknown, unknown>
  >(
    f: F
  ): WorkflowBuilder<
    WBContext,
    R | Effect.Effect.Context<ReturnType<F>>,
    E | Effect.Effect.Error<ReturnType<F>>,
    WBTasks,
    WBConditions,
    WBCancellationRegions,
    WBTasksWithOrXorSplit,
    WBConnectedTasks,
    WBConnectedConditions,
    Metadata,
    OnStartReturnType
  > {
    this.onEndFn = f;
    return this;
  }

  build() {
    const { name, definition, onStartFn, onEndFn } = this;

    return Effect.gen(function* ($) {
      const workflow = new Workflow<
        R,
        E,
        WBContext,
        Metadata,
        OnStartReturnType
        // non-null assertion is ok here, because onStartFn and onEndFn are set
        // in the initialize method which is automatically called by the `workflow`
        // entrypoint
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      >(name, onStartFn!, onEndFn!);

      for (const [taskName, taskBuilder] of Object.entries(definition.tasks)) {
        // TaskBuilder will add Task to workflow
        // This casting is ok, because task doesn't care about Workflow generics
        yield* $(taskBuilder.build(workflow as Workflow, taskName));
      }

      for (const [conditionName, conditionNode] of Object.entries(
        definition.conditions
      )) {
        const condition = new Condition(
          conditionName,
          conditionNode,
          // This casting is ok, because condition doesn't care about Workflow generics
          workflow as Workflow
        );

        workflow.addCondition(condition);
      }

      if (
        definition.startCondition &&
        workflow.conditions[definition.startCondition]
      ) {
        workflow.setStartCondition(definition.startCondition);
      } else {
        yield* $(
          Effect.fail(
            new StartConditionDoesNotExist({ workflowName: workflow.name })
          )
        );
      }

      if (
        definition.endCondition &&
        workflow.conditions[definition.endCondition]
      ) {
        workflow.setEndCondition(definition.endCondition);
      } else {
        yield* $(
          Effect.fail(
            new EndConditionDoesNotExist({ workflowName: workflow.name })
          )
        );
      }

      for (const [, conditionFlows] of Object.entries(
        definition.flows.conditions
      )) {
        // This casting is ok, because condition flow doesn't care about Workflow generics
        yield* $(conditionFlows.build(workflow as Workflow));
      }

      for (const [, taskFlows] of Object.entries(definition.flows.tasks)) {
        // This casting is ok, because task flow doesn't care about Workflow generics
        yield* $(taskFlows.build(workflow as Workflow));
      }

      for (const [taskName, cancellationRegion] of Object.entries(
        definition.cancellationRegions
      )) {
        const task = yield* $(workflow.getTask(taskName));
        for (const cancelledTaskName of cancellationRegion.tasks ?? []) {
          task.addTaskToCancellationRegion(
            yield* $(workflow.getTask(cancelledTaskName))
          );
        }
        for (const cancelledConditionName of cancellationRegion.conditions ??
          []) {
          task.addConditionToCancellationRegion(
            yield* $(workflow.getCondition(cancelledConditionName))
          );
        }
      }

      return workflow;
    });
  }
}

export function workflow<C extends object>(name: string) {
  return new WorkflowBuilder<C, never, never>(name).initialize();
}
