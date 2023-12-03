import { Effect } from 'effect';
import { expect, it } from 'vitest';

import { Builder, IdGenerator, Service } from '../../index.js';
import { getEnabledTaskNames, makeIdGenerator } from '../shared.js';

it('runs a net with "xor" split and "xor" join', () => {
  const workflowDefinition = Builder.workflow<{ foo: string }>()
    .withName('xor-split-join')
    .startCondition('start')
    .task('A', Builder.emptyTask().withSplitType('xor'))
    .task('B', Builder.emptyTask())
    .task('C', Builder.emptyTask())
    .task('D', Builder.emptyTask())
    .endCondition('end')
    .connectCondition('start', (to) => to.task('A'))
    .connectTask('A', (to) =>
      to
        .task('B', ({ context }) => Effect.succeed(context.foo === 'B'))
        .task('C', ({ context }) => Effect.succeed(context.foo === 'C'))
        .defaultTask('D')
    )
    .connectTask('B', (to) => to.condition('end'))
    .connectTask('C', (to) => to.condition('end'))
    .connectTask('D', (to) => to.condition('end'));

  const program = Effect.gen(function* ($) {
    const idGenerator = makeIdGenerator();

    const service1 = yield* $(
      workflowDefinition.build(),
      Effect.flatMap((workflow) => Service.initialize(workflow, { foo: 'B' })),
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
    expect(state1_3.workflows[0]?.state).toBe('completed');

    const service2 = yield* $(
      workflowDefinition.build(),
      Effect.flatMap((workflow) => Service.initialize(workflow, { foo: 'C' })),
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
    expect(getEnabledTaskNames(state2_2)).toEqual(new Set(['C']));

    yield* $(service2.startTask('C'));
    const state2_3 = yield* $(service2.getState());
    expect(state2_3).toMatchSnapshot();
    expect(state2_3.workflows[0]?.state).toBe('completed');

    const service3 = yield* $(
      workflowDefinition.build(),
      Effect.flatMap((workflow) =>
        Service.initialize(workflow, { foo: 'not a match' })
      ),
      Effect.provideService(IdGenerator, idGenerator)
    );

    expect(yield* $(service3.getState())).toMatchSnapshot();

    yield* $(service3.start());
    const state3_1 = yield* $(service3.getState());
    expect(state3_1).toMatchSnapshot();
    expect(getEnabledTaskNames(state3_1)).toEqual(new Set(['A']));

    yield* $(service3.startTask('A'));
    const state3_2 = yield* $(service3.getState());
    expect(state3_2).toMatchSnapshot();
    expect(getEnabledTaskNames(state3_2)).toEqual(new Set(['D']));

    yield* $(service3.startTask('D'));
    const state3_3 = yield* $(service3.getState());
    expect(state3_3).toMatchSnapshot();
    expect(state3_3.workflows[0]?.state).toBe('completed');
  });

  Effect.runSync(program);
});
