/**
 * gridWeld.ts
 *
 * Ecken, die auf denselben Punkt eines Gitters mit Abstand `step` fallen,
 * bekommen dieselbe Nummer; gezaehlt wird in der Reihenfolge, in der die Ecken
 * zuerst vorkommen. Dasselbe, was ein Textschluessel aus den gerundeten
 * Koordinaten (`Math.round(value / step)`, mit Kommas verbunden) in einer Map
 * ergab - -0 zaehlt wie 0, und NaN trifft NaN wie im Text -, nur ohne einen
 * Text je Ecke, der bei Netzen mit ein paar hunderttausend Dreiecken Sekunden
 * kostete.
 *
 * `ids[i]` ist die Nummer von Ecke i, `first[n]` die erste Ecke mit Nummer n,
 * `count` die Zahl der Nummern. Aus layerling 1.105.0.
 */
export function weldOnGrid(vertices: ReadonlyArray<ArrayLike<number>>, step: number) {
  const total = vertices.length;
  const grid = new Float64Array(total * 3);
  for (let index = 0; index < total; index += 1) {
    const vertex = vertices[index];
    grid[index * 3] = Math.round(vertex[0] / step) + 0;
    grid[index * 3 + 1] = Math.round(vertex[1] / step) + 0;
    grid[index * 3 + 2] = Math.round(vertex[2] / step) + 0;
  }
  let capacity = 1;
  while (capacity < total * 2) capacity <<= 1;
  const mask = capacity - 1;
  const table = new Int32Array(capacity).fill(-1);
  const ids = new Int32Array(total);
  const first: number[] = [];
  for (let index = 0; index < total; index += 1) {
    const x = grid[index * 3];
    const y = grid[index * 3 + 1];
    const z = grid[index * 3 + 2];
    // Der Abschluss von MurmurHash3 mischt die drei, sonst haeuften sich die Punkte eines regelmaessigen Netzes.
    let hash = Math.imul(hashPart(x), 0x9e3779b1);
    hash = Math.imul(hash ^ hashPart(y), 0x85ebca6b);
    hash = Math.imul(hash ^ hashPart(z), 0xc2b2ae35);
    hash ^= hash >>> 16;
    hash = Math.imul(hash, 0x85ebca6b);
    hash ^= hash >>> 13;
    hash &= mask;
    for (;;) {
      const entry = table[hash];
      if (entry === -1) {
        table[hash] = index;
        ids[index] = first.length;
        first.push(index);
        break;
      }
      if (sameNumber(grid[entry * 3], x) && sameNumber(grid[entry * 3 + 1], y) && sameNumber(grid[entry * 3 + 2], z)) {
        ids[index] = ids[entry];
        break;
      }
      hash = (hash + 1) & mask;
    }
  }
  return { ids, first, count: first.length };
}

function hashPart(value: number) {
  return value !== value ? 0x7fc00000 : (value | 0) ^ ((value / 4294967296) | 0);
}

/** NaN trifft NaN, so wie der Text "NaN" sich selbst. */
function sameNumber(a: number, b: number) {
  return a === b || (a !== a && b !== b);
}
