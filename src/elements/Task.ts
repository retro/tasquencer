import { pipe } from '@effect/data/Function';
import * as Effect from '@effect/io/Effect';

import type { JoinType, SplitType, TaskState } from '../types.js';
import { Condition } from './Condition.js';
import { ConditionToTaskFlow, TaskToConditionFlow } from './Flow.js';
import { Workflow } from './Workflow.js';

const VALID_STATE_TRANSITIONS = {
  disabled: new Set(['enabled']),
  enabled: new Set(['active', 'disabled']),
  active: new Set(['completed', 'canceled']),
  completed: new Set(['enabled']),
  canceled: new Set(['enabled']),
};

function isValidTransition(
  from: TaskState,
  to: TaskState
): to is keyof typeof VALID_STATE_TRANSITIONS {
  return VALID_STATE_TRANSITIONS[from].has(to);
}

export class Task {
  readonly workflow: Workflow;
  readonly preSet: Record<string, Condition> = {};
  readonly postSet: Record<string, Condition> = {};
  readonly incomingFlows = new Set<ConditionToTaskFlow>();
  readonly outgoingFlows = new Set<TaskToConditionFlow>();
  readonly cancellationRegion: {
    tasks: Record<string, Task>;
    conditions: Record<string, Condition>;
  } = { tasks: {}, conditions: {} };
  readonly id: string;
  readonly name: string;
  readonly splitType: SplitType | undefined;
  readonly joinType: JoinType | undefined;

  constructor(
    id: string,
    name: string,
    workflow: Workflow,
    props?: { splitType?: SplitType; joinType?: JoinType }
  ) {
    this.id = id;
    this.name = name;
    this.workflow = workflow;

    this.splitType = props?.splitType;
    this.joinType = props?.joinType;
  }
  addIncomingFlow(flow: ConditionToTaskFlow) {
    this.incomingFlows.add(flow);
    this.preSet[flow.priorElement.name] = flow.priorElement;
  }
  addOutgoingFlow(flow: TaskToConditionFlow) {
    this.outgoingFlows.add(flow);
    this.postSet[flow.nextElement.name] = flow.nextElement;
  }
  addTaskToCancellationRegion(task: Task) {
    this.cancellationRegion.tasks[task.name] = task;
  }
  addConditionToCancellationRegion(condition: Condition) {
    this.cancellationRegion.conditions[condition.name] = condition;
  }

  getState() {
    const self = this;
    return Effect.gen(function* ($) {
      return yield* $(self.workflow.stateManager.getTaskState(self));
    });
  }

  enable() {
    const self = this;

    return Effect.gen(function* ($) {
      const state = yield* $(self.getState());

      if (isValidTransition(state, 'enabled')) {
        const isJoinSatisfied = yield* $(self.isJoinSatisfied());
        if (isJoinSatisfied) {
          yield* $(self.workflow.stateManager.enableTask(self));
        }
      }
    });
  }

  disable() {
    const self = this;
    return Effect.gen(function* ($) {
      const state = yield* $(self.getState());
      if (isValidTransition(state, 'disabled')) {
        yield* $(self.workflow.stateManager.disableTask(self));
      }
    });
  }

  activate() {
    const self = this;
    return Effect.gen(function* ($) {
      const state = yield* $(self.getState());
      if (isValidTransition(state, 'active')) {
        yield* $(self.workflow.stateManager.activateTask(self));

        const preSet = Object.values(self.preSet);
        const updates = preSet.map((condition) => condition.decrementMarking());
        yield* $(Effect.allParDiscard(updates));
      }
    });
  }

  complete() {
    const self = this;
    return Effect.gen(function* ($) {
      const state = yield* $(self.getState());
      if (isValidTransition(state, 'completed')) {
        yield* $(self.workflow.stateManager.completeTask(self));
        yield* $(self.cancelCancellationRegion());
        yield* $(self.produceTokensInOutgoingFlows());
      }
    });
  }

  cancel() {
    const self = this;
    return Effect.gen(function* ($) {
      const state = yield* $(self.getState());
      if (isValidTransition(state, 'canceled')) {
        yield* $(self.workflow.stateManager.cancelTask(self));
      }
    });
  }

  isEnabled() {
    return this.isStateEqualTo('enabled');
  }

  isActive() {
    return this.isStateEqualTo('active');
  }

  isStateEqualTo(state: TaskState) {
    return pipe(
      this.getState(),
      Effect.map((s) => s === state)
    );
  }

  cancelCancellationRegion() {
    const taskUpdates = Object.values(this.cancellationRegion.tasks).map((t) =>
      t.cancel()
    );
    const conditionUpdates = Object.values(
      this.cancellationRegion.conditions
    ).map((c) => c.cancel());

    return Effect.allParDiscard([...taskUpdates, ...conditionUpdates]);
  }

  private produceTokensInOutgoingFlows() {
    switch (this.splitType) {
      case 'or':
        return this.produceOrSplitTokensInOutgoingFlows();
      case 'xor':
        return this.produceXorSplitTokensInOutgoingFlows();
      default:
        return this.produceAndSplitTokensInOutgoingFlows();
    }
  }

  private produceOrSplitTokensInOutgoingFlows() {
    const flows = this.outgoingFlows;
    const updates = Object.entries(flows).map(([conditionName, flow]) => {
      if (flow.isDefault) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return this.postSet[conditionName]!.incrementMarking();
      } else if (flow.predicate ? flow.predicate(null) : false) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return this.postSet[conditionName]!.incrementMarking();
      }
      return Effect.unit();
    });
    return Effect.allParDiscard(updates);
  }

  private produceXorSplitTokensInOutgoingFlows() {
    const flows = this.outgoingFlows;
    const sortedFlows = Array.from(flows).sort((flowA, flowB) => {
      return flowA.order > flowB.order ? 1 : flowA.order < flowB.order ? -1 : 0;
    });

    for (const flow of sortedFlows) {
      if (flow.isDefault) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return flow.nextElement.incrementMarking();
      } else if (flow.predicate ? flow.predicate(null) : false) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return flow.nextElement.incrementMarking();
      }
    }
    return Effect.unit();
  }

  private produceAndSplitTokensInOutgoingFlows() {
    const updates = Array.from(this.outgoingFlows).map((flow) => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return flow.nextElement.incrementMarking();
    });
    return Effect.allParDiscard(updates);
  }

  private isJoinSatisfied() {
    switch (this.joinType) {
      case 'or':
        return this.isOrJoinSatisfied();
      case 'xor':
        return this.isXorJoinSatisfied();
      default:
        return this.isAndJoinSatisfied();
    }
  }

  private isOrJoinSatisfied() {
    return Effect.succeed(false);
  }

  private isXorJoinSatisfied() {
    const self = this;
    return Effect.gen(function* ($) {
      const markings = yield* $(
        Effect.allPar(
          Array.from(self.incomingFlows).map((flow) =>
            flow.priorElement.getMarking()
          )
        )
      );
      return markings.filter((m) => m > 0).length === 1 ? true : false;
    });
  }

  private isAndJoinSatisfied() {
    const self = this;
    return Effect.gen(function* ($) {
      const markings = yield* $(
        Effect.allPar(
          Array.from(self.incomingFlows).map((flow) =>
            flow.priorElement.getMarking()
          )
        )
      );

      return markings.filter((m) => m > 0).length === markings.length
        ? true
        : false;
    });
  }
}
