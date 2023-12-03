import { Effect } from 'effect';
import { expect, it } from 'vitest';

import { Builder, IdGenerator, Service } from '../../index.js';
import { getEnabledTaskNames, makeIdGenerator } from '../shared.js';

it('runs a net with an "or" join and a cancellation region', () => {
  const workflowDefinition = Builder.workflow()
    .withName('or-join-cancellation-region')
    .startCondition('start')
    .task('A', Builder.emptyTask().withSplitType('and'))
    .task('B', Builder.emptyTask().withSplitType('and').withJoinType('xor'))
    .task('C', Builder.emptyTask())
    .task('D', Builder.emptyTask())
    .task('E', Builder.emptyTask())
    .task('F', Builder.emptyTask().withJoinType('and'))
    .task('G', Builder.emptyTask().withJoinType('or'))
    .endCondition('end')
    .condition('bToB')
    .condition('bToDAndE')
    .connectCondition('start', (to) => to.task('A'))
    .connectTask('A', (to) => to.task('B').task('C'))
    .connectTask('B', (to) => to.condition('bToB').condition('bToDAndE'))
    .connectCondition('bToB', (to) => to.task('B'))
    .connectCondition('bToDAndE', (to) => to.task('D').task('E'))
    .connectTask('C', (to) => to.task('G'))
    .connectTask('D', (to) => to.task('F'))
    .connectTask('E', (to) => to.task('F'))
    .connectTask('F', (to) => to.task('G'))
    .connectTask('G', (to) => to.condition('end'))
    .cancellationRegion('D', { conditions: ['bToB'] });

  const program = Effect.gen(function* ($) {
    const idGenerator = makeIdGenerator();

    const service = yield* $(
      workflowDefinition.build(),
      Effect.flatMap((workflow) => Service.initialize(workflow)),
      Effect.provideService(IdGenerator, idGenerator)
    );

    expect(yield* $(service.getState())).toMatchSnapshot();

    yield* $(service.start());
    const state1 = yield* $(service.getState());
    expect(state1).toMatchSnapshot();
    expect(getEnabledTaskNames(state1)).toEqual(new Set(['A']));

    yield* $(service.startTask('A'));
    const state2 = yield* $(service.getState());
    expect(state2).toMatchSnapshot();
    expect(getEnabledTaskNames(state2)).toEqual(new Set(['B', 'C']));

    yield* $(service.startTask('C'));
    const state3 = yield* $(service.getState());
    expect(state3).toMatchSnapshot();
    expect(getEnabledTaskNames(state3)).toEqual(new Set(['B']));

    yield* $(service.startTask('B'));
    const state4 = yield* $(service.getState());
    expect(state4).toMatchSnapshot();
    expect(getEnabledTaskNames(state4)).toEqual(new Set(['B', 'D', 'E']));

    yield* $(service.startTask('E'));
    const state5 = yield* $(service.getState());
    expect(state5).toMatchSnapshot();
    expect(getEnabledTaskNames(state5)).toEqual(new Set(['B']));

    yield* $(service.startTask('B'));
    const state6 = yield* $(service.getState());
    expect(state6).toMatchSnapshot();
    expect(getEnabledTaskNames(state6)).toEqual(new Set(['B', 'D', 'E']));

    yield* $(service.startTask('D'));
    const state7 = yield* $(service.getState());
    expect(state7).toMatchSnapshot();
    expect(getEnabledTaskNames(state7)).toEqual(new Set(['F']));

    yield* $(service.startTask('F'));
    const state8 = yield* $(service.getState());
    expect(state8).toMatchSnapshot();
    expect(getEnabledTaskNames(state8)).toEqual(new Set(['G']));

    yield* $(service.startTask('G'));
    const state9 = yield* $(service.getState());
    expect(state9).toMatchSnapshot();
    expect(state9.workflows[0]?.state).toBe('completed');
  });

  Effect.runSync(program);
});
