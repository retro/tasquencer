import util from "node:util";
import * as R from "remeda";
import {
  attribute as _,
  Digraph,
  Subgraph,
  Node,
  Edge,
  toDot,
} from "ts-graphviz";

export function foo() {
  return "a";
}

export type Prettify<T> = {
  [K in keyof T]: T[K];
} & object;

type Without<T, U> = {
  [P in Exclude<keyof T, keyof U>]?: never;
};

type XOR<T, U> = T | U extends object
  ? Prettify<Without<T, U> & U> | Prettify<Without<U, T> & T>
  : T | U;

interface Condition {
  name: string;
  isImplicit?: boolean;
}

type SplitType = "and" | "or" | "xor";
type JoinType = "and" | "xor";

interface Task {
  name: string;
  splitType?: SplitType;
  joinType?: JoinType;
}

type CancellationRegion = string[];

type RemoveIndex<T> = {
  [K in keyof T as string extends K
    ? never
    : number extends K
    ? never
    : K]: T[K];
};

type KnownKeys<T> = keyof RemoveIndex<T>;

export type Identity<T> = T extends object
  ? {
      [P in keyof T]: Identity<T[P]>;
    }
  : T;

export type KnownIdentity<T> = T extends object
  ? {
      [P in KnownKeys<T>]: KnownIdentity<T[P]>;
    }
  : T;

type FlowType = "task->condition" | "condition->task";

interface Flow {
  predicate?: (context: unknown, net: BuilderNet) => boolean;
  order?: number;
  isDefault?: true;
}

interface PredicateFlow<Context> {
  order: number;
  predicate: (context: Context, net: BuilderNet) => boolean;
}

interface DefaultFlow {
  isDefault: true;
}

type FlowProps<T> = Omit<T, "from" | "to" | "type">;

interface BuilderNet {
  startCondition?: string;
  endCondition?: string;
  conditions: Record<string, Condition>;
  tasks: Record<string, Task>;
  cancellationRegions: Record<string, CancellationRegion>;
  flows: {
    tasks: Record<string, Record<string, Flow>>;
    conditions: Record<string, Set<string>>;
  };
}

type ImplicitConditionName<
  N1 extends string,
  N2 extends string
> = `implicit:${N1}->${N2}`;

type NotExtends<NS, N> = N extends NS ? never : N;

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
    props?: Omit<Condition, "name">
  ): T {
    const condition: Condition = { name: conditionName, ...props };
    const newConditions = R.merge(this.net.conditions, {
      [conditionName]: condition,
    });

    return this.copyWithExtendedNet<T>({
      conditions: newConditions,
    });
  }

  private connectUnsafe(
    from: string,
    to: string,
    type: FlowType,
    props?: object
  ) {
    const flows = this.net.flows;

    if (type === "condition->task") {
      const flowsFromConditions = flows.conditions;
      const flowsFromCondition =
        from in flowsFromConditions
          ? flowsFromConditions[from]
          : new Set<string>();
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
    P extends Omit<Task, "name">,
    X extends P["splitType"] extends "or" | "xor" ? TN : never
  >(taskName: TN & NotExtends<BNTasks | BNConditions, TN>, props: P) {
    const task: Task = { name: taskName, ...props };
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
    NS extends (Exclude<BNTasks, TN> | BNConditions)[]
  >(
    taskName: TN & NotExtends<BNCancellationRegions, TN> & string,
    namesToCancel: NS
  ) {
    const newCancellationRegions = R.merge(this.net.cancellationRegions, {
      [taskName]: namesToCancel,
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
    return this.connectUnsafe(conditionNameFrom, taskNameTo, "condition->task");
  }

  connectTaskToCondition<
    TN extends BNTasks,
    CN extends BNConditions,
    S extends BNTasksWithOrXorSplit extends "or" | "xor" ? true : false,
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
      "task->condition",
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
        "task->condition",
        args[0]
      )
      .connectUnsafe(implicitConditionName, taskNameTo, "condition->task");
  }
  toDot() {
    const g = new Digraph({ [_.rankdir]: "LR" });
    const conditionNodes: Record<string, Node> = {};
    const taskNodes: Record<string, Node> = {};
    Object.values(this.net.tasks).forEach((task) => {
      const join =
        task.joinType === "and" ? "▷" : task.joinType === "xor" ? "◁" : "";
      const split =
        task.splitType === "and"
          ? "▷"
          : task.splitType === "xor"
          ? "◁"
          : task.splitType === "or"
          ? "◊"
          : "";
      const label = [
        '<table border="0" cellborder="1" cellspacing="0" cellpadding="4"><tr>',
      ];
      if (join.length) {
        label.push(`<td>${join}</td>`);
      }
      label.push(`<td>${task.name}</td>`);
      if (split.length) {
        label.push(`<td>${split}</td>`);
      }
      label.push("</tr></table>");

      const node = new Node(task.name, {
        [_.shape]: "plaintext",
        [_.margin]: 0,
        [_.label]: `<${label.join("")}>`,
      });
      taskNodes[task.name] = node;
      g.addNode(node);
    });
    Object.values(this.net.conditions).forEach((condition) => {
      if (!condition.isImplicit) {
        const label =
          condition.name === this.net.startCondition
            ? "▶"
            : condition.name === this.net.endCondition
            ? "■"
            : "";
        const node = new Node(condition.name, {
          [_.label]: label,
          [_.shape]: "circle",
          [_.width]: 0.5,
          [_.height]: 0.5,
          [_.fixedsize]: true,
        });
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
}

const builder = new Builder<{ foo?: string }>();

const net = builder
  .addStartCondition("start")
  .addEndCondition("end")
  .addTask("scan_goods", {})
  .addTask("pay", { splitType: "and" })
  .addTask("pack_goods", {})
  .addTask("issue_receipt", {})
  .addTask("check_goods", { joinType: "and" })
  .connectConditionToTask("start", "scan_goods")
  .connectTaskToTask("scan_goods", "pay")
  .connectTaskToTask("pay", "pack_goods")
  .connectTaskToTask("pay", "issue_receipt")
  .connectTaskToTask("pack_goods", "check_goods")
  .connectTaskToTask("issue_receipt", "check_goods")
  .connectTaskToCondition("check_goods", "end");

console.log(
  util.inspect(net, { showHidden: false, depth: null, colors: true })
);

console.log(net.toDot());
