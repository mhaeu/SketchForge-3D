/**
 * screenRectHit.ts
 *
 * Ob ein Dreieck, so wie es auf dem Schirm liegt, und ein Rechteck einen Punkt
 * gemeinsam haben.
 *
 * Gebraucht wird das fuers Aufziehen eines Auswahlrahmens. Der Rahmen eines
 * Koerpers sagt nur, *wo* er sein koennte: Das Loch einer Spule und der
 * Zwischenraum zwischen den Teilen einer Gruppe liegen darin und sind doch
 * leer. Wer dort hineinzieht, will nichts auswaehlen.
 *
 * Nach Layerling, beigetragen von @rmpel (#117).
 */

export type ScreenRect = { left: number; top: number; right: number; bottom: number };

function insideRect(x: number, y: number, rect: ScreenRect) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function segmentsCross(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number) {
  const side = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) => (qx - px) * (ry - py) - (qy - py) * (rx - px);
  const d1 = side(cx, cy, dx, dy, ax, ay);
  const d2 = side(cx, cy, dx, dy, bx, by);
  const d3 = side(ax, ay, bx, by, cx, cy);
  const d4 = side(ax, ay, bx, by, dx, dy);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

function segmentCrossesRect(ax: number, ay: number, bx: number, by: number, rect: ScreenRect) {
  const { left, top, right, bottom } = rect;
  return segmentsCross(ax, ay, bx, by, left, top, right, top)
    || segmentsCross(ax, ay, bx, by, right, top, right, bottom)
    || segmentsCross(ax, ay, bx, by, right, bottom, left, bottom)
    || segmentsCross(ax, ay, bx, by, left, bottom, left, top);
}

function pointInTriangle(px: number, py: number, ax: number, ay: number, bx: number, by: number, cx: number, cy: number) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const negative = d1 < 0 || d2 < 0 || d3 < 0;
  const positive = d1 > 0 || d2 > 0 || d3 > 0;
  return !(negative && positive);
}

/**
 * Drei Faelle, und alle drei muessen gefragt werden: Eine Ecke des Dreiecks
 * liegt im Rechteck, eine seiner Kanten kreuzt den Rand - oder das Rechteck
 * liegt ganz im Dreieck, und dann liegt keine Ecke und keine Kante irgendwo in
 * der Naehe. Zuerst die Rahmen gegeneinander, das spart den Rest fuer die
 * meisten Dreiecke.
 */
export function triangleTouchesRect(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, rect: ScreenRect) {
  if (Math.max(ax, bx, cx) < rect.left || Math.min(ax, bx, cx) > rect.right || Math.max(ay, by, cy) < rect.top || Math.min(ay, by, cy) > rect.bottom) {
    return false;
  }
  if (insideRect(ax, ay, rect) || insideRect(bx, by, rect) || insideRect(cx, cy, rect)) return true;
  if (segmentCrossesRect(ax, ay, bx, by, rect) || segmentCrossesRect(bx, by, cx, cy, rect) || segmentCrossesRect(cx, cy, ax, ay, rect)) return true;
  return pointInTriangle(rect.left, rect.top, ax, ay, bx, by, cx, cy);
}
