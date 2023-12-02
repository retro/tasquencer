import { Effect } from 'effect';
import { expect, it } from 'vitest';

import { Builder, IdGenerator, Service } from '../index.js';
import { makeIdGenerator } from './shared.js';

function makeWorkflowDefinitionAndLog() {
  const log: string[] = [];
  const workflowDefinition = Builder.workflow()
    .withName('activities')
    .startCondition('start')
    .task('t1', (t) =>
      t()
        .withWorkItem((w) =>
          w()
            .onCancel(({ cancelWorkItem }) =>
              Effect.gen(function* ($) {
                yield* $(cancelWorkItem());
                log.push('T1 WORK ITEM ON CANCEL');
              })
            )
            .onComplete(({ completeWorkItem }) =>
              Effect.gen(function* ($) {
                yield* $(completeWorkItem());
                log.push('T1 WORK ITEM ON COMPLETE');
              })
            )
            .onFail(({ failWorkItem }) =>
              Effect.gen(function* ($) {
                yield* $(failWorkItem());
                log.push('T1 WORK ITEM ON FAIL');
              })
            )
            .onStart(({ startWorkItem }) =>
              Effect.gen(function* ($) {
                yield* $(startWorkItem());
                log.push('T1 WORK ITEM ON START');
              })
            )
        )
        .onEnable(({ enableTask }) =>
          Effect.gen(function* ($) {
            yield* $(enableTask());
            log.push('T1 ON ENABLE');
          })
        )
        .onDisable(({ disableTask }) =>
          Effect.gen(function* ($) {
            yield* $(disableTask());
            log.push('T1 ON DISABLE');
          })
        )
        .onFire(({ fireTask }) =>
          Effect.gen(function* ($) {
            yield* $(fireTask());
            log.push('T1 ON FIRE');
          })
        )
        .onCancel(({ cancelTask }) =>
          Effect.gen(function* ($) {
            log.push('T1 ON CANCEL');
            yield* $(cancelTask());
          })
        )
        .onExit(({ exitTask }) =>
          Effect.gen(function* ($) {
            log.push('T1 ON EXIT');
            yield* $(exitTask());
          })
        )
    )
    .task(
      't2',
      Builder.emptyTask()
        .onEnable(({ enableTask }) =>
          Effect.gen(function* ($) {
            yield* $(enableTask());
            log.push('T2 ON ENABLE');
          })
        )
        .onDisable(({ disableTask }) =>
          Effect.gen(function* ($) {
            yield* $(disableTask());
            log.push('T2 ON DISABLE');
          })
        )
        .onFire(({ fireTask }) =>
          Effect.gen(function* ($) {
            yield* $(fireTask());
            log.push('T2 ON FIRE');
          })
        )
        .onCancel(({ cancelTask }) =>
          Effect.gen(function* ($) {
            log.push('T2 ON CANCEL');
            yield* $(cancelTask());
          })
        )
        .onExit(({ exitTask }) =>
          Effect.gen(function* ($) {
            log.push('T2 ON EXIT');
            yield* $(exitTask());
          })
        )
    )
    .endCondition('end')
    .connectCondition('start', (to) => to.task('t1').task('t2'))
    .connectTask('t1', (to) => to.condition('end'))
    .connectTask('t2', (to) => to.condition('end'))
    .onStart(({ startWorkflow }) =>
      Effect.gen(function* ($) {
        log.push('WORKFLOW ON START');
        yield* $(startWorkflow());
      })
    )
    .onComplete(({ completeWorkflow }) =>
      Effect.gen(function* ($) {
        yield* $(completeWorkflow());
        log.push('WORKFLOW ON COMPLETE');
      })
    )
    .onFail(({ failWorkflow }) =>
      Effect.gen(function* ($) {
        yield* $(failWorkflow());
        log.push('WORKFLOW ON FAIL');
      })
    )
    .onCancel(({ cancelWorkflow }) =>
      Effect.gen(function* ($) {
        yield* $(cancelWorkflow());
        log.push('WORKFLOW ON CANCEL');
      })
    );

  return { workflowDefinition, log };
}

it('runs activities (1)', () => {
  const { workflowDefinition, log } = makeWorkflowDefinitionAndLog();
  const program = Effect.gen(function* ($) {
    const idGenerator = makeIdGenerator();

    const service = yield* $(
      workflowDefinition.build(),
      Effect.flatMap((workflow) => Service.initialize(workflow)),
      Effect.provideService(IdGenerator, idGenerator)
    );

    yield* $(service.start());

    yield* $(service.fireTask('t1'));

    const { id } = yield* $(service.initializeWorkItem('t1'));

    yield* $(service.startWorkItem(`t1.${id}`));
    yield* $(service.completeWorkItem(`t1.${id}`));

    expect(log).toEqual([
      'WORKFLOW ON START',
      'T1 ON ENABLE',
      'T2 ON ENABLE',
      'T2 ON DISABLE',
      'T1 ON FIRE',
      'T1 WORK ITEM ON START',
      'T1 WORK ITEM ON COMPLETE',
      'T1 ON EXIT',
      'WORKFLOW ON COMPLETE',
    ]);
  });

  Effect.runSync(program);
});

it('runs activities (2)', () => {
  const { workflowDefinition, log } = makeWorkflowDefinitionAndLog();
  const program = Effect.gen(function* ($) {
    const idGenerator = makeIdGenerator();

    const service = yield* $(
      workflowDefinition.build(),
      Effect.flatMap((workflow) => Service.initialize(workflow)),
      Effect.provideService(IdGenerator, idGenerator)
    );

    yield* $(service.start());

    yield* $(service.fireTask('t1'));

    const { id: id1 } = yield* $(service.initializeWorkItem('t1'));
    const { id: id2 } = yield* $(service.initializeWorkItem('t1'));

    yield* $(service.startWorkItem(`t1.${id1}`));
    yield* $(service.startWorkItem(`t1.${id2}`));
    yield* $(service.cancelWorkItem(`t1.${id1}`));
    yield* $(service.completeWorkItem(`t1.${id2}`));

    expect(log).toEqual([
      'WORKFLOW ON START',
      'T1 ON ENABLE',
      'T2 ON ENABLE',
      'T2 ON DISABLE',
      'T1 ON FIRE',
      'T1 WORK ITEM ON START',
      'T1 WORK ITEM ON START',
      'T1 WORK ITEM ON CANCEL',
      'T1 WORK ITEM ON COMPLETE',
      'T1 ON EXIT',
      'WORKFLOW ON COMPLETE',
    ]);
  });

  Effect.runSync(program);
});

it('runs activities (3)', () => {
  const { workflowDefinition, log } = makeWorkflowDefinitionAndLog();
  const program = Effect.gen(function* ($) {
    const idGenerator = makeIdGenerator();

    const service = yield* $(
      workflowDefinition.build(),
      Effect.flatMap((workflow) => Service.initialize(workflow)),
      Effect.provideService(IdGenerator, idGenerator)
    );

    yield* $(service.start());

    yield* $(service.fireTask('t1'));

    const { id: id1 } = yield* $(service.initializeWorkItem('t1'));
    const { id: id2 } = yield* $(service.initializeWorkItem('t1'));

    yield* $(service.startWorkItem(`t1.${id1}`));
    yield* $(service.startWorkItem(`t1.${id2}`));

    yield* $(service.cancel());

    expect(log).toEqual([
      'WORKFLOW ON START',
      'T1 ON ENABLE',
      'T2 ON ENABLE',
      'T2 ON DISABLE',
      'T1 ON FIRE',
      'T1 WORK ITEM ON START',
      'T1 WORK ITEM ON START',
      'WORKFLOW ON CANCEL',
    ]);
  });

  Effect.runSync(program);
});
