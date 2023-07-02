import * as Effect from '@effect/io/Effect';
import { expect, it } from 'vitest';

import * as Builder from '../builder.js';
import * as Interpreter from '../interpreter2.js';
import { createMemory } from '../stateManager/memory.js';
import { IdGenerator, StateManager } from '../stateManager/types.js';

function makeIdGenerator(): IdGenerator {
  const ids = {
    task: 0,
    condition: 0,
    workflow: 0,
  };
  return {
    next(type) {
      ids[type]++;
      return Effect.succeed(`${type}-${ids[type]}`);
    },
  };
}

it('can run simple net with and-split and and-join', () => {
  const workflowDefinition = Builder.workflow('checkout')
    .startCondition('start')
    .task('scan_goods')
    .task('pay', (t) => t.withSplitType('and'))
    .task('pack_goods')
    .task('issue_receipt')
    .task('check_goods', (t) => t.withJoinType('and'))
    .endCondition('end')
    .connectCondition('start', (to) => to.task('scan_goods'))
    .connectTask('scan_goods', (to) => to.task('pay'))
    .connectTask('pay', (to) => to.task('pack_goods').task('issue_receipt'))
    .connectTask('pack_goods', (to) => to.task('check_goods'))
    .connectTask('issue_receipt', (to) => to.task('check_goods'))
    .connectTask('check_goods', (to) => to.condition('end'));

  const program = Effect.gen(function* ($) {
    const idGenerator = makeIdGenerator();
    const stateManager = yield* $(
      createMemory(),
      Effect.provideService(IdGenerator, idGenerator)
    );

    const workflow = yield* $(
      workflowDefinition.build(),
      Effect.provideService(StateManager, stateManager),
      Effect.provideService(IdGenerator, idGenerator)
    );

    const interpreter = yield* $(
      Interpreter.make(workflow, {}),
      Effect.provideService(StateManager, stateManager)
    );

    yield* $(interpreter.start());

    const res1 = yield* $(interpreter.getState());

    expect(res1).toEqual({
      tasks: {
        'task-1': { id: 'task-1', name: 'scan_goods', state: 'enabled' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 1 },
      },
    });

    yield* $(interpreter.activateTask('scan_goods'));

    const res2 = yield* $(interpreter.getState());

    expect(res2).toEqual({
      tasks: {
        'task-1': { id: 'task-1', name: 'scan_goods', state: 'active' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
      },
    });

    yield* $(interpreter.completeTask('scan_goods'));

    const res3 = yield* $(interpreter.getState());

    expect(res3).toEqual({
      tasks: {
        'task-1': { id: 'task-1', name: 'scan_goods', state: 'completed' },
        'task-2': { id: 'task-2', name: 'pay', state: 'enabled' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-3': {
          id: 'condition-3',
          name: 'implicit:scan_goods->pay',
          marking: 1,
        },
      },
    });

    yield* $(interpreter.activateTask('pay'));

    const res4 = yield* $(interpreter.getState());

    expect(res4).toEqual({
      tasks: {
        'task-1': { id: 'task-1', name: 'scan_goods', state: 'completed' },
        'task-2': { id: 'task-2', name: 'pay', state: 'active' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-3': {
          id: 'condition-3',
          name: 'implicit:scan_goods->pay',
          marking: 0,
        },
      },
    });

    yield* $(interpreter.completeTask('pay'));

    const res5 = yield* $(interpreter.getState());

    expect(res5).toEqual({
      tasks: {
        'task-1': { id: 'task-1', name: 'scan_goods', state: 'completed' },
        'task-2': { id: 'task-2', name: 'pay', state: 'completed' },
        'task-3': { id: 'task-3', name: 'pack_goods', state: 'enabled' },
        'task-4': { id: 'task-4', name: 'issue_receipt', state: 'enabled' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-3': {
          id: 'condition-3',
          name: 'implicit:scan_goods->pay',
          marking: 0,
        },
        'condition-4': {
          id: 'condition-4',
          name: 'implicit:pay->pack_goods',
          marking: 1,
        },
        'condition-5': {
          id: 'condition-5',
          name: 'implicit:pay->issue_receipt',
          marking: 1,
        },
      },
    });

    yield* $(interpreter.activateTask('pack_goods'));

    const res6 = yield* $(interpreter.getState());

    expect(res6).toEqual({
      tasks: {
        'task-1': { id: 'task-1', name: 'scan_goods', state: 'completed' },
        'task-2': { id: 'task-2', name: 'pay', state: 'completed' },
        'task-3': { id: 'task-3', name: 'pack_goods', state: 'active' },
        'task-4': { id: 'task-4', name: 'issue_receipt', state: 'enabled' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-3': {
          id: 'condition-3',
          name: 'implicit:scan_goods->pay',
          marking: 0,
        },
        'condition-4': {
          id: 'condition-4',
          name: 'implicit:pay->pack_goods',
          marking: 0,
        },
        'condition-5': {
          id: 'condition-5',
          name: 'implicit:pay->issue_receipt',
          marking: 1,
        },
      },
    });

    const res7 = yield* $(interpreter.getState());

    expect(res7).toEqual({
      tasks: {
        'task-1': { id: 'task-1', name: 'scan_goods', state: 'completed' },
        'task-2': { id: 'task-2', name: 'pay', state: 'completed' },
        'task-3': { id: 'task-3', name: 'pack_goods', state: 'active' },
        'task-4': { id: 'task-4', name: 'issue_receipt', state: 'enabled' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-3': {
          id: 'condition-3',
          name: 'implicit:scan_goods->pay',
          marking: 0,
        },
        'condition-4': {
          id: 'condition-4',
          name: 'implicit:pay->pack_goods',
          marking: 0,
        },
        'condition-5': {
          id: 'condition-5',
          name: 'implicit:pay->issue_receipt',
          marking: 1,
        },
      },
    });

    yield* $(interpreter.activateTask('issue_receipt'));

    const res8 = yield* $(interpreter.getState());

    expect(res8).toEqual({
      tasks: {
        'task-1': { id: 'task-1', name: 'scan_goods', state: 'completed' },
        'task-2': { id: 'task-2', name: 'pay', state: 'completed' },
        'task-3': { id: 'task-3', name: 'pack_goods', state: 'active' },
        'task-4': { id: 'task-4', name: 'issue_receipt', state: 'active' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-3': {
          id: 'condition-3',
          name: 'implicit:scan_goods->pay',
          marking: 0,
        },
        'condition-4': {
          id: 'condition-4',
          name: 'implicit:pay->pack_goods',
          marking: 0,
        },
        'condition-5': {
          id: 'condition-5',
          name: 'implicit:pay->issue_receipt',
          marking: 0,
        },
      },
    });

    yield* $(interpreter.completeTask('pack_goods'));

    const res9 = yield* $(interpreter.getState());

    expect(res9).toEqual({
      tasks: {
        'task-1': { id: 'task-1', name: 'scan_goods', state: 'completed' },
        'task-2': { id: 'task-2', name: 'pay', state: 'completed' },
        'task-3': { id: 'task-3', name: 'pack_goods', state: 'completed' },
        'task-4': { id: 'task-4', name: 'issue_receipt', state: 'active' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-3': {
          id: 'condition-3',
          name: 'implicit:scan_goods->pay',
          marking: 0,
        },
        'condition-4': {
          id: 'condition-4',
          name: 'implicit:pay->pack_goods',
          marking: 0,
        },
        'condition-5': {
          id: 'condition-5',
          name: 'implicit:pay->issue_receipt',
          marking: 0,
        },
        'condition-6': {
          id: 'condition-6',
          name: 'implicit:pack_goods->check_goods',
          marking: 1,
        },
      },
    });

    yield* $(interpreter.completeTask('issue_receipt'));

    const res10 = yield* $(interpreter.getState());

    expect(res10).toEqual({
      tasks: {
        'task-1': { id: 'task-1', name: 'scan_goods', state: 'completed' },
        'task-2': { id: 'task-2', name: 'pay', state: 'completed' },
        'task-3': { id: 'task-3', name: 'pack_goods', state: 'completed' },
        'task-4': { id: 'task-4', name: 'issue_receipt', state: 'completed' },
        'task-5': { id: 'task-5', name: 'check_goods', state: 'enabled' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-3': {
          id: 'condition-3',
          name: 'implicit:scan_goods->pay',
          marking: 0,
        },
        'condition-4': {
          id: 'condition-4',
          name: 'implicit:pay->pack_goods',
          marking: 0,
        },
        'condition-5': {
          id: 'condition-5',
          name: 'implicit:pay->issue_receipt',
          marking: 0,
        },
        'condition-6': {
          id: 'condition-6',
          name: 'implicit:pack_goods->check_goods',
          marking: 1,
        },
        'condition-7': {
          id: 'condition-7',
          name: 'implicit:issue_receipt->check_goods',
          marking: 1,
        },
      },
    });

    yield* $(interpreter.activateTask('check_goods'));

    const res11 = yield* $(interpreter.getState());

    expect(res11).toEqual({
      tasks: {
        'task-1': { id: 'task-1', name: 'scan_goods', state: 'completed' },
        'task-2': { id: 'task-2', name: 'pay', state: 'completed' },
        'task-3': { id: 'task-3', name: 'pack_goods', state: 'completed' },
        'task-4': { id: 'task-4', name: 'issue_receipt', state: 'completed' },
        'task-5': { id: 'task-5', name: 'check_goods', state: 'active' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-3': {
          id: 'condition-3',
          name: 'implicit:scan_goods->pay',
          marking: 0,
        },
        'condition-4': {
          id: 'condition-4',
          name: 'implicit:pay->pack_goods',
          marking: 0,
        },
        'condition-5': {
          id: 'condition-5',
          name: 'implicit:pay->issue_receipt',
          marking: 0,
        },
        'condition-6': {
          id: 'condition-6',
          name: 'implicit:pack_goods->check_goods',
          marking: 0,
        },
        'condition-7': {
          id: 'condition-7',
          name: 'implicit:issue_receipt->check_goods',
          marking: 0,
        },
      },
    });

    yield* $(interpreter.completeTask('check_goods'));

    const res12 = yield* $(interpreter.getState());

    expect(res12).toEqual({
      tasks: {
        'task-1': { id: 'task-1', name: 'scan_goods', state: 'completed' },
        'task-2': { id: 'task-2', name: 'pay', state: 'completed' },
        'task-3': { id: 'task-3', name: 'pack_goods', state: 'completed' },
        'task-4': { id: 'task-4', name: 'issue_receipt', state: 'completed' },
        'task-5': { id: 'task-5', name: 'check_goods', state: 'completed' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-3': {
          id: 'condition-3',
          name: 'implicit:scan_goods->pay',
          marking: 0,
        },
        'condition-4': {
          id: 'condition-4',
          name: 'implicit:pay->pack_goods',
          marking: 0,
        },
        'condition-5': {
          id: 'condition-5',
          name: 'implicit:pay->issue_receipt',
          marking: 0,
        },
        'condition-6': {
          id: 'condition-6',
          name: 'implicit:pack_goods->check_goods',
          marking: 0,
        },
        'condition-7': {
          id: 'condition-7',
          name: 'implicit:issue_receipt->check_goods',
          marking: 0,
        },
        'condition-2': { id: 'condition-2', name: 'end', marking: 1 },
      },
    });
  });

  Effect.runSync(program);
});

it('can run resume a workflow', () => {
  const workflowDefinition = Builder.workflow('checkout')
    .startCondition('start')
    .task('scan_goods')
    .task('pay', (t) => t.withSplitType('and'))
    .task('pack_goods')
    .task('issue_receipt')
    .task('check_goods', (t) => t.withJoinType('and'))
    .endCondition('end')
    .connectCondition('start', (to) => to.task('scan_goods'))
    .connectTask('scan_goods', (to) => to.task('pay'))
    .connectTask('pay', (to) => to.task('pack_goods').task('issue_receipt'))
    .connectTask('pack_goods', (to) => to.task('check_goods'))
    .connectTask('issue_receipt', (to) => to.task('check_goods'))
    .connectTask('check_goods', (to) => to.condition('end'));

  const program = Effect.gen(function* ($) {
    const idGenerator = makeIdGenerator();
    const stateManager = yield* $(
      createMemory(),
      Effect.provideService(IdGenerator, idGenerator)
    );

    const workflow1 = yield* $(
      workflowDefinition.build(),
      Effect.provideService(StateManager, stateManager),
      Effect.provideService(IdGenerator, idGenerator)
    );

    const interpreter1 = yield* $(
      Interpreter.make(workflow1, {}),
      Effect.provideService(StateManager, stateManager)
    );

    yield* $(interpreter1.start());
    yield* $(interpreter1.activateTask('scan_goods'));

    const workflow2 = yield* $(
      workflowDefinition.build(workflow1.id),
      Effect.provideService(StateManager, stateManager),
      Effect.provideService(IdGenerator, idGenerator)
    );

    const interpreter2 = yield* $(
      Interpreter.make(workflow2, {}),
      Effect.provideService(StateManager, stateManager)
    );

    yield* $(interpreter2.completeTask('scan_goods'));

    const res3 = yield* $(interpreter2.getState());

    // In this case some IDs are different than in the previous test
    // because idGenerator was not reset. If the task or condition wasn't
    // persisted, it will get a new ID on resume. What is important is that
    // the conditions and tasks that were persisted have their state and ID
    // restored.
    expect(res3).toEqual({
      tasks: {
        'task-1': { id: 'task-1', name: 'scan_goods', state: 'completed' },
        'task-6': { id: 'task-6', name: 'pay', state: 'enabled' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-9': {
          id: 'condition-9',
          name: 'implicit:scan_goods->pay',
          marking: 1,
        },
      },
    });
  });

  Effect.runSync(program);
});
