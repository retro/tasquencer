import { Effect } from 'effect';
import { it } from 'vitest';

import { Builder, IdGenerator, Service } from '../index.js';
import { getEnabledTaskNames, makeIdGenerator } from './shared.js';

const workflowDefinition = Builder.workflow()
  .withName('activities')
  .startCondition('start')
  .task('t1', Builder.emptyTask().withSplitType('and'))
  .task('t2')
  .task('t3', Builder.emptyTask().withJoinType('and'))
  .endCondition('end')
  .connectCondition('start', (to) => to.task('t1'))
  .connectTask('t1', (to) => to.task('t2'))
  .connectTask('t2', (to) => to.task('t3'))
  .connectTask('t3', (to) => to.condition('end'));

it('handles workflow completion in simple workflows', ({ expect }) => {
  const program = Effect.gen(function* () {
    const idGenerator = makeIdGenerator();

    const service = yield* workflowDefinition.build().pipe(
      Effect.flatMap((workflow) => Service.initialize(workflow)),
      Effect.provideService(IdGenerator, idGenerator)
    );

    yield* service.startRootWorkflow();
    const state = yield* service.getState();
    expect(state).toMatchSnapshot();
    expect(getEnabledTaskNames(state)).toEqual(new Set(['t1']));

    yield* service.startTask('t1', {});
    const state2 = yield* service.getState();
    expect(state2).toMatchSnapshot();
    expect(getEnabledTaskNames(state2)).toEqual(new Set(['t2']));

    yield* service.startTask('t2', {});
    const state3 = yield* service.getState();
    expect(state3).toMatchSnapshot();
    expect(getEnabledTaskNames(state3)).toEqual(new Set());

    const { id: t2WorkItemId } = yield* service.initializeWorkItem('t2', {});
    yield* service.startWorkItem('t2.$t2WorkItemId', {
      params: { t2WorkItemId },
    });
    yield* service.completeWorkItem('t2.$t2WorkItemId', {
      params: { t2WorkItemId },
    });
    yield* service.startTask('t3', {});
    const state4 = yield* service.getState();
    expect(state4).toMatchSnapshot();
    expect(getEnabledTaskNames(state4)).toEqual(new Set());
    expect(state4.workflows[0]?.state).toEqual('completed');
  });

  Effect.runSync(program);
});
