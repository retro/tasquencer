import { BaseTask } from './BaseTask.js';
import { Condition } from './Condition.js';

export class Marking {
  private readonly locations: (BaseTask | Condition)[] = [];
  constructor(tasks: BaseTask[], conditions: Condition[]) {
    this.locations = [...tasks, ...conditions];
  }
  getLocations() {
    return this.locations;
  }
}
