import { describe, expect, it } from "vitest";
import { CAMERA_FRAMING_PADDING, orthographicFramingZoom, perspectiveFramingDistance } from "@/lib/cameraFraming";

describe("camera framing", () => {
  it("backs a perspective camera off far enough for the sphere to fit the narrower axis", () => {
    // Wide viewport: height limits. A sphere of radius 10 at 38 degrees of
    // vertical field spans the view at distance r / sin(19 deg).
    const wide = perspectiveFramingDistance(10, 38, 16 / 9, 1);
    expect(wide).toBeCloseTo(10 / Math.sin((19 * Math.PI) / 180), 6);
    // Tall viewport: width limits, so the camera has to be further away.
    expect(perspectiveFramingDistance(10, 38, 9 / 16, 1)).toBeGreaterThan(wide);
    // Padding scales the distance; nothing to frame gives nothing.
    expect(perspectiveFramingDistance(10, 38, 16 / 9)).toBeCloseTo(wide * CAMERA_FRAMING_PADDING, 6);
    expect(perspectiveFramingDistance(0, 38, 1)).toBe(0);
  });

  it("zooms an orthographic camera so the sphere fits the narrower axis", () => {
    // Half height 50: a sphere of radius 10 needs zoom 5 on a wide view.
    expect(orthographicFramingZoom(10, 50, 2, 1)).toBeCloseTo(5, 6);
    // On a tall view the width (half height * aspect = 25) limits: zoom 2.5.
    expect(orthographicFramingZoom(10, 50, 0.5, 1)).toBeCloseTo(2.5, 6);
    expect(orthographicFramingZoom(10, 0, 1)).toBeNull();
  });
});
