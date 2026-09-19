export type EntityType = "project" | "task" | "note";

export type ObjectRef = {
  type: EntityType;
  id: string;
};

export type Relation = {
  id: string;
  a: ObjectRef;
  b: ObjectRef;
  kind: "related";
  createdAt: string;
};

export const RELATIONS_STORAGE_KEY = "sfera.relations.v1";

function sameRef(a: ObjectRef, b: ObjectRef) {
  return a.type === b.type && a.id === b.id;
}

export function createRelation(a: ObjectRef, b: ObjectRef): Relation {
  return {
    id: crypto.randomUUID(),
    a,
    b,
    kind: "related",
    createdAt: new Date().toISOString()
  };
}

export function readRelations(): Relation[] {
  try {
    const raw = localStorage.getItem(RELATIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function relationsFor(relations: Relation[], ref: ObjectRef) {
  return relations.filter((relation) => sameRef(relation.a, ref) || sameRef(relation.b, ref));
}

export function otherRef(relation: Relation, ref: ObjectRef): ObjectRef {
  return sameRef(relation.a, ref) ? relation.b : relation.a;
}

export function areLinked(relations: Relation[], a: ObjectRef, b: ObjectRef) {
  return relations.some((relation) =>
    (sameRef(relation.a, a) && sameRef(relation.b, b)) ||
    (sameRef(relation.a, b) && sameRef(relation.b, a))
  );
}

export function removeRelationsFor(relations: Relation[], ref: ObjectRef) {
  return relations.filter((relation) => !sameRef(relation.a, ref) && !sameRef(relation.b, ref));
}
