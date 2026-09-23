/// <reference lib="webworker" />

import { OcctKernel, SweepMode, TransitionMode, type ShapeHandle } from "occt-wasm";
import { cadSketchRegions, type OrderedCadSketchPath } from "@/lib/sketchCadProfile";
import { segmentArcGeometry } from "@/lib/sketchArcs";
import { splitSweepDrawing, sweepPathPoint, sweepProfilePlacement } from "@/lib/sketchSweep";
import type { SketchCadBuildRequest, SketchCadBuildResponse } from "@/lib/sketchCadTypes";
import { SKETCH_CAD_DEFLECTION } from "@/lib/cadModifierRuntime";

let kernelPromise: Promise<OcctKernel> | null = null;

function kernel() {
  const moduleUrl = "/occt/occt-wasm.js";
  kernelPromise ??= import(/* webpackIgnore: true */ moduleUrl)
    .then((imported: { default: (options?: { locateFile?: (path: string) => string }) => Promise<unknown> }) => imported.default({
      locateFile: (path) => path.endsWith(".wasm") ? "/occt/occt-wasm.wasm" : path,
    }))
    .then((module) => {
      const KernelConstructor = OcctKernel as unknown as new (rawModule: unknown) => OcctKernel;
      return new KernelConstructor(module);
    })
    .catch((error) => {
      // Ein fehlgeschlagener Versuch wird verworfen, damit ein kurzer
      // Netzaussetzer beim Laden des Kerns nicht die ganze Sitzung vergiftet -
      // der naechste Aufruf laedt neu.
      kernelPromise = null;
      throw error;
    });
  return kernelPromise;
}

function post(message: SketchCadBuildResponse, transfer: Transferable[] = []) {
  self.postMessage(message, { transfer });
}

function pathWire(cad: OcctKernel, path: OrderedCadSketchPath) {
  const edges = path.steps.map(({ segment, from, to }) => {
    // Ein Bogen wird als Bogen gebaut, nicht als Kurve, die einem aehnlich
    // sieht: Der Kern legt ihn durch Anfang, Scheitel und Ende.
    const arc = segmentArcGeometry(segment, from, to);
    if (arc) {
      return cad.makeArcEdge({ x: from.x, y: 0, z: from.z }, { x: arc.apex.x, y: 0, z: arc.apex.z }, { x: to.x, y: 0, z: to.z });
    }
    const forward = segment.startId === from.id;
    const first = forward ? from.handleOut : from.handleIn;
    const second = forward ? to.handleIn : to.handleOut;
    if (segment.kind !== "line" && first && second) {
      return cad.makeBezierEdge([
        { x: from.x, y: 0, z: from.z },
        { x: first.x, y: 0, z: first.z },
        { x: second.x, y: 0, z: second.z },
        { x: to.x, y: 0, z: to.z },
      ]);
    }
    return cad.makeLineEdge({ x: from.x, y: 0, z: from.z }, { x: to.x, y: 0, z: to.z });
  });
  return cad.makeWire(edges);
}

/**
 * Der Pfad als Zug im Raum. Er liegt senkrecht zur Formebene: Die Tiefe der
 * Zeichnung wird zur Hoehe, die Querachse bleibt die Querachse.
 */
function spineWire(cad: OcctKernel, path: OrderedCadSketchPath) {
  const edges = path.steps.map(({ segment, from, to }) => {
    const arc = segmentArcGeometry(segment, from, to);
    if (arc) return cad.makeArcEdge(sweepPathPoint(from), sweepPathPoint(arc.apex), sweepPathPoint(to));
    const forward = segment.startId === from.id;
    const first = forward ? from.handleOut : from.handleIn;
    const second = forward ? to.handleIn : to.handleOut;
    if (segment.kind !== "line" && first && second) {
      return cad.makeBezierEdge([sweepPathPoint(from), sweepPathPoint(first), sweepPathPoint(second), sweepPathPoint(to)]);
    }
    return cad.makeLineEdge(sweepPathPoint(from), sweepPathPoint(to));
  });
  return cad.makeWire(edges);
}

self.onmessage = async (event: MessageEvent<SketchCadBuildRequest>) => {
  const request = event.data;
  let cad: OcctKernel | null = null;
  try {
    cad = await kernel();
    cad.releaseAll();
    // Beim Folgen wird der Weg aus der Zeichnung genommen, bevor daraus
    // Flaechen werden - sonst zaehlte ein geschlossener Weg als zweite Form.
    const drawing = request.type === "sweep" ? splitSweepDrawing(request.profile) : null;
    if (request.type === "sweep" && !drawing) {
      throw new Error("Draw a path for the shape to follow: an open stroke, or a second closed loop wider than the shape");
    }
    const regions = cadSketchRegions(drawing ? drawing.shape : request.profile);
    if (regions.length === 0) throw new Error("No closed profile found. Draw at least one closed loop and ensure it has no degenerate (zero-area) geometry.");
    const faceFor = (region: (typeof regions)[number]) => {
      let face = cad!.makeFace(pathWire(cad!, region.outer));
      if (region.holes.length > 0) face = cad!.addHolesInFace(face, region.holes.map((hole) => pathWire(cad!, hole)));
      return face;
    };
    let solids: ShapeHandle[];
    if (drawing) {
      const { spine } = drawing;
      const wire = spineWire(cad, spine);
      /*
       * Die Form steht quer auf dem Weg, mit ihrer Mitte an dessen Anfang.
       * Beide Zeichnungen haben denselben Nullpunkt, aber sie meinen
       * verschiedene Ebenen: Ohne das Kippen und Zusammenruecken laege die
       * Form flach da, wo sie gezeichnet wurde, statt im rechten Winkel dort,
       * wo der Weg beginnt.
       */
      const outline = regions.flatMap((region) => region.outer.points);
      const centre = {
        x: (Math.min(...outline.map((point) => point.x)) + Math.max(...outline.map((point) => point.x))) / 2,
        z: (Math.min(...outline.map((point) => point.z)) + Math.max(...outline.map((point) => point.z))) / 2,
      };
      const placement = sweepProfilePlacement(spine, centre);
      if (!placement) throw new Error("The path has no length at its start - draw it running away from the shape");
      /*
       * Gefuehrt wird die Form mit dem Rohr-Sweep und nicht mit dem einfachen
       * `pipe`. Der Unterschied zeigt sich an den Ecken: `pipe` zieht die
       * Flaeche ueber die Ecke hinweg, statt die Form dort abzuwinkeln - bei
       * einem rechteckigen Weg kommt an zwei Seiten nur eine Flaeche heraus,
       * und der Kern meldet trotzdem einen gueltigen Koerper. Der Rohr-Sweep
       * setzt an jeder Ecke des Weges eine Gehrung, und `withCorrection`
       * haelt die Form unterwegs im rechten Winkel zum Weg.
       *
       * `pipe` bleibt als zweiter Anlauf: Es ist das einfachere Verfahren und
       * kommt mit mancher Form durch, an der das aufwendigere scheitert.
       */
      const carried = regions.map((region) => cad!.transform(faceFor(region), placement));
      const attempt = (build: (face: ShapeHandle) => ShapeHandle) => {
        try {
          const built = carried.map(build);
          return built.every((solid) => cad!.isValid(solid)) ? built : null;
        } catch {
          // Der zweite Anlauf ist der Grund, warum das hier nicht durchfaellt.
          return null;
        }
      };
      solids = attempt((face) => cad!.sweepAdvanced(face, wire, {
        mode: SweepMode.Fixed,
        transitionMode: TransitionMode.RightCorner,
        withCorrection: true,
      }))
        ?? attempt((face) => cad!.sweepAdvanced(face, wire, {
          mode: SweepMode.Fixed,
          transitionMode: TransitionMode.RoundCorner,
          withCorrection: true,
        }))
        ?? attempt((face) => cad!.pipe(face, wire))
        ?? (() => {
          throw new Error(
            "The path cannot carry this shape. Usually the path bends tighter than the shape is wide, so the body folds into itself - widen the bend or make the shape smaller. A path that crosses itself does the same.",
          );
        })();
    } else {
      const height = request.type === "build" ? request.height : 0;
      solids = regions.map((region) => cad!.extrude(faceFor(region), 0, height, 0));
    }
    const result = solids.length === 1 ? solids[0] : cad.makeCompound(solids);
    if (!cad.isValid(result)) throw new Error("OpenCascade produced invalid sketch topology");
    const mesh = cad.tessellate(result, { linearDeflection: SKETCH_CAD_DEFLECTION.linear, angularDeflection: SKETCH_CAD_DEFLECTION.angular });
    const positions = new Float32Array(mesh.positions);
    const normals = new Float32Array(mesh.normals);
    const indices = new Uint32Array(mesh.indices);
    const brep = cad.toBREP(result);
    post({ type: "built", requestId: request.requestId, positions, normals, indices, triangleCount: mesh.triangleCount, brep }, [positions.buffer, normals.buffer, indices.buffer]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? "The CAD kernel could not build this sketch");
    post({ type: "error", requestId: request.requestId, message });
    if (/memory|WebAssembly|abort/i.test(message)) kernelPromise = null;
  } finally {
    try {
      cad?.releaseAll();
    } catch {
      // The arena may already have reset after a kernel error.
    }
  }
};

export {};
