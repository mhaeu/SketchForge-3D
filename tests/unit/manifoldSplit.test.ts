import { beforeAll, describe, expect, it } from "vitest";
import manifoldModule from "manifold-3d";
import type { ManifoldToplevel } from "manifold-3d";
import { dropSplitSlivers, unionSplitManifoldComponents } from "@/lib/manifoldSplit";

/**
 * Am echten Kern gerechnet, nicht an einer Nachbildung: Was beim Teilen
 * schiefgeht, geht in Manifold schief, und eine Nachbildung wuerde genau das
 * verstecken.
 */
let runtime: ManifoldToplevel;

beforeAll(async () => {
  runtime = await manifoldModule();
  runtime.setup();
}, 120000);

/** Ein rundum geschlossener Hohlkoerper: Kasten minus kleinerer Kasten. */
function hollowBox(outer: number, wall: number) {
  const { Manifold } = runtime;
  return Manifold.cube([outer, outer, outer], true).subtract(Manifold.cube([outer - wall * 2, outer - wall * 2, outer - wall * 2], true));
}

describe("Was der Kern beim Teilen hergibt", () => {
  it("teilt einen Wuerfel in zwei gleiche Haelften", () => {
    const [positive, negative] = runtime.Manifold.cube([20, 20, 20], true).splitByPlane([0, 0, 1], 0);
    expect(positive.status()).toBe("NoError");
    expect(negative.status()).toBe("NoError");
    expect(positive.volume()).toBeCloseTo(4000, 6);
    expect(negative.volume()).toBeCloseTo(4000, 6);
  });

  /**
   * Der Fall, auf den es beim Aushoehlen ankommt: Der Hohlraum muss die
   * Teilung ueberleben. Ein 20er Kasten mit 2 mm Wand hat 3904 mm3 Material;
   * beide Haelften zusammen muessen dasselbe ergeben.
   */
  it("laesst einem Hohlkoerper seinen Hohlraum", () => {
    const hollow = hollowBox(20, 2);
    expect(hollow.volume()).toBeCloseTo(3904, 6);
    const [positive, negative] = hollow.splitByPlane([0, 0, 1], 0);
    expect(positive.volume() + negative.volume()).toBeCloseTo(3904, 6);
    expect(positive.volume()).toBeCloseTo(1952, 6);
  });

  /** Ein geschlossener Hohlkoerper ist fuer den Kern zweierlei: Haut und Hohlraum. */
  it("zerfaellt ein Hohlkoerper in Aussenhaut und Hohlraum", () => {
    const parts = hollowBox(20, 2).decompose();
    expect(parts.length).toBe(2);
    expect(parts.filter((part) => part.volume() > 0).length).toBe(1);
    expect(parts.filter((part) => part.volume() < 0).length).toBe(1);
  });
});

describe("Mehrere Koerper vor dem Teilen zusammenlegen", () => {
  it("laesst einen einzelnen Koerper, wie er ist", () => {
    const cube = runtime.Manifold.cube([10, 10, 10], true);
    expect(unionSplitManifoldComponents(runtime, cube).solid?.volume()).toBeCloseTo(1000, 6);
  });

  /**
   * Zwei sich durchdringende Koerper muessen einer werden, sonst schneidet
   * die Ebene zwei Mal und die Haelften stecken ineinander.
   */
  it("vereinigt zwei sich durchdringende Koerper", () => {
    const { Manifold } = runtime;
    const overlapping = Manifold.cube([10, 10, 10], true).add(Manifold.cube([10, 10, 10], true).translate([5, 0, 0]));
    const united = unionSplitManifoldComponents(runtime, overlapping);
    // 10x10x10 plus die Haelfte noch einmal: 1500, nicht 2000.
    expect(united.solid?.volume()).toBeCloseTo(1500, 6);
    expect(united.solid?.decompose().length).toBe(1);
  });

  /**
   * Der Fall, der die Umwendung braucht: zwei Hohlkoerper nebeneinander in
   * *einer* Auswahl. Der Kern sieht darin vier Teile - zwei Aussenhaeute und
   * zwei Hohlraeume -, und eine Vereinigung ueber alle vier wuerde die
   * Hohlraeume zuschuetten.
   *
   * Zwei Kaesten von 20 mm mit 2 mm Wand sind 2 x 3904 mm3 Material.
   * Zugeschuettet waeren es 2 x 8000.
   */
  it("schuettet die Hohlraeume nicht zu", () => {
    const apart = runtime.Manifold.compose([hollowBox(20, 2), hollowBox(20, 2).translate([40, 0, 0])]);
    expect(apart.decompose().filter((part) => part.volume() > 0).length).toBe(2);
    const united = unionSplitManifoldComponents(runtime, apart);
    expect(united.solid).not.toBeNull();
    expect(united.solid!.volume()).toBeCloseTo(7808, 3);
  });

  /**
   * Durchdringen sich zwei Hohlkoerper, verschmelzen ihre Hohlraeume zu
   * einem: Dann sieht der Kern nur noch *eine* Aussenhaut, und die Auswahl
   * geht unveraendert durch - es gibt nichts zu vereinigen.
   */
  it("laesst zwei durchdringende Hohlkoerper unangetastet", () => {
    const overlapping = hollowBox(20, 2).add(hollowBox(20, 2).translate([10, 0, 0]));
    expect(overlapping.decompose().filter((part) => part.volume() > 0).length).toBe(1);
    const united = unionSplitManifoldComponents(runtime, overlapping);
    expect(united.solid?.volume()).toBeCloseTo(overlapping.volume(), 6);
  });

  /** Gemischt: ein Hohlkoerper und ein Vollkoerper in einer Auswahl. */
  it("legt einen Hohl- und einen Vollkoerper zusammen, ohne zu fuellen", () => {
    const mixed = runtime.Manifold.compose([hollowBox(20, 2), runtime.Manifold.cube([10, 10, 10], true).translate([40, 0, 0])]);
    expect(unionSplitManifoldComponents(runtime, mixed).solid?.volume()).toBeCloseTo(3904 + 1000, 3);
  });
});

describe("Die Haeute ohne Dicke", () => {
  it("laesst einen gewoehnlichen Koerper unangetastet", () => {
    const cube = runtime.Manifold.cube([10, 10, 10], true);
    const kept = dropSplitSlivers(runtime, cube);
    expect(kept.solid?.volume()).toBeCloseTo(1000, 6);
  });

  /**
   * Eine Haelfte, die ausser einem Koerper noch ein flaches Blatt enthaelt,
   * verliert das Blatt. Nachgestellt mit einem Wuerfel und einer sehr
   * flachen Platte daneben - genau das laesst ein Schnitt auf einer Flaeche
   * zurueck.
   */
  it("wirft ein flaches Blatt neben dem Koerper weg", () => {
    const { Manifold } = runtime;
    const sheet = Manifold.cube([10, 10, 1e-7], true).translate([30, 0, 0]);
    const withSheet = Manifold.cube([10, 10, 10], true).add(sheet);
    expect(withSheet.decompose().length).toBe(2);
    const kept = dropSplitSlivers(runtime, withSheet);
    expect(kept.solid).not.toBeNull();
    expect(kept.solid!.decompose().length).toBe(1);
    expect(kept.solid!.volume()).toBeCloseTo(1000, 3);
  });

  /** Ein Hohlraum ist kein Blatt: Er zaehlt nach seiner Groesse mit. */
  it("behaelt den Hohlraum eines ausgehoehlten Koerpers", () => {
    const hollow = hollowBox(20, 2);
    const kept = dropSplitSlivers(runtime, hollow);
    expect(kept.solid?.volume()).toBeCloseTo(3904, 6);
    expect(kept.solid?.decompose().length).toBe(2);
  });

  it("gibt nichts her, wenn alles nur Haut war", () => {
    const sheet = runtime.Manifold.cube([10, 10, 1e-9], true);
    expect(dropSplitSlivers(runtime, sheet).solid).toBeNull();
  });
});
