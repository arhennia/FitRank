/**
 * Exhaustive dot-product top-k.
 * A boolean mask drops rows before they are scored.
 * Equal scores break by id, then by row index.
 */

function worse(left, right) {
  if (left.score !== right.score) return left.score < right.score;
  const idOrder = String(left.id).localeCompare(String(right.id));
  if (idOrder !== 0) return idOrder > 0;
  return left.index > right.index;
}

function siftUp(heap, index) {
  let cursor = index;
  while (cursor > 0) {
    const parent = (cursor - 1) >> 1;
    if (!worse(heap[cursor], heap[parent])) break;
    const swap = heap[cursor];
    heap[cursor] = heap[parent];
    heap[parent] = swap;
    cursor = parent;
  }
}

function siftDown(heap, index) {
  let cursor = index;
  const length = heap.length;
  while (true) {
    let worst = cursor;
    const left = cursor * 2 + 1;
    const right = left + 1;
    if (left < length && worse(heap[left], heap[worst])) worst = left;
    if (right < length && worse(heap[right], heap[worst])) worst = right;
    if (worst === cursor) break;
    const swap = heap[cursor];
    heap[cursor] = heap[worst];
    heap[worst] = swap;
    cursor = worst;
  }
}

function dotAt(floats, offset, query) {
  let sum = 0;
  for (let index = 0; index < query.length; index += 1) {
    const value = floats[offset + index];
    if (!Number.isFinite(value)) return null;
    sum += value * query[index];
  }
  return sum;
}

function betterOrder(left, right) {
  if (right.score !== left.score) return right.score - left.score;
  const idOrder = String(left.id).localeCompare(String(right.id));
  if (idOrder !== 0) return idOrder;
  return left.index - right.index;
}

/**
 * store is { floats, ids, dim, count }. mask[i] false excludes ids[i].
 * query is dotted as given. Callers pass L2-normalized vectors when they want cosine.
 */
export function dotProductTopK(store, query, { k, mask = null } = {}) {
  if (!store || !(store.floats instanceof Float32Array)) throw new Error("A vector store is required");
  if (!Number.isInteger(k) || k < 0) throw new Error("k must be a non-negative integer");
  const dim = store.dim;
  const count = store.count;
  if (!Array.isArray(query) && !ArrayBuffer.isView(query)) throw new Error("query must be a vector");
  if (query.length !== dim) throw new Error(`query length ${query.length} does not match dim ${dim}`);
  for (let index = 0; index < dim; index += 1) {
    if (!Number.isFinite(query[index])) throw new Error("query contains a non-finite value");
  }
  if (mask != null && mask.length !== count) {
    throw new Error(`mask length ${mask.length} does not match count ${count}`);
  }
  if (k === 0 || count === 0) return [];

  const heap = [];
  for (let row = 0; row < count; row += 1) {
    if (mask != null && !mask[row]) continue;
    const score = dotAt(store.floats, row * dim, query);
    if (score == null) continue;
    const entry = { id: store.ids[row], index: row, score };
    if (heap.length < k) {
      heap.push(entry);
      siftUp(heap, heap.length - 1);
    } else if (worse(heap[0], entry)) {
      heap[0] = entry;
      siftDown(heap, 0);
    }
  }
  heap.sort(betterOrder);
  return heap;
}
