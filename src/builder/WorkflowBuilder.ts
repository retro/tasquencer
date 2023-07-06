import * as Effect from '@effect/io/Effect';

import { Condition } from '../elements/Condition.js';
import { Workflow } from '../elements/Workflow.js';
import {
  EndConditionDoesNotExist,
  StartConditionDoesNotExist,
} from '../errors.js';
import { IdGenerator, StateManager } from '../stateManager/types.js';
import type {
  ConditionNode,
  NotExtends,
  WorkflowBuilderDefinition,
} from '../types.js';
import {
  ConditionFlowBuilder,
  OrXorTaskFlowBuilder,
  TaskFlowBuilder,
  ValidOrXorTaskFlow,
} from './FlowBuilder.js';
import { IdProvider } from './IdProvider.js';
import * as TB from './TaskBuilder.js';

type TaskWithValidContext<C, T> = C extends TB.TaskBuilderUserContext<T>
  ? T
  : never;

type IsXorOrOrJoinSplit<T> = T extends never
  ? never
  : T extends 'or' | 'xor'
  ? true
  : never;

// TODO: implement invariant checking
export class WorkflowBuilder<
  WBContext extends object,
  R,
  E,
  WBTasks = never,
  WBConditions = never,
  WBCancellationRegions = never,
  WBTasksWithOrXorSplit = never,
  WBConnectedTasks = never,
  WBConnectedConditions = never,
  WBTasksActivitiesOutputs extends Record<
    string,
    TB.ActivitiesReturnEffect
  > = Record<string, TB.ActivitiesReturnEffect>
> {
  readonly name: string;
  definition: WorkflowBuilderDefinition;

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
    WBTasksActivitiesOutputs
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
    WBTasksActivitiesOutputs
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
    WBTasksActivitiesOutputs
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
    R,
    E,
    WBTasks | TN,
    WBConditions,
    WBCancellationRegions,
    WBTasksWithOrXorSplit | X,
    WBConnectedTasks,
    WBConnectedConditions,
    WBTasksActivitiesOutputs & { [tn in TN]: TB.TaskBuilderActivityOutputs<T> }
  >;
  task<
    TN extends string,
    T extends (
      t: TB.InitializedTaskBuilder<WBContext>
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
    R,
    E,
    WBTasks | TN,
    WBConditions,
    WBCancellationRegions,
    WBTasksWithOrXorSplit | X,
    WBConnectedTasks,
    WBConnectedConditions,
    WBTasksActivitiesOutputs & {
      [tn in TN]: TB.TaskBuilderActivityOutputs<ReturnType<T>>;
    }
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
    WBTasksActivitiesOutputs & {
      [tn in TN]: TB.ActivitiesReturnEffect;
    }
  >;
  task(
    taskName: string,
    input?: TB.AnyTaskBuilder | ((t: TB.AnyTaskBuilder) => TB.AnyTaskBuilder)
  ) {
    if (!input) {
      this.definition.tasks[taskName] = TB.task<WBContext>();
    } else if (input instanceof TB.TaskBuilder) {
      this.definition.tasks[taskName] = input;
    } else {
      this.definition.tasks[taskName] = input(TB.task<WBContext>());
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
    WBTasksActivitiesOutputs
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
    WBTasksActivitiesOutputs
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
    WBTasksActivitiesOutputs
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
    WBTasksActivitiesOutputs
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
  build(prevId?: string) {
    const { definition } = this;

    return Effect.gen(function* ($) {
      const stateManager = yield* $(StateManager);
      const idGenerator = yield* $(IdGenerator);
      const workflowId = prevId ?? (yield* $(idGenerator.next('workflow')));
      const prevState = yield* $(
        stateManager.getWorkflowState(workflowId),
        Effect.catchTag('WorkflowNotInitialized', () =>
          Effect.succeed(undefined)
        )
      );
      const idProvider = new IdProvider(prevState, idGenerator);

      const workflow = new Workflow<
        R,
        E,
        WBContext,
        {
          [K in WBTasks & string]: {
            onActivate: WBTasksActivitiesOutputs[K]['onActivate'];
            onComplete: WBTasksActivitiesOutputs[K]['onComplete'];
          };
        }
      >(workflowId, stateManager);

      for (const [taskName, taskBuilder] of Object.entries(definition.tasks)) {
        // TaskBuilder will add Task to workflow
        yield* $(taskBuilder.build(workflow, taskName, idProvider));
      }

      for (const [conditionName, conditionNode] of Object.entries(
        definition.conditions
      )) {
        const condition = new Condition(
          yield* $(idProvider.getConditionId(conditionName)),
          conditionName,
          conditionNode,
          workflow
        );

        workflow.addCondition(condition);
      }

      if (
        definition.startCondition &&
        workflow.conditions[definition.startCondition]
      ) {
        workflow.setStartCondition(definition.startCondition);
      } else {
        yield* $(Effect.fail(StartConditionDoesNotExist()));
      }

      if (
        definition.endCondition &&
        workflow.conditions[definition.endCondition]
      ) {
        workflow.setEndCondition(definition.endCondition);
      } else {
        yield* $(Effect.fail(EndConditionDoesNotExist()));
      }

      for (const [, conditionFlows] of Object.entries(
        definition.flows.conditions
      )) {
        yield* $(conditionFlows.build(workflow));
      }

      for (const [, taskFlows] of Object.entries(definition.flows.tasks)) {
        yield* $(taskFlows.build(workflow, idProvider));
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
  return new WorkflowBuilder<C, never, never>(name);
}
