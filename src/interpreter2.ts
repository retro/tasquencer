import * as Data from '@effect/data/Data';
import { pipe } from '@effect/data/Function';
import * as Effect from '@effect/io/Effect';

import { OrXorTaskFlowBuilder } from './builder/FlowBuilder.js';
import { WorkflowBuilder } from './builder/WorkflowBuilder.js';
import { Condition } from './elements/Condition.js';
import { ConditionToTaskFlow, TaskToConditionFlow } from './elements/Flow.js';
import { Task } from './elements/Task.js';
import { Workflow } from './elements/Workflow.js';
import { IdGenerator, StateManager } from './stateManager/types.js';

/*export type onStart = (
  state: InterpreterState
) => Effect.Effect<never, never, void>;
export const onStart = Context.Tag<onStart>();

export type onActivate = (
  state: InterpreterState
) => Effect.Effect<never, never, void>;
export const onActivate = Context.Tag<onActivate>();

export type onComplete = (
  state: InterpreterState
) => Effect.Effect<never, never, void>;
export const onComplete = Context.Tag<onComplete>();

export type onCancel = (
  state: InterpreterState
) => Effect.Effect<never, never, void>;
export const onCancel = Context.Tag<onCancel>();*/

interface TaskNotEnabledError extends Data.Case {
  readonly _tag: 'TaskNotEnabledError';
}
const TaskNotEnabledError = Data.tagged<TaskNotEnabledError>(
  'TaskNotEnabledError'
);

interface TaskNotActivatedError extends Data.Case {
  readonly _tag: 'TaskNotActivatedError';
}
const TaskNotActivatedError = Data.tagged<TaskNotActivatedError>(
  'TaskNotActivatedError'
);

export class Interpreter {
  constructor(
    private workflow: Workflow,
    private stateManager: StateManager,
    private context: object
  ) {}
  start() {
    const { workflow, stateManager } = this;
    return pipe(
      Effect.gen(function* ($) {
        yield* $(stateManager.initializeWorkflow(workflow));
        yield* $(workflow.initialize());
        const startCondition = yield* $(workflow.getStartCondition());
        yield* $(startCondition.incrementMarking());
      }),
      Effect.provideService(StateManager, this.stateManager)
    );
  }
  resume() {
    const { workflow } = this;
    return pipe(
      Effect.gen(function* ($) {
        yield* $(workflow.resume());
      }),
      Effect.provideService(StateManager, this.stateManager)
    );
  }

  activateTask(taskName: string) {
    const { workflow } = this;
    return pipe(
      Effect.gen(function* ($) {
        const task = yield* $(workflow.getTask(taskName));
        const isEnabled = yield* $(task.isEnabled());
        if (isEnabled) {
          yield* $(task.activate());
        } else {
          yield* $(Effect.fail(TaskNotEnabledError()));
        }
      }),
      Effect.provideService(StateManager, this.stateManager)
    );
  }

  completeTask(taskName: string) {
    const { workflow } = this;
    return pipe(
      Effect.gen(function* ($) {
        const task = yield* $(workflow.getTask(taskName));
        const isActive = yield* $(task.isActive());
        if (isActive) {
          yield* $(task.complete());
        } else {
          yield* $(Effect.fail(TaskNotActivatedError()));
        }
      }),
      Effect.provideService(StateManager, this.stateManager)
    );
  }

  getState() {
    const { workflow, stateManager } = this;
    return Effect.gen(function* ($) {
      return yield* $(stateManager.getWorkflowState(workflow));
    });
  }
}

export function make<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  W extends WorkflowBuilder<object, any, any, any, any, any, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  C extends W extends WorkflowBuilder<infer WC, any, any, any, any, any, any>
    ? WC
    : object
>(workflowBuilder: W, context: C) {
  return Effect.gen(function* ($) {
    const stateManager = yield* $(StateManager);
    const idGenerator = yield* $(IdGenerator);

    const workflow = new Workflow(yield* $(idGenerator.next('workflow')));

    for (const [taskName, taskBuilder] of Object.entries(
      workflowBuilder.definition.tasks
    )) {
      const task = new Task(
        yield* $(idGenerator.next('task')),
        taskName,
        taskBuilder,
        workflow
      );

      workflow.addTask(task);
    }

    for (const [conditionName, conditionNode] of Object.entries(
      workflowBuilder.definition.conditions
    )) {
      const condition = new Condition(
        yield* $(idGenerator.next('condition')),
        conditionName,
        conditionNode,
        workflow
      );

      workflow.addCondition(condition);
    }

    workflow.setStartCondition(workflowBuilder.definition.startCondition ?? '');
    workflow.setEndCondition(workflowBuilder.definition.endCondition ?? '');

    for (const [conditionName, conditionFlows] of Object.entries(
      workflowBuilder.definition.flows.conditions
    )) {
      const condition = yield* $(workflow.getCondition(conditionName));
      for (const taskName of conditionFlows.to) {
        const task = yield* $(workflow.getTask(taskName));
        const flow = new ConditionToTaskFlow(condition, task);
        task.addIncomingFlow(flow);
        condition.addOutgoingFlow(flow);
      }
    }

    for (const [taskName, taskFlows] of Object.entries(
      workflowBuilder.definition.flows.tasks
    )) {
      const task = yield* $(workflow.getTask(taskName));
      for (const [conditionName, props] of Object.entries(
        taskFlows.toConditions
      )) {
        const condition = yield* $(workflow.getCondition(conditionName));
        const flow = new TaskToConditionFlow(task, condition, props);
        condition.addIncomingFlow(flow);
        task.addOutgoingFlow(flow);
      }
      for (const [toTaskName, props] of Object.entries(taskFlows.toTasks)) {
        const toTask = yield* $(workflow.getTask(toTaskName));
        const condition = new Condition(
          yield* $(idGenerator.next('condition')),
          `implicit:${taskName}->${toTask.name}`,
          { isImplicit: true },
          workflow
        );

        workflow.addCondition(condition);

        const leftFlow = new TaskToConditionFlow(task, condition, props);
        const rightFlow = new ConditionToTaskFlow(condition, toTask);
        task.addOutgoingFlow(leftFlow);
        condition.addIncomingFlow(leftFlow);
        condition.addOutgoingFlow(rightFlow);
        toTask.addIncomingFlow(rightFlow);
      }

      if (taskFlows instanceof OrXorTaskFlowBuilder) {
        const defaultFlow = taskFlows.toDefault;
        if (defaultFlow?.type === 'task') {
          const toTask = yield* $(workflow.getTask(defaultFlow.name));
          const condition = new Condition(
            yield* $(idGenerator.next('condition')),
            `implicit:${taskName}->${toTask.name}`,
            { isImplicit: true },
            workflow
          );

          workflow.addCondition(condition);

          const leftFlow = new TaskToConditionFlow(task, condition, {
            order: Infinity,
          });
          const rightFlow = new ConditionToTaskFlow(condition, toTask);
          task.addOutgoingFlow(leftFlow);
          condition.addIncomingFlow(leftFlow);
          condition.addOutgoingFlow(rightFlow);
          toTask.addIncomingFlow(rightFlow);
        } else if (defaultFlow?.type === 'condition') {
          const condition = yield* $(workflow.getCondition(defaultFlow.name));
          const flow = new TaskToConditionFlow(task, condition);
          condition.addIncomingFlow(flow);
          task.addOutgoingFlow(flow);
        }
      }
    }

    for (const [taskName, cancellationRegion] of Object.entries(
      workflowBuilder.definition.cancellationRegions
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

    return new Interpreter(workflow, stateManager, context);
  });
}
