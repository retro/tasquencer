import { Effect } from 'effect';
import { it } from 'vitest';

import { Builder, IdGenerator, Service } from '../index.js';
import { getEnabledTaskNames, makeIdGenerator } from './shared.js';

const workflowDefinition = Builder.workflow()
  .withName('activities')
  .startCondition('start')
  .task('t1', Builder.emptyTask().withSplitType('and'))
  .task('t2', (t) =>
    // complete task as soon as one work item is completed
    t().withShouldComplete(({ getWorkItems }) =>
      Effect.gen(function* () {
        const workItems = yield* getWorkItems();
        return workItems.some((wi) => wi.state === 'completed');
      })
    )
  )
  .task('t3', Builder.emptyTask().withJoinType('and'))
  .endCondition('end')
  .connectCondition('start', (to) => to.task('t1'))
  .connectTask('t1', (to) => to.task('t2'))
  .connectTask('t2', (to) => to.task('t3'))
  .connectTask('t3', (to) => to.condition('end'));

it('cleans up work items on exit', ({ expect }) => {
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
    expect(getEnabledTaskNames(state2)).toEqual(new Set(['t2']));

    yield* service.startTask('t2');
    const state3 = yield* service.getState();
    expect(state3).toMatchSnapshot();
    expect(getEnabledTaskNames(state3)).toEqual(new Set());

    const { id } = yield* service.initializeWorkItem('t2');
    yield* service.initializeWorkItem('t2');
    yield* service.initializeWorkItem('t2');
    yield* service.startWorkItem(`t2.${id}`);
    yield* service.completeWorkItem(`t2.${id}`);
    yield* service.startTask('t3');
    const state4 = yield* service.getState();
    expect(state4).toMatchSnapshot();
    expect(getEnabledTaskNames(state4)).toEqual(new Set());
    expect(state4.workflows[0]?.state).toEqual('completed');
  });

  Effect.runSync(program);
});
