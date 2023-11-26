import { Effect } from 'effect';
import { Get, Simplify } from 'type-fest';
import { expect, it } from 'vitest';

import * as Service from '../Service.js';
import * as Builder from '../builder.js';
import { compositeTask } from '../builder.js';
import { WorkflowBuilderTaskActivitiesOutputs } from '../builder/WorkflowBuilder.js';
import { IdGenerator, TaskName, WorkItemId, WorkflowId } from '../types.js';

function makeIdGenerator(): IdGenerator {
  const ids = {
    workItem: 0,
    workflow: 0,
  };
  return {
    workflow() {
      ids.workflow++;
      return Effect.succeed(WorkflowId(`workflow-${ids.workflow}`));
    },
    workItem() {
      ids.workItem++;
      return Effect.succeed(WorkItemId(`workItem-${ids.workItem}`));
    },
  };
}

/*const w1 = Builder.workflow<{ foo: string }>('w1')
  .startCondition('start')
  .task('t1', (t) =>
    t().onCancel(() =>
      Effect.gen(function* ($) {
        yield* $(Effect.fail(new Error('t1 canceled')));
      })
    )
  )
  .endCondition('end')
  .connectCondition('start', (to) => to.task('t1'))
  .connectTask('t1', (to) => to.condition('end'));

const c = Builder.compositeTask<{ bar: string }>().withSubWorkflow(w1);*/

it('can run net with composite tasks', () => {
  const subWorkflow = Builder.workflow<{ bar: string }>('subWorkflow')
    .startCondition('subStart')
    .task('subT1', (t) => t().onFire(() => Effect.succeed(1)))
    .endCondition('subEnd')
    .connectCondition('subStart', (to) => to.task('subT1'))
    .connectTask('subT1', (to) => to.condition('subEnd'));

  const workflowDefinition = Builder.workflow('parent')
    .startCondition('start')
    .compositeTask(
      't1',
      compositeTask()
        .withSubWorkflow(subWorkflow)
        .onFire(({ fireTask }) =>
          Effect.gen(function* ($) {
            const { initializeWorkflow } = yield* $(fireTask());
            return yield* $(initializeWorkflow({ bar: 'foo' }));
          })
        )
    )
    .endCondition('end')
    .connectCondition('start', (to) => to.task('t1'))
    .connectTask('t1', (to) => to.condition('end'));

  type A = typeof workflowDefinition;
  type B = WorkflowBuilderTaskActivitiesOutputs<A>;

  type C = Get<B, ['t1', 'someId', 'subT1']>;

  const program = Effect.gen(function* ($) {
    const idGenerator = makeIdGenerator();

    const workflow = yield* $(workflowDefinition.build());

    const service = yield* $(
      Service.initialize(workflow, {}),
      Effect.provideService(IdGenerator, idGenerator)
    );

    yield* $(service.start());

    const subWorkflow = yield* $(service.fireTask('t1'));

    console.log(subWorkflow);

    console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>');

    const subWorkflow2 = yield* $(service.initializeWorkflow(['t1']));

    yield* $(service.startWorkflow(['t1', subWorkflow.id]));
    const a = yield* $(service.fireTask(`t1.${subWorkflow.id}.subT1`));

    yield* $(service.startWorkflow(['t1', subWorkflow2.id]));
    const b = yield* $(service.fireTask(['t1', subWorkflow2.id, 'subT1']));

    console.log(JSON.stringify(yield* $(service.inspectState()), null, 2));
    expect(1).toBe(1);
  });

  Effect.runSync(program);
});

it('can run simple net with and-split and and-join', () => {
  expect(1).toBe(1);
  return;
  const workflowDefinition = Builder.workflow('checkout')
    .startCondition('start')
    .task('scan_goods', (t) =>
      t()
        .withWorkItem((w) => w<{ foo: string }>())
        .onFire(({ fireTask }) =>
          Effect.gen(function* ($) {
            const { createWorkItem } = yield* $(fireTask());
            yield* $(createWorkItem({ foo: 'bar' }));
          })
        )
    )
    .task('pay', (t) => t().withSplitType('and'))
    .task('pack_goods')
    .task('issue_receipt')
    .task('check_goods', (t) => t().withJoinType('and'))
    .endCondition('end')
    .connectCondition('start', (to) => to.task('scan_goods'))
    .connectTask('scan_goods', (to) => to.task('pay'))
    .connectTask('pay', (to) => to.task('pack_goods').task('issue_receipt'))
    .connectTask('pack_goods', (to) => to.task('check_goods'))
    .connectTask('issue_receipt', (to) => to.task('check_goods'))
    .connectTask('check_goods', (to) => to.condition('end'));

  const program = Effect.gen(function* ($) {
    const idGenerator = makeIdGenerator();

    const workflow = yield* $(workflowDefinition.build());

    const service = yield* $(
      Service.initialize(workflow, {}),
      Effect.provideService(IdGenerator, idGenerator)
    );

    yield* $(service.startWorkflow());

    expect(yield* $(service.getFullState())).toEqual({
      workflow: {
        id: 'workflow-1',
        name: 'checkout',
        state: 'running',
        parent: null,
      },
      tasks: [
        {
          name: 'scan_goods',
          workflowId: 'workflow-1',
          generation: 0,
          state: 'enabled',
        },
        {
          name: 'pay',
          workflowId: 'workflow-1',
          generation: 0,
          state: 'disabled',
        },
        {
          name: 'pack_goods',
          workflowId: 'workflow-1',
          generation: 0,
          state: 'disabled',
        },
        {
          name: 'issue_receipt',
          workflowId: 'workflow-1',
          generation: 0,
          state: 'disabled',
        },
        {
          name: 'check_goods',
          workflowId: 'workflow-1',
          generation: 0,
          state: 'disabled',
        },
      ],
      conditions: [
        { name: 'start', workflowId: 'workflow-1', marking: 1 },
        { name: 'end', workflowId: 'workflow-1', marking: 0 },
        {
          name: 'implicit:scan_goods->pay',
          workflowId: 'workflow-1',
          marking: 0,
        },
        {
          name: 'implicit:pay->pack_goods',
          workflowId: 'workflow-1',
          marking: 0,
        },
        {
          name: 'implicit:pay->issue_receipt',
          workflowId: 'workflow-1',
          marking: 0,
        },
        {
          name: 'implicit:pack_goods->check_goods',
          workflowId: 'workflow-1',
          marking: 0,
        },
        {
          name: 'implicit:issue_receipt->check_goods',
          workflowId: 'workflow-1',
          marking: 0,
        },
      ],
    });

    yield* $(service.fireTask('scan_goods'));

    expect(yield* $(service.getFullState())).toEqual({
      workflow: {
        id: 'workflow-1',
        name: 'checkout',
        state: 'running',
        parent: null,
      },
      tasks: [
        {
          name: 'scan_goods',
          workflowId: 'workflow-1',
          generation: 1,
          state: 'fired',
        },
        {
          name: 'pay',
          workflowId: 'workflow-1',
          generation: 0,
          state: 'disabled',
        },
        {
          name: 'pack_goods',
          workflowId: 'workflow-1',
          generation: 0,
          state: 'disabled',
        },
        {
          name: 'issue_receipt',
          workflowId: 'workflow-1',
          generation: 0,
          state: 'disabled',
        },
        {
          name: 'check_goods',
          workflowId: 'workflow-1',
          generation: 0,
          state: 'disabled',
        },
      ],
      conditions: [
        { name: 'start', workflowId: 'workflow-1', marking: 0 },
        { name: 'end', workflowId: 'workflow-1', marking: 0 },
        {
          name: 'implicit:scan_goods->pay',
          workflowId: 'workflow-1',
          marking: 0,
        },
        {
          name: 'implicit:pay->pack_goods',
          workflowId: 'workflow-1',
          marking: 0,
        },
        {
          name: 'implicit:pay->issue_receipt',
          workflowId: 'workflow-1',
          marking: 0,
        },
        {
          name: 'implicit:pack_goods->check_goods',
          workflowId: 'workflow-1',
          marking: 0,
        },
        {
          name: 'implicit:issue_receipt->check_goods',
          workflowId: 'workflow-1',
          marking: 0,
        },
      ],
    });

    const workItems = yield* $(service.getWorkItems(TaskName('scan_goods')));

    console.log(workItems);

    for (const workItem of workItems) {
      yield* $(service.completeWorkItem(TaskName('scan_goods'), workItem.id));
    }

    console.log(yield* $(service.getFullState()));

    expect(yield* $(service.getFullState())).toEqual({
      workflow: {
        id: 'workflow-1',
        name: 'checkout',
        state: 'running',
        parent: null,
      },
      tasks: [
        {
          name: 'scan_goods',
          workflowId: 'workflow-1',
          generation: 1,
          state: 'exited',
        },
        {
          name: 'pay',
          workflowId: 'workflow-1',
          generation: 0,
          state: 'enabled',
        },
        {
          name: 'pack_goods',
          workflowId: 'workflow-1',
          generation: 0,
          state: 'disabled',
        },
        {
          name: 'issue_receipt',
          workflowId: 'workflow-1',
          generation: 0,
          state: 'disabled',
        },
        {
          name: 'check_goods',
          workflowId: 'workflow-1',
          generation: 0,
          state: 'disabled',
        },
      ],
      conditions: [
        { name: 'start', workflowId: 'workflow-1', marking: 0 },
        { name: 'end', workflowId: 'workflow-1', marking: 0 },
        {
          name: 'implicit:scan_goods->pay',
          workflowId: 'workflow-1',
          marking: 1,
        },
        {
          name: 'implicit:pay->pack_goods',
          workflowId: 'workflow-1',
          marking: 0,
        },
        {
          name: 'implicit:pay->issue_receipt',
          workflowId: 'workflow-1',
          marking: 0,
        },
        {
          name: 'implicit:pack_goods->check_goods',
          workflowId: 'workflow-1',
          marking: 0,
        },
        {
          name: 'implicit:issue_receipt->check_goods',
          workflowId: 'workflow-1',
          marking: 0,
        },
      ],
    });

    //  console.log(JSON.stringify(yield* $(service.inspectState()), null, 2));

    /*expect(res1).toEqual({
      id: 'workflow-1',
      name: 'checkout',
      state: 'running',
      tasks: {
        'task-1': { id: 'task-1', name: 'scan_goods', state: 'enabled' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 1 },
      },
    });

    yield* $(service.fireTask('scan_goods'));

    const res2 = yield* $(service.getWorkflowState());

    expect(res2).toEqual({
      id: 'workflow-1',
      name: 'checkout',
      state: 'running',
      tasks: {
        'task-1': { id: 'task-1', name: 'scan_goods', state: 'active' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
      },
    });

    yield* $(service.exitTask('scan_goods'));

    const res3 = yield* $(service.getWorkflowState());

    expect(res3).toEqual({
      id: 'workflow-1',
      name: 'checkout',
      state: 'running',
      tasks: {
        'task-1': { id: 'task-1', name: 'scan_goods', state: 'exited' },
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

    yield* $(service.fireTask('pay'));

    const res4 = yield* $(service.getWorkflowState());

    expect(res4).toEqual({
      id: 'workflow-1',
      name: 'checkout',
      state: 'running',
      tasks: {
        'task-1': { id: 'task-1', name: 'scan_goods', state: 'exited' },
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

    yield* $(service.exitTask('pay'));

    const res5 = yield* $(service.getWorkflowState());

    expect(res5).toEqual({
      id: 'workflow-1',
      name: 'checkout',
      state: 'running',
      tasks: {
        'task-1': { id: 'task-1', name: 'scan_goods', state: 'exited' },
        'task-2': { id: 'task-2', name: 'pay', state: 'exited' },
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

    yield* $(service.fireTask('pack_goods'));

    const res6 = yield* $(service.getWorkflowState());

    expect(res6).toEqual({
      id: 'workflow-1',
      name: 'checkout',
      state: 'running',
      tasks: {
        'task-1': { id: 'task-1', name: 'scan_goods', state: 'exited' },
        'task-2': { id: 'task-2', name: 'pay', state: 'exited' },
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

    const res7 = yield* $(service.getWorkflowState());

    expect(res7).toEqual({
      id: 'workflow-1',
      name: 'checkout',
      state: 'running',
      tasks: {
        'task-1': { id: 'task-1', name: 'scan_goods', state: 'exited' },
        'task-2': { id: 'task-2', name: 'pay', state: 'exited' },
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

    yield* $(service.fireTask('issue_receipt'));

    const res8 = yield* $(service.getWorkflowState());

    expect(res8).toEqual({
      id: 'workflow-1',
      name: 'checkout',
      state: 'running',
      tasks: {
        'task-1': { id: 'task-1', name: 'scan_goods', state: 'exited' },
        'task-2': { id: 'task-2', name: 'pay', state: 'exited' },
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

    yield* $(service.exitTask('pack_goods'));

    const res9 = yield* $(service.getWorkflowState());

    expect(res9).toEqual({
      id: 'workflow-1',
      name: 'checkout',
      state: 'running',
      tasks: {
        'task-1': { id: 'task-1', name: 'scan_goods', state: 'exited' },
        'task-2': { id: 'task-2', name: 'pay', state: 'exited' },
        'task-3': { id: 'task-3', name: 'pack_goods', state: 'exited' },
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

    yield* $(service.exitTask('issue_receipt'));

    const res10 = yield* $(service.getWorkflowState());

    expect(res10).toEqual({
      id: 'workflow-1',
      name: 'checkout',
      state: 'running',
      tasks: {
        'task-1': { id: 'task-1', name: 'scan_goods', state: 'exited' },
        'task-2': { id: 'task-2', name: 'pay', state: 'exited' },
        'task-3': { id: 'task-3', name: 'pack_goods', state: 'exited' },
        'task-4': { id: 'task-4', name: 'issue_receipt', state: 'exited' },
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

    yield* $(service.fireTask('check_goods'));

    const res11 = yield* $(service.getWorkflowState());

    expect(res11).toEqual({
      id: 'workflow-1',
      name: 'checkout',
      state: 'running',
      tasks: {
        'task-1': { id: 'task-1', name: 'scan_goods', state: 'exited' },
        'task-2': { id: 'task-2', name: 'pay', state: 'exited' },
        'task-3': { id: 'task-3', name: 'pack_goods', state: 'exited' },
        'task-4': { id: 'task-4', name: 'issue_receipt', state: 'exited' },
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

    yield* $(service.exitTask('check_goods'));

    const res12 = yield* $(service.getWorkflowState());

    expect(res12).toEqual({
      id: 'workflow-1',
      name: 'checkout',
      state: 'done',
      tasks: {
        'task-1': { id: 'task-1', name: 'scan_goods', state: 'exited' },
        'task-2': { id: 'task-2', name: 'pay', state: 'exited' },
        'task-3': { id: 'task-3', name: 'pack_goods', state: 'exited' },
        'task-4': { id: 'task-4', name: 'issue_receipt', state: 'exited' },
        'task-5': { id: 'task-5', name: 'check_goods', state: 'exited' },
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
    });*/
  });

  Effect.runSync(program);
});

/*it('can run resume a workflow', () => {
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

    const service1 = yield* $(
      Interpreter.make(workflow1, {}),
      Effect.provideService(StateManager, stateManager)
    );

    yield* $(service1.start());
    yield* $(service1.fireTask('scan_goods'));

    const workflow2 = yield* $(
      workflowDefinition.build(workflow1.id),
      Effect.provideService(StateManager, stateManager),
      Effect.provideService(IdGenerator, idGenerator)
    );

    const service2 = yield* $(
      Interpreter.make(workflow2, {}),
      Effect.provideService(StateManager, stateManager)
    );

    yield* $(service2.exitTask('scan_goods'));

    const res3 = yield* $(service2.getWorkflowState());

    // In this case some IDs are different than in the previous test
    // because idGenerator was not reset. If the task or condition wasn't
    // persisted, it will get a new ID on resume. What is important is that
    // the conditions and tasks that were persisted have their state and ID
    // restored.
    expect(res3).toEqual({
      id: 'workflow-1',
      name: 'checkout',
      state: 'running',
      tasks: {
        'task-1': { id: 'task-1', name: 'scan_goods', state: 'exited' },
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
    activityPhase: 'before' | 'after';
    taskPhase: 'disable' | 'enable' | 'fire' | 'exit' | 'cancel';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    input?: any;
  }[] = [];

  const onEnableActivity = (payload: TaskOnEnablePayload) =>
    Effect.gen(function* ($) {
      const name = yield* $(payload.getTaskName());
      log.push({
        name,
        activityPhase: 'before',
        taskPhase: 'enable',
      });
      yield* $(payload.enableTask());
      log.push({
        name,
        activityPhase: 'after',
        taskPhase: 'enable',
      });
      return 'onEnable';
    });

  const onFireActivity = (payload: TaskOnFirePayload) =>
    Effect.gen(function* ($) {
      const name = yield* $(payload.getTaskName());
      log.push({
        name,
        activityPhase: 'before',
        taskPhase: 'fire',
      });
      yield* $(payload.fireTask());
      log.push({
        name,
        activityPhase: 'after',
        taskPhase: 'fire',
      });
      return `onFire: ${payload.input}`;
    });

  const onExitActivity = (payload: TaskOnExitPayload) =>
    Effect.gen(function* ($) {
      const name = yield* $(payload.getTaskName());
      log.push({
        name,
        activityPhase: 'before',
        taskPhase: 'exit',
      });
      yield* $(payload.exitTask());
      log.push({
        name,
        activityPhase: 'after',
        taskPhase: 'exit',
      });
      return `onExit: ${payload.input}`;
    });

  const workflowDefinition = Builder.workflow('checkout')
    .startCondition('start')
    .task('scan_goods', (t) =>
      t
        .onEnable(onEnableActivity)
        .onFire(onFireActivity)
        .onExit(onExitActivity)
    )
    .task('pay', (t) =>
      t
        .onEnable(onEnableActivity)
        .onFire(onFireActivity)
        .onExit(onExitActivity)
        .withSplitType('and')
    )
    .task('pack_goods', (t) =>
      t
        .onEnable(onEnableActivity)
        .onFire(onFireActivity)
        .onExit(onExitActivity)
    )
    .task('issue_receipt', (t) =>
      t
        .onEnable(onEnableActivity)
        .onFire(onFireActivity)
        .onExit(onExitActivity)
    )
    .task('check_goods', (t) =>
      t
        .onEnable(onEnableActivity)
        .onFire(onFireActivity)
        .onExit(onExitActivity)
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

    const service = yield* $(
      Interpreter.make(workflow, {}),
      Effect.provideService(StateManager, stateManager)
    );

    yield* $(service.start());

    const res1 = yield* $(
      service.fireTask('scan_goods', 'fire scan_goods user input')
    );
    expect(res1).toEqual('onFire: fire scan_goods user input');

    const res2 = yield* $(
      service.exitTask('scan_goods', 'exit scan_goods user input')
    );
    expect(res2).toEqual('onExit: exit scan_goods user input');

    yield* $(service.fireTask('pay'));
    yield* $(service.exitTask('pay'));
    yield* $(service.fireTask('pack_goods'));
    yield* $(service.fireTask('issue_receipt'));
    yield* $(service.exitTask('pack_goods'));
    yield* $(service.exitTask('issue_receipt'));
    yield* $(service.fireTask('check_goods'));
    yield* $(service.exitTask('check_goods'));

    expect(log).toEqual([
      { name: 'scan_goods', activityPhase: 'before', taskPhase: 'enable' },
      { name: 'scan_goods', activityPhase: 'after', taskPhase: 'enable' },
      {
        name: 'scan_goods',
        activityPhase: 'before',
        taskPhase: 'fire',
      },
      { name: 'scan_goods', activityPhase: 'after', taskPhase: 'fire' },
      {
        name: 'scan_goods',
        activityPhase: 'before',
        taskPhase: 'exit',
      },
      { name: 'pay', activityPhase: 'before', taskPhase: 'enable' },
      { name: 'pay', activityPhase: 'after', taskPhase: 'enable' },
      { name: 'scan_goods', activityPhase: 'after', taskPhase: 'exit' },
      { name: 'pay', activityPhase: 'before', taskPhase: 'fire' },
      { name: 'pay', activityPhase: 'after', taskPhase: 'fire' },
      { name: 'pay', activityPhase: 'before', taskPhase: 'exit' },
      { name: 'pack_goods', activityPhase: 'before', taskPhase: 'enable' },
      { name: 'pack_goods', activityPhase: 'after', taskPhase: 'enable' },
      {
        name: 'issue_receipt',
        activityPhase: 'before',
        taskPhase: 'enable',
      },
      {
        name: 'issue_receipt',
        activityPhase: 'after',
        taskPhase: 'enable',
      },
      { name: 'pay', activityPhase: 'after', taskPhase: 'exit' },
      {
        name: 'pack_goods',
        activityPhase: 'before',
        taskPhase: 'fire',
      },
      { name: 'pack_goods', activityPhase: 'after', taskPhase: 'fire' },
      {
        name: 'issue_receipt',
        activityPhase: 'before',
        taskPhase: 'fire',
      },
      {
        name: 'issue_receipt',
        activityPhase: 'after',
        taskPhase: 'fire',
      },
      {
        name: 'pack_goods',
        activityPhase: 'before',
        taskPhase: 'exit',
      },
      { name: 'pack_goods', activityPhase: 'after', taskPhase: 'exit' },
      {
        name: 'issue_receipt',
        activityPhase: 'before',
        taskPhase: 'exit',
      },
      { name: 'check_goods', activityPhase: 'before', taskPhase: 'enable' },
      { name: 'check_goods', activityPhase: 'after', taskPhase: 'enable' },
      {
        name: 'issue_receipt',
        activityPhase: 'after',
        taskPhase: 'exit',
      },
      {
        name: 'check_goods',
        activityPhase: 'before',
        taskPhase: 'fire',
      },
      {
        name: 'check_goods',
        activityPhase: 'after',
        taskPhase: 'fire',
      },
      {
        name: 'check_goods',
        activityPhase: 'before',
        taskPhase: 'exit',
      },
      {
        name: 'check_goods',
        activityPhase: 'after',
        taskPhase: 'exit',
      },
    ]);

    const workflowRes = yield* $(service.getWorkflowState());

    expect(workflowRes).toEqual({
      id: 'workflow-1',
      name: 'checkout',
      state: 'done',
      tasks: {
        'task-1': { id: 'task-1', name: 'scan_goods', state: 'exited' },
        'task-2': { id: 'task-2', name: 'pay', state: 'exited' },
        'task-3': { id: 'task-3', name: 'pack_goods', state: 'exited' },
        'task-4': { id: 'task-4', name: 'issue_receipt', state: 'exited' },
        'task-5': { id: 'task-5', name: 'check_goods', state: 'exited' },
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

it('can auto fire and auto exit tasks', () => {
  const workflowDefinition = Builder.workflow('name')
    .startCondition('start')
    .task('A', (t) =>
      t
        .onEnable(({ enableTask }) =>
          pipe(
            enableTask(),
            Effect.flatMap(({ fireTask }) => fireTask())
          )
        )
        .onFire(({ fireTask }) =>
          pipe(
            fireTask(),
            Effect.flatMap(({ exitTask }) => exitTask())
          )
        )
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

    const service = yield* $(
      Interpreter.make(workflow, {}),
      Effect.provideService(StateManager, stateManager)
    );

    yield* $(service.start());

    const res1 = yield* $(service.getWorkflowState());

    expect(res1).toEqual({
      id: 'workflow-1',
      name: 'name',
      state: 'done',
      tasks: { 'task-1': { id: 'task-1', name: 'A', state: 'exited' } },
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

    const service = yield* $(
      Interpreter.make(workflow, {}),
      Effect.provideService(StateManager, stateManager)
    );

    yield* $(service.start());

    const res1 = yield* $(service.getWorkflowState());

    expect(res1).toEqual({
      id: 'workflow-1',
      name: 'deferred-choice',
      state: 'running',
      tasks: {
        'task-1': { id: 'task-1', name: 'task_1', state: 'enabled' },
        'task-3': { id: 'task-3', name: 'task_2', state: 'enabled' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 1 },
      },
    });

    yield* $(service.fireTask('task_1'));
    yield* $(service.exitTask('task_1'));

    const res2 = yield* $(service.getWorkflowState());

    expect(res2).toEqual({
      id: 'workflow-1',
      name: 'deferred-choice',
      state: 'running',
      tasks: {
        'task-1': { id: 'task-1', name: 'task_1', state: 'exited' },
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

    yield* $(service.fireTask('task_1a'));
    yield* $(service.exitTask('task_1a'));

    const res3 = yield* $(service.getWorkflowState());

    expect(res3).toEqual({
      id: 'workflow-1',
      name: 'deferred-choice',
      state: 'done',
      tasks: {
        'task-1': { id: 'task-1', name: 'task_1', state: 'exited' },
        'task-3': { id: 'task-3', name: 'task_2', state: 'disabled' },
        'task-2': { id: 'task-2', name: 'task_1a', state: 'exited' },
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

    const service = yield* $(
      Interpreter.make(workflow, {}),
      Effect.provideService(StateManager, stateManager)
    );

    yield* $(service.start());

    const res1 = yield* $(service.getWorkflowState());

    expect(res1).toEqual({
      id: 'workflow-1',
      name: 'xor-join',
      state: 'running',
      tasks: {
        'task-1': { id: 'task-1', name: 'initial_task', state: 'enabled' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 1 },
      },
    });

    yield* $(service.fireTask('initial_task'));
    yield* $(service.exitTask('initial_task'));

    const res2 = yield* $(service.getWorkflowState());

    expect(res2).toEqual({
      id: 'workflow-1',
      name: 'xor-join',
      state: 'running',
      tasks: {
        'task-1': { id: 'task-1', name: 'initial_task', state: 'exited' },
        'task-2': { id: 'task-2', name: 'task_a', state: 'enabled' },
        'task-3': { id: 'task-3', name: 'task_b', state: 'enabled' },
        'task-4': { id: 'task-4', name: 'task_c', state: 'enabled' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-2': { id: 'condition-2', name: 'choice', marking: 1 },
      },
    });

    yield* $(service.fireTask('task_b'));
    yield* $(service.exitTask('task_b'));

    const res3 = yield* $(service.getWorkflowState());

    expect(res3).toEqual({
      id: 'workflow-1',
      name: 'xor-join',
      state: 'running',
      tasks: {
        'task-1': { id: 'task-1', name: 'initial_task', state: 'exited' },
        'task-2': { id: 'task-2', name: 'task_a', state: 'disabled' },
        'task-3': { id: 'task-3', name: 'task_b', state: 'exited' },
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
  const workflowDefinition = Builder.workflow('interleaved-parallel')
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

    const service = yield* $(
      Interpreter.make(workflow, {}),
      Effect.provideService(StateManager, stateManager)
    );

    yield* $(service.start());

    const res1 = yield* $(service.getWorkflowState());

    expect(res1).toEqual({
      id: 'workflow-1',
      name: 'interleaved-parallel',
      state: 'running',
      tasks: {
        'task-1': { id: 'task-1', name: 'initial_task', state: 'enabled' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 1 },
      },
    });

    yield* $(service.fireTask('initial_task'));
    yield* $(service.exitTask('initial_task'));

    const res2 = yield* $(service.getWorkflowState());

    expect(res2).toEqual({
      id: 'workflow-1',
      name: 'interleaved-parallel',
      state: 'running',
      tasks: {
        'task-1': { id: 'task-1', name: 'initial_task', state: 'exited' },
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

    yield* $(service.fireTask('task_a'));

    const res3 = yield* $(service.getWorkflowState());

    expect(res3).toEqual({
      id: 'workflow-1',
      name: 'interleaved-parallel',
      state: 'running',
      tasks: {
        'task-1': { id: 'task-1', name: 'initial_task', state: 'exited' },
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

    yield* $(service.exitTask('task_a'));

    const res4 = yield* $(service.getWorkflowState());

    expect(res4).toEqual({
      id: 'workflow-1',
      name: 'interleaved-parallel',
      state: 'running',
      tasks: {
        'task-1': { id: 'task-1', name: 'initial_task', state: 'exited' },
        'task-2': { id: 'task-2', name: 'task_a', state: 'exited' },
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

    yield* $(service.fireTask('task_b'));

    const res5 = yield* $(service.getWorkflowState());

    expect(res5).toEqual({
      id: 'workflow-1',
      name: 'interleaved-parallel',
      state: 'running',
      tasks: {
        'task-1': { id: 'task-1', name: 'initial_task', state: 'exited' },
        'task-2': { id: 'task-2', name: 'task_a', state: 'exited' },
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

    yield* $(service.exitTask('task_b'));

    const res6 = yield* $(service.getWorkflowState());

    expect(res6).toEqual({
      id: 'workflow-1',
      name: 'interleaved-parallel',
      state: 'running',
      tasks: {
        'task-1': { id: 'task-1', name: 'initial_task', state: 'exited' },
        'task-2': { id: 'task-2', name: 'task_a', state: 'exited' },
        'task-4': { id: 'task-4', name: 'task_c', state: 'enabled' },
        'task-3': { id: 'task-3', name: 'task_b', state: 'exited' },
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

    yield* $(service.fireTask('task_c'));

    const res7 = yield* $(service.getWorkflowState());

    expect(res7).toEqual({
      id: 'workflow-1',
      name: 'interleaved-parallel',
      state: 'running',
      tasks: {
        'task-1': { id: 'task-1', name: 'initial_task', state: 'exited' },
        'task-2': { id: 'task-2', name: 'task_a', state: 'exited' },
        'task-4': { id: 'task-4', name: 'task_c', state: 'active' },
        'task-3': { id: 'task-3', name: 'task_b', state: 'exited' },
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

    yield* $(service.exitTask('task_c'));

    const res8 = yield* $(service.getWorkflowState());

    expect(res8).toEqual({
      id: 'workflow-1',
      name: 'interleaved-parallel',
      state: 'running',
      tasks: {
        'task-1': { id: 'task-1', name: 'initial_task', state: 'exited' },
        'task-2': { id: 'task-2', name: 'task_a', state: 'exited' },
        'task-4': { id: 'task-4', name: 'task_c', state: 'exited' },
        'task-3': { id: 'task-3', name: 'task_b', state: 'exited' },
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

    yield* $(service.fireTask('task_d'));

    const res9 = yield* $(service.getWorkflowState());

    expect(res9).toEqual({
      id: 'workflow-1',
      name: 'interleaved-parallel',
      state: 'running',
      tasks: {
        'task-1': { id: 'task-1', name: 'initial_task', state: 'exited' },
        'task-2': { id: 'task-2', name: 'task_a', state: 'exited' },
        'task-4': { id: 'task-4', name: 'task_c', state: 'exited' },
        'task-3': { id: 'task-3', name: 'task_b', state: 'exited' },
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

    yield* $(service.exitTask('task_d'));

    const res10 = yield* $(service.getWorkflowState());

    expect(res10).toEqual({
      id: 'workflow-1',
      name: 'interleaved-parallel',
      state: 'running',
      tasks: {
        'task-1': { id: 'task-1', name: 'initial_task', state: 'exited' },
        'task-2': { id: 'task-2', name: 'task_a', state: 'exited' },
        'task-4': { id: 'task-4', name: 'task_c', state: 'exited' },
        'task-3': { id: 'task-3', name: 'task_b', state: 'exited' },
        'task-5': { id: 'task-5', name: 'task_d', state: 'exited' },
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

    yield* $(service.fireTask('finish_task'));
    yield* $(service.exitTask('finish_task'));

    const res11 = yield* $(service.getWorkflowState());

    expect(res11).toEqual({
      id: 'workflow-1',
      name: 'interleaved-parallel',
      state: 'done',
      tasks: {
        'task-1': { id: 'task-1', name: 'initial_task', state: 'exited' },
        'task-2': { id: 'task-2', name: 'task_a', state: 'exited' },
        'task-4': { id: 'task-4', name: 'task_c', state: 'exited' },
        'task-3': { id: 'task-3', name: 'task_b', state: 'exited' },
        'task-5': { id: 'task-5', name: 'task_d', state: 'exited' },
        'task-6': { id: 'task-6', name: 'finish_task', state: 'exited' },
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

    const workflow1 = yield* $(
      workflowDefinition.build(),
      Effect.provideService(StateManager, stateManager),
      Effect.provideService(IdGenerator, idGenerator)
    );

    const service1 = yield* $(
      Interpreter.make(workflow1, { foo: 'B' }),
      Effect.provideService(StateManager, stateManager)
    );

    yield* $(service1.start());
    yield* $(service1.fireTask('A'));
    yield* $(service1.exitTask('A'));

    const res1_1 = yield* $(service1.getWorkflowState());

    expect(res1_1).toEqual({
      id: 'workflow-1',
      name: 'xor-join',
      state: 'running',
      tasks: {
        'task-1': { id: 'task-1', name: 'A', state: 'exited' },
        'task-2': { id: 'task-2', name: 'B', state: 'enabled' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-3': { id: 'condition-3', name: 'implicit:A->B', marking: 1 },
      },
    });

    const workflow2 = yield* $(
      workflowDefinition.build(),
      Effect.provideService(StateManager, stateManager),
      Effect.provideService(IdGenerator, idGenerator)
    );

    const service2 = yield* $(
      Interpreter.make(workflow2, { foo: 'C' }),
      Effect.provideService(StateManager, stateManager)
    );

    yield* $(service2.start());
    yield* $(service2.fireTask('A'));
    yield* $(service2.exitTask('A'));

    const res2_1 = yield* $(service2.getWorkflowState());

    expect(res2_1).toEqual({
      id: 'workflow-2',
      name: 'xor-join',
      state: 'running',
      tasks: {
        'task-5': { id: 'task-5', name: 'A', state: 'exited' },
        'task-7': { id: 'task-7', name: 'C', state: 'enabled' },
      },
      conditions: {
        'condition-6': { id: 'condition-6', name: 'start', marking: 0 },
        'condition-9': { id: 'condition-9', name: 'implicit:A->C', marking: 1 },
      },
    });

    const workflow3 = yield* $(
      workflowDefinition.build(),
      Effect.provideService(StateManager, stateManager),
      Effect.provideService(IdGenerator, idGenerator)
    );

    const service3 = yield* $(
      Interpreter.make(workflow3, { foo: 'not a match' }),
      Effect.provideService(StateManager, stateManager)
    );

    yield* $(service3.start());
    yield* $(service3.fireTask('A'));
    yield* $(service3.exitTask('A'));

    const res3_1 = yield* $(service3.getWorkflowState());

    expect(res3_1).toEqual({
      id: 'workflow-3',
      name: 'xor-join',
      state: 'running',
      tasks: {
        'task-9': { id: 'task-9', name: 'A', state: 'exited' },
        'task-12': { id: 'task-12', name: 'D', state: 'enabled' },
      },
      conditions: {
        'condition-11': { id: 'condition-11', name: 'start', marking: 0 },
        'condition-15': {
          id: 'condition-15',
          name: 'implicit:A->D',
          marking: 1,
        },
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

    const service1 = yield* $(
      Interpreter.make(workflow1, {
        shouldBookFlight: true,
        shouldBookCar: true,
      }),
      Effect.provideService(StateManager, stateManager)
    );

    yield* $(service1.start());

    const res1_1 = yield* $(service1.getWorkflowState());

    expect(res1_1).toEqual({
      id: 'workflow-1',
      name: 'or-split-and-or-join',
      state: 'running',
      tasks: { 'task-1': { id: 'task-1', name: 'register', state: 'enabled' } },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 1 },
      },
    });

    yield* $(service1.fireTask('register'));
    yield* $(service1.exitTask('register'));

    const res1_2 = yield* $(service1.getWorkflowState());

    expect(res1_2).toEqual({
      id: 'workflow-1',
      name: 'or-split-and-or-join',
      state: 'running',
      tasks: {
        'task-1': { id: 'task-1', name: 'register', state: 'exited' },
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

    yield* $(service1.fireTask('book_flight'));
    yield* $(service1.exitTask('book_flight'));

    const res1_3 = yield* $(service1.getWorkflowState());

    expect(res1_3).toEqual({
      id: 'workflow-1',
      name: 'or-split-and-or-join',
      state: 'running',
      tasks: {
        'task-1': { id: 'task-1', name: 'register', state: 'exited' },
        'task-2': { id: 'task-2', name: 'book_flight', state: 'exited' },
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

    yield* $(service1.fireTask('book_hotel'));
    yield* $(service1.exitTask('book_hotel'));

    const res1_4 = yield* $(service1.getWorkflowState());

    expect(res1_4).toEqual({
      id: 'workflow-1',
      name: 'or-split-and-or-join',
      state: 'running',
      tasks: {
        'task-1': { id: 'task-1', name: 'register', state: 'exited' },
        'task-2': { id: 'task-2', name: 'book_flight', state: 'exited' },
        'task-4': { id: 'task-4', name: 'book_car', state: 'enabled' },
        'task-3': { id: 'task-3', name: 'book_hotel', state: 'exited' },
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

    yield* $(service1.fireTask('book_car'));
    yield* $(service1.exitTask('book_car'));

    const res1_5 = yield* $(service1.getWorkflowState());

    expect(res1_5).toEqual({
      id: 'workflow-1',
      name: 'or-split-and-or-join',
      state: 'running',
      tasks: {
        'task-1': { id: 'task-1', name: 'register', state: 'exited' },
        'task-2': { id: 'task-2', name: 'book_flight', state: 'exited' },
        'task-4': { id: 'task-4', name: 'book_car', state: 'exited' },
        'task-3': { id: 'task-3', name: 'book_hotel', state: 'exited' },
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

    const service2 = yield* $(
      Interpreter.make(workflow2, {
        shouldBookFlight: true,
        shouldBookCar: false,
      }),
      Effect.provideService(StateManager, stateManager)
    );

    yield* $(service2.start());

    yield* $(service2.fireTask('register'));
    yield* $(service2.exitTask('register'));

    const res2_1 = yield* $(service2.getWorkflowState());

    expect(res2_1).toEqual({
      id: 'workflow-2',
      name: 'or-split-and-or-join',
      state: 'running',
      tasks: {
        'task-6': { id: 'task-6', name: 'register', state: 'exited' },
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

    yield* $(service2.fireTask('book_flight'));
    yield* $(service2.exitTask('book_flight'));

    const res2_2 = yield* $(service2.getWorkflowState());

    expect(res2_2).toEqual({
      id: 'workflow-2',
      name: 'or-split-and-or-join',
      state: 'running',
      tasks: {
        'task-6': { id: 'task-6', name: 'register', state: 'exited' },
        'task-7': { id: 'task-7', name: 'book_flight', state: 'exited' },
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

    yield* $(service2.fireTask('book_hotel'));
    yield* $(service2.exitTask('book_hotel'));

    const res2_3 = yield* $(service2.getWorkflowState());

    expect(res2_3).toEqual({
      id: 'workflow-2',
      name: 'or-split-and-or-join',
      state: 'running',
      tasks: {
        'task-6': { id: 'task-6', name: 'register', state: 'exited' },
        'task-7': { id: 'task-7', name: 'book_flight', state: 'exited' },
        'task-8': { id: 'task-8', name: 'book_hotel', state: 'exited' },
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

    const service3 = yield* $(
      Interpreter.make(workflow3, {
        shouldBookFlight: false,
        shouldBookCar: false,
      }),
      Effect.provideService(StateManager, stateManager)
    );

    yield* $(service3.start());

    yield* $(service3.fireTask('register'));
    yield* $(service3.exitTask('register'));

    const res3_1 = yield* $(service3.getWorkflowState());

    expect(res3_1).toEqual({
      id: 'workflow-3',
      name: 'or-split-and-or-join',
      state: 'running',
      tasks: {
        'task-11': { id: 'task-11', name: 'register', state: 'exited' },
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

    yield* $(service3.fireTask('book_hotel'));
    yield* $(service3.exitTask('book_hotel'));

    const res3_2 = yield* $(service3.getWorkflowState());

    expect(res3_2).toEqual({
      id: 'workflow-3',
      name: 'or-split-and-or-join',
      state: 'running',
      tasks: {
        'task-11': { id: 'task-11', name: 'register', state: 'exited' },
        'task-13': { id: 'task-13', name: 'book_hotel', state: 'exited' },
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
    'multiple-or-join-1'
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

    const service1 = yield* $(
      Interpreter.make(workflow1, { isTaskDEnabled: true }),
      Effect.provideService(StateManager, stateManager)
    );

    yield* $(service1.start());

    const res1_1 = yield* $(service1.getWorkflowState());

    expect(res1_1).toEqual({
      id: 'workflow-1',
      name: 'multiple-or-join-1',
      state: 'running',
      tasks: { 'task-1': { id: 'task-1', name: 'A', state: 'enabled' } },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 1 },
      },
    });

    yield* $(service1.fireTask('A'));
    yield* $(service1.exitTask('A'));

    const res1_2 = yield* $(service1.getWorkflowState());

    expect(res1_2).toEqual({
      id: 'workflow-1',
      name: 'multiple-or-join-1',
      state: 'running',
      tasks: {
        'task-1': { id: 'task-1', name: 'A', state: 'exited' },
        'task-2': { id: 'task-2', name: 'B', state: 'enabled' },
        'task-3': { id: 'task-3', name: 'C', state: 'enabled' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-3': { id: 'condition-3', name: 'implicit:A->B', marking: 1 },
        'condition-4': { id: 'condition-4', name: 'implicit:A->C', marking: 1 },
      },
    });

    yield* $(service1.fireTask('B'));
    yield* $(service1.exitTask('B'));

    const res1_3 = yield* $(service1.getWorkflowState());

    expect(res1_3).toEqual({
      id: 'workflow-1',
      name: 'multiple-or-join-1',
      state: 'running',
      tasks: {
        'task-1': { id: 'task-1', name: 'A', state: 'exited' },
        'task-2': { id: 'task-2', name: 'B', state: 'exited' },
        'task-3': { id: 'task-3', name: 'C', state: 'enabled' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-3': { id: 'condition-3', name: 'implicit:A->B', marking: 0 },
        'condition-4': { id: 'condition-4', name: 'implicit:A->C', marking: 1 },
        'condition-5': { id: 'condition-5', name: 'implicit:B->F', marking: 1 },
      },
    });

    yield* $(service1.fireTask('C'));
    yield* $(service1.exitTask('C'));

    const res1_4 = yield* $(service1.getWorkflowState());

    expect(res1_4).toEqual({
      id: 'workflow-1',
      name: 'multiple-or-join-1',
      state: 'running',
      tasks: {
        'task-1': { id: 'task-1', name: 'A', state: 'exited' },
        'task-2': { id: 'task-2', name: 'B', state: 'exited' },
        'task-3': { id: 'task-3', name: 'C', state: 'exited' },
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

    yield* $(service1.fireTask('D'));
    yield* $(service1.exitTask('D'));

    const res1_5 = yield* $(service1.getWorkflowState());

    expect(res1_5).toEqual({
      id: 'workflow-1',
      name: 'multiple-or-join-1',
      state: 'running',
      tasks: {
        'task-1': { id: 'task-1', name: 'A', state: 'exited' },
        'task-2': { id: 'task-2', name: 'B', state: 'exited' },
        'task-3': { id: 'task-3', name: 'C', state: 'exited' },
        'task-4': { id: 'task-4', name: 'D', state: 'exited' },
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

    yield* $(service1.fireTask('E'));
    yield* $(service1.exitTask('E'));

    const res1_6 = yield* $(service1.getWorkflowState());

    expect(res1_6).toEqual({
      id: 'workflow-1',
      name: 'multiple-or-join-1',
      state: 'running',
      tasks: {
        'task-1': { id: 'task-1', name: 'A', state: 'exited' },
        'task-2': { id: 'task-2', name: 'B', state: 'exited' },
        'task-3': { id: 'task-3', name: 'C', state: 'exited' },
        'task-4': { id: 'task-4', name: 'D', state: 'exited' },
        'task-5': { id: 'task-5', name: 'E', state: 'exited' },
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

    const service2 = yield* $(
      Interpreter.make(workflow2, { isTaskDEnabled: false }),
      Effect.provideService(StateManager, stateManager)
    );

    yield* $(service2.start());

    const res2_1 = yield* $(service2.getWorkflowState());

    expect(res2_1).toEqual({
      id: 'workflow-2',
      name: 'multiple-or-join-1',
      state: 'running',
      tasks: { 'task-7': { id: 'task-7', name: 'A', state: 'enabled' } },
      conditions: {
        'condition-10': { id: 'condition-10', name: 'start', marking: 1 },
      },
    });

    yield* $(service2.fireTask('A'));
    yield* $(service2.exitTask('A'));

    const res2_2 = yield* $(service2.getWorkflowState());

    expect(res2_2).toEqual({
      id: 'workflow-2',
      name: 'multiple-or-join-1',
      state: 'running',
      tasks: {
        'task-7': { id: 'task-7', name: 'A', state: 'exited' },
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

    yield* $(service2.fireTask('B'));
    yield* $(service2.exitTask('B'));

    const res2_3 = yield* $(service2.getWorkflowState());

    expect(res2_3).toEqual({
      id: 'workflow-2',
      name: 'multiple-or-join-1',
      state: 'running',
      tasks: {
        'task-7': { id: 'task-7', name: 'A', state: 'exited' },
        'task-8': { id: 'task-8', name: 'B', state: 'exited' },
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

    yield* $(service2.fireTask('C'));
    yield* $(service2.exitTask('C'));

    const res2_4 = yield* $(service2.getWorkflowState());

    expect(res2_4).toEqual({
      id: 'workflow-2',
      name: 'multiple-or-join-1',
      state: 'running',
      tasks: {
        'task-7': { id: 'task-7', name: 'A', state: 'exited' },
        'task-8': { id: 'task-8', name: 'B', state: 'exited' },
        'task-9': { id: 'task-9', name: 'C', state: 'exited' },
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

    yield* $(service2.fireTask('E'));
    yield* $(service2.exitTask('E'));

    const res2_5 = yield* $(service2.getWorkflowState());

    expect(res2_5).toEqual({
      id: 'workflow-2',
      name: 'multiple-or-join-1',
      state: 'running',
      tasks: {
        'task-7': { id: 'task-7', name: 'A', state: 'exited' },
        'task-8': { id: 'task-8', name: 'B', state: 'exited' },
        'task-9': { id: 'task-9', name: 'C', state: 'exited' },
        'task-11': { id: 'task-11', name: 'E', state: 'exited' },
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
    'multiple-or-join-2'
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

    const service1 = yield* $(
      Interpreter.make(workflow1, { isBToCEnabled: true }),
      Effect.provideService(StateManager, stateManager)
    );

    yield* $(service1.start());

    const res1_1 = yield* $(service1.getWorkflowState());

    expect(res1_1).toEqual({
      id: 'workflow-1',
      name: 'multiple-or-join-2',
      state: 'running',
      tasks: { 'task-1': { id: 'task-1', name: 'A', state: 'enabled' } },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 1 },
      },
    });

    yield* $(service1.fireTask('A'));
    yield* $(service1.exitTask('A'));

    const res1_2 = yield* $(service1.getWorkflowState());

    expect(res1_2).toEqual({
      id: 'workflow-1',
      name: 'multiple-or-join-2',
      state: 'running',
      tasks: {
        'task-1': { id: 'task-1', name: 'A', state: 'exited' },
        'task-2': { id: 'task-2', name: 'B', state: 'enabled' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-3': { id: 'condition-3', name: 'implicit:A->B', marking: 1 },
        'condition-4': { id: 'condition-4', name: 'implicit:A->C', marking: 1 },
      },
    });

    yield* $(service1.fireTask('B'));
    yield* $(service1.exitTask('B'));

    const res1_3 = yield* $(service1.getWorkflowState());

    expect(res1_3).toEqual({
      id: 'workflow-1',
      name: 'multiple-or-join-2',
      state: 'running',
      tasks: {
        'task-1': { id: 'task-1', name: 'A', state: 'exited' },
        'task-2': { id: 'task-2', name: 'B', state: 'exited' },
        'task-3': { id: 'task-3', name: 'C', state: 'enabled' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-3': { id: 'condition-3', name: 'implicit:A->B', marking: 0 },
        'condition-4': { id: 'condition-4', name: 'implicit:A->C', marking: 1 },
        'condition-5': { id: 'condition-5', name: 'implicit:B->C', marking: 1 },
      },
    });

    yield* $(service1.fireTask('C'));
    yield* $(service1.exitTask('C'));

    const res1_4 = yield* $(service1.getWorkflowState());

    expect(res1_4).toEqual({
      id: 'workflow-1',
      name: 'multiple-or-join-2',
      state: 'running',
      tasks: {
        'task-1': { id: 'task-1', name: 'A', state: 'exited' },
        'task-2': { id: 'task-2', name: 'B', state: 'exited' },
        'task-3': { id: 'task-3', name: 'C', state: 'exited' },
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

    const service2 = yield* $(
      Interpreter.make(workflow2, { isBToCEnabled: false }),
      Effect.provideService(StateManager, stateManager)
    );

    yield* $(service2.start());

    const res2_1 = yield* $(service2.getWorkflowState());

    expect(res2_1).toEqual({
      id: 'workflow-2',
      name: 'multiple-or-join-2',
      state: 'running',
      tasks: { 'task-5': { id: 'task-5', name: 'A', state: 'enabled' } },
      conditions: {
        'condition-8': { id: 'condition-8', name: 'start', marking: 1 },
      },
    });

    yield* $(service2.fireTask('A'));
    yield* $(service2.exitTask('A'));

    const res2_2 = yield* $(service2.getWorkflowState());

    expect(res2_2).toEqual({
      id: 'workflow-2',
      name: 'multiple-or-join-2',
      state: 'running',
      tasks: {
        'task-5': { id: 'task-5', name: 'A', state: 'exited' },
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

    yield* $(service2.fireTask('B'));
    yield* $(service2.exitTask('B'));

    const res2_3 = yield* $(service2.getWorkflowState());

    expect(res2_3).toEqual({
      id: 'workflow-2',
      name: 'multiple-or-join-2',
      state: 'running',
      tasks: {
        'task-5': { id: 'task-5', name: 'A', state: 'exited' },
        'task-6': { id: 'task-6', name: 'B', state: 'exited' },
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

    yield* $(service2.fireTask('C'));
    yield* $(service2.exitTask('C'));

    const res2_4 = yield* $(service2.getWorkflowState());

    expect(res2_4).toEqual({
      id: 'workflow-2',
      name: 'multiple-or-join-2',
      state: 'running',
      tasks: {
        'task-5': { id: 'task-5', name: 'A', state: 'exited' },
        'task-6': { id: 'task-6', name: 'B', state: 'exited' },
        'task-7': { id: 'task-7', name: 'C', state: 'exited' },
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

    const service = yield* $(
      Interpreter.make(workflow, {}),
      Effect.provideService(StateManager, stateManager)
    );

    yield* $(service.start());

    const res1 = yield* $(service.getWorkflowState());

    expect(res1).toEqual({
      id: 'workflow-1',
      name: 'or-join-cancellation-region',
      state: 'running',
      tasks: { 'task-1': { id: 'task-1', name: 'A', state: 'enabled' } },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 1 },
      },
    });

    yield* $(service.fireTask('A'));
    yield* $(service.exitTask('A'));

    const res2 = yield* $(service.getWorkflowState());

    expect(res2).toEqual({
      id: 'workflow-1',
      name: 'or-join-cancellation-region',
      state: 'running',
      tasks: {
        'task-1': { id: 'task-1', name: 'A', state: 'exited' },
        'task-2': { id: 'task-2', name: 'B', state: 'enabled' },
        'task-3': { id: 'task-3', name: 'C', state: 'enabled' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-5': { id: 'condition-5', name: 'implicit:A->B', marking: 1 },
        'condition-6': { id: 'condition-6', name: 'implicit:A->C', marking: 1 },
      },
    });

    yield* $(service.fireTask('C'));
    yield* $(service.exitTask('C'));

    const res3 = yield* $(service.getWorkflowState());

    expect(res3).toEqual({
      id: 'workflow-1',
      name: 'or-join-cancellation-region',
      state: 'running',
      tasks: {
        'task-1': { id: 'task-1', name: 'A', state: 'exited' },
        'task-2': { id: 'task-2', name: 'B', state: 'enabled' },
        'task-3': { id: 'task-3', name: 'C', state: 'exited' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-5': { id: 'condition-5', name: 'implicit:A->B', marking: 1 },
        'condition-6': { id: 'condition-6', name: 'implicit:A->C', marking: 0 },
        'condition-7': { id: 'condition-7', name: 'implicit:C->G', marking: 1 },
      },
    });

    yield* $(service.fireTask('B'));
    yield* $(service.exitTask('B'));

    const res4 = yield* $(service.getWorkflowState());

    expect(res4).toEqual({
      id: 'workflow-1',
      name: 'or-join-cancellation-region',
      state: 'running',
      tasks: {
        'task-1': { id: 'task-1', name: 'A', state: 'exited' },
        'task-2': { id: 'task-2', name: 'B', state: 'enabled' },
        'task-3': { id: 'task-3', name: 'C', state: 'exited' },
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

    yield* $(service.fireTask('E'));
    yield* $(service.exitTask('E'));

    const res5 = yield* $(service.getWorkflowState());

    expect(res5).toEqual({
      id: 'workflow-1',
      name: 'or-join-cancellation-region',
      state: 'running',
      tasks: {
        'task-1': { id: 'task-1', name: 'A', state: 'exited' },
        'task-2': { id: 'task-2', name: 'B', state: 'enabled' },
        'task-3': { id: 'task-3', name: 'C', state: 'exited' },
        'task-4': { id: 'task-4', name: 'D', state: 'disabled' },
        'task-5': { id: 'task-5', name: 'E', state: 'exited' },
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

    yield* $(service.fireTask('B'));
    yield* $(service.exitTask('B'));

    const res6 = yield* $(service.getWorkflowState());

    expect(res6).toEqual({
      id: 'workflow-1',
      name: 'or-join-cancellation-region',
      state: 'running',
      tasks: {
        'task-1': { id: 'task-1', name: 'A', state: 'exited' },
        'task-2': { id: 'task-2', name: 'B', state: 'enabled' },
        'task-3': { id: 'task-3', name: 'C', state: 'exited' },
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

    yield* $(service.fireTask('D'));
    yield* $(service.exitTask('D'));

    const res7 = yield* $(service.getWorkflowState());

    expect(res7).toEqual({
      id: 'workflow-1',
      name: 'or-join-cancellation-region',
      state: 'running',
      tasks: {
        'task-1': { id: 'task-1', name: 'A', state: 'exited' },
        'task-2': { id: 'task-2', name: 'B', state: 'disabled' },
        'task-3': { id: 'task-3', name: 'C', state: 'exited' },
        'task-4': { id: 'task-4', name: 'D', state: 'exited' },
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

    yield* $(service.fireTask('F'));
    yield* $(service.exitTask('F'));

    const res8 = yield* $(service.getWorkflowState());

    expect(res8).toEqual({
      id: 'workflow-1',
      name: 'or-join-cancellation-region',
      state: 'running',
      tasks: {
        'task-1': { id: 'task-1', name: 'A', state: 'exited' },
        'task-2': { id: 'task-2', name: 'B', state: 'disabled' },
        'task-3': { id: 'task-3', name: 'C', state: 'exited' },
        'task-4': { id: 'task-4', name: 'D', state: 'exited' },
        'task-5': { id: 'task-5', name: 'E', state: 'disabled' },
        'task-6': { id: 'task-6', name: 'F', state: 'exited' },
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

    const service = yield* $(
      Interpreter.make(workflow, {}),
      Effect.provideService(StateManager, stateManager)
    );

    yield* $(service.start());

    const res1 = yield* $(service.getWorkflowState());

    expect(res1).toEqual({
      id: 'workflow-1',
      name: 'or-join-cancellation-region',
      state: 'running',
      tasks: { 'task-1': { id: 'task-1', name: 'A', state: 'enabled' } },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 1 },
      },
    });

    yield* $(service.fireTask('A'));
    yield* $(service.exitTask('A'));

    const res2 = yield* $(service.getWorkflowState());

    expect(res2).toEqual({
      id: 'workflow-1',
      name: 'or-join-cancellation-region',
      state: 'running',
      tasks: {
        'task-1': { id: 'task-1', name: 'A', state: 'exited' },
        'task-2': { id: 'task-2', name: 'B', state: 'enabled' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-2': { id: 'condition-2', name: 'c1', marking: 1 },
      },
    });

    yield* $(service.fireTask('B'));
    yield* $(service.exitTask('B'));

    const res3 = yield* $(service.getWorkflowState());

    expect(res3).toEqual({
      id: 'workflow-1',
      name: 'or-join-cancellation-region',
      state: 'running',
      tasks: {
        'task-1': { id: 'task-1', name: 'A', state: 'exited' },
        'task-2': { id: 'task-2', name: 'B', state: 'exited' },
        'task-3': { id: 'task-3', name: 'C', state: 'enabled' },
        'task-5': { id: 'task-5', name: 'E', state: 'enabled' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-2': { id: 'condition-2', name: 'c1', marking: 0 },
        'condition-3': { id: 'condition-3', name: 'c2', marking: 1 },
      },
    });

    yield* $(service.fireTask('C'));
    yield* $(service.exitTask('C'));

    const res4 = yield* $(service.getWorkflowState());

    expect(res4).toEqual({
      id: 'workflow-1',
      name: 'or-join-cancellation-region',
      state: 'running',
      tasks: {
        'task-1': { id: 'task-1', name: 'A', state: 'exited' },
        'task-2': { id: 'task-2', name: 'B', state: 'exited' },
        'task-3': { id: 'task-3', name: 'C', state: 'exited' },
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

    yield* $(service.fireTask('D'));
    yield* $(service.exitTask('D'));

    const res5 = yield* $(service.getWorkflowState());

    expect(res5).toEqual({
      id: 'workflow-1',
      name: 'or-join-cancellation-region',
      state: 'running',
      tasks: {
        'task-1': { id: 'task-1', name: 'A', state: 'exited' },
        'task-2': { id: 'task-2', name: 'B', state: 'enabled' },
        'task-3': { id: 'task-3', name: 'C', state: 'enabled' },
        'task-5': { id: 'task-5', name: 'E', state: 'enabled' },
        'task-4': { id: 'task-4', name: 'D', state: 'exited' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-2': { id: 'condition-2', name: 'c1', marking: 1 },
        'condition-3': { id: 'condition-3', name: 'c2', marking: 1 },
        'condition-4': { id: 'condition-4', name: 'c3', marking: 0 },
      },
    });

    yield* $(service.fireTask('E'));
    yield* $(service.exitTask('E'));

    const res6 = yield* $(service.getWorkflowState());

    expect(res6).toEqual({
      id: 'workflow-1',
      name: 'or-join-cancellation-region',
      state: 'done',
      tasks: {
        'task-1': { id: 'task-1', name: 'A', state: 'exited' },
        'task-2': { id: 'task-2', name: 'B', state: 'enabled' },
        'task-3': { id: 'task-3', name: 'C', state: 'disabled' },
        'task-5': { id: 'task-5', name: 'E', state: 'exited' },
        'task-4': { id: 'task-4', name: 'D', state: 'exited' },
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

it('calls onStart and onEnd activities (1)', () => {
  const log: {
    workflowId: string;
    workflowPhase: 'end' | 'start';
    activityPhase: 'before' | 'after';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    value: any;
  }[] = [];
  const workflowDefinition = Builder.workflow('name')
    .startCondition('start')
    .task('A')
    .endCondition('end')
    .connectCondition('start', (to) => to.task('A'))
    .connectTask('A', (to) => to.condition('end'))
    .onStart(({ getWorkflowId, input, startWorkflow }) =>
      Effect.gen(function* ($) {
        const workflowId = yield* $(getWorkflowId());
        log.push({
          workflowId,
          workflowPhase: 'start',
          activityPhase: 'before',
          value: input,
        });
        yield* $(startWorkflow());
        log.push({
          workflowId,
          workflowPhase: 'start',
          activityPhase: 'after',
          value: input,
        });
        return `from onStart activity: ${input}`;
      })
    )
    .onEnd(({ getWorkflowId, endWorkflow }) =>
      Effect.gen(function* ($) {
        const workflowId = yield* $(getWorkflowId());
        log.push({
          workflowId,
          workflowPhase: 'end',
          activityPhase: 'before',
          value: undefined,
        });
        yield* $(endWorkflow());
        log.push({
          workflowId,
          workflowPhase: 'end',
          activityPhase: 'after',
          value: undefined,
        });
      })
    );

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

    const service = yield* $(
      Interpreter.make(workflow, {}),
      Effect.provideService(StateManager, stateManager)
    );

    const start = yield* $(service.start('starting'));

    expect(start).toEqual(`from onStart activity: starting`);

    yield* $(service.fireTask('A'));
    yield* $(service.exitTask('A'));

    const res1 = yield* $(service.getWorkflowState());

    expect(res1).toEqual({
      id: 'workflow-1',
      name: 'name',
      state: 'done',
      tasks: { 'task-1': { id: 'task-1', name: 'A', state: 'exited' } },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-2': { id: 'condition-2', name: 'end', marking: 1 },
      },
    });

    expect(log).toEqual([
      {
        workflowId: 'workflow-1',
        workflowPhase: 'start',
        activityPhase: 'before',
        value: 'starting',
      },
      {
        workflowId: 'workflow-1',
        workflowPhase: 'start',
        activityPhase: 'after',
        value: 'starting',
      },
      {
        workflowId: 'workflow-1',
        workflowPhase: 'end',
        activityPhase: 'before',
        value: undefined,
      },
      {
        workflowId: 'workflow-1',
        workflowPhase: 'end',
        activityPhase: 'after',
        value: undefined,
      },
    ]);
  });

  Effect.runSync(program);
});

it('calls onStart and onEnd activities (2)', () => {
  const log: {
    workflowId: string;
    workflowPhase: 'end' | 'start';
    activityPhase: 'before' | 'after';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    value: any;
  }[] = [];
  const workflowDefinition = Builder.workflow('name')
    .startCondition('start')
    .task('A', (t) =>
      t
        .onEnable(({ enableTask }) =>
          pipe(
            enableTask(),
            Effect.flatMap(({ fireTask }) => fireTask())
          )
        )
        .onFire(({ fireTask }) =>
          pipe(
            fireTask(),
            Effect.flatMap(({ exitTask }) => exitTask())
          )
        )
    )
    .endCondition('end')
    .connectCondition('start', (to) => to.task('A'))
    .connectTask('A', (to) => to.condition('end'))
    .onStart(({ getWorkflowId, input, startWorkflow }) =>
      Effect.gen(function* ($) {
        const workflowId = yield* $(getWorkflowId());
        log.push({
          workflowId,
          workflowPhase: 'start',
          activityPhase: 'before',
          value: input,
        });
        yield* $(startWorkflow());
        log.push({
          workflowId,
          workflowPhase: 'start',
          activityPhase: 'after',
          value: input,
        });
        return `from onStart activity: ${input}`;
      })
    )
    .onEnd(({ getWorkflowId, endWorkflow }) =>
      Effect.gen(function* ($) {
        const workflowId = yield* $(getWorkflowId());
        log.push({
          workflowId,
          workflowPhase: 'end',
          activityPhase: 'before',
          value: undefined,
        });
        yield* $(endWorkflow());
        log.push({
          workflowId,
          workflowPhase: 'end',
          activityPhase: 'after',
          value: undefined,
        });
      })
    );

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

    const service = yield* $(
      Interpreter.make(workflow, {}),
      Effect.provideService(StateManager, stateManager)
    );

    const start = yield* $(service.start('starting'));

    expect(start).toEqual(`from onStart activity: starting`);

    const res1 = yield* $(service.getWorkflowState());

    expect(res1).toEqual({
      id: 'workflow-1',
      name: 'name',
      state: 'done',
      tasks: { 'task-1': { id: 'task-1', name: 'A', state: 'exited' } },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-2': { id: 'condition-2', name: 'end', marking: 1 },
      },
    });

    expect(log).toEqual([
      {
        workflowId: 'workflow-1',
        workflowPhase: 'start',
        activityPhase: 'before',
        value: 'starting',
      },
      {
        workflowId: 'workflow-1',
        workflowPhase: 'end',
        activityPhase: 'before',
        value: undefined,
      },
      {
        workflowId: 'workflow-1',
        workflowPhase: 'end',
        activityPhase: 'after',
        value: undefined,
      },
      {
        workflowId: 'workflow-1',
        workflowPhase: 'start',
        activityPhase: 'after',
        value: 'starting',
      },
    ]);
  });

  Effect.runSync(program);
});

it('can supports workflow cancellation', () => {
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

    const service = yield* $(
      Interpreter.make(workflow, {}),
      Effect.provideService(StateManager, stateManager)
    );

    yield* $(service.start());

    const res1 = yield* $(service.getWorkflowState());

    expect(res1).toEqual({
      id: 'workflow-1',
      name: 'checkout',
      state: 'running',
      tasks: {
        'task-1': { id: 'task-1', name: 'scan_goods', state: 'enabled' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 1 },
      },
    });

    yield* $(service.fireTask('scan_goods'));

    const res2 = yield* $(service.getWorkflowState());

    expect(res2).toEqual({
      id: 'workflow-1',
      name: 'checkout',
      state: 'running',
      tasks: {
        'task-1': { id: 'task-1', name: 'scan_goods', state: 'active' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
      },
    });

    yield* $(service.exitTask('scan_goods'));

    const res3 = yield* $(service.getWorkflowState());

    expect(res3).toEqual({
      id: 'workflow-1',
      name: 'checkout',
      state: 'running',
      tasks: {
        'task-1': { id: 'task-1', name: 'scan_goods', state: 'exited' },
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

    yield* $(service.fireTask('pay'));

    const res4 = yield* $(service.getWorkflowState());

    expect(res4).toEqual({
      id: 'workflow-1',
      name: 'checkout',
      state: 'running',
      tasks: {
        'task-1': { id: 'task-1', name: 'scan_goods', state: 'exited' },
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

    yield* $(service.cancelWorkflow());

    const res5 = yield* $(service.getWorkflowState());

    expect(res5).toEqual({
      id: 'workflow-1',
      name: 'checkout',
      state: 'canceled',
      tasks: {
        'task-1': { id: 'task-1', name: 'scan_goods', state: 'exited' },
        'task-2': { id: 'task-2', name: 'pay', state: 'canceled' },
      },
      conditions: {
        'condition-1': { id: 'condition-1', name: 'start', marking: 0 },
        'condition-3': {
          id: 'condition-3',
          name: 'implicit:scan_goods->pay',
          marking: 0,
        },
        'condition-2': { id: 'condition-2', name: 'end', marking: 0 },
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
  });

  Effect.runSync(program);
});


*/
