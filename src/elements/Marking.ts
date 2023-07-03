import { Condition } from './Condition.js';
import { Task } from './Task.js';

export class Marking {
  private readonly locations: (Task | Condition)[] = [];
  constructor(tasks: Task[], conditions: Condition[]) {
    this.locations = [...tasks, ...conditions];
  }
  getLocations() {
    return this.locations;
  }
}
