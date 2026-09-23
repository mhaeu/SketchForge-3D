/// <reference lib="webworker" />

import { OcctKernel } from "occt-wasm";
import { cadSketchRegions, type OrderedCadSketchPath } from "@/lib/sketchCadProfile";
import { segmentArcGeometry } from "@/lib/sketchArcs";
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

self.onmessage = async (event: MessageEvent<SketchCadBuildRequest>) => {
  const request = event.data;
  let cad: OcctKernel | null = null;
  try {
    cad = await kernel();
    cad.releaseAll();
    const regions = cadSketchRegions(request.profile);
    if (regions.length === 0) throw new Error("status.cadNoClosedProfile");
    const faceFor = (region: (typeof regions)[number]) => {
      let face = cad!.makeFace(pathWire(cad!, region.outer));
      if (region.holes.length > 0) face = cad!.addHolesInFace(face, region.holes.map((hole) => pathWire(cad!, hole)));
      return face;
    };
    const solids = regions.map((region) => cad!.extrude(faceFor(region), 0, request.height, 0));
    const result = solids.length === 1 ? solids[0] : cad.makeCompound(solids);
    if (!cad.isValid(result)) throw new Error("status.cadInvalidTopology");
    const mesh = cad.tessellate(result, { linearDeflection: SKETCH_CAD_DEFLECTION.linear, angularDeflection: SKETCH_CAD_DEFLECTION.angular });
    const positions = new Float32Array(mesh.positions);
    const normals = new Float32Array(mesh.normals);
    const indices = new Uint32Array(mesh.indices);
    const brep = cad.toBREP(result);
    post({ type: "built", requestId: request.requestId, positions, normals, indices, triangleCount: mesh.triangleCount, brep }, [positions.buffer, normals.buffer, indices.buffer]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? "status.cadBuildFailed");
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
