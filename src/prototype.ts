import { v4 as uuidv4 } from 'uuid';

interface TaskDefinition {
  id: string;
  name: string;
  joinType?: 'and' | 'or' | 'xor';
  splitType?: 'and' | 'or' | 'xor';
  timeout?: number;
  deadline?: Date;
  allowMultipleInstances?: boolean;
  cancellationSet?: string[];
  cancellationRegion?: string;
  gatewayType?: 'event' | null;
  events?: EventDefinition[];
  resetSet?: string[];
}

interface SubWorkflowDefinition {
  id: string;
  name: string;
  subWorkflow: WorkflowDefinition;
  joinType?: 'and' | 'or' | 'xor';
  splitType?: 'and' | 'or' | 'xor';
  allowMultipleInstances?: boolean;
  timeout?: number;
  deadline?: Date;
  cancellationSet?: string[];
  cancellationRegion?: string;
}

interface SequenceFlowDefinition {
  id: string;
  source: string;
  target: string;
  condition?: string;
}

interface WorkflowDefinition {
  tasks: (TaskDefinition | SubWorkflowDefinition)[];
  sequenceFlows: SequenceFlowDefinition[];
  endEvents: string[];
  startEvents: string[];
}

interface EventDefinition {
  id: string;
  eventType: 'timer' | 'message' | 'signal' | 'error';
  eventCondition: string;
}

interface Context {
  [key: string]: any;
}

class EndEvent {
  id: string;

  constructor(id: string) {
    this.id = id;
  }
}

class Condition {
  constructor(private expression: string) {}

  evaluate(context: Context): boolean {
    return new Function('context', `return ${this.expression};`)(context);
  }
}

class SequenceFlow {
  id: string;
  condition: Condition | null;

  constructor(
    id: string,
    public source: string,
    public target: string,
    condition?: string
  ) {
    this.id = id;
    this.condition = condition ? new Condition(condition) : null;
  }

  execute(context: Context): boolean {
    if (this.condition === null || this.condition.evaluate(context)) {
      return true;
    }
    return false;
  }
}

class Task {
  incomingFlows: number = 0;
  timeout: number | null;
  deadline: Date | null;
  instanceId: number;
  cancellationSet: string[];
  cancellationRegion: string | null;
  canceled: boolean = false;
  allowMultipleInstances: boolean = false;
  incomingTokens: Map<string, boolean> = new Map();
  resetSet?: string[];

  constructor(
    public id: string,
    public name: string,
    public joinType: 'and' | 'or' | 'xor' = 'and',
    public splitType: 'and' | 'or' | 'xor' = 'and',
    instanceId: number,
    timeout?: number | null,
    deadline?: Date | null,
    cancellationSet?: string[],
    cancellationRegion?: string,
    resetSet?: string[],
    allowMultipleInstances?: boolean
  ) {
    this.timeout = timeout || null;
    this.deadline = deadline || null;
    this.instanceId = instanceId;
    this.cancellationSet = cancellationSet ?? [];
    this.cancellationRegion = cancellationRegion ?? null;
    this.resetSet = resetSet ?? [];
    this.allowMultipleInstances = allowMultipleInstances ?? false;
  }

  createNewInstance(instanceId: number): Task {
    return new Task(
      this.id,
      this.name,
      this.joinType,
      this.splitType,
      instanceId,
      this.timeout,
      this.deadline,
      this.cancellationSet
    );
  }

  // Add onTimeout method
  onTimeout(): void {
    console.log(`Task ${this.name} timed out.`);
    // Handle task timeout logic here, e.g., move to the next task or cancel the task
  }

  onFinished(interpreter: YAWLInterpreter): void {
    console.log(`Task ${this.name} finished.`);
    this.resetTasks(interpreter);
    this.cancelTasks(interpreter);
  }

  cancelTasks(interpreter: YAWLInterpreter): void {
    if (this.cancellationRegion) {
      interpreter.cancelTasksInRegion(this.cancellationRegion);
    } else {
      this.cancellationSet.forEach((taskId) => {
        const taskToCancel = interpreter.tasks.get(taskId);
        if (taskToCancel) {
          taskToCancel.cancel(interpreter);
        }
      });
    }
  }

  cancel(interpreter: YAWLInterpreter): void {
    if (!this.canceled) {
      console.log(`Task ${this.name} has been canceled.`);
      this.canceled = true;
    }
  }

  // Add resetTasks method in Task class
  resetTasks(interpreter: YAWLInterpreter): void {
    this.resetSet?.forEach((taskId) => {
      const taskToReset = interpreter.tasks.get(taskId);
      if (taskToReset) {
        taskToReset.reset(interpreter);
      }
    });
  }

  // Add reset method in Task class
  reset(interpreter: YAWLInterpreter): void {
    this.incomingTokens.forEach((_value, key) => {
      this.incomingTokens.set(key, false);
    });
    interpreter.visitedTasks.delete(this.id);
  }

  addIncomingFlow(flowId: string): void {
    this.incomingFlows++;
    this.incomingTokens.set(flowId, false);
  }

  completeIncomingFlow(flowId: string): void {
    this.incomingTokens.set(flowId, true);
  }

  canExecute(): boolean {
    const completedTokens = Array.from(this.incomingTokens.values()).filter(
      (token) => token
    ).length;

    if (this.joinType === 'xor') {
      return completedTokens === 1;
    } else if (this.joinType === 'or') {
      return completedTokens > 0;
    } else {
      return completedTokens === this.incomingFlows;
    }
  }

  async execute(context: Context): Promise<void> {
    console.log(`Executing task ${this.name}`);
    // Add asynchronous task logic here
    await new Promise((resolve) => setTimeout(resolve, 1000)); // Example: wait for 1 second
    console.log(`Finished task ${this.name}`);
  }
}

class SubWorkflowTask extends Task {
  constructor(
    id: string,
    name: string,
    public subWorkflow: YAWLInterpreter,
    joinType: 'and' | 'or' | 'xor' = 'and',
    splitType: 'and' | 'or' | 'xor' = 'and',
    instanceId: number,
    timeout?: number,
    deadline?: Date,
    cancellationSet?: string[],
    cancellationRegion?: string,
    allowMultipleInstances?: boolean
  ) {
    super(
      id,
      name,
      joinType,
      splitType,
      instanceId,
      timeout,
      deadline,
      cancellationSet ?? [],
      cancellationRegion,
      undefined,
      allowMultipleInstances
    );
  }

  async execute(context: Context): Promise<void> {
    console.log(`Executing sub-workflow ${this.name}`);
    await this.subWorkflow.start([], context);
    console.log(`Finished sub-workflow ${this.name}`);
  }

  cancel(interpreter: YAWLInterpreter): void {
    if (!this.canceled) {
      console.log(`Sub-workflow ${this.name} has been canceled.`);
      this.canceled = true;
      this.subWorkflow.cancelAllTasks();
    }
  }
}

class EventGatewayTask extends Task {
  events: EventDefinition[];
  interpreter: YAWLInterpreter;

  constructor(
    id: string,
    name: string,
    events: EventDefinition[],
    joinType: 'and' | 'or' | 'xor' = 'and',
    splitType: 'and' | 'or' | 'xor' = 'and',
    instanceId: number,
    interpreter: YAWLInterpreter
  ) {
    super(id, name, joinType, splitType, instanceId);
    this.events = events;
    this.interpreter = interpreter;
  }

  async execute(context: Context): Promise<void> {
    console.log(`Executing event-based gateway ${this.name}`);

    const eventPromises = this.events.map((event) =>
      this.handleEvent(event, context)
    );
    await Promise.race(eventPromises);

    console.log(`Finished event-based gateway ${this.name}`);
  }

  async handleIncomingEvent(
    event: EventDefinition,
    context: Context
  ): Promise<void> {
    const matchingEvent = this.events.find((e) => e.id === event.id);
    if (matchingEvent) {
      await this.handleEvent(matchingEvent, context);
    }
  }

  async handleEvent(event: EventDefinition, context: Context): Promise<void> {
    // Handle different event types, e.g., "timer", "message", "signal", "error"
    // and evaluate event conditions
    // ...

    // If the event condition is met, execute the corresponding outgoing sequence flow
    const outgoingFlows = this.interpreter.sequenceFlows.get(event.id) || [];
    // ...

    for (const flow of outgoingFlows) {
      const targetTask = this.interpreter.tasks.get(flow.target);
      const promise = this.interpreter.handleTaskFlow(
        targetTask,
        context,
        flow
      );
      await promise;
    }
  }
}

class CompositeTask extends Task {
  childTasks: Task[];

  constructor(
    id: string,
    name: string,
    childTasks: Task[],
    joinType: 'and' | 'or' | 'xor' = 'and',
    splitType: 'and' | 'or' | 'xor' = 'and',
    instanceId: number,
    timeout?: number,
    deadline?: Date,
    cancellationSet?: string[],
    cancellationRegion?: string,
    allowMultipleInstances?: boolean
  ) {
    super(
      id,
      name,
      joinType,
      splitType,
      instanceId,
      timeout,
      deadline,
      cancellationSet ?? [],
      cancellationRegion,
      undefined,
      allowMultipleInstances
    );
    this.childTasks = childTasks;
  }

  async execute(context: Context): Promise<void> {
    console.log(`Executing composite task ${this.name}`);
    const executionPromises = this.childTasks.map((childTask) =>
      childTask.execute(context)
    );
    await Promise.allSettled(executionPromises);
    log(`Finished composite task ${this.name}`);
  }
}

class YAWLInterpreter {
  tasks: Map<string, Task> = new Map();
  sequenceFlows: Map<string, SequenceFlow[]> = new Map();
  visitedTasks: Set<string> = new Set();
  context: Context;
  endEvents: Set<string> = new Set();
  startEvents: Set<string> = new Set();

  constructor(workflowDefinition: WorkflowDefinition, context?: Context) {
    this.context = context || {};
    this.loadWorkflow(workflowDefinition);
  }

  loadWorkflow(workflowDefinition: WorkflowDefinition): void {
    // Process tasks and sub-workflows
    for (const taskDef of workflowDefinition.tasks) {
      if (taskDef.gatewayType === 'event') {
        const task = new EventGatewayTask(
          taskDef.id,
          taskDef.name,
          taskDef.events,
          taskDef.joinType,
          taskDef.splitType,
          0, // Provide instanceId,
          this
        );
        this.tasks.set(taskDef.id, task);
      } else if ('subWorkflow' in taskDef) {
        const task = new SubWorkflowTask(
          taskDef.id,
          taskDef.name,
          new YAWLInterpreter(taskDef.subWorkflow),
          taskDef.joinType,
          taskDef.splitType,
          0, // Provide instanceId
          taskDef.timeout,
          taskDef.deadline,
          taskDef.cancellationSet
        );
        this.tasks.set(taskDef.id, task);
      } else if (taskDef instanceof CompositeTask) {
        const childTasks = taskDef.childTasks.map((childTaskDef) => {
          return new Task(
            uuidv4(),
            childTaskDef.name,
            childTaskDef.joinType,
            childTaskDef.splitType,
            0,
            childTaskDef.timeout,
            childTaskDef.deadline,
            childTaskDef.cancellationSet,
            childTaskDef.cancellationRegion ?? undefined,
            childTaskDef.resetSet
          );
        });

        const task = new CompositeTask(
          taskDef.id,
          taskDef.name,
          childTasks,
          taskDef.joinType,
          taskDef.splitType,
          0,
          taskDef.timeout,
          taskDef.deadline,
          taskDef.cancellationSet,
          taskDef.cancellationRegion,
          taskDef.allowMultipleInstances
        );
        this.tasks.set(taskDef.id, task);
      } else {
        const task = new Task(
          taskDef.id,
          taskDef.name,
          taskDef.joinType,
          taskDef.splitType,
          0,
          taskDef.timeout,
          taskDef.deadline,
          taskDef.cancellationSet,
          taskDef.resetSet
        );
        this.tasks.set(taskDef.id, task);
      }
    }

    // Process sequence flows
    workflowDefinition.sequenceFlows.forEach((flowDef) => {
      const flow = new SequenceFlow(
        flowDef.id,
        flowDef.source,
        flowDef.target,
        flowDef.condition
      );
      const targetTask = this.tasks.get(flowDef.target);
      targetTask.addIncomingFlow(flow.id);

      const existingFlows = this.sequenceFlows.get(flowDef.source) || [];
      existingFlows.push(flow);
      this.sequenceFlows.set(flowDef.source, existingFlows);
    });

    workflowDefinition.endEvents.forEach((endEventId) => {
      this.endEvents.add(endEventId);
    });

    workflowDefinition.startEvents.forEach((startEventId) => {
      this.startEvents.add(startEventId);
    });
  }

  async start(startEventIds?: string[], context?: Context): Promise<void> {
    this.visitedTasks.clear();
    this.context = context || this.context;

    if (!startEventIds || !startEventIds.length) {
      startEventIds = Array.from(this.startEvents);
    }

    const startTasks = startEventIds
      .map((id) => this.tasks.get(id))
      .filter((task) => task && this.startEvents.has(task.id));

    if (startTasks.length > 0) {
      const executionPromises = startTasks.map((task) =>
        this.executeTask(task, this.context)
      );
      await Promise.allSettled(executionPromises);
    } else {
      throw new Error(`No valid start events found.`);
    }
  }

  private async executeTask(task: Task, context: Context): Promise<void> {
    if (this.visitedTasks.has(task.id) || !task.canExecute()) {
      return;
    }

    if (task.deadline && task.deadline < new Date()) {
      console.log(`Task ${task.name} deadline exceeded.`);
      return; // Deadline exceeded, do not execute the task
    }

    if (task.canceled) {
      console.log(`Task ${task.name} was previously canceled.`);
      return;
    }

    this.visitedTasks.add(task.id);

    if (task instanceof EventGatewayTask) {
      await this.executeEventGatewayTask(task, context);
    } else {
      const timeoutPromise = new Promise((_, reject) => {
        if (task.timeout) {
          setTimeout(
            () => reject(new Error(`Task ${task.name} timed out.`)),
            task.timeout
          );
        }
      });

      try {
        await Promise.race([task.execute(context), timeoutPromise]);
      } catch (error) {
        console.log(error.message);
        // Handle the error, e.g., cancel the task or move to the next one
      }

      task.onFinished(this);

      const outgoingFlows = this.sequenceFlows.get(task.id) || [];

      if (this.endEvents.has(task.id)) {
        console.log(`Reached end event: ${task.name}`);
        return;
      }

      const executionPromises: Promise<void>[] = [];

      if (task.splitType === 'xor') {
        const executedFlow = outgoingFlows.find((flow) =>
          flow.execute(context)
        );
        if (executedFlow) {
          this.handleTaskFlow(
            this.tasks.get(executedFlow.target),
            context,
            executedFlow.id
          );
        }
      } else {
        for (const flow of outgoingFlows) {
          if (flow.execute(context)) {
            const targetTask = this.tasks.get(flow.target);

            // Create a new task instance if needed
            let instance: Task;
            if (targetTask.allowMultipleInstances) {
              instance = targetTask.createNewInstance(Date.now());
            } else {
              instance = targetTask;
            }

            const promise = this.handleTaskFlow(instance, context, flow);
            executionPromises.push(promise);

            if (task.splitType === 'or') {
              break;
            }
          }
        }
      }

      await Promise.allSettled(executionPromises);

      if (
        !executionPromises.some((_, i) => outgoingFlows[i].execute(context))
      ) {
        this.visitedTasks.delete(task.id);
      }
    }
  }

  private async executeEventGatewayTask(
    task: EventGatewayTask,
    context: Context
  ): Promise<void> {
    if (this.visitedTasks.has(task.id) || !task.canExecute()) {
      return;
    }

    this.visitedTasks.add(task.id);

    await task.execute(context);

    const outgoingFlows = this.sequenceFlows.get(task.id) || [];
    const executionPromises: Promise<void>[] = [];

    for (const flow of outgoingFlows) {
      if (flow.execute(context)) {
        const targetTask = this.tasks.get(flow.target);
        if (targetTask) {
          const promise = this.handleTaskFlow(targetTask, context, flow);
          executionPromises.push(promise);
        }
      }
    }

    await Promise.all(executionPromises);
  }

  async handleTaskFlow(
    targetTask: Task,
    context: Context,
    flow: SequenceFlow
  ): Promise<void> {
    targetTask.completeIncomingFlow(flow.id);
    await this.executeTask(targetTask, context);
  }

  cancelAllTasks(): void {
    this.tasks.forEach((task) => {
      task.cancel(this);
    });
  }

  cancelTasksInRegion(region: string): void {
    this.tasks.forEach((task) => {
      if (task.cancellationRegion === region) {
        task.cancel(this);
      }
    });
  }
  async sendEvent(event: EventDefinition, context?: Context): Promise<void> {
    // Find tasks that are EventGatewayTask instances and have a matching event
    const matchingTasks = Array.from(this.tasks.values()).filter(
      (task) => task instanceof EventGatewayTask
    ) as EventGatewayTask[];

    const promises = matchingTasks.map((task) =>
      task.handleIncomingEvent(event, context || this.context)
    );

    await Promise.all(promises);
  }
}
