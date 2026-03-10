import { SEED_CHANGES } from "../data/seed.js";
import { genId } from "../utils/id.js";
import { now } from "../utils/date.js";

// In-memory store — swap this for API calls in the future
let _changes = [...SEED_CHANGES];

export const changeService = {
  getAll: () => [..._changes],
  getById: (id) => _changes.find(c => c.id === id) || null,
  create: (change) => {
    const newC = { ...change, id: change.id || genId(), createdAt: change.createdAt || now() };
    _changes = [newC, ..._changes];
    return newC;
  },
  update: (id, updater) => {
    _changes = _changes.map(c =>
      c.id === id
        ? (typeof updater === "function" ? updater(c) : { ...c, ...updater, updatedAt: now() })
        : c
    );
    return _changes.find(c => c.id === id);
  },
  delete: (id) => { _changes = _changes.filter(c => c.id !== id); },
};
