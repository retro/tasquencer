import { setTimeout, clearTimeout } from "timers";
// Base classes for YAWL elements
abstract class YAWLElement {
  id: string;

  constructor(id: string) {
    this.id = id;
  }
}

abstract class FlowElement extends YAWLElement {
  inputs = new Set<Condition>();
  outputs = new Set<Condition>();

  addInput(condition: Condition): void {
    this.inputs.add(condition);
  }

  addOutput(condition: Condition): void {
    this.outputs.add(condition);
  }
}

// Condition class
export class Condition extends FlowElement {}

// Task class and its specialized classes
export abstract class Task extends FlowElement {
  joinType: JoinType;
  splitType: SplitType;
  resetNet: boolean;
  resetCondition: Condition | null;
  cancellationSet: CancellationSet = new CancellationSet();
  multipleInstance: boolean;
  timeOut: number | null;
  deadline: Date | null;
  instances: number;

  constructor(
    id: string,
    joinType: JoinType,
    splitType: SplitType,
    resetNet: boolean,
    resetCondition: Condition | null,
    multipleInstance: boolean,
    timeOut: number | null,
    deadline: Date | null,
    instances: number
  ) {
    super(id);
    this.joinType = joinType;
    this.splitType = splitType;
    this.resetNet = resetNet;
    this.resetCondition = resetCondition;
    this.multipleInstance = multipleInstance;
    this.timeOut = timeOut;
    this.deadline = deadline;
    this.instances = instances;
  }
}

export class AtomicTask extends Task {}

export class CompositeTask extends Task {
  subNet: YAWLNet;

  constructor(
    id: string,
    joinType: JoinType,
    splitType: SplitType,
    resetNet: boolean,
    multipleInstance: boolean,
    timeOut: number | null,
    deadline: Date | null,
    instances: number,
    subNet: YAWLNet
  ) {
    super(
      id,
      joinType,
      splitType,
      resetNet,
      multipleInstance,
      timeOut,
      deadline,
      instances
    );
    this.subNet = subNet;
  }
}

// Split and Join types
export enum JoinType {
  AND,
  OR,
  XOR,
}

export enum SplitType {
  AND,
  OR,
  XOR,
}

export class CancellationSet {
  tasks = new Set<Task>();
  regions = new Set<CancellationRegion>();
}

export class CancellationRegion {
  tasks = new Set<Task>();
}

// YAWL net class
export class YAWLNet {
  conditions = new Map<string, Condition>();
  tasks = new Map<string, Task>();

  addCondition(condition: Condition): void {
    this.conditions.set(condition.id, condition);
  }

  addTask(task: Task): void {
    this.tasks.set(task.id, task);
  }
}

// Add ResetNet class
export class ResetNet extends YAWLNet {
  resetCondition: Condition | null = null;
}

// YAWL interpreter class
export class YAWLInterpreter {
  yawlNet: YAWLNet;
  enabledTasks = new Set<AtomicTask>();
  markedConditions = new Set<Condition>();
  activeTaskInstances = new Map<Task, number>();
  taskTimeouts = new Map<Task, NodeJS.Timeout>();
  taskDeadlines = new Map<Task, NodeJS.Timeout>();

  constructor(yawlNet: YAWLNet) {
    this.yawlNet = yawlNet;
  }

  start(): void {
    const startConditions = Array.from(this.yawlNet.conditions.values()).filter(
      (condition) => condition.inputs.size === 0
    );

    for (const condition of startConditions) {
      this.markedConditions.add(condition);
    }

    this.evaluateEnabledTasks();
  }

  evaluateEnabledTasks(): void {
    for (const task of this.yawlNet.tasks.values()) {
      console.log(task.id, this.isTaskEnabled(task));
      if (this.isTaskEnabled(task)) {
        this.enabledTasks.add(task as AtomicTask);
        this.activeTaskInstances.set(task, task.instances);
        this.scheduleTaskTimeouts(task);
        this.scheduleTaskDeadlines(task);
      }
    }
  }

  isTaskEnabled(task: Task): boolean {
    if (task.joinType === JoinType.XOR && task.resetNet) {
      console.log(">>>>>>>>>>>>>", task.id);
      return this.isResetNetXORJoinEnabled(task);
    }

    switch (task.joinType) {
      case JoinType.AND:
        return this.isANDJoinEnabled(task);
      case JoinType.OR:
        return this.isORJoinEnabled(task);
      case JoinType.XOR:
        return this.isXORJoinEnabled(task);
      default:
        throw new Error(`Unsupported join type: ${task.joinType}`);
    }
  }

  isResetNetXORJoinEnabled(task: Task): boolean {
    // At least one input condition must be marked
    const hasMarkedInputCondition = Array.from(task.inputs).some((condition) =>
      this.markedConditions.has(condition)
    );

    // Check if the reset condition is marked
    const hasMarkedResetCondition = task.resetCondition
      ? this.markedConditions.has(task.resetCondition)
      : false;

    console.log(
      "HAS MARKED RESET CONDITION",
      this.markedConditions,
      hasMarkedResetCondition
    );

    // If the reset condition is marked, the task is not enabled
    if (hasMarkedResetCondition) {
      return false;
    }

    // The task is enabled if at least one input condition is marked and the reset condition is not marked
    return hasMarkedInputCondition;
  }

  isANDJoinEnabled(task: Task): boolean {
    return Array.from(task.inputs).every((condition) =>
      this.markedConditions.has(condition)
    );
  }

  isORJoinEnabled(task: Task): boolean {
    return Array.from(task.inputs).some((condition) =>
      this.markedConditions.has(condition)
    );
  }

  isXORJoinEnabled(task: Task): boolean {
    return (
      Array.from(task.inputs).filter((condition) =>
        this.markedConditions.has(condition)
      ).length === 1
    );
  }

  completeTask(
    taskId: string,
    chosenOutput?: string,
    currentTime: Date = new Date()
  ): void {
    const task = this.yawlNet.tasks.get(taskId) as Task;

    if (!this.enabledTasks.has(task as AtomicTask)) {
      throw new Error(`Task not enabled ${task.id}`);
    }

    if (!task.multipleInstance) {
      if (task.resetNet) {
        const resetCondition = Array.from(task.inputs).find(
          (condition) => condition.id === "C5"
        );
        if (resetCondition) {
          this.markedConditions.delete(resetCondition);
        }
      }
      this.enabledTasks.delete(task as AtomicTask);
    }

    // Check if the task is a composite task and execute its subnet
    if (task instanceof CompositeTask) {
      this.executeCompositeTask(task);
    }

    const conditionsToEvaluate = new Set<Condition>();

    switch (task.splitType) {
      case SplitType.AND:
        for (const condition of task.outputs) {
          conditionsToEvaluate.add(condition);
        }
        break;
      case SplitType.OR:
        this.getOutputConditionsForOR(task, chosenOutput, conditionsToEvaluate);
        break;
      case SplitType.XOR:
        this.getOutputConditionsForXOR(
          task,
          chosenOutput,
          conditionsToEvaluate
        );
        break;
    }

    for (const inputCondition of task.inputs) {
      this.markedConditions.delete(inputCondition);
    }

    // Cancel tasks and reset subnets if necessary
    this.cancelTasksAndResetSubnets(task);

    this.evaluateConditions(conditionsToEvaluate);
  }

  executeCompositeTask(task: CompositeTask): void {
    const subnetInterpreter = new YAWLInterpreter(task.subNet);
    subnetInterpreter.start();

    // You can listen for events or poll the subnetInterpreter to find out
    // when it completes, or use any other method based on your specific requirements
    // to know when the composite task's subnet has completed execution
  }

  private getOutputConditionsForOR(
    task: Task,
    chosenOutput: string | undefined,
    conditionsToEvaluate: Set<Condition>
  ): void {
    if (!chosenOutput) {
      throw new Error("Chosen output is required for OR-split");
    }

    const chosenCondition = Array.from(task.outputs).find(
      (condition) => condition.id === chosenOutput
    );

    if (!chosenCondition) {
      throw new Error("Invalid chosen output");
    }

    conditionsToEvaluate.add(chosenCondition);
  }

  private getOutputConditionsForXOR(
    task: Task,
    chosenOutput: string | undefined,
    conditionsToEvaluate: Set<Condition>
  ): void {
    if (!chosenOutput) {
      throw new Error("Chosen output is required for XOR-split");
    }

    const chosenCondition = Array.from(task.outputs).find(
      (condition) => condition.id === chosenOutput
    );

    if (!chosenCondition) {
      throw new Error("Invalid chosen output");
    }

    conditionsToEvaluate.add(chosenCondition);
  }

  isEndCondition(condition: Condition): boolean {
    if (condition.outputs.size === 0) {
      // Iterate through all tasks in the YAWL net
      for (const task of this.yawlNet.tasks.values()) {
        // Check if the condition is an output of any task
        if (task.outputs.has(condition)) {
          // Iterate through all tasks again to check if there's a task that has the current task as an input
          let isTaskConnectedToAnotherTask = false;
          for (const otherTask of this.yawlNet.tasks.values()) {
            if (otherTask.inputs.has(condition)) {
              isTaskConnectedToAnotherTask = true;
              break;
            }
          }
          // If no task has the current task as an input, the condition is an end condition
          if (!isTaskConnectedToAnotherTask) {
            return true;
          }
        }
      }
    }
    return false;
  }

  evaluateConditions(conditionsToEvaluate: Set<Condition>): void {
    for (const condition of conditionsToEvaluate) {
      this.markedConditions.add(condition);

      if (this.isEndCondition(condition)) {
        console.log(`End condition reached: ${condition.id}`);
        // Perform any additional actions you need when the end condition is reached
      }
    }

    this.evaluateEnabledTasks();
  }

  cancelTasksAndResetSubnets(task: Task): void {
    for (const element of task.cancellationSet.tasks) {
      this.cancelTask(element);
    }

    for (const element of task.cancellationSet.regions) {
      for (const innerElement of element.tasks) {
        this.cancelTask(innerElement);
      }
    }
  }

  scheduleTaskTimeouts(task: Task): void {
    if (task.timeOut !== null) {
      const timeout = setTimeout(() => {
        this.cancelTask(task);
        console.log(`Task ${task.id} timed out.`);
        const currentTime = new Date();
        for (const enabledTask of this.enabledTasks) {
          if (enabledTask.timeOut !== null && enabledTask.deadline !== null) {
            const elapsedTime =
              currentTime.getTime() - enabledTask.deadline.getTime();
            if (elapsedTime >= enabledTask.timeOut) {
              this.cancelTask(enabledTask);
            }
          }
        }
      }, task.timeOut);
      this.taskTimeouts.set(task, timeout);
    }
  }

  scheduleTaskDeadlines(task: Task): void {
    if (task.deadline !== null) {
      const deadline = setTimeout(() => {
        this.cancelTask(task);
        console.log(`Task ${task.id} deadline reached.`);
        const currentTime = new Date();
        for (const enabledTask of this.enabledTasks) {
          if (enabledTask.timeOut !== null && enabledTask.deadline !== null) {
            const elapsedTime =
              currentTime.getTime() - enabledTask.deadline.getTime();
            if (elapsedTime >= enabledTask.timeOut) {
              this.cancelTask(enabledTask);
            }
          }
        }
      }, task.deadline.getTime() - new Date().getTime());
      this.taskDeadlines.set(task, deadline);
    }
  }

  resetSubnet(compositeTask: CompositeTask): void {
    const subnetInterpreter = new YAWLInterpreter(compositeTask.subNet);
    subnetInterpreter.reset();
  }

  cancelTask(task: Task): void {
    this.enabledTasks.delete(task as AtomicTask);
    this.activeTaskInstances.delete(task);
    if (this.taskTimeouts.has(task)) {
      clearTimeout(this.taskTimeouts.get(task));
      this.taskTimeouts.delete(task);
    }
    if (this.taskDeadlines.has(task)) {
      clearTimeout(this.taskDeadlines.get(task));
      this.taskDeadlines.delete(task);
    }

    // Cancel tasks and reset subnets if necessary
    this.cancelTasksAndResetSubnets(task);
  }

  reset(): void {
    this.enabledTasks.clear();
    this.markedConditions.clear();
    this.activeTaskInstances.clear();
    this.taskTimeouts.clear();
    this.taskDeadlines.clear();

    this.start();
  }
}

export class YAWLNetBuilder {
  private yawlNet: YAWLNet;

  constructor() {
    this.yawlNet = new YAWLNet();
  }

  addCondition(id: string): this {
    const condition = new Condition(id);
    this.yawlNet.addCondition(condition);
    return this;
  }

  addAtomicTask(
    id: string,
    joinType: JoinType,
    splitType: SplitType,
    resetNet: boolean,
    resetConditionId: string | null,
    multipleInstance: boolean,
    timeOut: number | null,
    deadline: Date | null,
    instances: number
  ): this {
    const resetCondition =
      resetConditionId !== null
        ? this.yawlNet.conditions.get(resetConditionId) || null
        : null;

    const task = new AtomicTask(
      id,
      joinType,
      splitType,
      resetNet,
      resetCondition,
      multipleInstance,
      timeOut,
      deadline,
      instances
    );
    this.yawlNet.addTask(task);
    return this;
  }
  addCompositeTask(
    id: string,
    joinType: JoinType,
    splitType: SplitType,
    resetNet: boolean,
    multipleInstance: boolean,
    timeOut: number | null,
    deadline: Date | null,
    instances: number,
    subNet: YAWLNet
  ): this {
    const task = new CompositeTask(
      id,
      joinType,
      splitType,
      resetNet,
      multipleInstance,
      timeOut,
      deadline,
      instances,
      subNet
    );
    this.yawlNet.addTask(task);
    return this;
  }

  connectElements(fromId: string, toId: string): this {
    const fromElement = this.getElement(fromId);
    const toElement = this.getElement(toId);

    if (
      fromElement instanceof FlowElement &&
      toElement instanceof FlowElement
    ) {
      fromElement.addOutput(toElement as Condition);
      toElement.addInput(fromElement as Condition);
    } else {
      throw new Error(
        `Invalid connection between elements: ${fromId} -> ${toId}`
      );
    }

    return this;
  }

  addTaskToCancellationSet(taskId: string, cancelTaskId: string): this {
    const task = this.yawlNet.tasks.get(taskId);
    const cancelTask = this.yawlNet.tasks.get(cancelTaskId);

    if (task && cancelTask) {
      task.cancellationSet.tasks.add(cancelTask);
    } else {
      throw new Error("Invalid task IDs for cancellation set");
    }

    return this;
  }

  addTaskToCancellationRegion(
    taskId: string,
    region: CancellationRegion
  ): this {
    const task = this.yawlNet.tasks.get(taskId);

    if (task) {
      region.tasks.add(task);
    } else {
      throw new Error("Invalid task ID for cancellation region");
    }

    return this;
  }

  addCancellationRegionToTask(
    taskId: string,
    region: CancellationRegion
  ): this {
    const task = this.yawlNet.tasks.get(taskId);

    if (task) {
      task.cancellationSet.regions.add(region);
    } else {
      throw new Error("Invalid task ID for adding cancellation region");
    }

    return this;
  }

  buildResetNet(resetConditionId: string): ResetNet {
    const resetNet = new ResetNet();
    resetNet.conditions = this.yawlNet.conditions;
    resetNet.tasks = this.yawlNet.tasks;
    resetNet.resetCondition = resetNet.conditions.get(resetConditionId) ?? null;
    return resetNet;
  }

  build(): YAWLNet {
    return this.yawlNet;
  }
  private getElement(id: string): FlowElement | undefined {
    const element =
      this.yawlNet.conditions.get(id) ?? this.yawlNet.tasks.get(id);
    return element;
  }
}
