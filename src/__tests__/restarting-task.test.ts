import { Effect } from 'effect';
import { it } from 'vitest';

import { Builder, IdGenerator, Service } from '../index.js';
import { getEnabledTaskNames, makeIdGenerator } from './shared.js';

it('restarts the task if its input conditions have positive markings on task completion (1)', ({
  expect,
}) => {
  const workflowDefinition = Builder.workflow()
    .withName('activities')
    .startCondition('start')
    .task('t1', Builder.emptyTask().withSplitType('and'))
    .task('t2', Builder.emptyTask())
    .task('t3', (t) => t().withJoinType('xor'))
    .task('t4', Builder.emptyTask())
    .endCondition('end')
    .connectCondition('start', (to) => to.task('t1'))
    .connectTask('t1', (to) => to.task('t2').task('t3'))
    .connectTask('t2', (to) => to.task('t3'))
    .connectTask('t3', (to) => to.task('t4'))
    .connectTask('t4', (to) => to.condition('end'));

  const program = Effect.gen(function* () {
    const idGenerator = makeIdGenerator();

    const service = yield* workflowDefinition.build().pipe(
      Effect.flatMap((workflow) => Service.initialize(workflow)),
      Effect.provideService(IdGenerator, idGenerator)
    );

    yield* service.start();
    const state = yield* service.getState();
    expect(state).toMatchSnapshot();
    expect(getEnabledTaskNames(state)).toEqual(new Set(['t1']));

    yield* service.startTask('t1');
    const state2 = yield* service.getState();
    expect(state2).toMatchSnapshot();
    expect(getEnabledTaskNames(state2)).toEqual(new Set(['t2', 't3']));

    yield* service.startTask('t3');
    yield* service.startTask('t2');
    const { id } = yield* service.initializeWorkItem('t3');
    yield* service.startWorkItem(`t3.${id}`);
    yield* service.completeWorkItem(`t3.${id}`);
    const state3 = yield* service.getState();
    expect(state3).toMatchSnapshot();
    expect(getEnabledTaskNames(state3)).toEqual(new Set(['t3', 't4']));
  });

  Effect.runSync(program);
});
