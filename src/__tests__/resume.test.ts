import { Effect } from 'effect';
import { expect, it } from 'vitest';

import { Builder, IdGenerator, Service } from '../index.js';
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

it('resumes from persistable state', () => {
  const program = Effect.gen(function* ($) {
    const idGenerator = makeIdGenerator();

    const service1 = yield* $(
      workflowDefinition.build(),
      Effect.flatMap((workflow) => Service.initialize(workflow)),
      Effect.provideService(IdGenerator, idGenerator)
    );

    yield* $(service1.start());
    const state1_1 = yield* $(service1.getState());
    expect(state1_1).toMatchSnapshot();
    expect(getEnabledTaskNames(state1_1)).toEqual(new Set(['t1']));

    yield* $(service1.startTask('t1'));
    const state1_2 = yield* $(service1.getState());
    expect(state1_2).toMatchSnapshot();
    expect(getEnabledTaskNames(state1_2)).toEqual(new Set(['t2', 't3']));

    yield* $(service1.startTask('t2'));
    const state1_3 = yield* $(service1.getState());
    expect(state1_3).toMatchSnapshot();
    expect(getEnabledTaskNames(state1_3)).toEqual(new Set(['t3']));

    const service2 = yield* $(
      workflowDefinition.build(),
      Effect.flatMap((workflow) => Service.resume(workflow, state1_3)),
      Effect.provideService(IdGenerator, idGenerator)
    );

    const state2_1 = yield* $(service2.getState());
    expect(state2_1).toEqual(state1_3);

    yield* $(service2.startTask('t3'));
    const state2_2 = yield* $(service2.getState());
    expect(state2_2).toMatchSnapshot();
    expect(getEnabledTaskNames(state2_2)).toEqual(new Set());

    const { id: parentWorkItemId } = yield* $(
      service2.initializeWorkItem('t2')
    );
    const { id: subWorkflowId } = yield* $(service2.initializeWorkflow('t3'));
    yield* $(service2.startWorkflow(`t3.${subWorkflowId}`));
    yield* $(service2.startTask(`t3.${subWorkflowId}.subT1`));
    const { id: workItemId } = yield* $(
      service2.initializeWorkItem(`t3.${subWorkflowId}.subT1`)
    );
    yield* $(service2.startWorkItem(`t2.${parentWorkItemId}`));
    yield* $(service2.startWorkItem(`t3.${subWorkflowId}.subT1.${workItemId}`));
    yield* $(
      service2.completeWorkItem(`t3.${subWorkflowId}.subT1.${workItemId}`)
    );
    yield* $(service2.completeWorkItem(`t2.${parentWorkItemId}`));
    const state2_3 = yield* $(service2.getState());
    expect(state2_3).toMatchSnapshot();
    expect(getEnabledTaskNames(state2_3)).toEqual(new Set(['t4']));

    yield* $(service2.startTask('t4'));
    const state2_4 = yield* $(service2.getState());
    expect(state2_4).toMatchSnapshot();
    expect(getEnabledTaskNames(state2_4)).toEqual(new Set());
    expect(state2_4.workflows[0]?.state).toEqual('completed');
  });

  Effect.runSync(program);
});
