type Place = string;
type Transition = string;
type Marking = Map<Place, number>;

export interface ResetPetriNet {
  places: Set<Place>;
  transitions: Set<Transition>;
  arcs: Map<
    Transition,
    { preSet: Set<Place>; postSet: Set<Place>; resetSet: Set<Place> }
  >;
  initialMarking: Marking;
}

export class WSTS {
  stateSpace: Set<Marking>;
  transitionRelation: Set<[Marking, Transition, Marking]>;
  petriNet: ResetPetriNet; // Add the PetriNet class instance as a property

  constructor(petriNet: ResetPetriNet) {
    // Add a parameter to the constructor for the PetriNet instance
    this.stateSpace = new Set();
    this.transitionRelation = new Set();
    this.petriNet = petriNet; // Initialize the petriNet property
  }

  addState(marking: Marking) {
    this.stateSpace.add(marking);
  }

  addTransition(from: Marking, transition: Transition, to: Marking) {
    this.transitionRelation.add([from, transition, to]);
  }

  coverable(s: Marking, t: Marking): boolean {
    for (const sEntry of s.entries()) {
      const sPrime = new Map(s);
      sPrime.set(sEntry[0], sEntry[1] - 1);
      if (this.finiteBasisPredStar(new Set([t])).has(sPrime)) {
        return true;
      }
    }
    return false;
  }

  finiteBasisPredStar(I: Set<Marking>): Set<Marking> {
    let K = I;
    let Knext = new Set([...K, ...this.pb(K)]);
    while (!this.isUpwardEqual(K, Knext)) {
      K = Knext;
      Knext = new Set([...K, ...this.pb(K)]);
    }
    return K;
  }

  isUpwardEqual(K: Set<Marking>, Knext: Set<Marking>): boolean {
    // The upward closure of K and Knext
    const upwardClosureK = this.finiteBasisPredStar(K);
    const upwardClosureKnext = this.finiteBasisPredStar(Knext);

    // Check if upwardClosureKnext is a subset of upwardClosureK
    for (const marking of upwardClosureKnext) {
      if (!upwardClosureK.has(marking)) {
        return false;
      }
    }

    return true;
  }

  pb(I: Set<Marking>): Set<Marking> {
    const Z = new Set<Marking>();
    for (const M of I) {
      for (const t of this.petriNet.transitions) {
        const transitionInfo = this.petriNet.arcs.get(t);
        if (transitionInfo) {
          const preSet = transitionInfo.preSet;
          const postSet = transitionInfo.postSet;
          const resetSet = transitionInfo.resetSet;

          const canFire = Array.from(preSet).every((p) => {
            const tokens = M.get(p) || 0;
            if (resetSet.has(p)) {
              return postSet.has(p) && tokens === 1;
            } else {
              return tokens >= 1 && (!postSet.has(p) || !resetSet.has(p));
            }
          });

          if (canFire) {
            const Mprime = new Map(M);

            for (const p of postSet) {
              if (!preSet.has(p)) {
                const tokens = Mprime.get(p) || 0;
                Mprime.set(p, tokens - 1);
              }
            }

            for (const p of preSet) {
              if (!postSet.has(p)) {
                const tokens = Mprime.get(p) || 0;
                Mprime.set(p, tokens + 1);
              }
            }

            for (const p of Array.from(preSet).filter((p) => postSet.has(p))) {
              Mprime.set(p, M.get(p) || 0);
            }

            Z.add(Mprime);
          }
        }
      }
    }
    return Z;
  }

  orJoinEnabled(M: Marking, X: Set<Place>): boolean {
    const Y = new Set<Marking>();
    for (const q of X) {
      if (M.get(q) === 0) {
        const Mw = new Map(M);
        for (const p of X) {
          if (M.get(p) > 0) {
            Mw.set(p, 1);
          }
        }
        Mw.set(q, 1);
        Y.add(Mw);
      }
    }

    for (const Mw of Y) {
      if (this.coverable(M, Mw)) {
        return false;
      }
    }

    return true;
  }
}

function isEnabled(marking: Marking, input: Set<Place>): boolean {
  for (const place of input) {
    if (!marking.has(place) || marking.get(place) === 0) {
      return false;
    }
  }
  return true;
}

function fireTransition(
  marking: Marking,
  transitionInfo: { input: Set<Place>; output: Set<Place>; reset: Set<Place> }
): Marking {
  const newMarking = new Map(marking);

  // Consume tokens from input places
  for (const place of transitionInfo.input) {
    newMarking.set(place, newMarking.get(place) - 1);
  }

  // Produce tokens in output places
  for (const place of transitionInfo.output) {
    newMarking.set(place, (newMarking.get(place) ?? 0) + 1);
  }

  // Reset tokens in reset places
  for (const place of transitionInfo.reset) {
    newMarking.set(place, 0);
  }

  return newMarking;
}

export function petriNetToWSTS(petriNet: ResetPetriNet): WSTS {
  const wsts = new WSTS(petriNet);
  const visited = new Set<string>();

  function visit(marking: Marking) {
    const markingStr = JSON.stringify(Array.from(marking));
    if (visited.has(markingStr)) {
      return;
    }
    visited.add(markingStr);
    wsts.addState(marking);
    for (const transition of petriNet.transitions) {
      const transitionInfo = petriNet.arcs.get(transition);
      if (transitionInfo) {
        if (isEnabled(marking, transitionInfo.input)) {
          const newMarking = fireTransition(marking, transitionInfo);
          wsts.addTransition(marking, transition, newMarking);
          visit(newMarking);
        }
      }
    }
  }

  visit(petriNet.initialMarking);
  return wsts;
}
/*
const arcs = new Map<Transition, { preSet: Set<Place>, postSet: Set<Place>, resetSet: Set<Place> }>();

for (const transition of petriNet.transitions) {
  const preSet = new Set<Place>();
  const postSet = new Set<Place>();
  const resetSet = new Set<Place>();

  for (const [place, arc] of petriNet.arcs.entries()) {
    if (arc.postSet.has(transition)) {
      preSet.add(place);
    }
    if (arc.preSet.has(transition)) {
      postSet.add(place);
    }
    if (arc.resetSet.has(place) && arc.postSet.has(transition)) {
      resetSet.add(place);
    }
  }

  arcs.set(transition, { preSet, postSet, resetSet });
}

const resetPetriNet: ResetPetriNet = {
  places: petriNet.places,
  transitions: petriNet.transitions,
  arcs,
  initialMarking: petriNet.initialMarking,
};
*/
