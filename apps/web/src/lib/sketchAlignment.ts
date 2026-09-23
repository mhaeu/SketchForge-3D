export type SketchPlanePosition = { x: number; z: number };

export type SketchAlignmentTarget = SketchPlanePosition & { id: string };

export type SketchAlignmentGuide = {
  /** Die Achse, auf der die beiden Punkte uebereinstimmen. */
  axis: "x" | "z";
  /** Der Punkt, an dem eingerastet wurde. */
  from: SketchPlanePosition;
  /** Der Punkt, der dorthin gezogen wurde. */
  to: SketchPlanePosition;
};

export type SketchAlignment = {
  point: SketchPlanePosition;
  guides: SketchAlignmentGuide[];
};

/**
 * Einen Punkt an den anderen ausrichten.
 *
 * Kommt er einem anderen Punkt auf einer Achse nahe genug, rastet er auf
 * dessen Wert ein, und dazu wird eine Hilfslinie gemeldet: senkrecht, wenn
 * beide dieselbe Breite haben, waagerecht bei derselben Tiefe. Beide Achsen
 * koennen zugleich einrasten - dann liegt der Punkt genau auf der Ecke, die
 * zwei andere Punkte aufspannen.
 *
 * Eingerastet wird **nach** dem Raster: Wer einen Punkt an einem anderen
 * ausrichten will, meint diesen anderen Punkt und nicht die naechste
 * Rasterlinie daneben. Der naechste Nachbar gewinnt, und bei gleichem Abstand
 * der zuerst gefundene - so bleibt die Wahl bei einer Punktwolke ruhig,
 * statt zwischen zwei gleich weit entfernten zu flackern.
 */
export function alignSketchPoint(
  candidate: SketchPlanePosition,
  targets: readonly SketchAlignmentTarget[],
  tolerance: number,
  exclude?: string | null,
): SketchAlignment {
  if (!(tolerance > 0)) return { point: candidate, guides: [] };
  const point = { ...candidate };
  const guides: SketchAlignmentGuide[] = [];

  for (const axis of ["x", "z"] as const) {
    let nearest: SketchAlignmentTarget | null = null;
    let nearestDistance = tolerance;
    for (const target of targets) {
      if (target.id === exclude) continue;
      const distance = Math.abs(target[axis] - candidate[axis]);
      if (distance < nearestDistance) {
        nearest = target;
        nearestDistance = distance;
      }
    }
    if (!nearest) continue;
    point[axis] = nearest[axis];
    guides.push({ axis, from: { x: nearest.x, z: nearest.z }, to: point });
  }

  // Die Linien werden erst jetzt auf den fertigen Punkt gesetzt: Rastet die
  // zweite Achse noch ein, waere die erste sonst auf eine Stelle gezogen, an
  // der der Punkt am Ende gar nicht liegt.
  return { point, guides: guides.map((guide) => ({ ...guide, to: { ...point } })) };
}

/**
 * Die Hilfslinien, die dauerhaft stehen bleiben.
 *
 * Beim Ziehen zeigt eine Linie, woran gerade eingerastet wurde - danach ist
 * sie weg, und ob zwei Punkte wirklich uebereinander liegen, muesste man
 * wieder nachmessen. Diese hier bleiben: Wo zwei Punkte dieselbe Breite oder
 * dieselbe Tiefe haben, steht eine Linie dazwischen.
 *
 * Damit daraus kein Netz wird, gilt zweierlei. Verbunden wird nur mit dem
 * naechsten Nachbarn auf der Linie, nicht jeder mit jedem - eine Reihe von
 * fuenf Punkten ergibt vier Linien und nicht zehn. Und wo ohnehin eine Kante
 * zwischen zwei Punkten laeuft, sagt die Kante schon alles; dort kommt keine
 * Hilfslinie dazu.
 */
export function persistentSketchGuides(
  points: readonly SketchAlignmentTarget[],
  segments: readonly { startId: string; endId: string }[],
  tolerance = 1e-6,
): SketchAlignmentGuide[] {
  const joined = new Set(segments.map((segment) => [segment.startId, segment.endId].sort().join("\u0000")));
  const guides: SketchAlignmentGuide[] = [];

  for (const axis of ["x", "z"] as const) {
    const other = axis === "x" ? "z" : "x";
    const sorted = [...points].sort((a, b) => a[axis] - b[axis] || a[other] - b[other]);
    let group: SketchAlignmentTarget[] = [];
    const flush = () => {
      if (group.length >= 2) {
        const ordered = [...group].sort((a, b) => a[other] - b[other]);
        for (let index = 1; index < ordered.length; index += 1) {
          const from = ordered[index - 1];
          const to = ordered[index];
          if (joined.has([from.id, to.id].sort().join("\u0000"))) continue;
          guides.push({ axis, from: { x: from.x, z: from.z }, to: { x: to.x, z: to.z } });
        }
      }
      group = [];
    };
    for (const point of sorted) {
      if (group.length > 0 && Math.abs(point[axis] - group[0][axis]) > tolerance) flush();
      group.push(point);
    }
    flush();
  }

  return guides;
}
