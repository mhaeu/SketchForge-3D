import { describe, expect, it } from "vitest";
import { buildSweepMesh, tidySweepPath, type SweepPlanePoint, type SweepSpacePoint } from "@/lib/sweepMesh";

/** Ein Quadrat als Form, gegen den Uhrzeigersinn. */
const square = (size: number): SweepPlanePoint[] => [
  { x: -size / 2, z: -size / 2 },
  { x: size / 2, z: -size / 2 },
  { x: size / 2, z: size / 2 },
  { x: -size / 2, z: size / 2 },
];

/** Ein rechteckiger Weg in der Ebene, in der der Pfad gezeichnet wird. */
const rectanglePath = (width: number, height: number): SweepSpacePoint[] => [
  { x: -width / 2, y: -height / 2, z: 0 },
  { x: width / 2, y: -height / 2, z: 0 },
  { x: width / 2, y: height / 2, z: 0 },
  { x: -width / 2, y: height / 2, z: 0 },
];

/** Ein Faecher genuegt fuer die Deckel einer konvexen Form. */
const fan = (outer: SweepPlanePoint[]) => outer.slice(1, -1).map((_, index) => [0, index + 1, index + 2]);

function triangles(mesh: { positions: Float32Array }) {
  const out: number[][][] = [];
  for (let index = 0; index + 8 < mesh.positions.length; index += 9) {
    out.push([
      [mesh.positions[index], mesh.positions[index + 1], mesh.positions[index + 2]],
      [mesh.positions[index + 3], mesh.positions[index + 4], mesh.positions[index + 5]],
      [mesh.positions[index + 6], mesh.positions[index + 7], mesh.positions[index + 8]],
    ]);
  }
  return out;
}

/** Jede Kante einer geschlossenen Flaeche wird von genau zwei Dreiecken begangen. */
function watertight(mesh: { positions: Float32Array }) {
  const uses = new Map<string, number>();
  const key = (p: number[]) => p.map((v) => v.toFixed(5)).join(",");
  for (const [a, b, c] of triangles(mesh)) {
    [[a, b], [b, c], [c, a]].forEach(([p, q]) => {
      const pk = key(p);
      const qk = key(q);
      if (pk === qk) return;
      const edge = pk < qk ? `${pk}|${qk}` : `${qk}|${pk}`;
      uses.set(edge, (uses.get(edge) ?? 0) + 1);
    });
  }
  return [...uses.values()].every((count) => count === 2);
}

/** Das Volumen aus der Dreieckssuppe - positiv, wenn die Flaechen nach aussen zeigen. */
function volume(mesh: { positions: Float32Array }) {
  return triangles(mesh).reduce((sum, [a, b, c]) => sum + (
    a[0] * (b[1] * c[2] - b[2] * c[1])
    - a[1] * (b[0] * c[2] - b[2] * c[0])
    + a[2] * (b[0] * c[1] - b[1] * c[0])
  ) / 6, 0);
}

describe("Die Form am Weg entlang", () => {
  it("baut aus einem rechteckigen Weg einen geschlossenen Rahmen", () => {
    /*
     * Das ist der Fall, an dem der CAD-Kern scheiterte: Er zog die Form ueber
     * die Ecken hinweg, statt sie abzuwinkeln, und an zwei Seiten kam nur
     * eine Flaeche heraus.
     */
    const mesh = buildSweepMesh([{ outer: square(2), holes: [] }], rectanglePath(20, 20), true, fan)!;
    expect(mesh).not.toBeNull();
    expect(watertight(mesh)).toBe(true);
    // Auf Gehrung gestossen fasst der Rahmen genau seine Querschnittsflaeche
    // mal die Laenge der Mittellinie: vier mal achtzig.
    expect(volume(mesh)).toBeCloseTo(320, 6);
  });

  it("legt die Ecken auf Gehrung, nicht stumpf aneinander", () => {
    // Aussen misst der Rahmen die Mittellinie plus die halbe Form auf jeder
    // Seite, innen entsprechend weniger - eine stumpfe Ecke haette dort ein
    // Loch oder einen Ueberstand.
    const mesh = buildSweepMesh([{ outer: square(2), holes: [] }], rectanglePath(20, 20), true, fan)!;
    const xs = triangles(mesh).flat().map((p) => p[0]);
    expect(Math.max(...xs)).toBeCloseTo(11, 6);
    expect(Math.min(...xs)).toBeCloseTo(-11, 6);
    // Quer zur Wegebene ist der Rahmen so dick wie die Form hoch ist.
    const zs = triangles(mesh).flat().map((p) => p[2]);
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(2, 6);
  });

  it("zieht die Form gerade hoch, wenn der Weg gerade ist", () => {
    const mesh = buildSweepMesh(
      [{ outer: square(4), holes: [] }],
      [{ x: 0, y: 0, z: 0 }, { x: 0, y: 10, z: 0 }],
      false,
      fan,
    )!;
    expect(watertight(mesh)).toBe(true);
    // Eine Saeule von vier mal vier ueber zehn.
    expect(volume(mesh)).toBeCloseTo(160, 6);
  });

  it("winkelt einen offenen Weg an seinem Knick ab", () => {
    const mesh = buildSweepMesh(
      [{ outer: square(2), holes: [] }],
      [{ x: 0, y: 0, z: 0 }, { x: 0, y: 10, z: 0 }, { x: 10, y: 10, z: 0 }],
      false,
      fan,
    )!;
    expect(watertight(mesh)).toBe(true);
    /*
     * Zwei Schenkel von je zehn, Querschnitt zwei mal zwei. Die Gehrung
     * traegt aussen genau so viel auf, wie sie innen wegnimmt - deshalb ist
     * es glatt die Flaeche mal die Laenge der Mittellinie.
     */
    expect(volume(mesh)).toBeCloseTo(4 * 20, 6);
  });

  it("nimmt ein Loch in der Form mit", () => {
    // Am geschlossenen Weg gepruft, weil er keine Deckel braucht - der
    // Faecher oben koennte ein Loch nicht aussparen.
    const mesh = buildSweepMesh([{ outer: square(6), holes: [square(2)] }], rectanglePath(20, 20), true, fan)!;
    expect(watertight(mesh)).toBe(true);
    expect(volume(mesh)).toBeCloseTo((36 - 4) * 80, 6);
  });

  it("weist einen Weg ab, der in sich zurueckknickt", () => {
    // Dort haette die Gehrungsebene keine Richtung mehr, und der Ring liefe
    // ins Unendliche.
    expect(buildSweepMesh(
      [{ outer: square(2), holes: [] }],
      [{ x: 0, y: 0, z: 0 }, { x: 0, y: 10, z: 0 }, { x: 0, y: 0, z: 0 }],
      false,
      fan,
    )).toBeNull();
  });

  it("raeumt doppelte Punkte weg und meldet zu wenig Weg", () => {
    expect(tidySweepPath([{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }], false)).toHaveLength(2);
    // Ein geschlossener Weg braucht den Anfangspunkt am Ende nicht doppelt.
    expect(tidySweepPath([{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }], true)).toHaveLength(2);
    expect(buildSweepMesh([{ outer: square(2), holes: [] }], [{ x: 0, y: 0, z: 0 }], false, fan)).toBeNull();
  });
});
