import { Effect } from 'effect';
import { expect, it } from 'vitest';

import { Builder, IdGenerator, Service } from '../../index.js';
import { getEnabledTaskNames, makeIdGenerator } from '../shared.js';

it('runs a net with multiple "or" splits and "or" joins (1)', () => {
  const workflowDefinition = Builder.workflow<{ isBToCEnabled: boolean }>()
    .withName('multiple-or-join-2')
    .startCondition('start')
    .task('A', Builder.emptyTask().withSplitType('and'))
    .task('B', Builder.emptyTask().withSplitType('xor'))
    .task('C', Builder.emptyTask().withJoinType('or'))
    .task('D', Builder.emptyTask().withJoinType('or'))
    .endCondition('end')
    .connectCondition('start', (to) => to.task('A'))
    .connectTask('A', (to) => to.task('B').task('C'))
    .connectTask('B', (to) =>
      to
        .task('C', ({ context }) => Effect.succeed(context.isBToCEnabled))
        .defaultTask('D')
    )
    .connectTask('C', (to) => to.task('D'))
    .connectTask('D', (to) => to.condition('end'));

  const program = Effect.gen(function* ($) {
    const idGenerator = makeIdGenerator();

    const service1 = yield* $(
      workflowDefinition.build(),
      Effect.flatMap((workflow) =>
        Service.initialize(workflow, {
          isBToCEnabled: true,
        })
      ),
      Effect.provideService(IdGenerator, idGenerator)
    );

    expect(yield* $(service1.getState())).toMatchSnapshot();

    yield* $(service1.start());
    const state1_1 = yield* $(service1.getState());
    expect(state1_1).toMatchSnapshot();
    expect(getEnabledTaskNames(state1_1)).toEqual(new Set(['A']));

    yield* $(service1.startTask('A'));
    const state1_2 = yield* $(service1.getState());
    expect(state1_2).toMatchSnapshot();
    expect(getEnabledTaskNames(state1_2)).toEqual(new Set(['B']));

    yield* $(service1.startTask('B'));
    const state1_3 = yield* $(service1.getState());
    expect(state1_3).toMatchSnapshot();
    expect(getEnabledTaskNames(state1_3)).toEqual(new Set(['C']));

    yield* $(service1.startTask('C'));
    const state1_4 = yield* $(service1.getState());
    expect(state1_4).toMatchSnapshot();
    expect(getEnabledTaskNames(state1_4)).toEqual(new Set(['D']));

    yield* $(service1.startTask('D'));
    const state1_5 = yield* $(service1.getState());
    expect(state1_5).toMatchSnapshot();
    expect(state1_5.workflows[0]?.state).toBe('completed');

    const service2 = yield* $(
      workflowDefinition.build(),
      Effect.flatMap((workflow) =>
        Service.initialize(workflow, {
          isBToCEnabled: false,
        })
      ),
      Effect.provideService(IdGenerator, idGenerator)
    );

    expect(yield* $(service2.getState())).toMatchSnapshot();

    yield* $(service2.start());
    const state2_1 = yield* $(service2.getState());
    expect(state2_1).toMatchSnapshot();
    expect(getEnabledTaskNames(state2_1)).toEqual(new Set(['A']));

    yield* $(service2.startTask('A'));
    const state2_2 = yield* $(service2.getState());
    expect(state2_2).toMatchSnapshot();
    expect(getEnabledTaskNames(state2_2)).toEqual(new Set(['B']));

    yield* $(service2.startTask('B'));
    const state2_3 = yield* $(service2.getState());
    expect(state2_3).toMatchSnapshot();
    expect(getEnabledTaskNames(state2_3)).toEqual(new Set(['C']));

    yield* $(service2.startTask('C'));
    const state2_4 = yield* $(service2.getState());
    expect(state2_4).toMatchSnapshot();
    expect(getEnabledTaskNames(state2_4)).toEqual(new Set(['D']));

    yield* $(service2.startTask('D'));
    const state2_5 = yield* $(service2.getState());
    expect(state2_5).toMatchSnapshot();
    expect(state2_5.workflows[0]?.state).toBe('completed');
  });

  Effect.runSync(program);
});
