/**
 * dragAxisLock.ts
 *
 * Ein Zug, der auf einer Achse der Arbeitsebene bleibt.
 *
 * Mit Umschalt gezogen soll ein Koerper geradeaus laufen und nicht nebenbei
 * verrutschen - gerade beim Einpassen zweier Teile ist die zweite Richtung
 * genau das, was man nicht will. Genommen wird die der beiden Richtungen, in
 * die der Zug weiter gegangen ist; die andere wird auf null gesetzt.
 *
 * Auf der ebenen Arbeitsflaeche sind das X und Z. Auf einer gekippten Flaeche
 * sind es *deren* Richtungen, nicht die der Welt - sonst liefe der Koerper
 * aus der Flaeche heraus, auf der er steht.
 *
 * Nach Layerling 1.37.0.
 */

export type AxisLockPoint = { x: number; y: number; z: number };
export type AxisLockPlane = { xAxis: AxisLockPoint; zAxis: AxisLockPoint };

export type AxisLock = {
  /** Welche der beiden Ebenenachsen gilt. */
  along: "x" | "z";
  /** Die Verschiebung, auf diese Achse gelegt - in Weltkoordinaten. */
  delta: AxisLockPoint;
};

export function dragAxisLock(
  workplane: AxisLockPlane,
  deltaX: number,
  deltaY: number,
  deltaZ: number,
): AxisLock {
  const alongX = deltaX * workplane.xAxis.x + deltaY * workplane.xAxis.y + deltaZ * workplane.xAxis.z;
  const alongZ = deltaX * workplane.zAxis.x + deltaY * workplane.zAxis.y + deltaZ * workplane.zAxis.z;
  /*
   * Bei Gleichstand die erste Achse - irgendeine muss es sein, und so bleibt
   * die Antwort dieselbe, solange der Zeiger auf der Winkelhalbierenden steht,
   * statt zwischen beiden zu flackern.
   */
  const along: "x" | "z" = Math.abs(alongX) >= Math.abs(alongZ) ? "x" : "z";
  const axis = along === "x" ? workplane.xAxis : workplane.zAxis;
  const distance = along === "x" ? alongX : alongZ;
  /*
   * `+ 0` macht aus -0 eine 0. Das klingt nach Spitzfindigkeit, ist aber
   * dasselbe, was `placementWorkplane` und das Flachlegen schon tun: Eine
   * Null mit Vorzeichen wandert sonst in die Koerperkoordinaten und von dort
   * in Vergleiche, die sie nicht erwarten.
   */
  return {
    along,
    delta: {
      x: axis.x * distance + 0,
      y: axis.y * distance + 0,
      z: axis.z * distance + 0,
    },
  };
}
