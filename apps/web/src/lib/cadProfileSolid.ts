import type { OcctKernel, ShapeHandle } from "occt-wasm";

/**
 * cadProfileSolid.ts
 *
 * Ein Umriss, vom Kern hochgezogen: der genaue Koerper zu einer Form, deren
 * Grundflaeche ein Vieleck ist.
 *
 * Darauf wirken die Kantenwerkzeuge. Ein Netz ist fuer OpenCascade ein Haufen
 * Dreiecke - eine Verrundung daran scheitert oder gibt Unsinn. Gemessen an
 * einer Raendelung mit 30 Rillen: der genaue Koerper entsteht in 36 ms, hat
 * 236 Dreiecke und 62 Flaechen, und eine Verrundung von 0,15 mm an einer
 * Rillenkante rechnet in 54 ms.
 *
 * Bis jetzt kommt nur die Raendelung hier durch. Layerling baut so 23
 * Katalogformen (Stern, Herz, Zahnrad, Schrift ...); das ist ein eigener,
 * grosser Posten. Diese Datei ist sein Anfang und bewusst nicht nach der
 * Raendelung benannt.
 */

/** Der Umriss liegt in der Grundflaeche: Paare aus x und z, im Rahmen des Koerpers. */
export type CadProfileLoop = readonly number[];

export type CadProfileExtrusion = {
  loop: CadProfileLoop;
  /**
   * Eine runde Bohrung in der Grundflaeche, mittig - als echter Kreis und
   * nicht als Vieleck. Das Netz zeichnet sie als Vieleck mit vielen Ecken;
   * der genaue Koerper darf runder sein als das Bild, nur nicht kantiger.
   */
  bore?: number;
  height: number;
  /**
   * Die Fase von 45 Grad an beiden Enden: `size` weit, gemessen von `radius`
   * nach innen. Fehlt sie, bleiben die Enden scharf.
   */
  capChamfer?: { radius: number; size: number };
};

function loopPoints(loop: CadProfileLoop) {
  const points: Array<{ x: number; y: number; z: number }> = [];
  for (let index = 0; index + 1 < loop.length; index += 2) {
    points.push({ x: loop[index], y: 0, z: loop[index + 1] });
  }
  return points;
}

/**
 * Die Huelle der Fase: ein Fass mit 45 Grad an beiden Enden, gedreht aus
 * seinem Schnitt.
 *
 * Warum eine Huelle und nicht eine Fase auf den Randkanten: Das Netz der Form
 * rechnet die Fase als Kegel (`min(Umriss, Kegel)`), nicht Kante fuer Kante.
 * Eine Fase auf jeder Randkante waere etwas anderes - sie folgt auch den
 * Rillenflanken - und das Ergebnis passte nicht zu dem, was im Bild steht
 * (gemessen: 4.404 statt 4.418 mm^3). Sie ist zudem langsamer: 1,3 s gegen
 * 1,1 s bei 30 Rillen, und 8 s gegen 2,2 s bei 78.
 */
function chamferEnvelope(cad: OcctKernel, radius: number, height: number, size: number): ShapeHandle {
  const section = [
    { x: 0, y: 0, z: 0 },
    { x: radius - size, y: 0, z: 0 },
    { x: radius, y: size, z: 0 },
    { x: radius, y: height - size, z: 0 },
    { x: radius - size, y: height, z: 0 },
    { x: 0, y: height, z: 0 },
  ];
  const edges = section.map((point, index) => cad.makeLineEdge(point, section[(index + 1) % section.length]));
  const face = cad.makeFace(cad.makeWire(edges));
  return cad.revolve(face, { point: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 1, z: 0 } }, Math.PI * 2);
}

/**
 * Der genaue Koerper zu einem hochgezogenen Umriss.
 *
 * Der Umriss muss geschlossen sein - der letzte Punkt wird mit dem ersten
 * verbunden - und mindestens drei Punkte haben.
 */
export function buildProfileExtrusionSolid(cad: OcctKernel, part: CadProfileExtrusion): ShapeHandle {
  const points = loopPoints(part.loop);
  if (points.length < 3) throw new Error("The profile needs at least three points");
  if (!points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.z))) {
    throw new Error("The profile has a point that is not a number");
  }
  if (!(Number.isFinite(part.height) && part.height > 0)) throw new Error("The profile has no height");
  const edges = points.map((point, index) => cad.makeLineEdge(point, points[(index + 1) % points.length]));
  let face = cad.makeFace(cad.makeWire(edges));
  const bore = part.bore;
  if (bore !== undefined && bore > 0) {
    const circle = cad.makeCircleEdge({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, bore / 2);
    face = cad.addHolesInFace(face, [cad.makeWire([circle])]);
  }
  const solid = cad.extrude(face, 0, part.height, 0);
  const chamfer = part.capChamfer;
  if (!chamfer || !(chamfer.size > 0) || !(chamfer.radius > chamfer.size)) return solid;
  const envelope = chamferEnvelope(cad, chamfer.radius, part.height, chamfer.size);
  try {
    return cad.common(solid, envelope);
  } finally {
    try {
      cad.release(envelope);
    } catch {
      // Ein gescheiterter Verschnitt kann Zwischengriffe ungueltig machen.
    }
  }
}
