import { Effect } from 'effect';
import { it } from 'vitest';

import { Builder, IdGenerator, Service } from '../index.js';
import { getEnabledTaskNames, makeIdGenerator } from './shared.js';

const workflowDefinition = Builder.workflow()
  .withName('activities')
  .startCondition('start')
  .task('t1', Builder.emptyTask().withSplitType('and'))
  .task('t2')
  .task('t3')
  .task('t4', Builder.emptyTask())
  .endCondition('end')
  .connectCondition('start', (to) => to.task('t1'))
  .connectTask('t1', (to) => to.task('t2').task('t3').task('t4'))
  .connectTask('t2', (to) => to.condition('end'))
  .connectTask('t3', (to) => to.condition('end'))
  .connectTask('t4', (to) => to.condition('end'));

it('cancels or disables started or enabled tasks on workflow end', ({
  expect,
}) => {
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

    yield* service.startTask('t1', {});
    const state2 = yield* service.getState();
    expect(state2).toMatchSnapshot();
    expect(getEnabledTaskNames(state2)).toEqual(new Set(['t2', 't3', 't4']));

    yield* service.startTask('t2', {});
    const state3 = yield* service.getState();
    expect(state3).toMatchSnapshot();
    expect(getEnabledTaskNames(state3)).toEqual(new Set(['t3', 't4']));

    yield* service.startTask('t4', {});
    const state4 = yield* service.getState();
    expect(state4).toMatchSnapshot();
    expect(getEnabledTaskNames(state4)).toEqual(new Set());
    expect(state4.tasks.filter((t) => t.state === 'started')).toEqual([]);
    expect(state4.workflows[0]?.state).toEqual('completed');
  });

  Effect.runSync(program);
});
