import { describe, expect, it } from "vitest";
import {
  bakedRotationForBake,
  parametricRebuildPlan,
  parametricSourceForBake,
  patchTouchesBodyParameters,
  patchTouchesRotation,
} from "@/lib/parametricSource";
import { canonicalizeShape, shapeAccumulatedRotation } from "@/lib/workplaneShapes";
import type { WorkplaneShape } from "@/types/sketchforge";

function shape(overrides: Partial<WorkplaneShape> = {}): WorkplaneShape {
  return canonicalizeShape({
    id: "s1",
    name: "Koerper",
    kind: "box",
    color: "#888888",
    x: 10,
    z: -4,
    elevation: 2,
    size: 20,
    width: 20,
    depth: 20,
    height: 20,
    rotation: 0,
    rotationX: 0,
    rotationZ: 0,
    ...overrides,
  } as WorkplaneShape);
}

/**
 * Drehen backt den Koerper in ein Netz - nur so laesst sich sein Rahmen
 * ehrlich neu aufsetzen. Bis hierher war damit alles verloren, was ihn
 * ausmacht: die Bauwerte waren nicht mehr zu erreichen, und im Drehfeld
 * stand wieder eine Null, obwohl das Objekt schief stand.
 */
describe("was ein Koerper vor dem Drehen war", () => {
  it("haelt Art, Masse und Winkel beim ersten Backen fest", () => {
    const turned = shape({ kind: "cylinder", rotation: 30, width: 12, depth: 12, height: 40 });
    const source = parametricSourceForBake(turned)!;
    expect(source.kind).toBe("cylinder");
    expect(source.rotation).toBe(30);
    expect(source.height).toBe(40);
  });

  it("verkettet eine zweite Drehung mit der ersten", () => {
    const once = parametricSourceForBake(shape({ kind: "cylinder", rotation: 30 }))!;
    const baked = shape({ kind: "mesh", rotation: 0, parametricSource: once });
    // Jetzt noch einmal 30 Grad auf das gebackene Netz.
    const twice = parametricSourceForBake({ ...baked, rotation: 30 })!;
    expect(twice.rotation).toBeCloseTo(60, 6);
    expect(twice.kind).toBe("cylinder");
  });

  it("merkt sich nichts von einem gespiegelten Koerper", () => {
    // Ein gespiegeltes Rechtsgewinde ist ein Linksgewinde - das waere ein
    // anderer Koerper, und ihn spaeter "wiederherzustellen" waere falsch.
    expect(parametricSourceForBake(shape({ kind: "thread", rotation: 20, mirrorX: true }))).toBeUndefined();
    // Ein Netz und eine Gruppe haben ohnehin keine Bauwerte.
    expect(parametricSourceForBake(shape({ kind: "mesh", rotation: 20 }))).toBeUndefined();
  });
});

describe("der Rueckweg aus dem Netz", () => {
  const source = {
    kind: "cylinder" as const,
    width: 12,
    depth: 12,
    height: 40,
    size: 12,
    rotation: 30,
    rotationX: 0,
    rotationZ: 0,
  };
  const baked = shape({ kind: "mesh", rotation: 0, parametricSource: source, sides: 96 });

  it("baut die Urform wieder auf und setzt die Aenderung ein", () => {
    const plan = parametricRebuildPlan(baked, { sides: 6 })!;
    expect(plan.original.kind).toBe("cylinder");
    expect(plan.original.sides).toBe(6);
    expect(plan.original.height).toBe(40);
    expect(plan.original.rotation).toBe(0);
    // Die aufgelaufene Drehung kommt danach wieder darauf.
    expect(plan.rotation).toEqual({ rotation: 30, rotationX: 0, rotationZ: 0 });
    // Und ein reiner Bauwert bewegt den Koerper nicht.
    expect(plan.turns).toBe(false);
  });

  it("legt einen Winkel vom Drehgriff obendrauf", () => {
    const plan = parametricRebuildPlan(baked, { rotation: 15 })!;
    expect(plan.rotation.rotation).toBeCloseTo(45, 6);
    expect(plan.turns).toBe(true);
  });

  it("nimmt einen eingetippten Winkel als den, unter dem das Objekt stehen soll", () => {
    // Genau das fehlte: 0 eintippen muss das Objekt gerade stellen, nicht
    // seine 30 Grad unveraendert lassen.
    const plan = parametricRebuildPlan(baked, { rotation: 0 }, true)!;
    expect(plan.rotation).toEqual({ rotation: 0, rotationX: 0, rotationZ: 0 });
    // Und eine genannte Achse raeumt die anderen nicht mit weg.
    const tilted = shape({ kind: "mesh", parametricSource: { ...source, rotationX: 45 } });
    expect(parametricRebuildPlan(tilted, { rotation: 90 }, true)!.rotation)
      .toEqual({ rotation: 90, rotationX: 45, rotationZ: 0 });
  });

  it("laesst einen Koerper ohne Gedaechtnis in Ruhe", () => {
    expect(parametricRebuildPlan(shape({ kind: "box" }), { sides: 6 })).toBeNull();
  });
});

describe("welcher Patch den Koerper meint", () => {
  it("erkennt Bauwerte und Drehwinkel auseinander", () => {
    expect(patchTouchesBodyParameters({ sides: 6 })).toBe(true);
    expect(patchTouchesBodyParameters({ threadPitch: 1.5 })).toBe(true);
    expect(patchTouchesBodyParameters({ x: 5, width: 20 })).toBe(false);
    expect(patchTouchesRotation({ rotationZ: 0 })).toBe(true);
    expect(patchTouchesRotation({ x: 5 })).toBe(false);
  });
});

/**
 * Ein Koerper ohne Urform - ein Skizzen- oder Rotationskoerper, ein
 * eingelesenes Netz - laesst sich nicht neu bauen, sein Winkel aber
 * festhalten. Ohne ihn fing der Zaehler nach jeder Drehung wieder bei null
 * an: Man wusste nicht mehr, wie schief das Objekt steht, und konnte es
 * nicht wieder gerade stellen.
 */
describe("Der Winkel eines Koerpers ohne Urform", () => {
  const mesh = {
    id: "m", name: "Rotationskoerper", kind: "mesh", color: "#fff",
    x: 0, z: 0, elevation: 0, size: 20, width: 20, depth: 20, height: 40,
    rotation: 0, rotationX: 0, rotationZ: 0,
    importedMesh: { positions: [], triangleCount: 0 },
  } as unknown as WorkplaneShape;

  it("haelt die erste Drehung fest, wo es keine Urform gibt", () => {
    expect(parametricSourceForBake({ ...mesh, rotation: 30 })).toBeUndefined();
    expect(bakedRotationForBake({ ...mesh, rotation: 30 })).toEqual({ rotation: 30, rotationX: 0, rotationZ: 0 });
  });

  it("verkettet eine zweite Drehung mit der ersten", () => {
    const once = bakedRotationForBake({ ...mesh, rotation: 30 })!;
    const twice = bakedRotationForBake({ ...mesh, rotation: 45, bakedRotation: once } as unknown as WorkplaneShape)!;
    expect(twice.rotation).toBeCloseTo(75, 6);
  });

  it("wird vom Winkelzaehler gelesen, wenn keine Urform dasteht", () => {
    const turned = { ...mesh, bakedRotation: { rotation: 75, rotationX: 0, rotationZ: 0 } } as unknown as WorkplaneShape;
    expect(shapeAccumulatedRotation(turned).rotation).toBeCloseTo(75, 6);
    // Eine noch nicht gebackene Drehung kommt obendrauf.
    expect(shapeAccumulatedRotation({ ...turned, rotation: 15 } as WorkplaneShape).rotation).toBeCloseTo(90, 6);
  });

  it("merkt sich nichts von einem gespiegelten Koerper", () => {
    // Eine Spiegelung liesse sich nicht als Winkel wieder auftragen.
    expect(bakedRotationForBake({ ...mesh, rotation: 30, mirrorX: true } as WorkplaneShape)).toBeUndefined();
  });
});
