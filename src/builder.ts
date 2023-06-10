import * as R from 'remeda';
import {
  Digraph,
  Edge,
  Node,
  type NodeAttributesObject,
  attribute as _,
  toDot,
} from 'ts-graphviz';

import { Interpreter } from './interpreter.js';
import type {
  BuilderNet,
  ConditionNode,
  DefaultFlow,
  Flow,
  FlowProps,
  FlowType,
  ImplicitConditionName,
  Net,
  NotExtends,
  PredicateFlow,
  TaskNode,
  XOR,
} from './types.js';

export class Builder<
  Context,
  BNTasks = never,
  BNConditions = never,
  BNCancellationRegions = never,
  BNTasksWithOrXorSplit = never
> {
  net: BuilderNet;

  constructor() {
    const net: BuilderNet = {
      conditions: {},
      tasks: {},
      cancellationRegions: {},
      flows: { tasks: {}, conditions: {} },
    };

    this.net = net;
  }

  private copyWithExtendedNet<T>(props: Partial<BuilderNet>): T {
    const newNet = { ...this.net, ...props };
    return Object.assign(Object.create(this.constructor.prototype), {
      ...this,
      net: newNet,
    });
  }

  private addConditionUnsafe<T>(
    conditionName: string,
    props?: Omit<ConditionNode, 'name'>
  ): T {
    const condition: ConditionNode = { name: conditionName, ...props };
    const newConditions = R.merge(this.net.conditions, {
      [conditionName]: condition,
    });
    const newFlows = R.merge(this.net.flows, {
      conditions: R.merge(this.net.flows.conditions, {
        [conditionName]: new Set<string>(),
      }),
    });

    return this.copyWithExtendedNet<T>({
      conditions: newConditions,
      flows: newFlows,
    });
  }

  private connectUnsafe(
    from: string,
    to: string,
    type: FlowType,
    props?: object
  ) {
    const flows = this.net.flows;

    if (type === 'condition->task') {
      const flowsFromConditions = flows.conditions;
      const flowsFromCondition = flowsFromConditions[from];

      flowsFromCondition.add(to);
      return this.copyWithExtendedNet<
        Builder<
          Context,
          BNTasks,
          BNConditions,
          BNCancellationRegions,
          BNTasksWithOrXorSplit
        >
      >({
        flows: {
          ...flows,
          conditions: {
            ...flowsFromConditions,
            [from]: flowsFromCondition,
          },
        },
      });
    } else {
      const flowsFromTasks = flows.tasks;
      const flowsFromTask = from in flowsFromTasks ? flowsFromTasks[from] : {};
      flowsFromTask[to] = props ?? {};

      return this.copyWithExtendedNet<
        Builder<
          Context,
          BNTasks,
          BNConditions,
          BNCancellationRegions,
          BNTasksWithOrXorSplit
        >
      >({
        flows: {
          ...flows,
          tasks: {
            ...flowsFromTasks,
            [from]: flowsFromTask,
          },
        },
      });
    }
  }

  addCondition<CN extends string>(
    conditionName: CN & NotExtends<BNTasks | BNConditions, CN>
  ) {
    return this.addConditionUnsafe<
      Builder<
        Context,
        BNTasks,
        BNConditions | CN,
        BNCancellationRegions,
        BNTasksWithOrXorSplit
      >
    >(conditionName);
  }

  addStartCondition<CN extends string>(
    conditionName: CN & NotExtends<BNTasks | BNConditions, CN>
  ) {
    return this.copyWithExtendedNet<this>({
      startCondition: conditionName,
    }).addConditionUnsafe<
      Builder<
        Context,
        BNTasks,
        BNConditions | CN,
        BNCancellationRegions,
        BNTasksWithOrXorSplit
      >
    >(conditionName);
  }

  addEndCondition<CN extends string>(
    conditionName: CN & NotExtends<BNTasks | BNConditions, CN>
  ) {
    return this.copyWithExtendedNet<this>({
      endCondition: conditionName,
    }).addConditionUnsafe<
      Builder<
        Context,
        BNTasks,
        BNConditions | CN,
        BNCancellationRegions,
        BNTasksWithOrXorSplit
      >
    >(conditionName);
  }

  addTask<
    TN extends string,
    P extends Omit<TaskNode, 'name'>,
    X extends P['splitType'] extends 'or' | 'xor' ? TN : never
  >(taskName: TN & NotExtends<BNTasks | BNConditions, TN>, props: P) {
    const task: TaskNode = { name: taskName, ...props };
    const newTasks = R.merge(this.net.tasks, {
      [taskName]: task,
    });

    return this.copyWithExtendedNet<
      Builder<
        Context,
        BNTasks | TN,
        BNConditions,
        BNCancellationRegions,
        BNTasksWithOrXorSplit | X
      >
    >({
      tasks: newTasks,
    });
  }

  addCancellationRegion<
    TN extends BNTasks,
    TNS extends Exclude<BNTasks, TN>[],
    CNS extends BNConditions[]
  >(
    taskName: TN & NotExtends<BNCancellationRegions, TN> & string,
    toCancel: { tasks?: TNS; conditions?: CNS }
  ) {
    const newCancellationRegions = R.merge(this.net.cancellationRegions, {
      [taskName]: toCancel,
    });

    return this.copyWithExtendedNet<
      Builder<
        Context,
        BNTasks | TN,
        BNConditions,
        BNCancellationRegions | TN,
        BNTasksWithOrXorSplit
      >
    >({
      cancellationRegions: newCancellationRegions,
    });
  }

  connectConditionToTask<CN extends BNConditions, TN extends BNTasks>(
    conditionNameFrom: CN & string,
    taskNameTo: TN & string
  ) {
    return this.connectUnsafe(conditionNameFrom, taskNameTo, 'condition->task');
  }

  connectTaskToCondition<
    TN extends BNTasks,
    CN extends BNConditions,
    S extends BNTasksWithOrXorSplit extends 'or' | 'xor' ? true : false,
    P extends S extends true
      ? XOR<FlowProps<PredicateFlow<Context>>, FlowProps<DefaultFlow>>
      : FlowProps<Flow>
  >(
    taskNameFrom: TN & string,
    conditionNameTo: CN & string,
    ...args: S extends true ? [P] : [P?]
  ) {
    return this.connectUnsafe(
      taskNameFrom,
      conditionNameTo,
      'task->condition',
      args[0]
    );
  }

  connectTaskToTask<
    TN1 extends BNTasks,
    TN2 extends BNTasks,
    S extends TN1 extends BNTasksWithOrXorSplit ? true : false,
    P extends S extends true
      ? XOR<FlowProps<PredicateFlow<Context>>, FlowProps<DefaultFlow>>
      : FlowProps<Flow>
  >(
    taskNameFrom: TN1 & string,
    taskNameTo: TN2 & string,
    ...args: S extends true ? [P] : [P?]
  ) {
    const implicitConditionName: ImplicitConditionName<
      TN1 & string,
      TN2 & string
    > = `implicit:${taskNameFrom}->${taskNameTo}`;

    return this.addConditionUnsafe<
      Builder<
        Context,
        BNTasks,
        BNConditions | ImplicitConditionName<TN1 & string, TN2 & string>,
        BNCancellationRegions,
        BNTasksWithOrXorSplit
      >
    >(implicitConditionName, { isImplicit: true })
      .connectUnsafe(
        taskNameFrom,
        implicitConditionName,
        'task->condition',
        args[0]
      )
      .connectUnsafe(implicitConditionName, taskNameTo, 'condition->task');
  }
  toDot() {
    const g = new Digraph({ [_.rankdir]: 'LR', [_.splines]: 'polyline' });
    const conditionNodes: Record<string, Node> = {};
    const taskNodes: Record<string, Node> = {};
    Object.values(this.net.tasks).forEach((task) => {
      const join =
        task.joinType === 'and'
          ? '⍄'
          : task.joinType === 'xor'
          ? '⍃'
          : task.joinType === 'or'
          ? '⌺'
          : '';
      const split =
        task.splitType === 'and'
          ? '⍃'
          : task.splitType === 'xor'
          ? '⍄'
          : task.splitType === 'or'
          ? '⌺'
          : '';
      const label = [
        '<table border="1" cellborder="0" cellspacing="0" cellpadding="4"><tr>',
      ];
      if (join.length) {
        label.push(`<td fontsize="26">${join}</td>`);
      }
      label.push(`<td>${task.name}</td>`);
      if (split.length) {
        label.push(`<td>${split}</td>`);
      }
      label.push('</tr></table>');

      const node = new Node(task.name, {
        [_.shape]: 'plaintext',
        [_.margin]: 0,
        [_.label]: `<${label.join('')}>`,
      });
      taskNodes[task.name] = node;
      g.addNode(node);
    });
    Object.values(this.net.conditions).forEach((condition) => {
      if (!condition.isImplicit) {
        const label =
          condition.name === this.net.startCondition
            ? '▶'
            : condition.name === this.net.endCondition
            ? '■'
            : '';
        const props: NodeAttributesObject = {
          [_.label]: label,
          [_.shape]: 'circle',
          [_.width]: 0.5,
          [_.height]: 0.5,
          [_.fixedsize]: true,
        };

        if (label === '■') {
          props[_.fontsize] = 26;
        }

        const node = new Node(condition.name, props);
        conditionNodes[condition.name] = node;
        g.addNode(node);
      }
    });
    Object.entries(this.net.flows.tasks).forEach(([task, flows]) => {
      Object.keys(flows).forEach((conditionName) => {
        const condition = this.net.conditions[conditionName];
        if (condition.isImplicit) {
          const targetTaskName = Array.from(
            this.net.flows.conditions[conditionName]
          )[0];
          if (targetTaskName) {
            const e = new Edge([taskNodes[task], taskNodes[targetTaskName]]);
            g.addEdge(e);
          }
        } else {
          const e = new Edge([taskNodes[task], conditionNodes[conditionName]]);
          g.addEdge(e);
        }
      });
    });
    Object.entries(this.net.flows.conditions).forEach(
      ([conditionName, tasks]) => {
        if (!this.net.conditions[conditionName].isImplicit) {
          tasks.forEach((task) => {
            const e = new Edge([
              conditionNodes[conditionName],
              taskNodes[task],
            ]);
            g.addEdge(e);
          });
        }
      }
    );
    return toDot(g);
  }
  toNet() {
    const incomingFlows: Net['incomingFlows'] = { tasks: {}, conditions: {} };

    Object.entries(this.net.flows.tasks).forEach(([task, flows]) => {
      Object.entries(flows).forEach(([condition]) => {
        const incoming =
          incomingFlows.conditions[condition] ?? new Set<string>();
        incoming.add(task);
        incomingFlows.conditions[condition] = incoming;
      });
    });

    Object.entries(this.net.flows.conditions).forEach(([condition, flows]) => {
      for (const task of flows.values()) {
        const incoming = incomingFlows.tasks[task] ?? new Set<string>();
        incoming.add(condition);
        incomingFlows.tasks[task] = incoming;
      }
    });
    return { ...this.net, incomingFlows } as Net;
  }
  buildInterpreter(context: Context) {
    return new Interpreter<Context, BNTasks>(this.toNet(), context);
  }
}
