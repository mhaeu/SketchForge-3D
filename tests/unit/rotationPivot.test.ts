import { describe, expect, it } from "vitest";
import { planarFace, planarFaceCentroid } from "@/lib/rotationPivot";

/** Ein Rechteck in der Ebene y = `height`, als zwei Dreiecke. */
function quad(x0: number, z0: number, x1: number, z1: number, height: number) {
  return [
    x0, height, z0, x1, height, z0, x1, height, z1,
    x0, height, z0, x1, height, z1, x0, height, z1,
  ];
}

/** Ein Ring aus Dreiecken in der Ebene y = `height`, Mitte bei (cx, cz). */
function disc(cx: number, cz: number, height: number, radius: number, sides: number) {
  const positions: number[] = [];
  for (let side = 0; side < sides; side += 1) {
    const a = (side / sides) * Math.PI * 2;
    const b = ((side + 1) / sides) * Math.PI * 2;
    positions.push(
      cx, height, cz,
      cx + Math.cos(a) * radius, height, cz + Math.sin(a) * radius,
      cx + Math.cos(b) * radius, height, cz + Math.sin(b) * radius,
    );
  }
  return positions;
}

describe("Die Mitte der angeklickten Flaeche", () => {
  it("findet die Mitte eines Rechtecks von jedem seiner Dreiecke aus", () => {
    const positions = quad(0, 0, 20, 10, 4);
    for (const triangle of [0, 1]) {
      const centre = planarFaceCentroid(positions, triangle)!;
      expect(centre.x).toBeCloseTo(10, 6);
      expect(centre.y).toBeCloseTo(4, 6);
      expect(centre.z).toBeCloseTo(5, 6);
    }
  });

  it("findet auf dem runden Ende eines Rohrs seine Achse", () => {
    // Genau der Zweck: Ein Bogen soll um die Achse seines Endes drehen.
    const positions = disc(7, -3, 12, 5, 64);
    const centre = planarFaceCentroid(positions, 10)!;
    expect(centre.x).toBeCloseTo(7, 4);
    expect(centre.y).toBeCloseTo(12, 6);
    expect(centre.z).toBeCloseTo(-3, 4);
  });

  /**
   * Der Zusammenhang ist tragend: Bei einem U-Bogen liegen beide Enden in
   * derselben Ebene. Wer nur nach "gleiche Ebene" geht, mittelt ueber beide
   * und landet in der Luft zwischen den Rohren.
   */
  it("nimmt nur die Flaeche, die mit dem Klick zusammenhaengt", () => {
    const left = disc(-20, 0, 6, 4, 32);
    const right = disc(20, 0, 6, 4, 32);
    const positions = [...left, ...right];
    const onLeft = planarFaceCentroid(positions, 3)!;
    expect(onLeft.x).toBeCloseTo(-20, 4);
    const onRight = planarFaceCentroid(positions, 32 + 3)!;
    expect(onRight.x).toBeCloseTo(20, 4);
  });

  it("uebergeht Dreiecke in anderen Ebenen", () => {
    // Boden und Deckel eines Kastens: derselbe Umriss, andere Hoehe.
    const positions = [...quad(0, 0, 10, 10, 0), ...quad(0, 0, 10, 10, 30)];
    expect(planarFaceCentroid(positions, 0)!.y).toBeCloseTo(0, 6);
    expect(planarFaceCentroid(positions, 2)!.y).toBeCloseTo(30, 6);
  });

  it("wiegt nach Flaeche, nicht nach Dreieckszahl", () => {
    /*
     * Ein Rechteck aus einem grossen und zwei kleinen Dreiecken: Zaehlte man
     * die Dreiecke, laege die Mitte bei den kleinen. Nach Flaeche gewichtet
     * liegt sie dort, wo sie hingehoert.
     */
    const positions = [
      // Das grosse Dreieck (0,0) (20,0) (20,20)
      0, 0, 0, 20, 0, 0, 20, 0, 20,
      // Zwei kleine, die den Rest auffuellen: (0,0) (20,20) (10,20) und (0,0) (10,20) (0,20)
      0, 0, 0, 20, 0, 20, 10, 0, 20,
      0, 0, 0, 10, 0, 20, 0, 0, 20,
    ];
    const centre = planarFaceCentroid(positions, 0)!;
    // Das ganze Rechteck 20 x 20 hat seine Mitte bei (10, 10).
    expect(centre.x).toBeCloseTo(10, 6);
    expect(centre.z).toBeCloseTo(10, 6);
  });

  it("meldet nichts bei einem Treffer, den es nicht gibt", () => {
    const positions = quad(0, 0, 10, 10, 0);
    expect(planarFaceCentroid(positions, -1)).toBeNull();
    expect(planarFaceCentroid(positions, 99)).toBeNull();
    expect(planarFaceCentroid([], 0)).toBeNull();
  });

  it("meldet nichts bei einem entarteten Dreieck", () => {
    // Drei Punkte auf einer Linie spannen keine Flaeche auf, also auch keine
    // Ebene, in der man suchen koennte.
    expect(planarFaceCentroid([0, 0, 0, 5, 0, 0, 10, 0, 0], 0)).toBeNull();
  });
});

/**
 * Die Dreiecke der Flaeche selbst - ohne sie liesse sie sich nicht zeichnen.
 * Das Hervorheben unter dem Zeiger beim Flachlegen braucht genau diese Liste.
 */
describe("Die Dreiecke der angeklickten Flaeche", () => {
  it("nennt beide Dreiecke eines Rechtecks, von jedem aus", () => {
    const positions = quad(0, 0, 20, 10, 4);
    for (const triangle of [0, 1]) {
      expect(planarFace(positions, triangle)?.triangles.slice().sort()).toEqual([0, 1]);
    }
  });

  it("nennt alle Dreiecke einer Scheibe", () => {
    const positions = disc(0, 0, 6, 10, 24);
    const face = planarFace(positions, 5);
    expect(face?.triangles.length).toBe(24);
    expect(new Set(face?.triangles).size).toBe(24);
  });

  it("nennt das getroffene Dreieck immer mit", () => {
    const positions = disc(0, 0, 6, 10, 12);
    for (const triangle of [0, 4, 11]) {
      expect(planarFace(positions, triangle)?.triangles).toContain(triangle);
    }
  });

  /**
   * Was in einer anderen Ebene liegt, gehoert nicht dazu - sonst waere das
   * Hervorheben beim Flachlegen das halbe Objekt.
   */
  it("laesst eine zweite Ebene aussen vor", () => {
    const positions = [...quad(0, 0, 20, 10, 4), ...quad(0, 0, 20, 10, 9)];
    const lower = planarFace(positions, 0);
    expect(lower?.triangles.slice().sort()).toEqual([0, 1]);
    const upper = planarFace(positions, 2);
    expect(upper?.triangles.slice().sort()).toEqual([2, 3]);
  });

  /**
   * Und was in derselben Ebene liegt, aber nicht zusammenhaengt, auch nicht:
   * zwei Rechtecke auf gleicher Hoehe, weit auseinander.
   */
  it("laesst eine getrennte Flaeche derselben Ebene aussen vor", () => {
    const positions = [...quad(0, 0, 10, 10, 4), ...quad(50, 0, 60, 10, 4)];
    expect(planarFace(positions, 0)?.triangles.slice().sort()).toEqual([0, 1]);
    expect(planarFace(positions, 3)?.triangles.slice().sort()).toEqual([2, 3]);
  });

  it("gibt nichts her, wo es kein solches Dreieck gibt", () => {
    const positions = quad(0, 0, 20, 10, 4);
    expect(planarFace(positions, -1)).toBeNull();
    expect(planarFace(positions, 2)).toBeNull();
  });
});
