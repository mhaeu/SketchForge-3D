/// <reference lib="webworker" />

import { OcctKernel, type ShapeHandle } from "occt-wasm";
import { cadSketchRegions } from "@/lib/sketchCadProfile";
import { buildRevolvedSketchSolid, cadSketchPathWire, FLAT_SKETCH_POINT_MAP } from "@/lib/cadSketchRevolve";
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

self.onmessage = async (event: MessageEvent<SketchCadBuildRequest>) => {
  const request = event.data;
  let cad: OcctKernel | null = null;
  try {
    cad = await kernel();
    cad.releaseAll();
    let result: ShapeHandle;
    if (request.revolve) {
      result = buildRevolvedSketchSolid(cad, request.profile, request.revolve.startAngle, request.revolve.sweepAngle);
    } else {
      const regions = cadSketchRegions(request.profile);
      if (regions.length === 0) throw new Error("status.cadNoClosedProfile");
      const faceFor = (region: (typeof regions)[number]) => {
        let face = cad!.makeFace(cadSketchPathWire(cad!, region.outer, FLAT_SKETCH_POINT_MAP));
        if (region.holes.length > 0) face = cad!.addHolesInFace(face, region.holes.map((hole) => cadSketchPathWire(cad!, hole, FLAT_SKETCH_POINT_MAP)));
        return face;
      };
      const solids = regions.map((region) => cad!.extrude(faceFor(region), 0, request.height, 0));
      result = solids.length === 1 ? solids[0] : cad.makeCompound(solids);
      if (!cad.isValid(result)) throw new Error("status.cadInvalidTopology");
    }
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
