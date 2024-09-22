import { Effect } from 'effect';
import { it } from 'vitest';

import { Builder, IdGenerator, Service } from '../../index.js';
import { getEnabledTaskNames, makeIdGenerator } from '../shared.js';

it('runs a net with an "or" join, a loop and a cancellation region', ({
  expect,
}) => {
  const workflowDefinition = Builder.workflow()
    .withName('or-join-cancellation-region')
    .startCondition('start')
    .task('A', Builder.emptyTask())
    .task('B', Builder.emptyTask())
    .task('C', Builder.emptyTask())
    .task('D', Builder.emptyTask().withSplitType('and'))
    .task('E', Builder.emptyTask().withJoinType('or'))
    .condition('c1')
    .condition('c2')
    .condition('c3')
    .endCondition('end')
    .connectCondition('start', (to) => to.task('A'))
    .connectTask('A', (to) => to.condition('c1'))
    .connectCondition('c1', (to) => to.task('B'))
    .connectTask('B', (to) => to.condition('c2'))
    .connectCondition('c2', (to) => to.task('C').task('E'))
    .connectTask('C', (to) => to.condition('c3'))
    .connectCondition('c3', (to) => to.task('D').task('E'))
    .connectTask('D', (to) => to.condition('c1').condition('c2'))
    .connectTask('E', (to) => to.condition('end'))
    .cancellationRegion('C', { tasks: ['B'], conditions: ['c1', 'c2'] });

  const program = Effect.gen(function* () {
    const idGenerator = makeIdGenerator();

    const service = yield* workflowDefinition.build().pipe(
      Effect.flatMap((workflow) => Service.initialize(workflow)),
      Effect.provideService(IdGenerator, idGenerator)
    );

    expect(yield* service.getState()).toMatchSnapshot();

    yield* service.startRootWorkflow();
    const state1 = yield* service.getState();
    expect(state1).toMatchSnapshot();
    expect(getEnabledTaskNames(state1)).toEqual(new Set(['A']));

    yield* service.startTask('A', {});
    const state2 = yield* service.getState();
    expect(state2).toMatchSnapshot();
    expect(getEnabledTaskNames(state2)).toEqual(new Set(['B']));

    yield* service.startTask('B', {});
    const state3 = yield* service.getState();
    expect(state3).toMatchSnapshot();
    expect(getEnabledTaskNames(state3)).toEqual(new Set(['C', 'E']));

    yield* service.startTask('C', {});
    const state4 = yield* service.getState();
    expect(state4).toMatchSnapshot();
    expect(getEnabledTaskNames(state4)).toEqual(new Set(['D']));

    yield* service.startTask('D', {});
    const state5 = yield* service.getState();
    expect(state5).toMatchSnapshot();
    expect(getEnabledTaskNames(state5)).toEqual(new Set(['B', 'C', 'E']));

    yield* service.startTask('E', {});
    const state6 = yield* service.getState();
    expect(state6).toMatchSnapshot();
    expect(getEnabledTaskNames(state6)).toEqual(new Set());
    expect(state6.workflows[0]?.state).toBe('completed');
  });

  Effect.runSync(program);
});
