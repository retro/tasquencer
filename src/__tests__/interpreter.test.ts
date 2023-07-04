import * as Effect from '@effect/io/Effect';
import { expect, it } from 'vitest';

import * as Builder from '../builder.js';
import * as Interpreter from '../interpreter.js';
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

    const res1 = yield* $(interpreter.getWorkflowState());

    expect(res1).toEqual({
      tasks: {
        'task-1': { id: 'task-1', name: 'scan_goods', state: 'enabled' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 1 },
      },
    });

    yield* $(interpreter.activateTask('scan_goods'));

    const res2 = yield* $(interpreter.getWorkflowState());

    expect(res2).toEqual({
      tasks: {
        'task-1': { id: 'task-1', name: 'scan_goods', state: 'active' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
      },
    });

    yield* $(interpreter.completeTask('scan_goods'));

    const res3 = yield* $(interpreter.getWorkflowState());

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

    const res4 = yield* $(interpreter.getWorkflowState());

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

    const res5 = yield* $(interpreter.getWorkflowState());

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

    const res6 = yield* $(interpreter.getWorkflowState());

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

    const res7 = yield* $(interpreter.getWorkflowState());

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

    const res8 = yield* $(interpreter.getWorkflowState());

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

    const res9 = yield* $(interpreter.getWorkflowState());

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

    const res10 = yield* $(interpreter.getWorkflowState());

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

    const res11 = yield* $(interpreter.getWorkflowState());

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

    const res12 = yield* $(interpreter.getWorkflowState());

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

    const res3 = yield* $(interpreter2.getWorkflowState());

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

it('can run workflow with activities', () => {
  const log: {
    name: string;
    activityPhase: 'before' | 'procedure' | 'after';
    taskPhase: 'disable' | 'enable' | 'activate' | 'complete' | 'cancel';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    input?: any;
  }[] = [];

  const onEnableActivity = Builder.onEnable()
    .before((payload) =>
      Effect.gen(function* ($) {
        const name = yield* $(payload.getTaskName());
        log.push({
          name,
          activityPhase: 'before',
          taskPhase: 'enable',
        });
        return 'before';
      })
    )
    .procedure((payload) =>
      Effect.gen(function* ($) {
        const name = yield* $(payload.getTaskName());
        log.push({
          name,
          activityPhase: 'procedure',
          taskPhase: 'enable',
          input: payload.input,
        });
        return `${payload.input}:procedure`;
      })
    )
    .after((payload) =>
      Effect.gen(function* ($) {
        const name = yield* $(payload.getTaskName());
        log.push({
          name,
          activityPhase: 'after',
          taskPhase: 'enable',
          input: payload.input,
        });
      })
    );

  const onActivateActivity = Builder.onActivate()
    .before((payload) =>
      Effect.gen(function* ($) {
        const name = yield* $(payload.getTaskName());
        log.push({
          name,
          activityPhase: 'before',
          taskPhase: 'activate',
          input: payload.input,
        });
        return `${payload.input}:before`;
      })
    )
    .procedure((payload) =>
      Effect.gen(function* ($) {
        const name = yield* $(payload.getTaskName());
        log.push({
          name,
          activityPhase: 'procedure',
          taskPhase: 'activate',
          input: payload.input,
        });
        return `${payload.input}:procedure`;
      })
    )
    .after((payload) =>
      Effect.gen(function* ($) {
        const name = yield* $(payload.getTaskName());
        log.push({
          name,
          activityPhase: 'after',
          taskPhase: 'activate',
          input: payload.input,
        });
        return `${payload.input}:after`;
      })
    );

  const onCompleteActivity = Builder.onComplete()
    .before((payload) =>
      Effect.gen(function* ($) {
        const name = yield* $(payload.getTaskName());
        log.push({
          name,
          activityPhase: 'before',
          taskPhase: 'complete',
          input: payload.input,
        });
        return `${payload.input}:before`;
      })
    )
    .procedure((payload) =>
      Effect.gen(function* ($) {
        const name = yield* $(payload.getTaskName());
        log.push({
          name,
          activityPhase: 'procedure',
          taskPhase: 'complete',
          input: payload.input,
        });
        return `${payload.input}:procedure`;
      })
    )
    .after((payload) =>
      Effect.gen(function* ($) {
        const name = yield* $(payload.getTaskName());
        log.push({
          name,
          activityPhase: 'after',
          taskPhase: 'complete',
          input: payload.input,
        });
        return `${payload.input}:after`;
      })
    );

  const workflowDefinition = Builder.workflow('checkout')
    .startCondition('start')
    .task('scan_goods', (t) =>
      t
        .onEnable(onEnableActivity)
        .onActivate(onActivateActivity)
        .onComplete(onCompleteActivity)
    )
    .task('pay', (t) =>
      t
        .onEnable(onEnableActivity)
        .onActivate(onActivateActivity)
        .onComplete(onCompleteActivity)
        .withSplitType('and')
    )
    .task('pack_goods', (t) =>
      t
        .onEnable(onEnableActivity)
        .onActivate(onActivateActivity)
        .onComplete(onCompleteActivity)
    )
    .task('issue_receipt', (t) =>
      t
        .onEnable(onEnableActivity)
        .onActivate(onActivateActivity)
        .onComplete(onCompleteActivity)
    )
    .task('check_goods', (t) =>
      t
        .onEnable(onEnableActivity)
        .onActivate(onActivateActivity)
        .onComplete(onCompleteActivity)
        .withJoinType('and')
    )
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
    const res1 = yield* $(
      interpreter.activateTask('scan_goods', 'activate scan_goods user input')
    );
    expect(res1).toEqual(
      'activate scan_goods user input:before:procedure:after'
    );

    const res2 = yield* $(
      interpreter.completeTask('scan_goods', 'complete scan_goods user input')
    );
    expect(res2).toEqual(
      'complete scan_goods user input:before:procedure:after'
    );

    yield* $(interpreter.activateTask('pay'));
    yield* $(interpreter.completeTask('pay'));
    yield* $(interpreter.activateTask('pack_goods'));
    yield* $(interpreter.activateTask('issue_receipt'));
    yield* $(interpreter.completeTask('pack_goods'));
    yield* $(interpreter.completeTask('issue_receipt'));
    yield* $(interpreter.activateTask('check_goods'));
    yield* $(interpreter.completeTask('check_goods'));

    const workflowRes = yield* $(interpreter.getWorkflowState());

    expect(log).toEqual([
      { name: 'scan_goods', activityPhase: 'before', taskPhase: 'enable' },
      {
        name: 'scan_goods',
        activityPhase: 'procedure',
        taskPhase: 'enable',
        input: 'before',
      },
      {
        name: 'scan_goods',
        activityPhase: 'after',
        taskPhase: 'enable',
        input: 'before:procedure',
      },
      {
        name: 'scan_goods',
        activityPhase: 'before',
        taskPhase: 'activate',
        input: 'activate scan_goods user input',
      },
      {
        name: 'scan_goods',
        activityPhase: 'procedure',
        taskPhase: 'activate',
        input: 'activate scan_goods user input:before',
      },
      {
        name: 'scan_goods',
        activityPhase: 'after',
        taskPhase: 'activate',
        input: 'activate scan_goods user input:before:procedure',
      },
      {
        name: 'scan_goods',
        activityPhase: 'before',
        taskPhase: 'complete',
        input: 'complete scan_goods user input',
      },
      {
        name: 'scan_goods',
        activityPhase: 'procedure',
        taskPhase: 'complete',
        input: 'complete scan_goods user input:before',
      },
      { name: 'pay', activityPhase: 'before', taskPhase: 'enable' },
      {
        name: 'pay',
        activityPhase: 'procedure',
        taskPhase: 'enable',
        input: 'before',
      },
      {
        name: 'pay',
        activityPhase: 'after',
        taskPhase: 'enable',
        input: 'before:procedure',
      },
      {
        name: 'scan_goods',
        activityPhase: 'after',
        taskPhase: 'complete',
        input: 'complete scan_goods user input:before:procedure',
      },
      {
        name: 'pay',
        activityPhase: 'before',
        taskPhase: 'activate',
        input: undefined,
      },
      {
        name: 'pay',
        activityPhase: 'procedure',
        taskPhase: 'activate',
        input: 'undefined:before',
      },
      {
        name: 'pay',
        activityPhase: 'after',
        taskPhase: 'activate',
        input: 'undefined:before:procedure',
      },
      {
        name: 'pay',
        activityPhase: 'before',
        taskPhase: 'complete',
        input: undefined,
      },
      {
        name: 'pay',
        activityPhase: 'procedure',
        taskPhase: 'complete',
        input: 'undefined:before',
      },
      { name: 'pack_goods', activityPhase: 'before', taskPhase: 'enable' },
      {
        name: 'pack_goods',
        activityPhase: 'procedure',
        taskPhase: 'enable',
        input: 'before',
      },
      {
        name: 'pack_goods',
        activityPhase: 'after',
        taskPhase: 'enable',
        input: 'before:procedure',
      },
      {
        name: 'issue_receipt',
        activityPhase: 'before',
        taskPhase: 'enable',
      },
      {
        name: 'issue_receipt',
        activityPhase: 'procedure',
        taskPhase: 'enable',
        input: 'before',
      },
      {
        name: 'issue_receipt',
        activityPhase: 'after',
        taskPhase: 'enable',
        input: 'before:procedure',
      },
      {
        name: 'pay',
        activityPhase: 'after',
        taskPhase: 'complete',
        input: 'undefined:before:procedure',
      },
      {
        name: 'pack_goods',
        activityPhase: 'before',
        taskPhase: 'activate',
        input: undefined,
      },
      {
        name: 'pack_goods',
        activityPhase: 'procedure',
        taskPhase: 'activate',
        input: 'undefined:before',
      },
      {
        name: 'pack_goods',
        activityPhase: 'after',
        taskPhase: 'activate',
        input: 'undefined:before:procedure',
      },
      {
        name: 'issue_receipt',
        activityPhase: 'before',
        taskPhase: 'activate',
        input: undefined,
      },
      {
        name: 'issue_receipt',
        activityPhase: 'procedure',
        taskPhase: 'activate',
        input: 'undefined:before',
      },
      {
        name: 'issue_receipt',
        activityPhase: 'after',
        taskPhase: 'activate',
        input: 'undefined:before:procedure',
      },
      {
        name: 'pack_goods',
        activityPhase: 'before',
        taskPhase: 'complete',
        input: undefined,
      },
      {
        name: 'pack_goods',
        activityPhase: 'procedure',
        taskPhase: 'complete',
        input: 'undefined:before',
      },
      {
        name: 'pack_goods',
        activityPhase: 'after',
        taskPhase: 'complete',
        input: 'undefined:before:procedure',
      },
      {
        name: 'issue_receipt',
        activityPhase: 'before',
        taskPhase: 'complete',
        input: undefined,
      },
      {
        name: 'issue_receipt',
        activityPhase: 'procedure',
        taskPhase: 'complete',
        input: 'undefined:before',
      },
      { name: 'check_goods', activityPhase: 'before', taskPhase: 'enable' },
      {
        name: 'check_goods',
        activityPhase: 'procedure',
        taskPhase: 'enable',
        input: 'before',
      },
      {
        name: 'check_goods',
        activityPhase: 'after',
        taskPhase: 'enable',
        input: 'before:procedure',
      },
      {
        name: 'issue_receipt',
        activityPhase: 'after',
        taskPhase: 'complete',
        input: 'undefined:before:procedure',
      },
      {
        name: 'check_goods',
        activityPhase: 'before',
        taskPhase: 'activate',
        input: undefined,
      },
      {
        name: 'check_goods',
        activityPhase: 'procedure',
        taskPhase: 'activate',
        input: 'undefined:before',
      },
      {
        name: 'check_goods',
        activityPhase: 'after',
        taskPhase: 'activate',
        input: 'undefined:before:procedure',
      },
      {
        name: 'check_goods',
        activityPhase: 'before',
        taskPhase: 'complete',
        input: undefined,
      },
      {
        name: 'check_goods',
        activityPhase: 'procedure',
        taskPhase: 'complete',
        input: 'undefined:before',
      },
      {
        name: 'check_goods',
        activityPhase: 'after',
        taskPhase: 'complete',
        input: 'undefined:before:procedure',
      },
    ]);

    expect(workflowRes).toEqual({
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

it('can auto activate and auto complete tasks', () => {
  const workflowDefinition = Builder.workflow('name')
    .startCondition('start')
    .task('A', (t) =>
      t
        .onEnable((a) => a.procedure(({ activateTask }) => activateTask()))
        .onActivate((a) => a.procedure(({ completeTask }) => completeTask()))
    )
    .endCondition('end')
    .connectCondition('start', (to) => to.task('A'))
    .connectTask('A', (to) => to.condition('end'));

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

    const res1 = yield* $(interpreter.getWorkflowState());

    expect(res1).toEqual({
      tasks: { 'task-1': { id: 'task-1', name: 'A', state: 'completed' } },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-2': { id: 'condition-2', name: 'end', marking: 1 },
      },
    });
  });

  Effect.runSync(program);
});

it('supports deferred choice pattern', () => {
  const workflowDefinition = Builder.workflow('deferred-choice')
    .startCondition('start')
    .task('task_1')
    .task('task_1a')
    .task('task_2')
    .task('task_2a')
    .endCondition('end')
    .connectCondition('start', (to) => to.task('task_1').task('task_2'))
    .connectTask('task_1', (to) => to.task('task_1a'))
    .connectTask('task_2', (to) => to.task('task_2a'))
    .connectTask('task_1a', (to) => to.condition('end'))
    .connectTask('task_2a', (to) => to.condition('end'));

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

    const res1 = yield* $(interpreter.getWorkflowState());

    expect(res1).toEqual({
      tasks: {
        'task-1': { id: 'task-1', name: 'task_1', state: 'enabled' },
        'task-3': { id: 'task-3', name: 'task_2', state: 'enabled' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 1 },
      },
    });

    yield* $(interpreter.activateTask('task_1'));
    yield* $(interpreter.completeTask('task_1'));

    const res2 = yield* $(interpreter.getWorkflowState());

    expect(res2).toEqual({
      tasks: {
        'task-1': { id: 'task-1', name: 'task_1', state: 'completed' },
        'task-3': { id: 'task-3', name: 'task_2', state: 'disabled' },
        'task-2': { id: 'task-2', name: 'task_1a', state: 'enabled' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-3': {
          id: 'condition-3',
          name: 'implicit:task_1->task_1a',
          marking: 1,
        },
      },
    });

    yield* $(interpreter.activateTask('task_1a'));
    yield* $(interpreter.completeTask('task_1a'));

    const res3 = yield* $(interpreter.getWorkflowState());

    expect(res3).toEqual({
      tasks: {
        'task-1': { id: 'task-1', name: 'task_1', state: 'completed' },
        'task-3': { id: 'task-3', name: 'task_2', state: 'disabled' },
        'task-2': { id: 'task-2', name: 'task_1a', state: 'completed' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-3': {
          id: 'condition-3',
          name: 'implicit:task_1->task_1a',
          marking: 0,
        },
        'condition-2': { id: 'condition-2', name: 'end', marking: 1 },
      },
    });
  });

  Effect.runSync(program);
});

it('supports xor join', () => {
  const workflowDefinition = Builder.workflow('xor-join')
    .startCondition('start')
    .task('initial_task')
    .condition('choice')
    .task('task_a')
    .task('task_b')
    .task('task_c')
    .task('finish_task', (t) => t.withJoinType('xor'))
    .endCondition('end')
    .connectCondition('start', (to) => to.task('initial_task'))
    .connectTask('initial_task', (to) => to.condition('choice'))
    .connectCondition('choice', (to) =>
      to.task('task_a').task('task_b').task('task_c')
    )
    .connectTask('task_a', (to) => to.task('finish_task'))
    .connectTask('task_b', (to) => to.task('finish_task'))
    .connectTask('task_c', (to) => to.task('finish_task'))
    .connectTask('finish_task', (to) => to.condition('end'));

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

    const res1 = yield* $(interpreter.getWorkflowState());

    expect(res1).toEqual({
      tasks: {
        'task-1': { id: 'task-1', name: 'initial_task', state: 'enabled' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 1 },
      },
    });

    yield* $(interpreter.activateTask('initial_task'));
    yield* $(interpreter.completeTask('initial_task'));

    const res2 = yield* $(interpreter.getWorkflowState());

    expect(res2).toEqual({
      tasks: {
        'task-1': { id: 'task-1', name: 'initial_task', state: 'completed' },
        'task-2': { id: 'task-2', name: 'task_a', state: 'enabled' },
        'task-3': { id: 'task-3', name: 'task_b', state: 'enabled' },
        'task-4': { id: 'task-4', name: 'task_c', state: 'enabled' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-2': { id: 'condition-2', name: 'choice', marking: 1 },
      },
    });

    yield* $(interpreter.activateTask('task_b'));
    yield* $(interpreter.completeTask('task_b'));

    const res3 = yield* $(interpreter.getWorkflowState());

    expect(res3).toEqual({
      tasks: {
        'task-1': { id: 'task-1', name: 'initial_task', state: 'completed' },
        'task-2': { id: 'task-2', name: 'task_a', state: 'disabled' },
        'task-3': { id: 'task-3', name: 'task_b', state: 'completed' },
        'task-4': { id: 'task-4', name: 'task_c', state: 'disabled' },
        'task-5': { id: 'task-5', name: 'finish_task', state: 'enabled' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-2': { id: 'condition-2', name: 'choice', marking: 0 },
        'condition-5': {
          id: 'condition-5',
          name: 'implicit:task_b->finish_task',
          marking: 1,
        },
      },
    });
  });

  Effect.runSync(program);
});

it('supports interleaved parallel routing pattern', () => {
  const workflowDefinition = Builder.workflow('xor-join')
    .startCondition('start')
    .condition('mutex')
    .task('initial_task')
    .task('task_a', (t) => t.withSplitType('and').withJoinType('and'))
    .task('task_b', (t) => t.withSplitType('and').withJoinType('and'))
    .task('task_c', (t) => t.withSplitType('and').withJoinType('and'))
    .task('task_d', (t) => t.withSplitType('and').withJoinType('and'))
    .task('finish_task', (t) => t.withJoinType('and'))
    .endCondition('end')
    .connectCondition('start', (to) => to.task('initial_task'))
    .connectTask('initial_task', (to) =>
      to.condition('mutex').task('task_a').task('task_c')
    )
    .connectTask('task_a', (to) => to.task('task_b').condition('mutex'))
    .connectTask('task_b', (to) => to.task('finish_task').condition('mutex'))
    .connectTask('task_c', (to) => to.task('task_d').condition('mutex'))
    .connectTask('task_d', (to) => to.task('finish_task').condition('mutex'))
    .connectTask('finish_task', (to) => to.condition('end'))
    .connectCondition('mutex', (to) =>
      to.task('task_a').task('task_b').task('task_c').task('task_d')
    )
    .cancellationRegion('finish_task', { conditions: ['mutex'] });
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

    const res1 = yield* $(interpreter.getWorkflowState());

    expect(res1).toEqual({
      tasks: {
        'task-1': { id: 'task-1', name: 'initial_task', state: 'enabled' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 1 },
      },
    });

    yield* $(interpreter.activateTask('initial_task'));
    yield* $(interpreter.completeTask('initial_task'));

    const res2 = yield* $(interpreter.getWorkflowState());

    expect(res2).toEqual({
      tasks: {
        'task-1': { id: 'task-1', name: 'initial_task', state: 'completed' },
        'task-2': { id: 'task-2', name: 'task_a', state: 'enabled' },
        'task-4': { id: 'task-4', name: 'task_c', state: 'enabled' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-2': { id: 'condition-2', name: 'mutex', marking: 1 },
        'condition-4': {
          id: 'condition-4',
          name: 'implicit:initial_task->task_a',
          marking: 1,
        },
        'condition-5': {
          id: 'condition-5',
          name: 'implicit:initial_task->task_c',
          marking: 1,
        },
      },
    });

    yield* $(interpreter.activateTask('task_a'));

    const res3 = yield* $(interpreter.getWorkflowState());

    expect(res3).toEqual({
      tasks: {
        'task-1': { id: 'task-1', name: 'initial_task', state: 'completed' },
        'task-2': { id: 'task-2', name: 'task_a', state: 'active' },
        'task-4': { id: 'task-4', name: 'task_c', state: 'disabled' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-2': { id: 'condition-2', name: 'mutex', marking: 0 },
        'condition-4': {
          id: 'condition-4',
          name: 'implicit:initial_task->task_a',
          marking: 0,
        },
        'condition-5': {
          id: 'condition-5',
          name: 'implicit:initial_task->task_c',
          marking: 1,
        },
      },
    });

    yield* $(interpreter.completeTask('task_a'));

    const res4 = yield* $(interpreter.getWorkflowState());

    expect(res4).toEqual({
      tasks: {
        'task-1': { id: 'task-1', name: 'initial_task', state: 'completed' },
        'task-2': { id: 'task-2', name: 'task_a', state: 'completed' },
        'task-4': { id: 'task-4', name: 'task_c', state: 'enabled' },
        'task-3': { id: 'task-3', name: 'task_b', state: 'enabled' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-2': { id: 'condition-2', name: 'mutex', marking: 1 },
        'condition-4': {
          id: 'condition-4',
          name: 'implicit:initial_task->task_a',
          marking: 0,
        },
        'condition-5': {
          id: 'condition-5',
          name: 'implicit:initial_task->task_c',
          marking: 1,
        },
        'condition-6': {
          id: 'condition-6',
          name: 'implicit:task_a->task_b',
          marking: 1,
        },
      },
    });

    yield* $(interpreter.activateTask('task_b'));

    const res5 = yield* $(interpreter.getWorkflowState());

    expect(res5).toEqual({
      tasks: {
        'task-1': { id: 'task-1', name: 'initial_task', state: 'completed' },
        'task-2': { id: 'task-2', name: 'task_a', state: 'completed' },
        'task-4': { id: 'task-4', name: 'task_c', state: 'disabled' },
        'task-3': { id: 'task-3', name: 'task_b', state: 'active' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-2': { id: 'condition-2', name: 'mutex', marking: 0 },
        'condition-4': {
          id: 'condition-4',
          name: 'implicit:initial_task->task_a',
          marking: 0,
        },
        'condition-5': {
          id: 'condition-5',
          name: 'implicit:initial_task->task_c',
          marking: 1,
        },
        'condition-6': {
          id: 'condition-6',
          name: 'implicit:task_a->task_b',
          marking: 0,
        },
      },
    });

    yield* $(interpreter.completeTask('task_b'));

    const res6 = yield* $(interpreter.getWorkflowState());

    expect(res6).toEqual({
      tasks: {
        'task-1': { id: 'task-1', name: 'initial_task', state: 'completed' },
        'task-2': { id: 'task-2', name: 'task_a', state: 'completed' },
        'task-4': { id: 'task-4', name: 'task_c', state: 'enabled' },
        'task-3': { id: 'task-3', name: 'task_b', state: 'completed' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-2': { id: 'condition-2', name: 'mutex', marking: 1 },
        'condition-4': {
          id: 'condition-4',
          name: 'implicit:initial_task->task_a',
          marking: 0,
        },
        'condition-5': {
          id: 'condition-5',
          name: 'implicit:initial_task->task_c',
          marking: 1,
        },
        'condition-6': {
          id: 'condition-6',
          name: 'implicit:task_a->task_b',
          marking: 0,
        },
        'condition-7': {
          id: 'condition-7',
          name: 'implicit:task_b->finish_task',
          marking: 1,
        },
      },
    });

    yield* $(interpreter.activateTask('task_c'));

    const res7 = yield* $(interpreter.getWorkflowState());

    expect(res7).toEqual({
      tasks: {
        'task-1': { id: 'task-1', name: 'initial_task', state: 'completed' },
        'task-2': { id: 'task-2', name: 'task_a', state: 'completed' },
        'task-4': { id: 'task-4', name: 'task_c', state: 'active' },
        'task-3': { id: 'task-3', name: 'task_b', state: 'completed' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-2': { id: 'condition-2', name: 'mutex', marking: 0 },
        'condition-4': {
          id: 'condition-4',
          name: 'implicit:initial_task->task_a',
          marking: 0,
        },
        'condition-5': {
          id: 'condition-5',
          name: 'implicit:initial_task->task_c',
          marking: 0,
        },
        'condition-6': {
          id: 'condition-6',
          name: 'implicit:task_a->task_b',
          marking: 0,
        },
        'condition-7': {
          id: 'condition-7',
          name: 'implicit:task_b->finish_task',
          marking: 1,
        },
      },
    });

    yield* $(interpreter.completeTask('task_c'));

    const res8 = yield* $(interpreter.getWorkflowState());

    expect(res8).toEqual({
      tasks: {
        'task-1': { id: 'task-1', name: 'initial_task', state: 'completed' },
        'task-2': { id: 'task-2', name: 'task_a', state: 'completed' },
        'task-4': { id: 'task-4', name: 'task_c', state: 'completed' },
        'task-3': { id: 'task-3', name: 'task_b', state: 'completed' },
        'task-5': { id: 'task-5', name: 'task_d', state: 'enabled' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-2': { id: 'condition-2', name: 'mutex', marking: 1 },
        'condition-4': {
          id: 'condition-4',
          name: 'implicit:initial_task->task_a',
          marking: 0,
        },
        'condition-5': {
          id: 'condition-5',
          name: 'implicit:initial_task->task_c',
          marking: 0,
        },
        'condition-6': {
          id: 'condition-6',
          name: 'implicit:task_a->task_b',
          marking: 0,
        },
        'condition-7': {
          id: 'condition-7',
          name: 'implicit:task_b->finish_task',
          marking: 1,
        },
        'condition-8': {
          id: 'condition-8',
          name: 'implicit:task_c->task_d',
          marking: 1,
        },
      },
    });

    yield* $(interpreter.activateTask('task_d'));

    const res9 = yield* $(interpreter.getWorkflowState());

    expect(res9).toEqual({
      tasks: {
        'task-1': { id: 'task-1', name: 'initial_task', state: 'completed' },
        'task-2': { id: 'task-2', name: 'task_a', state: 'completed' },
        'task-4': { id: 'task-4', name: 'task_c', state: 'completed' },
        'task-3': { id: 'task-3', name: 'task_b', state: 'completed' },
        'task-5': { id: 'task-5', name: 'task_d', state: 'active' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-2': { id: 'condition-2', name: 'mutex', marking: 0 },
        'condition-4': {
          id: 'condition-4',
          name: 'implicit:initial_task->task_a',
          marking: 0,
        },
        'condition-5': {
          id: 'condition-5',
          name: 'implicit:initial_task->task_c',
          marking: 0,
        },
        'condition-6': {
          id: 'condition-6',
          name: 'implicit:task_a->task_b',
          marking: 0,
        },
        'condition-7': {
          id: 'condition-7',
          name: 'implicit:task_b->finish_task',
          marking: 1,
        },
        'condition-8': {
          id: 'condition-8',
          name: 'implicit:task_c->task_d',
          marking: 0,
        },
      },
    });

    yield* $(interpreter.completeTask('task_d'));

    const res10 = yield* $(interpreter.getWorkflowState());

    expect(res10).toEqual({
      tasks: {
        'task-1': { id: 'task-1', name: 'initial_task', state: 'completed' },
        'task-2': { id: 'task-2', name: 'task_a', state: 'completed' },
        'task-4': { id: 'task-4', name: 'task_c', state: 'completed' },
        'task-3': { id: 'task-3', name: 'task_b', state: 'completed' },
        'task-5': { id: 'task-5', name: 'task_d', state: 'completed' },
        'task-6': { id: 'task-6', name: 'finish_task', state: 'enabled' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-2': { id: 'condition-2', name: 'mutex', marking: 1 },
        'condition-4': {
          id: 'condition-4',
          name: 'implicit:initial_task->task_a',
          marking: 0,
        },
        'condition-5': {
          id: 'condition-5',
          name: 'implicit:initial_task->task_c',
          marking: 0,
        },
        'condition-6': {
          id: 'condition-6',
          name: 'implicit:task_a->task_b',
          marking: 0,
        },
        'condition-7': {
          id: 'condition-7',
          name: 'implicit:task_b->finish_task',
          marking: 1,
        },
        'condition-8': {
          id: 'condition-8',
          name: 'implicit:task_c->task_d',
          marking: 0,
        },
        'condition-9': {
          id: 'condition-9',
          name: 'implicit:task_d->finish_task',
          marking: 1,
        },
      },
    });

    yield* $(interpreter.activateTask('finish_task'));
    yield* $(interpreter.completeTask('finish_task'));

    const res11 = yield* $(interpreter.getWorkflowState());

    expect(res11).toEqual({
      tasks: {
        'task-1': { id: 'task-1', name: 'initial_task', state: 'completed' },
        'task-2': { id: 'task-2', name: 'task_a', state: 'completed' },
        'task-4': { id: 'task-4', name: 'task_c', state: 'completed' },
        'task-3': { id: 'task-3', name: 'task_b', state: 'completed' },
        'task-5': { id: 'task-5', name: 'task_d', state: 'completed' },
        'task-6': { id: 'task-6', name: 'finish_task', state: 'completed' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-2': { id: 'condition-2', name: 'mutex', marking: 0 },
        'condition-4': {
          id: 'condition-4',
          name: 'implicit:initial_task->task_a',
          marking: 0,
        },
        'condition-5': {
          id: 'condition-5',
          name: 'implicit:initial_task->task_c',
          marking: 0,
        },
        'condition-6': {
          id: 'condition-6',
          name: 'implicit:task_a->task_b',
          marking: 0,
        },
        'condition-7': {
          id: 'condition-7',
          name: 'implicit:task_b->finish_task',
          marking: 0,
        },
        'condition-8': {
          id: 'condition-8',
          name: 'implicit:task_c->task_d',
          marking: 0,
        },
        'condition-9': {
          id: 'condition-9',
          name: 'implicit:task_d->finish_task',
          marking: 0,
        },
        'condition-3': { id: 'condition-3', name: 'end', marking: 1 },
      },
    });
  });

  Effect.runSync(program);
});

it('supports xor join', () => {
  const workflowDefinition = Builder.workflow<{ foo: string }>('xor-join')
    .startCondition('start')
    .task('A', (t) => t.withSplitType('xor'))
    .task('B')
    .task('C')
    .task('D')
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
    const stateManager = yield* $(
      createMemory(),
      Effect.provideService(IdGenerator, idGenerator)
    );

    const workflow = yield* $(
      workflowDefinition.build(),
      Effect.provideService(StateManager, stateManager),
      Effect.provideService(IdGenerator, idGenerator)
    );

    const interpreter1 = yield* $(
      Interpreter.make(workflow, { foo: 'B' }),
      Effect.provideService(StateManager, stateManager)
    );

    yield* $(interpreter1.start());
    yield* $(interpreter1.activateTask('A'));
    yield* $(interpreter1.completeTask('A'));

    const res1_1 = yield* $(interpreter1.getWorkflowState());

    expect(res1_1).toEqual({
      tasks: {
        'task-1': { id: 'task-1', name: 'A', state: 'completed' },
        'task-2': { id: 'task-2', name: 'B', state: 'enabled' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-3': { id: 'condition-3', name: 'implicit:A->B', marking: 1 },
      },
    });

    const interpreter2 = yield* $(
      Interpreter.make(workflow, { foo: 'C' }),
      Effect.provideService(StateManager, stateManager)
    );

    yield* $(interpreter2.start());
    yield* $(interpreter2.activateTask('A'));
    yield* $(interpreter2.completeTask('A'));

    const res2_1 = yield* $(interpreter2.getWorkflowState());

    expect(res2_1).toEqual({
      tasks: {
        'task-1': { id: 'task-1', name: 'A', state: 'completed' },
        'task-3': { id: 'task-3', name: 'C', state: 'enabled' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-4': { id: 'condition-4', name: 'implicit:A->C', marking: 1 },
      },
    });

    const interpreter3 = yield* $(
      Interpreter.make(workflow, { foo: 'not a match' }),
      Effect.provideService(StateManager, stateManager)
    );

    yield* $(interpreter3.start());
    yield* $(interpreter3.activateTask('A'));
    yield* $(interpreter3.completeTask('A'));

    const res3_1 = yield* $(interpreter3.getWorkflowState());

    expect(res3_1).toEqual({
      tasks: {
        'task-1': { id: 'task-1', name: 'A', state: 'completed' },
        'task-4': { id: 'task-4', name: 'D', state: 'enabled' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-5': { id: 'condition-5', name: 'implicit:A->D', marking: 1 },
      },
    });
  });

  Effect.runSync(program);
});

it('supports or split and or join', () => {
  const workflowDefinition = Builder.workflow<{
    shouldBookFlight: boolean;
    shouldBookCar: boolean;
  }>('or-split-and-or-join')
    .startCondition('start')
    .task('register', (t) => t.withSplitType('or'))
    .task('book_flight')
    .task('book_hotel')
    .task('book_car')
    .task('pay', (t) => t.withJoinType('or'))
    .endCondition('end')
    .connectCondition('start', (to) => to.task('register'))
    .connectTask('register', (to) =>
      to
        .task('book_flight', ({ context }) =>
          Effect.succeed(context.shouldBookFlight)
        )
        .task('book_car', ({ context }) =>
          Effect.succeed(context.shouldBookCar)
        )
        .defaultTask('book_hotel')
    )
    .connectTask('book_flight', (to) => to.task('pay'))
    .connectTask('book_hotel', (to) => to.task('pay'))
    .connectTask('book_car', (to) => to.task('pay'))
    .connectTask('pay', (to) => to.condition('end'));

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
      Interpreter.make(workflow1, {
        shouldBookFlight: true,
        shouldBookCar: true,
      }),
      Effect.provideService(StateManager, stateManager)
    );

    yield* $(interpreter1.start());

    const res1_1 = yield* $(interpreter1.getWorkflowState());

    expect(res1_1).toEqual({
      tasks: { 'task-1': { id: 'task-1', name: 'register', state: 'enabled' } },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 1 },
      },
    });

    yield* $(interpreter1.activateTask('register'));
    yield* $(interpreter1.completeTask('register'));

    const res1_2 = yield* $(interpreter1.getWorkflowState());

    expect(res1_2).toEqual({
      tasks: {
        'task-1': { id: 'task-1', name: 'register', state: 'completed' },
        'task-2': { id: 'task-2', name: 'book_flight', state: 'enabled' },
        'task-4': { id: 'task-4', name: 'book_car', state: 'enabled' },
        'task-3': { id: 'task-3', name: 'book_hotel', state: 'enabled' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-3': {
          id: 'condition-3',
          name: 'implicit:register->book_flight',
          marking: 1,
        },
        'condition-4': {
          id: 'condition-4',
          name: 'implicit:register->book_car',
          marking: 1,
        },
        'condition-5': {
          id: 'condition-5',
          name: 'implicit:register->book_hotel',
          marking: 1,
        },
      },
    });

    yield* $(interpreter1.activateTask('book_flight'));
    yield* $(interpreter1.completeTask('book_flight'));

    const res1_3 = yield* $(interpreter1.getWorkflowState());

    expect(res1_3).toEqual({
      tasks: {
        'task-1': { id: 'task-1', name: 'register', state: 'completed' },
        'task-2': { id: 'task-2', name: 'book_flight', state: 'completed' },
        'task-4': { id: 'task-4', name: 'book_car', state: 'enabled' },
        'task-3': { id: 'task-3', name: 'book_hotel', state: 'enabled' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-3': {
          id: 'condition-3',
          name: 'implicit:register->book_flight',
          marking: 0,
        },
        'condition-4': {
          id: 'condition-4',
          name: 'implicit:register->book_car',
          marking: 1,
        },
        'condition-5': {
          id: 'condition-5',
          name: 'implicit:register->book_hotel',
          marking: 1,
        },
        'condition-6': {
          id: 'condition-6',
          name: 'implicit:book_flight->pay',
          marking: 1,
        },
      },
    });

    yield* $(interpreter1.activateTask('book_hotel'));
    yield* $(interpreter1.completeTask('book_hotel'));

    const res1_4 = yield* $(interpreter1.getWorkflowState());

    expect(res1_4).toEqual({
      tasks: {
        'task-1': { id: 'task-1', name: 'register', state: 'completed' },
        'task-2': { id: 'task-2', name: 'book_flight', state: 'completed' },
        'task-4': { id: 'task-4', name: 'book_car', state: 'enabled' },
        'task-3': { id: 'task-3', name: 'book_hotel', state: 'completed' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-3': {
          id: 'condition-3',
          name: 'implicit:register->book_flight',
          marking: 0,
        },
        'condition-4': {
          id: 'condition-4',
          name: 'implicit:register->book_car',
          marking: 1,
        },
        'condition-5': {
          id: 'condition-5',
          name: 'implicit:register->book_hotel',
          marking: 0,
        },
        'condition-6': {
          id: 'condition-6',
          name: 'implicit:book_flight->pay',
          marking: 1,
        },
        'condition-7': {
          id: 'condition-7',
          name: 'implicit:book_hotel->pay',
          marking: 1,
        },
      },
    });

    yield* $(interpreter1.activateTask('book_car'));
    yield* $(interpreter1.completeTask('book_car'));

    const res1_5 = yield* $(interpreter1.getWorkflowState());

    expect(res1_5).toEqual({
      tasks: {
        'task-1': { id: 'task-1', name: 'register', state: 'completed' },
        'task-2': { id: 'task-2', name: 'book_flight', state: 'completed' },
        'task-4': { id: 'task-4', name: 'book_car', state: 'completed' },
        'task-3': { id: 'task-3', name: 'book_hotel', state: 'completed' },
        'task-5': { id: 'task-5', name: 'pay', state: 'enabled' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-3': {
          id: 'condition-3',
          name: 'implicit:register->book_flight',
          marking: 0,
        },
        'condition-4': {
          id: 'condition-4',
          name: 'implicit:register->book_car',
          marking: 0,
        },
        'condition-5': {
          id: 'condition-5',
          name: 'implicit:register->book_hotel',
          marking: 0,
        },
        'condition-6': {
          id: 'condition-6',
          name: 'implicit:book_flight->pay',
          marking: 1,
        },
        'condition-7': {
          id: 'condition-7',
          name: 'implicit:book_hotel->pay',
          marking: 1,
        },
        'condition-8': {
          id: 'condition-8',
          name: 'implicit:book_car->pay',
          marking: 1,
        },
      },
    });

    const workflow2 = yield* $(
      workflowDefinition.build(),
      Effect.provideService(StateManager, stateManager),
      Effect.provideService(IdGenerator, idGenerator)
    );

    const interpreter2 = yield* $(
      Interpreter.make(workflow2, {
        shouldBookFlight: true,
        shouldBookCar: false,
      }),
      Effect.provideService(StateManager, stateManager)
    );

    yield* $(interpreter2.start());

    yield* $(interpreter2.activateTask('register'));
    yield* $(interpreter2.completeTask('register'));

    const res2_1 = yield* $(interpreter2.getWorkflowState());

    expect(res2_1).toEqual({
      tasks: {
        'task-6': { id: 'task-6', name: 'register', state: 'completed' },
        'task-7': { id: 'task-7', name: 'book_flight', state: 'enabled' },
        'task-8': { id: 'task-8', name: 'book_hotel', state: 'enabled' },
      },
      conditions: {
        'condition-9': { id: 'condition-9', name: 'start', marking: 0 },
        'condition-11': {
          id: 'condition-11',
          name: 'implicit:register->book_flight',
          marking: 1,
        },
        'condition-13': {
          id: 'condition-13',
          name: 'implicit:register->book_hotel',
          marking: 1,
        },
      },
    });

    yield* $(interpreter2.activateTask('book_flight'));
    yield* $(interpreter2.completeTask('book_flight'));

    const res2_2 = yield* $(interpreter2.getWorkflowState());

    expect(res2_2).toEqual({
      tasks: {
        'task-6': { id: 'task-6', name: 'register', state: 'completed' },
        'task-7': { id: 'task-7', name: 'book_flight', state: 'completed' },
        'task-8': { id: 'task-8', name: 'book_hotel', state: 'enabled' },
      },
      conditions: {
        'condition-9': { id: 'condition-9', name: 'start', marking: 0 },
        'condition-11': {
          id: 'condition-11',
          name: 'implicit:register->book_flight',
          marking: 0,
        },
        'condition-13': {
          id: 'condition-13',
          name: 'implicit:register->book_hotel',
          marking: 1,
        },
        'condition-14': {
          id: 'condition-14',
          name: 'implicit:book_flight->pay',
          marking: 1,
        },
      },
    });

    yield* $(interpreter2.activateTask('book_hotel'));
    yield* $(interpreter2.completeTask('book_hotel'));

    const res2_3 = yield* $(interpreter2.getWorkflowState());

    expect(res2_3).toEqual({
      tasks: {
        'task-6': { id: 'task-6', name: 'register', state: 'completed' },
        'task-7': { id: 'task-7', name: 'book_flight', state: 'completed' },
        'task-8': { id: 'task-8', name: 'book_hotel', state: 'completed' },
        'task-10': { id: 'task-10', name: 'pay', state: 'enabled' },
      },
      conditions: {
        'condition-9': { id: 'condition-9', name: 'start', marking: 0 },
        'condition-11': {
          id: 'condition-11',
          name: 'implicit:register->book_flight',
          marking: 0,
        },
        'condition-13': {
          id: 'condition-13',
          name: 'implicit:register->book_hotel',
          marking: 0,
        },
        'condition-14': {
          id: 'condition-14',
          name: 'implicit:book_flight->pay',
          marking: 1,
        },
        'condition-15': {
          id: 'condition-15',
          name: 'implicit:book_hotel->pay',
          marking: 1,
        },
      },
    });

    const workflow3 = yield* $(
      workflowDefinition.build(),
      Effect.provideService(StateManager, stateManager),
      Effect.provideService(IdGenerator, idGenerator)
    );

    const interpreter3 = yield* $(
      Interpreter.make(workflow3, {
        shouldBookFlight: false,
        shouldBookCar: false,
      }),
      Effect.provideService(StateManager, stateManager)
    );

    yield* $(interpreter3.start());

    yield* $(interpreter3.activateTask('register'));
    yield* $(interpreter3.completeTask('register'));

    const res3_1 = yield* $(interpreter3.getWorkflowState());

    expect(res3_1).toEqual({
      tasks: {
        'task-11': { id: 'task-11', name: 'register', state: 'completed' },
        'task-13': { id: 'task-13', name: 'book_hotel', state: 'enabled' },
      },
      conditions: {
        'condition-17': { id: 'condition-17', name: 'start', marking: 0 },
        'condition-21': {
          id: 'condition-21',
          name: 'implicit:register->book_hotel',
          marking: 1,
        },
      },
    });

    yield* $(interpreter3.activateTask('book_hotel'));
    yield* $(interpreter3.completeTask('book_hotel'));

    const res3_2 = yield* $(interpreter3.getWorkflowState());

    expect(res3_2).toEqual({
      tasks: {
        'task-11': { id: 'task-11', name: 'register', state: 'completed' },
        'task-13': { id: 'task-13', name: 'book_hotel', state: 'completed' },
        'task-15': { id: 'task-15', name: 'pay', state: 'enabled' },
      },
      conditions: {
        'condition-17': { id: 'condition-17', name: 'start', marking: 0 },
        'condition-21': {
          id: 'condition-21',
          name: 'implicit:register->book_hotel',
          marking: 0,
        },
        'condition-23': {
          id: 'condition-23',
          name: 'implicit:book_hotel->pay',
          marking: 1,
        },
      },
    });
  });

  Effect.runSync(program);
});

it('supports multiple or splits and or joins (1)', () => {
  const workflowDefinition = Builder.workflow<{ isTaskDEnabled: boolean }>(
    'xor-join'
  )
    .startCondition('start')
    .task('A', (t) => t.withSplitType('and'))
    .task('B')
    .task('C', (t) => t.withSplitType('or'))
    .task('D')
    .task('E', (t) => t.withJoinType('or'))
    .task('F', (t) => t.withJoinType('or'))
    .endCondition('end')
    .connectCondition('start', (to) => to.task('A'))
    .connectTask('A', (to) => to.task('B').task('C'))
    .connectTask('B', (to) => to.task('F'))
    .connectTask('C', (to) =>
      to
        .task('D', ({ context }) => Effect.succeed(context.isTaskDEnabled))
        .defaultTask('E')
    )
    .connectTask('D', (to) => to.task('E'))
    .connectTask('E', (to) => to.task('F'))
    .connectTask('F', (to) => to.condition('end'));

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
      Interpreter.make(workflow1, { isTaskDEnabled: true }),
      Effect.provideService(StateManager, stateManager)
    );

    yield* $(interpreter1.start());

    const res1_1 = yield* $(interpreter1.getWorkflowState());

    expect(res1_1).toEqual({
      tasks: { 'task-1': { id: 'task-1', name: 'A', state: 'enabled' } },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 1 },
      },
    });

    yield* $(interpreter1.activateTask('A'));
    yield* $(interpreter1.completeTask('A'));

    const res1_2 = yield* $(interpreter1.getWorkflowState());

    expect(res1_2).toEqual({
      tasks: {
        'task-1': { id: 'task-1', name: 'A', state: 'completed' },
        'task-2': { id: 'task-2', name: 'B', state: 'enabled' },
        'task-3': { id: 'task-3', name: 'C', state: 'enabled' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-3': { id: 'condition-3', name: 'implicit:A->B', marking: 1 },
        'condition-4': { id: 'condition-4', name: 'implicit:A->C', marking: 1 },
      },
    });

    yield* $(interpreter1.activateTask('B'));
    yield* $(interpreter1.completeTask('B'));

    const res1_3 = yield* $(interpreter1.getWorkflowState());

    expect(res1_3).toEqual({
      tasks: {
        'task-1': { id: 'task-1', name: 'A', state: 'completed' },
        'task-2': { id: 'task-2', name: 'B', state: 'completed' },
        'task-3': { id: 'task-3', name: 'C', state: 'enabled' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-3': { id: 'condition-3', name: 'implicit:A->B', marking: 0 },
        'condition-4': { id: 'condition-4', name: 'implicit:A->C', marking: 1 },
        'condition-5': { id: 'condition-5', name: 'implicit:B->F', marking: 1 },
      },
    });

    yield* $(interpreter1.activateTask('C'));
    yield* $(interpreter1.completeTask('C'));

    const res1_4 = yield* $(interpreter1.getWorkflowState());

    expect(res1_4).toEqual({
      tasks: {
        'task-1': { id: 'task-1', name: 'A', state: 'completed' },
        'task-2': { id: 'task-2', name: 'B', state: 'completed' },
        'task-3': { id: 'task-3', name: 'C', state: 'completed' },
        'task-4': { id: 'task-4', name: 'D', state: 'enabled' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-3': { id: 'condition-3', name: 'implicit:A->B', marking: 0 },
        'condition-4': { id: 'condition-4', name: 'implicit:A->C', marking: 0 },
        'condition-5': { id: 'condition-5', name: 'implicit:B->F', marking: 1 },
        'condition-6': { id: 'condition-6', name: 'implicit:C->D', marking: 1 },
        'condition-7': { id: 'condition-7', name: 'implicit:C->E', marking: 1 },
      },
    });

    yield* $(interpreter1.activateTask('D'));
    yield* $(interpreter1.completeTask('D'));

    const res1_5 = yield* $(interpreter1.getWorkflowState());

    expect(res1_5).toEqual({
      tasks: {
        'task-1': { id: 'task-1', name: 'A', state: 'completed' },
        'task-2': { id: 'task-2', name: 'B', state: 'completed' },
        'task-3': { id: 'task-3', name: 'C', state: 'completed' },
        'task-4': { id: 'task-4', name: 'D', state: 'completed' },
        'task-5': { id: 'task-5', name: 'E', state: 'enabled' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-3': { id: 'condition-3', name: 'implicit:A->B', marking: 0 },
        'condition-4': { id: 'condition-4', name: 'implicit:A->C', marking: 0 },
        'condition-5': { id: 'condition-5', name: 'implicit:B->F', marking: 1 },
        'condition-6': { id: 'condition-6', name: 'implicit:C->D', marking: 0 },
        'condition-7': { id: 'condition-7', name: 'implicit:C->E', marking: 1 },
        'condition-8': { id: 'condition-8', name: 'implicit:D->E', marking: 1 },
      },
    });

    yield* $(interpreter1.activateTask('E'));
    yield* $(interpreter1.completeTask('E'));

    const res1_6 = yield* $(interpreter1.getWorkflowState());

    expect(res1_6).toEqual({
      tasks: {
        'task-1': { id: 'task-1', name: 'A', state: 'completed' },
        'task-2': { id: 'task-2', name: 'B', state: 'completed' },
        'task-3': { id: 'task-3', name: 'C', state: 'completed' },
        'task-4': { id: 'task-4', name: 'D', state: 'completed' },
        'task-5': { id: 'task-5', name: 'E', state: 'completed' },
        'task-6': { id: 'task-6', name: 'F', state: 'enabled' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-3': { id: 'condition-3', name: 'implicit:A->B', marking: 0 },
        'condition-4': { id: 'condition-4', name: 'implicit:A->C', marking: 0 },
        'condition-5': { id: 'condition-5', name: 'implicit:B->F', marking: 1 },
        'condition-6': { id: 'condition-6', name: 'implicit:C->D', marking: 0 },
        'condition-7': { id: 'condition-7', name: 'implicit:C->E', marking: 0 },
        'condition-8': { id: 'condition-8', name: 'implicit:D->E', marking: 0 },
        'condition-9': { id: 'condition-9', name: 'implicit:E->F', marking: 1 },
      },
    });

    const workflow2 = yield* $(
      workflowDefinition.build(),
      Effect.provideService(StateManager, stateManager),
      Effect.provideService(IdGenerator, idGenerator)
    );

    const interpreter2 = yield* $(
      Interpreter.make(workflow2, { isTaskDEnabled: false }),
      Effect.provideService(StateManager, stateManager)
    );

    yield* $(interpreter2.start());

    const res2_1 = yield* $(interpreter2.getWorkflowState());

    expect(res2_1).toEqual({
      tasks: { 'task-7': { id: 'task-7', name: 'A', state: 'enabled' } },
      conditions: {
        'condition-10': { id: 'condition-10', name: 'start', marking: 1 },
      },
    });

    yield* $(interpreter2.activateTask('A'));
    yield* $(interpreter2.completeTask('A'));

    const res2_2 = yield* $(interpreter2.getWorkflowState());

    expect(res2_2).toEqual({
      tasks: {
        'task-7': { id: 'task-7', name: 'A', state: 'completed' },
        'task-8': { id: 'task-8', name: 'B', state: 'enabled' },
        'task-9': { id: 'task-9', name: 'C', state: 'enabled' },
      },
      conditions: {
        'condition-10': { id: 'condition-10', name: 'start', marking: 0 },
        'condition-12': {
          id: 'condition-12',
          name: 'implicit:A->B',
          marking: 1,
        },
        'condition-13': {
          id: 'condition-13',
          name: 'implicit:A->C',
          marking: 1,
        },
      },
    });

    yield* $(interpreter2.activateTask('B'));
    yield* $(interpreter2.completeTask('B'));

    const res2_3 = yield* $(interpreter2.getWorkflowState());

    expect(res2_3).toEqual({
      tasks: {
        'task-7': { id: 'task-7', name: 'A', state: 'completed' },
        'task-8': { id: 'task-8', name: 'B', state: 'completed' },
        'task-9': { id: 'task-9', name: 'C', state: 'enabled' },
      },
      conditions: {
        'condition-10': { id: 'condition-10', name: 'start', marking: 0 },
        'condition-12': {
          id: 'condition-12',
          name: 'implicit:A->B',
          marking: 0,
        },
        'condition-13': {
          id: 'condition-13',
          name: 'implicit:A->C',
          marking: 1,
        },
        'condition-14': {
          id: 'condition-14',
          name: 'implicit:B->F',
          marking: 1,
        },
      },
    });

    yield* $(interpreter2.activateTask('C'));
    yield* $(interpreter2.completeTask('C'));

    const res2_4 = yield* $(interpreter2.getWorkflowState());

    expect(res2_4).toEqual({
      tasks: {
        'task-7': { id: 'task-7', name: 'A', state: 'completed' },
        'task-8': { id: 'task-8', name: 'B', state: 'completed' },
        'task-9': { id: 'task-9', name: 'C', state: 'completed' },
        'task-11': { id: 'task-11', name: 'E', state: 'enabled' },
      },
      conditions: {
        'condition-10': { id: 'condition-10', name: 'start', marking: 0 },
        'condition-12': {
          id: 'condition-12',
          name: 'implicit:A->B',
          marking: 0,
        },
        'condition-13': {
          id: 'condition-13',
          name: 'implicit:A->C',
          marking: 0,
        },
        'condition-14': {
          id: 'condition-14',
          name: 'implicit:B->F',
          marking: 1,
        },
        'condition-16': {
          id: 'condition-16',
          name: 'implicit:C->E',
          marking: 1,
        },
      },
    });

    yield* $(interpreter2.activateTask('E'));
    yield* $(interpreter2.completeTask('E'));

    const res2_5 = yield* $(interpreter2.getWorkflowState());

    expect(res2_5).toEqual({
      tasks: {
        'task-7': { id: 'task-7', name: 'A', state: 'completed' },
        'task-8': { id: 'task-8', name: 'B', state: 'completed' },
        'task-9': { id: 'task-9', name: 'C', state: 'completed' },
        'task-11': { id: 'task-11', name: 'E', state: 'completed' },
        'task-12': { id: 'task-12', name: 'F', state: 'enabled' },
      },
      conditions: {
        'condition-10': { id: 'condition-10', name: 'start', marking: 0 },
        'condition-12': {
          id: 'condition-12',
          name: 'implicit:A->B',
          marking: 0,
        },
        'condition-13': {
          id: 'condition-13',
          name: 'implicit:A->C',
          marking: 0,
        },
        'condition-14': {
          id: 'condition-14',
          name: 'implicit:B->F',
          marking: 1,
        },
        'condition-16': {
          id: 'condition-16',
          name: 'implicit:C->E',
          marking: 0,
        },
        'condition-17': {
          id: 'condition-17',
          name: 'implicit:D->E',
          marking: 0,
        },
        'condition-18': {
          id: 'condition-18',
          name: 'implicit:E->F',
          marking: 1,
        },
      },
    });
  });

  Effect.runSync(program);
});

it('supports multiple or splits and or joins (2)', () => {
  const workflowDefinition = Builder.workflow<{ isBToCEnabled: boolean }>(
    'or-split-or-join'
  )
    .startCondition('start')
    .task('A', (t) => t.withSplitType('and'))
    .task('B', (t) => t.withSplitType('xor'))
    .task('C', (t) => t.withJoinType('or'))
    .task('D', (t) => t.withJoinType('or'))
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
      Interpreter.make(workflow1, { isBToCEnabled: true }),
      Effect.provideService(StateManager, stateManager)
    );

    yield* $(interpreter1.start());

    const res1_1 = yield* $(interpreter1.getWorkflowState());

    expect(res1_1).toEqual({
      tasks: { 'task-1': { id: 'task-1', name: 'A', state: 'enabled' } },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 1 },
      },
    });

    yield* $(interpreter1.activateTask('A'));
    yield* $(interpreter1.completeTask('A'));

    const res1_2 = yield* $(interpreter1.getWorkflowState());

    expect(res1_2).toEqual({
      tasks: {
        'task-1': { id: 'task-1', name: 'A', state: 'completed' },
        'task-2': { id: 'task-2', name: 'B', state: 'enabled' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-3': { id: 'condition-3', name: 'implicit:A->B', marking: 1 },
        'condition-4': { id: 'condition-4', name: 'implicit:A->C', marking: 1 },
      },
    });

    yield* $(interpreter1.activateTask('B'));
    yield* $(interpreter1.completeTask('B'));

    const res1_3 = yield* $(interpreter1.getWorkflowState());

    expect(res1_3).toEqual({
      tasks: {
        'task-1': { id: 'task-1', name: 'A', state: 'completed' },
        'task-2': { id: 'task-2', name: 'B', state: 'completed' },
        'task-3': { id: 'task-3', name: 'C', state: 'enabled' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-3': { id: 'condition-3', name: 'implicit:A->B', marking: 0 },
        'condition-4': { id: 'condition-4', name: 'implicit:A->C', marking: 1 },
        'condition-5': { id: 'condition-5', name: 'implicit:B->C', marking: 1 },
      },
    });

    yield* $(interpreter1.activateTask('C'));
    yield* $(interpreter1.completeTask('C'));

    const res1_4 = yield* $(interpreter1.getWorkflowState());

    expect(res1_4).toEqual({
      tasks: {
        'task-1': { id: 'task-1', name: 'A', state: 'completed' },
        'task-2': { id: 'task-2', name: 'B', state: 'completed' },
        'task-3': { id: 'task-3', name: 'C', state: 'completed' },
        'task-4': { id: 'task-4', name: 'D', state: 'enabled' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-3': { id: 'condition-3', name: 'implicit:A->B', marking: 0 },
        'condition-4': { id: 'condition-4', name: 'implicit:A->C', marking: 0 },
        'condition-5': { id: 'condition-5', name: 'implicit:B->C', marking: 0 },
        'condition-7': { id: 'condition-7', name: 'implicit:C->D', marking: 1 },
      },
    });

    const workflow2 = yield* $(
      workflowDefinition.build(),
      Effect.provideService(StateManager, stateManager),
      Effect.provideService(IdGenerator, idGenerator)
    );

    const interpreter2 = yield* $(
      Interpreter.make(workflow2, { isBToCEnabled: false }),
      Effect.provideService(StateManager, stateManager)
    );

    yield* $(interpreter2.start());

    const res2_1 = yield* $(interpreter2.getWorkflowState());

    expect(res2_1).toEqual({
      tasks: { 'task-5': { id: 'task-5', name: 'A', state: 'enabled' } },
      conditions: {
        'condition-8': { id: 'condition-8', name: 'start', marking: 1 },
      },
    });

    yield* $(interpreter2.activateTask('A'));
    yield* $(interpreter2.completeTask('A'));

    const res2_2 = yield* $(interpreter2.getWorkflowState());

    expect(res2_2).toEqual({
      tasks: {
        'task-5': { id: 'task-5', name: 'A', state: 'completed' },
        'task-6': { id: 'task-6', name: 'B', state: 'enabled' },
      },
      conditions: {
        'condition-8': { id: 'condition-8', name: 'start', marking: 0 },
        'condition-10': {
          id: 'condition-10',
          name: 'implicit:A->B',
          marking: 1,
        },
        'condition-11': {
          id: 'condition-11',
          name: 'implicit:A->C',
          marking: 1,
        },
      },
    });

    yield* $(interpreter2.activateTask('B'));
    yield* $(interpreter2.completeTask('B'));

    const res2_3 = yield* $(interpreter2.getWorkflowState());

    expect(res2_3).toEqual({
      tasks: {
        'task-5': { id: 'task-5', name: 'A', state: 'completed' },
        'task-6': { id: 'task-6', name: 'B', state: 'completed' },
        'task-7': { id: 'task-7', name: 'C', state: 'enabled' },
      },
      conditions: {
        'condition-8': { id: 'condition-8', name: 'start', marking: 0 },
        'condition-10': {
          id: 'condition-10',
          name: 'implicit:A->B',
          marking: 0,
        },
        'condition-11': {
          id: 'condition-11',
          name: 'implicit:A->C',
          marking: 1,
        },
        'condition-13': {
          id: 'condition-13',
          name: 'implicit:B->D',
          marking: 1,
        },
      },
    });

    yield* $(interpreter2.activateTask('C'));
    yield* $(interpreter2.completeTask('C'));

    const res2_4 = yield* $(interpreter2.getWorkflowState());

    expect(res2_4).toEqual({
      tasks: {
        'task-5': { id: 'task-5', name: 'A', state: 'completed' },
        'task-6': { id: 'task-6', name: 'B', state: 'completed' },
        'task-7': { id: 'task-7', name: 'C', state: 'completed' },
        'task-8': { id: 'task-8', name: 'D', state: 'enabled' },
      },
      conditions: {
        'condition-8': { id: 'condition-8', name: 'start', marking: 0 },
        'condition-10': {
          id: 'condition-10',
          name: 'implicit:A->B',
          marking: 0,
        },
        'condition-11': {
          id: 'condition-11',
          name: 'implicit:A->C',
          marking: 0,
        },
        'condition-13': {
          id: 'condition-13',
          name: 'implicit:B->D',
          marking: 1,
        },
        'condition-12': {
          id: 'condition-12',
          name: 'implicit:B->C',
          marking: 0,
        },
        'condition-14': {
          id: 'condition-14',
          name: 'implicit:C->D',
          marking: 1,
        },
      },
    });
  });

  Effect.runSync(program);
});

it('supports or joins and cancellation regions', () => {
  const workflowDefinition = Builder.workflow('or-join-cancellation-region')
    .startCondition('start')
    .task('A', (t) => t.withSplitType('and'))
    .task('B', (t) => t.withSplitType('and').withJoinType('xor'))
    .task('C')
    .task('D')
    .task('E')
    .task('F', (t) => t.withJoinType('and'))
    .task('G', (t) => t.withJoinType('or'))
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

    const res1 = yield* $(interpreter.getWorkflowState());

    expect(res1).toEqual({
      tasks: { 'task-1': { id: 'task-1', name: 'A', state: 'enabled' } },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 1 },
      },
    });

    yield* $(interpreter.activateTask('A'));
    yield* $(interpreter.completeTask('A'));

    const res2 = yield* $(interpreter.getWorkflowState());

    expect(res2).toEqual({
      tasks: {
        'task-1': { id: 'task-1', name: 'A', state: 'completed' },
        'task-2': { id: 'task-2', name: 'B', state: 'enabled' },
        'task-3': { id: 'task-3', name: 'C', state: 'enabled' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-5': { id: 'condition-5', name: 'implicit:A->B', marking: 1 },
        'condition-6': { id: 'condition-6', name: 'implicit:A->C', marking: 1 },
      },
    });

    yield* $(interpreter.activateTask('C'));
    yield* $(interpreter.completeTask('C'));

    const res3 = yield* $(interpreter.getWorkflowState());

    expect(res3).toEqual({
      tasks: {
        'task-1': { id: 'task-1', name: 'A', state: 'completed' },
        'task-2': { id: 'task-2', name: 'B', state: 'enabled' },
        'task-3': { id: 'task-3', name: 'C', state: 'completed' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-5': { id: 'condition-5', name: 'implicit:A->B', marking: 1 },
        'condition-6': { id: 'condition-6', name: 'implicit:A->C', marking: 0 },
        'condition-7': { id: 'condition-7', name: 'implicit:C->G', marking: 1 },
      },
    });

    yield* $(interpreter.activateTask('B'));
    yield* $(interpreter.completeTask('B'));

    const res4 = yield* $(interpreter.getWorkflowState());

    expect(res4).toEqual({
      tasks: {
        'task-1': { id: 'task-1', name: 'A', state: 'completed' },
        'task-2': { id: 'task-2', name: 'B', state: 'enabled' },
        'task-3': { id: 'task-3', name: 'C', state: 'completed' },
        'task-4': { id: 'task-4', name: 'D', state: 'enabled' },
        'task-5': { id: 'task-5', name: 'E', state: 'enabled' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-5': { id: 'condition-5', name: 'implicit:A->B', marking: 0 },
        'condition-6': { id: 'condition-6', name: 'implicit:A->C', marking: 0 },
        'condition-7': { id: 'condition-7', name: 'implicit:C->G', marking: 1 },
        'condition-3': { id: 'condition-3', name: 'bToB', marking: 1 },
        'condition-4': { id: 'condition-4', name: 'bToDAndE', marking: 1 },
      },
    });

    yield* $(interpreter.activateTask('E'));
    yield* $(interpreter.completeTask('E'));

    const res5 = yield* $(interpreter.getWorkflowState());

    expect(res5).toEqual({
      tasks: {
        'task-1': { id: 'task-1', name: 'A', state: 'completed' },
        'task-2': { id: 'task-2', name: 'B', state: 'enabled' },
        'task-3': { id: 'task-3', name: 'C', state: 'completed' },
        'task-4': { id: 'task-4', name: 'D', state: 'disabled' },
        'task-5': { id: 'task-5', name: 'E', state: 'completed' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-5': { id: 'condition-5', name: 'implicit:A->B', marking: 0 },
        'condition-6': { id: 'condition-6', name: 'implicit:A->C', marking: 0 },
        'condition-7': { id: 'condition-7', name: 'implicit:C->G', marking: 1 },
        'condition-3': { id: 'condition-3', name: 'bToB', marking: 1 },
        'condition-4': { id: 'condition-4', name: 'bToDAndE', marking: 0 },
        'condition-9': { id: 'condition-9', name: 'implicit:E->F', marking: 1 },
      },
    });

    yield* $(interpreter.activateTask('B'));
    yield* $(interpreter.completeTask('B'));

    const res6 = yield* $(interpreter.getWorkflowState());

    expect(res6).toEqual({
      tasks: {
        'task-1': { id: 'task-1', name: 'A', state: 'completed' },
        'task-2': { id: 'task-2', name: 'B', state: 'enabled' },
        'task-3': { id: 'task-3', name: 'C', state: 'completed' },
        'task-4': { id: 'task-4', name: 'D', state: 'enabled' },
        'task-5': { id: 'task-5', name: 'E', state: 'enabled' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-5': { id: 'condition-5', name: 'implicit:A->B', marking: 0 },
        'condition-6': { id: 'condition-6', name: 'implicit:A->C', marking: 0 },
        'condition-7': { id: 'condition-7', name: 'implicit:C->G', marking: 1 },
        'condition-3': { id: 'condition-3', name: 'bToB', marking: 1 },
        'condition-4': { id: 'condition-4', name: 'bToDAndE', marking: 1 },
        'condition-9': { id: 'condition-9', name: 'implicit:E->F', marking: 1 },
      },
    });

    yield* $(interpreter.activateTask('D'));
    yield* $(interpreter.completeTask('D'));

    const res7 = yield* $(interpreter.getWorkflowState());

    expect(res7).toEqual({
      tasks: {
        'task-1': { id: 'task-1', name: 'A', state: 'completed' },
        'task-2': { id: 'task-2', name: 'B', state: 'disabled' },
        'task-3': { id: 'task-3', name: 'C', state: 'completed' },
        'task-4': { id: 'task-4', name: 'D', state: 'completed' },
        'task-5': { id: 'task-5', name: 'E', state: 'disabled' },
        'task-6': { id: 'task-6', name: 'F', state: 'enabled' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-5': { id: 'condition-5', name: 'implicit:A->B', marking: 0 },
        'condition-6': { id: 'condition-6', name: 'implicit:A->C', marking: 0 },
        'condition-7': { id: 'condition-7', name: 'implicit:C->G', marking: 1 },
        'condition-3': { id: 'condition-3', name: 'bToB', marking: 0 },
        'condition-4': { id: 'condition-4', name: 'bToDAndE', marking: 0 },
        'condition-9': { id: 'condition-9', name: 'implicit:E->F', marking: 1 },
        'condition-8': { id: 'condition-8', name: 'implicit:D->F', marking: 1 },
      },
    });

    yield* $(interpreter.activateTask('F'));
    yield* $(interpreter.completeTask('F'));

    const res8 = yield* $(interpreter.getWorkflowState());

    expect(res8).toEqual({
      tasks: {
        'task-1': { id: 'task-1', name: 'A', state: 'completed' },
        'task-2': { id: 'task-2', name: 'B', state: 'disabled' },
        'task-3': { id: 'task-3', name: 'C', state: 'completed' },
        'task-4': { id: 'task-4', name: 'D', state: 'completed' },
        'task-5': { id: 'task-5', name: 'E', state: 'disabled' },
        'task-6': { id: 'task-6', name: 'F', state: 'completed' },
        'task-7': { id: 'task-7', name: 'G', state: 'enabled' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-5': { id: 'condition-5', name: 'implicit:A->B', marking: 0 },
        'condition-6': { id: 'condition-6', name: 'implicit:A->C', marking: 0 },
        'condition-7': { id: 'condition-7', name: 'implicit:C->G', marking: 1 },
        'condition-3': { id: 'condition-3', name: 'bToB', marking: 0 },
        'condition-4': { id: 'condition-4', name: 'bToDAndE', marking: 0 },
        'condition-9': { id: 'condition-9', name: 'implicit:E->F', marking: 0 },
        'condition-8': { id: 'condition-8', name: 'implicit:D->F', marking: 0 },
        'condition-10': {
          id: 'condition-10',
          name: 'implicit:F->G',
          marking: 1,
        },
      },
    });
  });

  Effect.runSync(program);
});

it('supports or joins, loops and cancellation regions', () => {
  // http://www.padsweb.rwth-aachen.de/wvdaalst/publications/p528.pdf
  const workflowDefinition = Builder.workflow('or-join-cancellation-region')
    .startCondition('start')
    .task('A')
    .task('B')
    .task('C')
    .task('D', (t) => t.withSplitType('and'))
    .task('E', (t) => t.withJoinType('or'))
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

    const res1 = yield* $(interpreter.getWorkflowState());

    expect(res1).toEqual({
      tasks: { 'task-1': { id: 'task-1', name: 'A', state: 'enabled' } },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 1 },
      },
    });

    yield* $(interpreter.activateTask('A'));
    yield* $(interpreter.completeTask('A'));

    const res2 = yield* $(interpreter.getWorkflowState());

    expect(res2).toEqual({
      tasks: {
        'task-1': { id: 'task-1', name: 'A', state: 'completed' },
        'task-2': { id: 'task-2', name: 'B', state: 'enabled' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-2': { id: 'condition-2', name: 'c1', marking: 1 },
      },
    });

    yield* $(interpreter.activateTask('B'));
    yield* $(interpreter.completeTask('B'));

    const res3 = yield* $(interpreter.getWorkflowState());

    expect(res3).toEqual({
      tasks: {
        'task-1': { id: 'task-1', name: 'A', state: 'completed' },
        'task-2': { id: 'task-2', name: 'B', state: 'completed' },
        'task-3': { id: 'task-3', name: 'C', state: 'enabled' },
        'task-5': { id: 'task-5', name: 'E', state: 'enabled' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-2': { id: 'condition-2', name: 'c1', marking: 0 },
        'condition-3': { id: 'condition-3', name: 'c2', marking: 1 },
      },
    });

    yield* $(interpreter.activateTask('C'));
    yield* $(interpreter.completeTask('C'));

    const res4 = yield* $(interpreter.getWorkflowState());

    expect(res4).toEqual({
      tasks: {
        'task-1': { id: 'task-1', name: 'A', state: 'completed' },
        'task-2': { id: 'task-2', name: 'B', state: 'completed' },
        'task-3': { id: 'task-3', name: 'C', state: 'completed' },
        'task-5': { id: 'task-5', name: 'E', state: 'disabled' },
        'task-4': { id: 'task-4', name: 'D', state: 'enabled' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-2': { id: 'condition-2', name: 'c1', marking: 0 },
        'condition-3': { id: 'condition-3', name: 'c2', marking: 0 },
        'condition-4': { id: 'condition-4', name: 'c3', marking: 1 },
      },
    });

    yield* $(interpreter.activateTask('D'));
    yield* $(interpreter.completeTask('D'));

    const res5 = yield* $(interpreter.getWorkflowState());

    expect(res5).toEqual({
      tasks: {
        'task-1': { id: 'task-1', name: 'A', state: 'completed' },
        'task-2': { id: 'task-2', name: 'B', state: 'enabled' },
        'task-3': { id: 'task-3', name: 'C', state: 'enabled' },
        'task-5': { id: 'task-5', name: 'E', state: 'enabled' },
        'task-4': { id: 'task-4', name: 'D', state: 'completed' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-2': { id: 'condition-2', name: 'c1', marking: 1 },
        'condition-3': { id: 'condition-3', name: 'c2', marking: 1 },
        'condition-4': { id: 'condition-4', name: 'c3', marking: 0 },
      },
    });

    yield* $(interpreter.activateTask('E'));
    yield* $(interpreter.completeTask('E'));

    const res6 = yield* $(interpreter.getWorkflowState());

    expect(res6).toEqual({
      tasks: {
        'task-1': { id: 'task-1', name: 'A', state: 'completed' },
        'task-2': { id: 'task-2', name: 'B', state: 'enabled' },
        'task-3': { id: 'task-3', name: 'C', state: 'disabled' },
        'task-5': { id: 'task-5', name: 'E', state: 'completed' },
        'task-4': { id: 'task-4', name: 'D', state: 'completed' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-2': { id: 'condition-2', name: 'c1', marking: 1 },
        'condition-3': { id: 'condition-3', name: 'c2', marking: 0 },
        'condition-4': { id: 'condition-4', name: 'c3', marking: 0 },
        'condition-5': { id: 'condition-5', name: 'end', marking: 1 },
      },
    });
  });

  Effect.runSync(program);
});
