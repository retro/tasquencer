import { Effect } from 'effect';
import { expect, it } from 'vitest';

import { Builder, IdGenerator, Service } from '../../index.js';
import { getEnabledTaskNames, makeIdGenerator } from '../shared.js';

it('supports the deferred choice pattern', () => {
  const workflowDefinition = Builder.workflow()
    .withName('deferred-choice')
    .startCondition('start')
    .task('task_1', Builder.emptyTask())
    .task('task_1a', Builder.emptyTask())
    .task('task_2', Builder.emptyTask())
    .task('task_2a', Builder.emptyTask())
    .endCondition('end')
    .connectCondition('start', (to) => to.task('task_1').task('task_2'))
    .connectTask('task_1', (to) => to.task('task_1a'))
    .connectTask('task_2', (to) => to.task('task_2a'))
    .connectTask('task_1a', (to) => to.condition('end'))
    .connectTask('task_2a', (to) => to.condition('end'));

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
    expect(getEnabledTaskNames(state1)).toEqual(new Set(['task_1', 'task_2']));

    yield* $(service.startTask('task_1'));
    const state2 = yield* $(service.getState());
    expect(state2).toMatchSnapshot();
    expect(getEnabledTaskNames(state2)).toEqual(new Set(['task_1a']));

    yield* $(service.startTask('task_1a'));
    const state3 = yield* $(service.getState());
    expect(state3).toMatchSnapshot();
    expect(state3.workflows[0]?.state).toBe('completed');
  });

  Effect.runSync(program);
});
