import type { SketchProfile } from "@/types/sketchforge";

/**
 * Das Folgen steht hier nicht: Es wird als Netz gerechnet, nicht im Kern -
 * dessen Rohr-Sweep zog die Form ueber die Ecken eines eckigen Weges hinweg,
 * statt sie abzuwinkeln. Siehe `lib/sweepMesh.ts`.
 */
export type SketchCadBuildRequest =
  | {
    type: "build";
    requestId: number;
    profile: SketchProfile;
    height: number;
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
