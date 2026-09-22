/// <reference lib="webworker" />

import { OcctKernel, type ShapeHandle } from "occt-wasm";
import { cadSketchRegions, type OrderedCadSketchPath } from "@/lib/sketchCadProfile";
import { sweepPathPoint, sweepSpineFromLowestEnd, sweepSpinePath, sweepStartLeavesProfilePlane } from "@/lib/sketchSweep";
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
    const regions = cadSketchRegions(request.profile);
    if (regions.length === 0) throw new Error("No closed profile found. Draw at least one closed loop and ensure it has no degenerate (zero-area) geometry.");
    const faceFor = (region: (typeof regions)[number]) => {
      let face = cad!.makeFace(pathWire(cad!, region.outer));
      if (region.holes.length > 0) face = cad!.addHolesInFace(face, region.holes.map((hole) => pathWire(cad!, hole)));
      return face;
    };
    let solids: ShapeHandle[];
    if (request.type === "sweep") {
      const drawn = sweepSpinePath(request.profile);
      if (!drawn) throw new Error("Draw an open path for the shape to follow, beside the closed outline");
      const spine = sweepSpineFromLowestEnd(drawn);
      if (!sweepStartLeavesProfilePlane(spine)) {
        throw new Error("The path starts inside the plane of the shape - draw it running out of that plane");
      }
      const wire = spineWire(cad, spine);
      /*
       * Die Form sitzt mit ihrer Mitte am Anfang des Pfades. Beide
       * Zeichnungen haben denselben Nullpunkt, aber sie meinen verschiedene
       * Ebenen - ohne das Zusammenruecken stuende der Koerper dort, wo die
       * Form gezeichnet wurde, statt dort, wo der Weg beginnt.
       */
      const start = sweepPathPoint(spine.steps[0].from);
      const outline = regions.flatMap((region) => region.outer.points);
      const centre = {
        x: (Math.min(...outline.map((point) => point.x)) + Math.max(...outline.map((point) => point.x))) / 2,
        z: (Math.min(...outline.map((point) => point.z)) + Math.max(...outline.map((point) => point.z))) / 2,
      };
      solids = regions.map((region) => cad!.pipe(
        cad!.translate(faceFor(region), start.x - centre.x, start.y, start.z - centre.z),
        wire,
      ));
    } else {
      solids = regions.map((region) => cad!.extrude(faceFor(region), 0, request.height, 0));
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
