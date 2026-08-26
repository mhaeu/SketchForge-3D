/**
 * "variableFillet" ist eine Verrundung, deren Radius sich entlang der Kante
 * aendert: `amount` am Kantenanfang, `endAmount` am Kantenende. Der Kernel
 * unterstuetzt das bereits - `fillet()` nimmt statt einer Zahl auch ein Tupel
 * [r1, r2] entgegen.
 */
export type CadModifierKind = "chamfer" | "fillet" | "variableFillet";

export type CadModifierEdge = {
  id: number;
  owner?: number;
  points: number[];
  display: boolean;
  selectable: boolean;
  angle: number;
  boundary: boolean;
  manifold: boolean;
};

export type CadModifierQuality = "draft" | "standard" | "fine";

export type CadModifierDisplayEdge = {
  points: number[];
};

export type CadModifierPrimitivePart = {
  kind: "box";
  width: number;
  depth: number;
  height: number;
  transform?: number[];
};

export type CadModifierMeshPart = {
  positions?: Float32Array;
  indices?: Uint32Array;
  brep?: string;
  brepTransform?: number[];
  primitive?: CadModifierPrimitivePart;
  hole: boolean;
};

export type CadModifierComponentMesh = {
  owner: number;
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  triangleCount: number;
  brep: string;
  displayEdges: CadModifierDisplayEdge[];
};

export type CadModifierWorkerRequest =
  | { type: "prepare"; requestId: number; parts: CadModifierMeshPart[]; sharpAngle: number; suppressTreatmentDetailEdges?: boolean }
  | {
      type: "preview";
      requestId: number;
      kind: CadModifierKind;
      edgeIds: number[];
      amount: number;
      quality: CadModifierQuality;
      chamferAngle: number;
      /**
       * Endradius fuer "variableFillet". Bei den anderen Arten ohne Wirkung.
       */
      endAmount: number;
      /**
       * Vertauscht Start- und Endradius. Noetig, weil die Laufrichtung einer
       * Kante aus der OCCT-Parametrisierung stammt und in der Oberflaeche
       * nicht sichtbar ist - zeigt die Verjuengung falsch herum, kippt dieser
       * Schalter sie.
       */
      flipTaper: boolean;
    }
  | { type: "dispose"; requestId: number };

export type CadModifierWorkerResponse =
  | { type: "ready"; requestId: number; edges: CadModifierEdge[]; selectableEdgeIds: number[]; sourceType: string }
  | {
      type: "preview";
      requestId: number;
      positions: Float32Array;
      normals: Float32Array;
      indices: Uint32Array;
      triangleCount: number;
      brep: string;
      displayEdges: CadModifierDisplayEdge[];
      components?: CadModifierComponentMesh[];
    }
  | { type: "disposed"; requestId: number }
  | { type: "error"; requestId: number; message: string; resetSession?: boolean };
