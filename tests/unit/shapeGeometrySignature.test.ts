import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The viewport keeps one object per shape and rebuilds it when
 * `shapeGeometrySignature` changes. A parametric field that is missing from
 * that signature is invisible until something else moves: the drive in a screw
 * head was set, stored and drawn correctly - and only appeared once the
 * diameter was touched, because the diameter *is* in the signature.
 *
 * The function sits in a client component that cannot be imported here, so the
 * source is read instead. Every field that shapes geometry has to be named in
 * it.
 */
const PARAMETRIC_FIELDS = [
  "radius", "steps", "sides", "bevel", "segments", "topRadius", "baseRadius",
  "teeth", "toothSize", "toothWidth", "centerHoleSize", "gearType", "helixAngle", "helixQuality",
  "threadRole", "threadHead", "threadDrive", "threadHand", "threadProfile", "threadDiameter",
  "threadPitch", "threadClearance", "threadQuality", "threadHeadHeight", "threadChamfer", "threadHeadChamfer",
  "springTurns", "springWire", "springQuality",
  "loftBottomShape", "loftTopShape", "loftTopWidth", "loftTopDepth",
  "loftBottomRotation", "loftTopRotation", "loftSegments", "loftLayers",
  "text", "font",
];

function functionBody(source: string, name: string) {
  const start = source.indexOf(`function ${name}(`);
  expect(start, `${name} not found`).toBeGreaterThan(-1);
  let depth = 0;
  for (let index = source.indexOf("{", start); index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`${name} has no closing brace`);
}

describe("shape geometry signature", () => {
  const source = readFileSync(fileURLToPath(new URL("../../apps/web/src/components/WorkplaneViewport.tsx", import.meta.url)), "utf8");

  it("names every field that changes a shape's geometry", () => {
    const body = functionBody(source, "shapeGeometrySignature");
    const missing = PARAMETRIC_FIELDS.filter((field) => !body.includes(`shape.${field}`));
    expect(missing).toEqual([]);
  });

  it("names them in the tape measure's topology key as well", () => {
    // Same reason: a measurement clings to a face, and the face moves when the
    // body is rebuilt.
    const body = functionBody(source, "rulerShapeTopologyKey");
    const missing = PARAMETRIC_FIELDS.filter((field) => !body.includes(`shape.${field}`));
    expect(missing).toEqual([]);
  });
});
