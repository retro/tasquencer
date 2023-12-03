import { Effect } from 'effect';
import { expect, it } from 'vitest';

import { Builder, IdGenerator, Service, StateChangeItem } from '../index.js';
import { getEnabledTaskNames, makeIdGenerator } from './shared.js';

const subWorkflowDefinition = Builder.workflow()
  .withName('sub')
  .withParentContext()
  .startCondition('start')
  .task('subT1')
  .endCondition('end')
  .connectCondition('start', (to) => to.task('subT1'))
  .connectTask('subT1', (to) => to.condition('end'));

const workflowDefinition = Builder.workflow()
  .withName('activities')
  .startCondition('start')
  .task('t1', Builder.emptyTask().withSplitType('and'))
  .task('t2')
  .compositeTask('t3', (ct) => ct().withSubWorkflow(subWorkflowDefinition))
  .task('t4', Builder.emptyTask().withJoinType('and'))
  .endCondition('end')
  .connectCondition('start', (to) => to.task('t1'))
  .connectTask('t1', (to) => to.task('t2').task('t3'))
  .connectTask('t2', (to) => to.task('t4'))
  .connectTask('t3', (to) => to.task('t4'))
  .connectTask('t4', (to) => to.condition('end'));

it('sends updates on state change', () => {
  const program = Effect.gen(function* ($) {
    const log: StateChangeItem[] = [];
    const idGenerator = makeIdGenerator();

    const service = yield* $(
      workflowDefinition.build(),
      Effect.flatMap((workflow) => Service.initialize(workflow)),
      Effect.provideService(IdGenerator, idGenerator)
    );

    service.onStateChange((changes) =>
      Effect.succeed(changes.forEach((change) => log.push(change)))
    );

    yield* $(service.start());
    const state = yield* $(service.getState());
    expect(state).toMatchSnapshot();
    expect(getEnabledTaskNames(state)).toEqual(new Set(['t1']));

    yield* $(service.startTask('t1'));
    const state2 = yield* $(service.getState());
    expect(state2).toMatchSnapshot();
    expect(getEnabledTaskNames(state2)).toEqual(new Set(['t2', 't3']));

    yield* $(service.startTask('t2'));
    const state3 = yield* $(service.getState());
    expect(state3).toMatchSnapshot();
    expect(getEnabledTaskNames(state3)).toEqual(new Set(['t3']));

    yield* $(service.startTask('t3'));
    const state4 = yield* $(service.getState());
    expect(state4).toMatchSnapshot();
    expect(getEnabledTaskNames(state4)).toEqual(new Set());

    const { id: parentWorkItemId } = yield* $(service.initializeWorkItem('t2'));
    const { id: subWorkflowId } = yield* $(service.initializeWorkflow('t3'));
    yield* $(service.startWorkflow(`t3.${subWorkflowId}`));
    yield* $(service.startTask(`t3.${subWorkflowId}.subT1`));
    const { id: workItemId } = yield* $(
      service.initializeWorkItem(`t3.${subWorkflowId}.subT1`)
    );
    yield* $(service.startWorkItem(`t2.${parentWorkItemId}`));
    yield* $(service.startWorkItem(`t3.${subWorkflowId}.subT1.${workItemId}`));
    yield* $(
      service.completeWorkItem(`t3.${subWorkflowId}.subT1.${workItemId}`)
    );
    yield* $(service.completeWorkItem(`t2.${parentWorkItemId}`));
    const state5 = yield* $(service.getState());
    expect(state5).toMatchSnapshot();
    expect(getEnabledTaskNames(state5)).toEqual(new Set(['t4']));

    yield* $(service.startTask('t4'));
    const state6 = yield* $(service.getState());
    expect(state6).toMatchSnapshot();
    expect(getEnabledTaskNames(state6)).toEqual(new Set());
    expect(state6.workflows[0]?.state).toEqual('completed');

    expect(log).toMatchSnapshot();
  });

  Effect.runSync(program);
});
