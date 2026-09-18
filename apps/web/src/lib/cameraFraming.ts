// Framing moves the camera so that a selection fills the viewport, without
// turning it. The selection is taken as a sphere, which fits from every
// direction; the padding keeps its outline and handles off the edge.
export const CAMERA_FRAMING_PADDING = 1.18;

/**
 * Distance a perspective camera needs from the sphere's centre for the sphere
 * to fit the viewport - limited by the narrower of the two axes: a wide
 * viewport runs out of height first, a tall one out of width.
 */
export function perspectiveFramingDistance(radius: number, verticalFovDegrees: number, aspect: number, padding = CAMERA_FRAMING_PADDING) {
  if (!(radius > 0)) return 0;
  const halfVertical = (verticalFovDegrees * Math.PI) / 360;
  const halfHorizontal = Math.atan(Math.tan(halfVertical) * (aspect > 0 ? aspect : 1));
  return (radius / Math.sin(Math.min(halfVertical, halfHorizontal))) * padding;
}

/**
 * Zoom an orthographic camera needs for the same sphere. `halfHeight` is the
 * frustum's unzoomed half height, as the viewport sets it up.
 */
export function orthographicFramingZoom(radius: number, halfHeight: number, aspect: number, padding = CAMERA_FRAMING_PADDING) {
  if (!(radius > 0) || !(halfHeight > 0)) return null;
  const safeAspect = aspect > 0 ? aspect : 1;
  return Math.min(halfHeight / (radius * padding), (halfHeight * safeAspect) / (radius * padding));
}
