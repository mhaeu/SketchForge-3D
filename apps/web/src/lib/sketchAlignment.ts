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
