import type { SketchProfile } from "@/types/sketchforge";

export type SketchCadBuildRequest =
  | {
    type: "build";
    requestId: number;
    profile: SketchProfile;
    height: number;
  }
  | {
    /**
     * Folgen: die Form wandert den Pfad entlang, statt gerade hochgezogen zu
     * werden. Beides steht in derselben Zeichnung - der geschlossene Umriss
     * ist die Form, der offene Zug der Weg.
     */
    type: "sweep";
    requestId: number;
    profile: SketchProfile;
  };

export type SketchCadBuildResponse =
  | {
      type: "built";
      requestId: number;
      positions: Float32Array;
      normals: Float32Array;
      indices: Uint32Array;
      triangleCount: number;
      brep: string;
    }
  | { type: "error"; requestId: number; message: string };
