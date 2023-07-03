import { Condition } from './elements/Condition.js';
import { Marking } from './elements/Marking.js';
import { Task } from './elements/Task.js';

type NetElement = Condition | Task;

class RElement {
  private name: string;
  private presetFlows: Record<string, RFlow> = {};
  private postsetFlows: Record<string, RFlow> = {};
  readonly id: string;

  constructor(id: string) {
    this.id = id;
    this.name = id;
  }

  setName(name: string): void {
    this.name = name;
  }

  getName(): string {
    return this.name;
  }

  getPresetFlows(): Record<string, RFlow> {
    return this.presetFlows;
  }

  getPostsetFlows(): Record<string, RFlow> {
    return this.postsetFlows;
  }

  setPresetFlows(presetFlows: Record<string, RFlow>): void {
    this.presetFlows = presetFlows;
  }
  setPostsetFlows(postsetFlows: Record<string, RFlow>): void {
    this.postsetFlows = postsetFlows;
  }

  getPostsetElements(): Set<RElement> {
    const postsetElements = new Set<RElement>();
    const flowSet = Object.values(this.postsetFlows);

    for (const flow of flowSet) {
      postsetElements.add(flow.getNextElement());
    }

    return postsetElements;
  }

  getPresetElements(): Set<RElement> {
    const presetElements = new Set<RElement>();
    const flowSet = Object.values(this.presetFlows);

    for (const flow of flowSet) {
      presetElements.add(flow.getPriorElement());
    }

    return presetElements;
  }

  setPreset(flowsInto: RFlow): void {
    if (flowsInto) {
      this.presetFlows[flowsInto.getPriorElement().id] = flowsInto;
      flowsInto.getPriorElement().postsetFlows[flowsInto.getNextElement().id] =
        flowsInto;
    }
  }
  setPostset(flowsInto: RFlow): void {
    if (flowsInto) {
      this.postsetFlows[flowsInto.getNextElement().id] = flowsInto;
      flowsInto.getNextElement().presetFlows[flowsInto.getPriorElement().id] =
        flowsInto;
    }
  }

  getPostsetElement(id: string): RElement {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.postsetFlows[id]!.getNextElement();
  }

  getPresetElement(id: string): RElement {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.presetFlows[id]!.getPriorElement();
  }
}

class RFlow {
  private priorElement: RElement;
  private nextElement: RElement;

  constructor(prior: RElement, next: RElement) {
    this.priorElement = prior;
    this.nextElement = next;
  }

  getPriorElement(): RElement {
    return this.priorElement;
  }

  getNextElement(): RElement {
    return this.nextElement;
  }
}

class RMarking {
  private markedPlaces = new Map<string, number>();

  constructor(locations: RElement[] | Map<string, number>) {
    if (locations instanceof Map) {
      this.markedPlaces = locations;
    } else {
      for (const netElement of locations) {
        const netElementName = netElement.id;
        let tokenCount = 1;
        if (this.markedPlaces.has(netElementName)) {
          const count = this.markedPlaces.get(netElementName) ?? 0;
          tokenCount = count + 1;
        }
        this.markedPlaces.set(netElementName, tokenCount);
      }
    }
  }

  public static fromMarkedPlaces(markedPlaces: Map<string, number>): RMarking {
    const marking = new RMarking([]);
    marking.markedPlaces = new Map(markedPlaces);
    return marking;
  }

  getLocations(): string[] {
    return Array.from(this.markedPlaces.keys());
  }

  equals(omarking: RMarking): boolean {
    const otherMarking = new Map(omarking.getMarkedPlaces());
    const otherPlaces = new Set(otherMarking.keys());
    const myPlaces = new Set(this.markedPlaces.keys());

    if (myPlaces.size !== otherPlaces.size) {
      return false;
    }

    for (const netElement of myPlaces) {
      const myCount = this.markedPlaces.get(netElement) ?? 0;
      const otherCount = otherMarking.get(netElement) ?? 0;
      if (myCount !== otherCount) {
        return false;
      }
    }

    return true;
  }

  isBiggerThanOrEqual(marking: RMarking): boolean {
    const otherMarking = marking.getMarkedPlaces();
    const otherPlaces = new Set(otherMarking.keys());
    const myPlaces = new Set(this.markedPlaces.keys());

    if (!setHasAll(myPlaces, otherPlaces)) {
      return false;
    }

    for (const netElement of otherPlaces) {
      const myCount = this.markedPlaces.get(netElement) ?? 0;
      const otherCount = otherMarking.get(netElement) ?? 0;
      if (myCount < otherCount) {
        return false;
      }
    }

    return true;
  }
  isBiggerThan(marking: RMarking): boolean {
    const otherMarking = marking.getMarkedPlaces();
    const otherPlaces = new Set(otherMarking.keys());
    const myPlaces = new Set(this.markedPlaces.keys());
    let isBigger = false;

    if (!setHasAll(myPlaces, otherPlaces)) {
      return false;
    }

    for (const netElement of otherPlaces) {
      const myCount = this.markedPlaces.get(netElement) ?? 0;
      const otherCount = otherMarking.get(netElement) ?? 0;
      if (myCount < otherCount) {
        return false;
      } else if (myCount > otherCount) {
        isBigger = true;
      }
    }

    if (!isBigger && setHasAll(otherPlaces, myPlaces)) {
      return false;
    }

    return isBigger;
  }

  getMarkedPlaces(): Map<string, number> {
    return this.markedPlaces;
  }

  isLessThanOrEqual(marking: RMarking): boolean {
    const otherMarking = marking.getMarkedPlaces();
    const myPlaces = new Set(this.markedPlaces.keys());
    const otherPlaces = new Set(otherMarking.keys());

    if (!setHasAll(otherPlaces, myPlaces)) {
      return false;
    }

    for (const netElement of myPlaces) {
      const myCount = this.markedPlaces.get(netElement) ?? 0;
      const otherCount = otherMarking.get(netElement) ?? 0;
      if (myCount > otherCount) {
        return false;
      }
    }

    return true;
  }

  debugMarking(msg: string): void {
    let printM = msg + ':';
    const mPlaces = Array.from(this.markedPlaces.entries());
    for (const [key, value] of mPlaces) {
      printM += `${key}(${value})\t`;
    }
    console.log(printM);
  }
}

class RSetOfMarkings {
  private markings = new Set<RMarking>();

  addMarking(marking: RMarking): void {
    this.markings.add(marking);
  }

  getMarkings(): Set<RMarking> {
    return new Set(this.markings);
  }

  size(): number {
    return this.markings.size;
  }

  removeAll(): void {
    this.markings.clear();
  }

  removeMarking(marking: RMarking): void {
    this.markings.delete(marking);
  }

  addAll(newMarkings: RSetOfMarkings): void {
    for (const marking of newMarkings.getMarkings()) {
      this.markings.add(marking);
    }
  }

  equals(markings: RSetOfMarkings): boolean {
    const markingsToCompare = markings.getMarkings();
    if (this.markings.size !== markingsToCompare.size) {
      return false;
    }
    return (
      setHasAll(this.markings, markingsToCompare) &&
      setHasAll(markingsToCompare, this.markings)
    );
  }
}

function setHasAll<T>(s1: Set<T>, s2: Set<T>) {
  for (const item of s2) {
    if (!s1.has(item)) {
      return false;
    }
  }
  return true;
}

function setIsEmpty(s: Set<unknown>) {
  return s.size === 0;
}
function setAddAll<T>(s1: Set<T>, s2: Set<T>): Set<T> {
  for (const element of s2) {
    s1.add(element);
  }
  return s1;
}

function setsAreEqual<T>(setA: Set<T>, setB: Set<T>): boolean {
  if (setA.size !== setB.size) {
    return false;
  }
  for (const item of setA) {
    if (!setB.has(item)) {
      return false;
    }
  }
  return true;
}

function setContainsAll<T>(set: Set<T>, subset: Set<T>): boolean {
  for (const elem of subset) {
    if (!set.has(elem)) {
      return false;
    }
  }
  return true;
}

function setIntersection<T>(setA: Set<T>, setB: Set<T>): Set<T> {
  for (const el of setA) {
    if (!setB.has(el)) {
      setA.delete(el);
    }
  }
  return setA;
}

class RPlace extends RElement {}

class RTransition extends RElement {
  private removeSet = new Set<RPlace>();

  setRemoveSet(removeSetOrPlace: Set<RPlace> | RPlace): void {
    if (removeSetOrPlace instanceof Set) {
      this.removeSet = new Set([...this.removeSet, ...removeSetOrPlace]);
    } else {
      this.removeSet.add(removeSetOrPlace);
    }
  }

  getRemoveSet(): Set<RPlace> {
    if (this.removeSet) {
      return this.removeSet;
    }
    return new Set();
  }

  isCancelTransition(): boolean {
    return this.removeSet.size > 0;
  }
}

export class E2WFOJNet {
  private transitions: Record<string, RTransition> = {};
  private places: Record<string, RPlace> = {};
  private orJoins: Record<string, RTransition> = {};
  private yOrJoins: Record<string, Task> = {};
  private yTasks: Task[];
  private yConditions: Condition[];
  private alreadyConsideredMarkings = new Set<RMarking>();
  private conditions = new Set();

  constructor(yTasks: Task[], yConditions: Condition[], orJoin: Task) {
    this.yTasks = yTasks;
    this.yConditions = yConditions;
    this.convertToResetNet();
    this.orJoinRemove(orJoin);
    this.orJoins = {};
    this.yOrJoins = {};
  }

  private convertToResetNet(): void {
    for (const nextElement of this.yConditions) {
      const p = new RPlace(nextElement.name);
      this.places[p.id] = p;
      this.conditions.add(nextElement);
    }

    const _StartTransitions: Record<string, RTransition> = {};
    const _EndTransitions: Record<string, RTransition> = {};

    for (const next of this.yTasks) {
      const nextElement = next;

      const p = new RPlace('p_' + nextElement.name);
      this.places[p.id] = p;

      if (nextElement.joinType == 'and' || !nextElement.joinType) {
        const t = new RTransition(nextElement.name + '_start');
        _StartTransitions[t.id] = t;
        const pre = nextElement.getPresetElements();
        for (const preElement of pre) {
          const inflow = new RFlow(
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            this.places[preElement.name]!,
            t
          );
          t.setPreset(inflow);
          const outflow = new RFlow(
            t,
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            this.places['p_' + nextElement.name]!
          );
          t.setPostset(outflow);
        }
      } else if (nextElement.joinType == 'xor') {
        const pre = nextElement.getPresetElements();
        for (const preElement of pre) {
          const t = new RTransition(
            nextElement.name + '_start^' + preElement.name
          );
          _StartTransitions[t.id] = t;
          const inflow = new RFlow(
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            this.places[preElement.name]!,
            t
          );
          t.setPreset(inflow);
          const outflow = new RFlow(
            t,
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            this.places['p_' + nextElement.name]!
          );
          t.setPostset(outflow);
        }
      } else if (nextElement.joinType == 'or') {
        const t = new RTransition(nextElement.name + '_start');
        _StartTransitions[t.id] = t;
        this.orJoins[t.id] = t;
        this.yOrJoins[nextElement.name] = nextElement;
      }
      if (nextElement.splitType == 'and' || !nextElement.splitType) {
        const t = new RTransition(nextElement.name + '_end');
        _EndTransitions[t.id] = t;
        const post = nextElement.getPostsetElements();
        for (const postElement of post) {
          const inflow = new RFlow(
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            this.places['p_' + nextElement.name]!,
            t
          );
          t.setPreset(inflow);
          const outflow = new RFlow(
            t,
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            this.places[postElement.name]!
          );
          t.setPostset(outflow);
        }
        const removeSet = new Set(nextElement.getRemoveSet());
        if (!setIsEmpty(removeSet)) {
          this.addCancelSet(t, removeSet);
        }
      } else if (nextElement.splitType == 'xor') {
        const post = nextElement.getPostsetElements();
        for (const postElement of post) {
          const t = new RTransition(
            nextElement.name + '_end^' + postElement.name
          );
          _EndTransitions[t.id] = t;
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const inflow = new RFlow(this.places['p_' + nextElement.name]!, t);
          t.setPreset(inflow);
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const outflow = new RFlow(t, this.places[postElement.name]!);
          t.setPostset(outflow);
          const removeSet = new Set(nextElement.getRemoveSet());
          if (!setIsEmpty(removeSet)) {
            this.addCancelSet(t, removeSet);
          }
        }
      } else if (nextElement.splitType == 'or') {
        const xSubSet = new Set<Set<NetElement>>();
        const post = nextElement.getPostsetElements();
        for (let i = 1; i <= post.size; i++) {
          const subSet = this.generateCombination(post, i);
          setAddAll(xSubSet, subSet);
        }
        for (const x of xSubSet) {
          let tid = '';
          for (const postElement of x) {
            tid += postElement.name + ' ';
          }
          const t = new RTransition(nextElement.name + '_end^{' + tid + '}');
          _EndTransitions[t.id] = t;

          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const inflow = new RFlow(this.places['p_' + nextElement.name]!, t);

          t.setPreset(inflow);
          for (const postElement of x) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const outflow = new RFlow(t, this.places[postElement.name]!);
            t.setPostset(outflow);
          }
          const removeSet = new Set(nextElement.getRemoveSet());
          if (!setIsEmpty(removeSet)) {
            this.addCancelSet(t, removeSet);
          }
        }
      }
    }

    this.transitions = {
      ..._StartTransitions,
      ..._EndTransitions,
    };
  }

  private generateCombination(
    netElements: Set<NetElement>,
    size: number
  ): Set<Set<NetElement>> {
    const subSets = new Set<Set<NetElement>>();
    const elements = Array.from(netElements);
    const x = new CombinationGenerator(elements.length, size);
    while (x.hasMore()) {
      const combsubSet = new Set<NetElement>();
      const indices = x.getNext();
      for (const i of indices) {
        const element = elements[i];
        element && combsubSet.add(element);
      }
      subSets.add(combsubSet);
    }
    return subSets;
  }

  private addCancelSet(rt: RTransition, removeSet: Set<NetElement>): void {
    const removeSetT = new Set(removeSet);
    const removeSetR = new Set<RPlace>();
    removeSet.forEach((c) => {
      const p = this.places[c.name];
      if (p !== null && p !== undefined) {
        removeSetR.add(p);
      }
    });
    removeSetT.forEach((t) => {
      const p = this.places['p_' + t.name];
      if (p !== null && p !== undefined) {
        removeSetR.add(p);
      }
    });
    rt.setRemoveSet(removeSetR);
  }

  private orJoinRemove(j: Task): void {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete this.yOrJoins[j.name];

    for (const rj of Object.values(this.orJoins)) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete this.transitions[rj.id];
    }
    for (const otherOrJoin of Object.values(this.yOrJoins)) {
      const pre = otherOrJoin.getPresetElements();
      for (const preElement of pre) {
        const t = new RTransition(
          otherOrJoin.name + '_start^' + preElement.name
        );
        this.transitions[t.id] = t;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const inflow = new RFlow(this.places[preElement.name]!, t);
        t.setPreset(inflow);
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const outflow = new RFlow(t, this.places['p_' + otherOrJoin.name]!);
        t.setPostset(outflow);
      }
    }
  }

  private getPostset(elements: Set<RElement>): Set<RElement> {
    const postset = new Set<RElement>();
    const iter = elements.values();
    let e = iter.next();
    while (!e.done) {
      const element = e.value as RElement;
      setAddAll(postset, element.getPostsetElements());
      e = iter.next();
    }
    return postset;
  }

  private getPreset(elements: Set<RElement>): Set<RElement> {
    const preset = new Set<RElement>();
    const iter = elements.values();
    let e = iter.next();
    while (!e.done) {
      const element = e.value as RElement;
      setAddAll(preset, element.getPresetElements());
      e = iter.next();
    }
    return preset;
  }

  private isCoverable(s: RMarking, t: RMarking): boolean {
    this.alreadyConsideredMarkings = new Set<RMarking>();
    const tSet = new RSetOfMarkings();
    tSet.addMarking(t);
    const rm = this.finiteBasisPred(tSet);
    let result = false;
    for (const x of rm.getMarkings()) {
      if (x.isLessThanOrEqual(s)) {
        result = true;
        break;
      }
    }
    this.alreadyConsideredMarkings = new Set<RMarking>();
    rm.removeAll();
    return result;
  }

  private finiteBasisPred(I: RSetOfMarkings): RSetOfMarkings {
    const K = new RSetOfMarkings();
    const Kn = new RSetOfMarkings();
    const Pred = new RSetOfMarkings();
    K.addAll(I);
    Pred.addAll(K);
    Kn.addAll(this.getMinimalCoveringSet(this.pb(K), Pred));
    while (!this.isUpwardEqual(K, Kn)) {
      K.removeAll();
      K.addAll(Kn);
      Pred.removeAll();
      Pred.addAll(K);
      Kn.addAll(this.getMinimalCoveringSet(this.pb(K), Pred));
    }
    Kn.removeAll();
    Pred.removeAll();
    return K;
  }

  private isUpwardEqual(K: RSetOfMarkings, Kn: RSetOfMarkings): boolean {
    return K.equals(Kn);
  }

  private pb(value: RMarking | RSetOfMarkings): RSetOfMarkings {
    if (value instanceof RSetOfMarkings) {
      const I = value;
      const Z = new RSetOfMarkings();
      for (const M of I.getMarkings()) {
        Z.addAll(this.pb(M));
      }
      return this.getMinimalCoveringSet2(Z);
    } else {
      const M = value;
      const Z = new RSetOfMarkings();
      if (!this.alreadyConsideredMarkings.has(M)) {
        for (const t of Object.values(this.transitions)) {
          if (this.isBackwardsEnabled(M, t)) {
            const preM = this.getPreviousRMarking(M, t);

            if (!preM.isBiggerThanOrEqual(M)) {
              Z.addMarking(preM);
            }
          }
        }
        this.alreadyConsideredMarkings.add(M);
      }
      return Z;
    }
  }

  private isBackwardsEnabled(currentM: RMarking, t: RTransition): boolean {
    const postSet = t.getPostsetElements();
    const removeSet = t.getRemoveSet();
    const markedPlaces = currentM.getMarkedPlaces();
    if (removeSet && removeSet.size > 0) {
      for (const place of removeSet) {
        const placeName = place.id;
        if (markedPlaces.has(placeName)) {
          if (postSet.has(place)) {
            const count = markedPlaces.get(placeName) ?? 0;
            if (count > 1) {
              return false;
            }
          } else {
            return false;
          }
        }
      }
    }
    return true;
  }

  private getPreviousRMarking(currentM: RMarking, t: RTransition): RMarking {
    const premarkedPlaces = new Map(currentM.getMarkedPlaces());
    const postSet = new Set(t.getPostsetElements());
    const preSet = new Set(t.getPresetElements());
    const removeSet = new Set(t.getRemoveSet());
    let netElement: RElement;
    let netElementName: string;
    let tokenCount: number;

    postSet.forEach((element) => {
      netElement = element;
      netElementName = netElement.id;
      if (premarkedPlaces.has(netElementName)) {
        let count = premarkedPlaces.get(netElementName) ?? 0;

        if (count === 1) {
          premarkedPlaces.delete(netElementName);
        } else if (count > 1) {
          count = count - 1;
          tokenCount = count;
          premarkedPlaces.set(netElementName, tokenCount);
        }
      }
      if (premarkedPlaces.has(netElementName)) {
        let count = premarkedPlaces.get(netElementName) ?? 0;

        if (count === 1) {
          premarkedPlaces.delete(netElementName);
        } else if (count > 1) {
          count = count - 1;
          tokenCount = count;
          premarkedPlaces.set(netElementName, tokenCount);
        }
      }
    });

    preSet.forEach((element) => {
      netElement = element;
      netElementName = netElement.id;

      if (premarkedPlaces.has(netElementName)) {
        let count = premarkedPlaces.get(netElementName) ?? 0;
        count++;

        tokenCount = count;
        premarkedPlaces.set(netElementName, tokenCount);
      } else {
        tokenCount = 1;
        premarkedPlaces.set(netElementName, tokenCount);
      }
    });

    removeSet.forEach((element) => {
      netElement = element;
      netElementName = netElement.id;
      if (!premarkedPlaces.has(netElementName)) {
        tokenCount = 1;
        premarkedPlaces.set(netElementName, tokenCount);
      }
    });

    return new RMarking(premarkedPlaces);
  }

  private getMinimalCoveringSet2(Z: RSetOfMarkings): RSetOfMarkings {
    const Z_min = new RSetOfMarkings();
    Z_min.addAll(Z);

    for (const M of Z.getMarkings()) {
      const Z_inner = new RSetOfMarkings();
      Z_inner.addAll(Z_min);
      Z_inner.removeMarking(M);
      for (const M_i of Z_inner.getMarkings()) {
        if (M.isBiggerThanOrEqual(M_i)) {
          Z_min.removeMarking(M);
        }
      }
    }
    return Z_min;
  }
  private getMinimalCoveringSet(
    pbZ: RSetOfMarkings,
    Z: RSetOfMarkings
  ): RSetOfMarkings {
    const Z_min = new RSetOfMarkings();
    Z_min.addAll(Z);
    Z_min.addAll(pbZ);

    for (const M of pbZ.getMarkings()) {
      const Z_inner = new RSetOfMarkings();
      Z_inner.addAll(Z_min);
      Z_inner.removeMarking(M);
      for (const M_i of Z_inner.getMarkings()) {
        if (M.isBiggerThanOrEqual(M_i)) {
          Z_min.removeMarking(M);
        } else if (M_i.isBiggerThanOrEqual(M)) {
          Z_min.removeMarking(M_i);
        }
      }
    }
    return Z_min;
  }

  orJoinEnabled(M: Marking, orJoin: Task): boolean {
    const markedTasks = new Set<NetElement>();
    const RMap = new Map<string, number>();
    const YLocations: NetElement[] = M.getLocations();

    for (const nextElement of YLocations) {
      if (nextElement instanceof Condition) {
        const condition: Condition = nextElement;
        const place: RPlace | undefined = this.places[condition.name];
        if (place !== undefined) {
          const placename: string = place.id;
          let tokenCount = 1;
          if (RMap.has(placename)) {
            let count: number = RMap.get(placename) ?? 0;
            count++;
            tokenCount = count;
          }
          RMap.set(placename, tokenCount);
        }
      }
      if (nextElement instanceof Task) {
        markedTasks.add(nextElement);
      }
    }

    for (const task of markedTasks) {
      const internalPlace: string = 'p_' + task.name;
      const place: RPlace | undefined = this.places[internalPlace];
      if (place !== undefined) {
        const placename: string = place.id;
        const tokenCount = 1;
        RMap.set(placename, tokenCount);
      }
    }

    const RM: RMarking = new RMarking(RMap);

    const X: Set<Condition> = orJoin.getPresetElements();
    const newMap = new Map<string, number>();
    const emptyPreSetPlaces = new Set<RPlace>();
    let tokenCount = 1;

    for (const preSetCondition of X) {
      const preSetPlace: RPlace | undefined = this.places[preSetCondition.name];
      if (preSetPlace !== undefined) {
        if (YLocations.includes(preSetCondition)) {
          const preSetPlaceName: string = preSetPlace.id;
          newMap.set(preSetPlaceName, tokenCount);
        } else {
          emptyPreSetPlaces.add(preSetPlace);
        }
      }
    }

    const Y: RSetOfMarkings = new RSetOfMarkings();

    for (const q of emptyPreSetPlaces) {
      tokenCount = 1;
      const qname: string = q.id;
      newMap.set(qname, tokenCount);
      const M_w: RMarking = new RMarking(new Map(newMap));
      Y.addMarking(M_w);
      newMap.delete(qname);
    }

    for (const M_w of Y.getMarkings()) {
      const res = this.isCoverable(RM, M_w);
      if (res) {
        return false;
      }
    }
    return true;
  }

  restrictNet(value: Task | Marking): void {
    if (value instanceof Task) {
      const j = value;

      const restrictedTrans = new Set<RTransition>();
      const restrictedPlaces = new Set<RPlace>();

      const pre = new Set<RPlace>();
      const yPre: Set<Condition> = j.getPresetElements();
      for (const condition of yPre) {
        const place: RPlace | undefined = this.places[condition.name];
        if (place !== undefined) {
          pre.add(place);
        }
      }

      let rk = new Set<RElement>();
      let trans: Set<RElement> = this.getPreset(pre);

      setAddAll(restrictedTrans, trans);
      setAddAll(restrictedPlaces, pre);

      while (!setsAreEqual(rk, restrictedTrans)) {
        rk = new Set(restrictedTrans);
        pre.clear();
        setAddAll(pre, this.getPreset(trans));
        trans = this.getPreset(pre);
        setAddAll(restrictedTrans, trans);
        setAddAll(restrictedPlaces, pre);
      }

      this.performRestriction(restrictedTrans, restrictedPlaces);
    } else {
      const M = value;
      const markedPlaces = new Set<RPlace>();
      const yMarked = new Set(M.getLocations());

      // Make sure that every condition in M is external
      for (const nextElement of yMarked) {
        if (nextElement instanceof Condition) {
          const place = this.places[nextElement.name];
          if (place !== undefined) {
            markedPlaces.add(place);
          }
        }

        // Need to consider active tasks in a marking
        if (nextElement instanceof Task) {
          const internalPlace = 'p_' + nextElement.name;
          const place = this.places[internalPlace];
          if (place !== undefined) {
            markedPlaces.add(place);
          }
        }
      }

      // Forward pass
      const restrictedTrans = new Set<RTransition>();
      const restrictedPlaces = new Set<RPlace>();
      let post = new Set<RPlace>();
      let fk = new Set<RElement>();
      let trans = this.getPostset(markedPlaces);
      setAddAll(restrictedTrans, trans);
      setAddAll(restrictedPlaces, markedPlaces);
      while (!setsAreEqual(fk, restrictedTrans)) {
        fk = new Set(restrictedTrans);
        post = this.getPostset(trans);
        trans = this.getPostset(post);
        setAddAll(restrictedTrans, trans);
        setAddAll(restrictedPlaces, post);
      }
      const TransToRemove = new Set(Object.values(this.transitions));
      for (const tElement of TransToRemove) {
        const preSet = tElement.getPresetElements();
        if (!setContainsAll(restrictedPlaces, preSet)) {
          restrictedTrans.delete(tElement);
        }
      }

      this.performRestriction(restrictedTrans, restrictedPlaces);
    }
  }
  private performRestriction(
    restrictedTrans: Set<RTransition>,
    restrictedPlaces: Set<RPlace>
  ): void {
    const irrelevantTrans = new Set(
      Object.values(this.transitions).filter((t) => !restrictedTrans.has(t))
    );
    for (const t of irrelevantTrans) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete this.transitions[t.id];
    }
    for (const t of restrictedTrans) {
      if (t.isCancelTransition()) {
        setIntersection(t.getRemoveSet(), restrictedPlaces);
      }

      const tElement = t as RElement;
      const postSetToRemove = new Set(
        [...tElement.getPostsetElements()].filter(
          (p) => !restrictedPlaces.has(p)
        )
      );
      if (postSetToRemove.size > 0) {
        const postSetFlows = { ...tElement.getPostsetFlows() };
        for (const p of postSetToRemove) {
          // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
          delete postSetFlows[p.id];
        }
        tElement.setPostsetFlows(postSetFlows);
      }

      const preSetToRemove = new Set(
        [...tElement.getPresetElements()].filter(
          (p) => !restrictedPlaces.has(p)
        )
      );
      if (preSetToRemove.size > 0) {
        const preSetFlows = { ...tElement.getPresetFlows() };
        for (const p of preSetToRemove) {
          // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
          delete preSetFlows[p.id];
        }
        tElement.setPresetFlows(preSetFlows);
      }
    }
    const irrelevantPlaces = new Set(
      Object.values(this.places).filter((p) => !restrictedPlaces.has(p))
    );
    for (const p of irrelevantPlaces) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete this.places[p.id];

      const pElement = p as RElement;
      const preSetToRemove = new Set(
        [...pElement.getPresetElements()].filter((t) => {
          assertRElementIsRTransition(t);
          return !restrictedTrans.has(t);
        })
      );
      if (preSetToRemove.size > 0) {
        const preSetFlows = { ...pElement.getPresetFlows() };
        for (const t of preSetToRemove) {
          // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
          delete preSetFlows[t.id];
        }
        pElement.setPresetFlows(preSetFlows);
      }

      const postSetToRemove = new Set(
        [...pElement.getPostsetElements()].filter((t) => {
          assertRElementIsRTransition(t);
          return !restrictedTrans.has(t);
        })
      );
      if (postSetToRemove.size > 0) {
        const postSetFlows = { ...pElement.getPostsetFlows() };
        for (const t of postSetToRemove) {
          // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
          delete postSetFlows[t.id];
        }
        pElement.setPostsetFlows(postSetFlows);
      }
    }
  }
}

function assertRElementIsRTransition(
  value: unknown
): asserts value is RTransition {
  if (!(value instanceof RTransition)) {
    throw new Error('Value is not RTransition');
  }
}

/**
 * http://www.merriampark.com/comb.htm#Source
 * Ported from Combination Generator
 * by Michael Gilleland, Merriam Park Software
 *
 **/
class CombinationGenerator {
  private a: number[];
  private n: number;
  private r: number;
  private numLeft = BigInt(0);
  private total: bigint;

  constructor(n: number, r: number) {
    if (r > n) {
      throw new Error('Invalid input');
    }
    if (n < 1) {
      throw new Error('Invalid input');
    }
    this.n = n;
    this.r = r;
    this.a = new Array(r).fill(0);
    const nFact = this.getFactorial(n);
    const rFact = this.getFactorial(r);
    const nminusrFact = this.getFactorial(n - r);
    this.total = nFact / (rFact * nminusrFact);
    this.reset();
  }

  reset(): void {
    for (let i = 0; i < this.a.length; i++) {
      this.a[i] = i;
    }
    this.numLeft = BigInt(this.total.toString());
  }

  getNumLeft(): bigint {
    return this.numLeft;
  }

  hasMore(): boolean {
    return this.numLeft > BigInt(0);
  }
  getTotal(): bigint {
    return this.total;
  }

  private getFactorial(n: number): bigint {
    let fact = BigInt(1);
    for (let i = n; i > 1; i--) {
      fact = fact * BigInt(i);
    }
    return fact;
  }

  getNext(): number[] {
    if (this.numLeft === this.total) {
      this.numLeft = this.numLeft - BigInt(1);
      return this.a;
    }

    let i = this.r - 1;
    while (this.a[i] === this.n - this.r + i) {
      i--;
    }
    this.a[i] = this.a[i] ?? 0 + 1;
    for (let j = i + 1; j < this.r; j++) {
      this.a[j] = this.a[i] ?? 0 + j - i;
    }

    this.numLeft = this.numLeft - BigInt(1);
    return this.a;
  }
}
