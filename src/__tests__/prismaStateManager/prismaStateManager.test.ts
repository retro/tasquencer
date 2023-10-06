import { PrismaClient } from '@prisma/client';
import { Effect } from 'effect';
// eslint-disable-next-line import/no-extraneous-dependencies
import { v4 as uuidv4 } from 'uuid';
import { expect, it } from 'vitest';

import * as Builder from '../../builder.js';
import * as Interpreter from '../../interpreter.js';
import {
  IdGenerator,
  StateManager,
  WorkflowItem,
} from '../../stateManager/types.js';
import { InjectablePrismaClient, createPrisma } from './prismaStateManager.js';

const ID_GENERATOR: IdGenerator = {
  next(_type) {
    return Effect.succeed(uuidv4());
  },
};

function processWorkflowItem(workflowItem: WorkflowItem) {
  return {
    name: workflowItem.name,
    state: workflowItem.state,
    tasks: Object.values(workflowItem.tasks).reduce<{
      [k in string]: { name: string; state: string };
    }>((acc, taskItem) => {
      acc[taskItem.name] = { name: taskItem.name, state: taskItem.state };
      return acc;
    }, {}),
    conditions: Object.values(workflowItem.conditions).reduce<{
      [k in string]: { name: string; marking: number };
    }>((acc, conditionItem) => {
      acc[conditionItem.name] = {
        name: conditionItem.name,
        marking: conditionItem.marking,
      };
      return acc;
    }, {}),
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

  const prismaClient = new PrismaClient({
    log: ['query', 'info', 'warn', 'error'],
  });

  return prismaClient.$transaction((prisma) => {
    const program = Effect.gen(function* ($) {
      const stateManager = yield* $(
        createPrisma(),
        Effect.provideService(InjectablePrismaClient, prisma)
      );

      const workflow = yield* $(
        workflowDefinition.build(),
        Effect.provideService(StateManager, stateManager),
        Effect.provideService(IdGenerator, ID_GENERATOR)
      );

      const interpreter = yield* $(
        Interpreter.make(workflow, {}),
        Effect.provideService(StateManager, stateManager)
      );

      yield* $(interpreter.start());

      const res1 = processWorkflowItem(
        yield* $(interpreter.getWorkflowState())
      );

      expect(res1).toEqual({
        name: 'checkout',
        state: 'running',
        tasks: { scan_goods: { name: 'scan_goods', state: 'enabled' } },
        conditions: { start: { name: 'start', marking: 1 } },
      });

      yield* $(interpreter.activateTask('scan_goods'));

      const res2 = processWorkflowItem(
        yield* $(interpreter.getWorkflowState())
      );

      expect(res2).toEqual({
        name: 'checkout',
        state: 'running',
        tasks: { scan_goods: { name: 'scan_goods', state: 'active' } },
        conditions: { start: { name: 'start', marking: 0 } },
      });

      yield* $(interpreter.completeTask('scan_goods'));

      const res3 = processWorkflowItem(
        yield* $(interpreter.getWorkflowState())
      );

      expect(res3).toEqual({
        name: 'checkout',
        state: 'running',
        tasks: {
          scan_goods: { name: 'scan_goods', state: 'completed' },
          pay: { name: 'pay', state: 'enabled' },
        },
        conditions: {
          start: { name: 'start', marking: 0 },
          'implicit:scan_goods->pay': {
            name: 'implicit:scan_goods->pay',
            marking: 1,
          },
        },
      });

      yield* $(interpreter.activateTask('pay'));

      const res4 = processWorkflowItem(
        yield* $(interpreter.getWorkflowState())
      );

      expect(res4).toEqual({
        name: 'checkout',
        state: 'running',
        tasks: {
          scan_goods: { name: 'scan_goods', state: 'completed' },
          pay: { name: 'pay', state: 'active' },
        },
        conditions: {
          start: { name: 'start', marking: 0 },
          'implicit:scan_goods->pay': {
            name: 'implicit:scan_goods->pay',
            marking: 0,
          },
        },
      });

      yield* $(interpreter.completeTask('pay'));

      const res5 = processWorkflowItem(
        yield* $(interpreter.getWorkflowState())
      );

      expect(res5).toEqual({
        name: 'checkout',
        state: 'running',
        tasks: {
          scan_goods: { name: 'scan_goods', state: 'completed' },
          pay: { name: 'pay', state: 'completed' },
          pack_goods: { name: 'pack_goods', state: 'enabled' },
          issue_receipt: { name: 'issue_receipt', state: 'enabled' },
        },
        conditions: {
          start: { name: 'start', marking: 0 },
          'implicit:scan_goods->pay': {
            name: 'implicit:scan_goods->pay',
            marking: 0,
          },
          'implicit:pay->pack_goods': {
            name: 'implicit:pay->pack_goods',
            marking: 1,
          },
          'implicit:pay->issue_receipt': {
            name: 'implicit:pay->issue_receipt',
            marking: 1,
          },
        },
      });

      yield* $(interpreter.activateTask('pack_goods'));

      const res6 = processWorkflowItem(
        yield* $(interpreter.getWorkflowState())
      );

      expect(res6).toEqual({
        name: 'checkout',
        state: 'running',
        tasks: {
          scan_goods: { name: 'scan_goods', state: 'completed' },
          pay: { name: 'pay', state: 'completed' },
          pack_goods: { name: 'pack_goods', state: 'active' },
          issue_receipt: { name: 'issue_receipt', state: 'enabled' },
        },
        conditions: {
          start: { name: 'start', marking: 0 },
          'implicit:scan_goods->pay': {
            name: 'implicit:scan_goods->pay',
            marking: 0,
          },
          'implicit:pay->pack_goods': {
            name: 'implicit:pay->pack_goods',
            marking: 0,
          },
          'implicit:pay->issue_receipt': {
            name: 'implicit:pay->issue_receipt',
            marking: 1,
          },
        },
      });

      yield* $(interpreter.activateTask('issue_receipt'));

      const res7 = processWorkflowItem(
        yield* $(interpreter.getWorkflowState())
      );

      expect(res7).toEqual({
        name: 'checkout',
        state: 'running',
        tasks: {
          scan_goods: { name: 'scan_goods', state: 'completed' },
          pay: { name: 'pay', state: 'completed' },
          pack_goods: { name: 'pack_goods', state: 'active' },
          issue_receipt: { name: 'issue_receipt', state: 'active' },
        },
        conditions: {
          start: { name: 'start', marking: 0 },
          'implicit:scan_goods->pay': {
            name: 'implicit:scan_goods->pay',
            marking: 0,
          },
          'implicit:pay->pack_goods': {
            name: 'implicit:pay->pack_goods',
            marking: 0,
          },
          'implicit:pay->issue_receipt': {
            name: 'implicit:pay->issue_receipt',
            marking: 0,
          },
        },
      });

      yield* $(interpreter.completeTask('pack_goods'));

      const res8 = processWorkflowItem(
        yield* $(interpreter.getWorkflowState())
      );

      expect(res8).toEqual({
        name: 'checkout',
        state: 'running',
        tasks: {
          scan_goods: { name: 'scan_goods', state: 'completed' },
          pay: { name: 'pay', state: 'completed' },
          pack_goods: { name: 'pack_goods', state: 'completed' },
          issue_receipt: { name: 'issue_receipt', state: 'active' },
        },
        conditions: {
          start: { name: 'start', marking: 0 },
          'implicit:scan_goods->pay': {
            name: 'implicit:scan_goods->pay',
            marking: 0,
          },
          'implicit:pay->pack_goods': {
            name: 'implicit:pay->pack_goods',
            marking: 0,
          },
          'implicit:pay->issue_receipt': {
            name: 'implicit:pay->issue_receipt',
            marking: 0,
          },
          'implicit:pack_goods->check_goods': {
            name: 'implicit:pack_goods->check_goods',
            marking: 1,
          },
        },
      });

      yield* $(interpreter.completeTask('issue_receipt'));

      const res9 = processWorkflowItem(
        yield* $(interpreter.getWorkflowState())
      );

      expect(res9).toEqual({
        name: 'checkout',
        state: 'running',
        tasks: {
          scan_goods: { name: 'scan_goods', state: 'completed' },
          pay: { name: 'pay', state: 'completed' },
          pack_goods: { name: 'pack_goods', state: 'completed' },
          issue_receipt: { name: 'issue_receipt', state: 'completed' },
          check_goods: { name: 'check_goods', state: 'enabled' },
        },
        conditions: {
          start: { name: 'start', marking: 0 },
          'implicit:scan_goods->pay': {
            name: 'implicit:scan_goods->pay',
            marking: 0,
          },
          'implicit:pay->pack_goods': {
            name: 'implicit:pay->pack_goods',
            marking: 0,
          },
          'implicit:pay->issue_receipt': {
            name: 'implicit:pay->issue_receipt',
            marking: 0,
          },
          'implicit:pack_goods->check_goods': {
            name: 'implicit:pack_goods->check_goods',
            marking: 1,
          },
          'implicit:issue_receipt->check_goods': {
            name: 'implicit:issue_receipt->check_goods',
            marking: 1,
          },
        },
      });

      yield* $(interpreter.activateTask('check_goods'));

      const res10 = processWorkflowItem(
        yield* $(interpreter.getWorkflowState())
      );

      expect(res10).toEqual({
        name: 'checkout',
        state: 'running',
        tasks: {
          scan_goods: { name: 'scan_goods', state: 'completed' },
          pay: { name: 'pay', state: 'completed' },
          pack_goods: { name: 'pack_goods', state: 'completed' },
          issue_receipt: { name: 'issue_receipt', state: 'completed' },
          check_goods: { name: 'check_goods', state: 'active' },
        },
        conditions: {
          start: { name: 'start', marking: 0 },
          'implicit:scan_goods->pay': {
            name: 'implicit:scan_goods->pay',
            marking: 0,
          },
          'implicit:pay->pack_goods': {
            name: 'implicit:pay->pack_goods',
            marking: 0,
          },
          'implicit:pay->issue_receipt': {
            name: 'implicit:pay->issue_receipt',
            marking: 0,
          },
          'implicit:pack_goods->check_goods': {
            name: 'implicit:pack_goods->check_goods',
            marking: 0,
          },
          'implicit:issue_receipt->check_goods': {
            name: 'implicit:issue_receipt->check_goods',
            marking: 0,
          },
        },
      });

      yield* $(interpreter.completeTask('check_goods'));

      const res11 = processWorkflowItem(
        yield* $(interpreter.getWorkflowState())
      );

      expect(res11).toEqual({
        name: 'checkout',
        state: 'done',
        tasks: {
          scan_goods: { name: 'scan_goods', state: 'completed' },
          pay: { name: 'pay', state: 'completed' },
          pack_goods: { name: 'pack_goods', state: 'completed' },
          issue_receipt: { name: 'issue_receipt', state: 'completed' },
          check_goods: { name: 'check_goods', state: 'completed' },
        },
        conditions: {
          start: { name: 'start', marking: 0 },
          'implicit:scan_goods->pay': {
            name: 'implicit:scan_goods->pay',
            marking: 0,
          },
          'implicit:pay->pack_goods': {
            name: 'implicit:pay->pack_goods',
            marking: 0,
          },
          'implicit:pay->issue_receipt': {
            name: 'implicit:pay->issue_receipt',
            marking: 0,
          },
          'implicit:pack_goods->check_goods': {
            name: 'implicit:pack_goods->check_goods',
            marking: 0,
          },
          'implicit:issue_receipt->check_goods': {
            name: 'implicit:issue_receipt->check_goods',
            marking: 0,
          },
          end: { name: 'end', marking: 1 },
        },
      });
    });

    return Effect.runPromise(program);
  });
});
