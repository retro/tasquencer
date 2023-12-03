import { Effect } from 'effect';
import { expect, it } from 'vitest';

import { Builder, IdGenerator, Service } from '../../index.js';
import { getEnabledTaskNames, makeIdGenerator } from '../shared.js';

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

it('runs a net with multiple "or" splits and "or" joins (1)', () => {
  const program = Effect.gen(function* ($) {
    const idGenerator = makeIdGenerator();

    const service = yield* $(
      workflowDefinition.build(),
      Effect.flatMap((workflow) =>
        Service.initialize(workflow, {
          isBToCEnabled: true,
        })
      ),
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
    expect(getEnabledTaskNames(state2)).toEqual(new Set(['B']));

    yield* $(service.startTask('B'));
    const state3 = yield* $(service.getState());
    expect(state3).toMatchSnapshot();
    expect(getEnabledTaskNames(state3)).toEqual(new Set(['C']));

    yield* $(service.startTask('C'));
    const state4 = yield* $(service.getState());
    expect(state4).toMatchSnapshot();
    expect(getEnabledTaskNames(state4)).toEqual(new Set(['D']));

    yield* $(service.startTask('D'));
    const state5 = yield* $(service.getState());
    expect(state5).toMatchSnapshot();
    expect(state5.workflows[0]?.state).toBe('completed');
  });

  Effect.runSync(program);
});

it('runs a net with multiple "or" splits and "or" joins (2)', () => {
  const program = Effect.gen(function* ($) {
    const idGenerator = makeIdGenerator();

    const service = yield* $(
      workflowDefinition.build(),
      Effect.flatMap((workflow) =>
        Service.initialize(workflow, {
          isBToCEnabled: false,
        })
      ),
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
    expect(getEnabledTaskNames(state2)).toEqual(new Set(['B']));

    yield* $(service.startTask('B'));
    const state3 = yield* $(service.getState());
    expect(state3).toMatchSnapshot();
    expect(getEnabledTaskNames(state3)).toEqual(new Set(['C']));

    yield* $(service.startTask('C'));
    const state4 = yield* $(service.getState());
    expect(state4).toMatchSnapshot();
    expect(getEnabledTaskNames(state4)).toEqual(new Set(['D']));

    yield* $(service.startTask('D'));
    const state5 = yield* $(service.getState());
    expect(state5).toMatchSnapshot();
    expect(state5.workflows[0]?.state).toBe('completed');
  });

  Effect.runSync(program);
});
