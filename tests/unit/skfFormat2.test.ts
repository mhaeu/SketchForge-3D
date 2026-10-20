import { readFileSync } from "node:fs";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { sha256Hex } from "@/lib/projectAssets";
import { editorHistoryEntry } from "@/lib/editorHistory";
import { exportSkfProject, importSkfProject, SKF_FORMAT_VERSION } from "@/lib/skfProject";
import type { WorkplaneShape } from "@/types/sketchforge";
import { DEFAULT_SNAP_GRID, DEFAULT_WORKPLANE_WORKSPACE } from "@/lib/workplaneSettings";

/**
 * Dateien der Fassung 2, wie Formsmith746 (unser `origin`) sie seit Commit
 * e9cb8e8 schreibt. Die Vorlage hat Formsmith746s eigener Schreiber erzeugt,
 * nicht wir: ein Kasten mit zwei Kanten in sieben Verlaufsstaenden, zuletzt
 * daneben eine Gruppe, deren Kind dieselben Kanten traegt. Alle drei Koerper
 * zeigen auf eine einzige Kantendatei.
 */
const FIXTURE = new Uint8Array(readFileSync("tests/fixtures/skf/formsmith-format2.skf"));
const EDGES = [{ points: [0, 0, 0, 20, 0, 0] }, { points: [0, 5, 0, 20, 5, 0, 20, 5, 10] }];

function exportInput(project: Awaited<ReturnType<typeof importSkfProject>>) {
  return {
    projectId: project.projectId,
    projectName: project.projectName,
    createdAt: project.createdAt,
    modifiedAt: project.modifiedAt,
    shapes: project.shapes,
    history: project.history,
    historyIndex: project.historyIndex,
    assets: project.assets,
    workspace: project.workspace ?? DEFAULT_WORKPLANE_WORKSPACE,
    snapGrid: project.snapGrid ?? DEFAULT_SNAP_GRID,
    placementElevation: project.placementElevation ?? 0,
  } as Parameters<typeof exportSkfProject>[0];
}

async function rewritten(mutate: (document: Record<string, any>, files: Record<string, Uint8Array>) => void | Promise<void>) {
  const files = unzipSync(FIXTURE);
  const document = JSON.parse(strFromU8(files["project.json"]));
  await mutate(document, files);
  files["project.json"] = strToU8(JSON.stringify(document));
  return zipSync(files);
}

describe("Dateien der Fassung 2 von Formsmith746", () => {
  it("liegt wirklich als Fassung 2 mit eigener Kantendatei vor", () => {
    const document = JSON.parse(strFromU8(unzipSync(FIXTURE)["project.json"]));
    expect(document.formatVersion).toBe(2);
    expect(document.minimumReaderVersion).toBe(2);
    expect(document.assets.filter((asset: { kind: string }) => asset.kind === "display-edges")).toHaveLength(1);
  });

  it("oeffnet sie mit allen Koerpern, Kanten und dem Verlauf", async () => {
    const project = await importSkfProject(FIXTURE);
    expect(project.projectName).toBe("Formsmith Format 2");
    expect(project.history).toHaveLength(7);
    expect(project.historyIndex).toBe(6);
    expect(project.history.slice(0, 6).map((entry) => entry.shapes[0].x)).toEqual([0, 1, 2, 3, 4, 5]);
    const box = project.shapes.find((shape) => shape.id === "kasten")!;
    expect(box.x).toBe(5);
    expect(box.cadDisplayEdges).toEqual(EDGES);
    expect(box.cadDisplayEdgesVersion).toBe(2);
    const group = project.shapes.find((shape) => shape.id === "gruppe")!;
    expect(group.groupedShapes?.[0].cadDisplayEdges).toEqual(EDGES);
  });

  /** Eine Kantendatei, ein Feld: Die Staende teilen es auch im Speicher, wie beim Schreiber. */
  it("teilt die Kanten ueber alle Staende und Koerper", async () => {
    const project = await importSkfProject(FIXTURE);
    const fields = [
      ...project.history.flatMap((entry) => entry.shapes.filter((shape) => shape.id === "kasten").map((shape) => shape.cadDisplayEdges)),
      project.shapes.find((shape) => shape.id === "gruppe")!.groupedShapes![0].cadDisplayEdges,
    ];
    expect(fields).toHaveLength(8);
    expect(new Set(fields).size).toBe(1);
  });

  /** Zurueckgespeichert wird ebenfalls Fassung 2, mit einer Kantendatei fuer alle Verweise. */
  it("speichert sie als Fassung 2 zurueck, ohne Kanten zu verlieren", async () => {
    const project = await importSkfProject(FIXTURE);
    const bytes = await exportSkfProject(exportInput(project));
    const document = JSON.parse(strFromU8(unzipSync(bytes)["project.json"]));
    expect(document.formatVersion).toBe(2);
    expect(document.minimumReaderVersion).toBe(2);
    expect(document.assets.filter((asset: { kind: string }) => asset.kind === "display-edges")).toHaveLength(1);
    const nodes = document.states.flatMap((state: { nodes: Array<Record<string, any>> }) => state.nodes);
    expect(nodes.every((node: Record<string, any>) => node.definition.cadDisplayEdges === undefined)).toBe(true);
    const again = await importSkfProject(bytes);
    expect(again.shapes.find((shape) => shape.id === "kasten")!.cadDisplayEdges).toEqual(EDGES);
  });

  it("lehnt eine Datei ab, die einen noch neueren Leser verlangt", async () => {
    const bytes = await rewritten((document) => {
      document.minimumReaderVersion = 3;
    });
    await expect(importSkfProject(bytes)).rejects.toThrow(/newer SketchForge reader/);
    const newer = await rewritten((document) => {
      document.formatVersion = 3;
    });
    await expect(importSkfProject(newer)).rejects.toThrow(/format 3/);
  });

  it("lehnt kaputte Kantendaten ab, statt sie halb zu laden", async () => {
    const bytes = await rewritten(async (document, files) => {
      const asset = document.assets.find((entry: { kind: string }) => entry.kind === "display-edges");
      const broken = strToU8(JSON.stringify([{ points: [0, 0] }]));
      files[asset.path] = broken;
      asset.byteLength = broken.byteLength;
      asset.sha256 = await sha256Hex(broken);
    });
    await expect(importSkfProject(bytes)).rejects.toThrow(/display-edge/);
  });

  it("verlangt, dass ein Verweis auf eine Kantendatei auch eine Kantendatei trifft", async () => {
    const bytes = await rewritten((document) => {
      const mesh = document.assets.find((entry: { kind: string }) => entry.kind === "derived-mesh");
      document.states.forEach((state: { nodes: Array<Record<string, unknown>> }) => state.nodes.forEach((node) => {
        if (node.cadDisplayEdgesAssetId) node.cadDisplayEdgesAssetId = mesh.id;
      }));
    });
    await expect(importSkfProject(bytes)).rejects.toThrow(/missing display-edge asset/);
  });

  it("kennt Kantendateien nur in Fassung 2", async () => {
    const bytes = await rewritten((document) => {
      document.formatVersion = 1;
      document.minimumReaderVersion = 1;
    });
    await expect(importSkfProject(bytes)).rejects.toThrow(/unknown type/);
  });
});

/**
 * Eine Datei der Fassung 1, geschrieben von unserem eigenen Schreiber, bevor
 * er auf Fassung 2 umgestellt wurde: Kanten in jedem Stand. Sie muss weiter
 * aufgehen - es gibt viele davon.
 */
describe("Dateien der Fassung 1", () => {
  const V1 = new Uint8Array(readFileSync("tests/fixtures/skf/sketchforge-format1.skf"));

  it("oeffnen weiter, mit Kanten und Verlauf", async () => {
    expect(JSON.parse(strFromU8(unzipSync(V1)["project.json"])).formatVersion).toBe(1);
    const project = await importSkfProject(V1);
    expect(project.history.map((entry) => entry.shapes[0].x)).toEqual([0, 1, 2]);
    expect(project.shapes[0].cadDisplayEdges).toEqual(EDGES);
  });

  it("werden beim naechsten Speichern zu Fassung 2", async () => {
    const bytes = await exportSkfProject(exportInput(await importSkfProject(V1)));
    expect(JSON.parse(strFromU8(unzipSync(bytes)["project.json"])).formatVersion).toBe(SKF_FORMAT_VERSION);
  });
});

/**
 * Warum Fassung 2: Ein Kantensatz steht einmal in der Datei, nicht in jedem
 * Verlaufsstand. Gemessen vorher an drei Koerpern mit je 60 Kanten in 50
 * Staenden: 16 MB project.json, rund 1 s je Speichern; mit 300 Kanten ueber
 * der Grenze von 64 MB.
 */
describe("Der Schreiber der Fassung 2", () => {
  it("legt einen Kantensatz einmal ab, so viele Staende ihn auch tragen", async () => {
    const edges = Array.from({ length: 300 }, (_, edge) => ({ points: Array.from({ length: 96 }, (_, index) => Math.cos(edge + index)) }));
    const body = { id: "koerper", name: "koerper", kind: "box", color: "#d41721", x: 0, z: 0, elevation: 0, size: 20, width: 20, depth: 20, height: 10, rotation: 0, cadDisplayEdges: edges, cadDisplayEdgesVersion: 2 } as WorkplaneShape;
    const history = Array.from({ length: 50 }, (_, x) => editorHistoryEntry([{ ...body, x }], []));
    const bytes = await exportSkfProject({
      projectId: "viele-staende", projectName: "Viele Staende", createdAt: 1, modifiedAt: 2,
      shapes: history[49].shapes, history, historyIndex: 49, assets: [],
      workspace: DEFAULT_WORKPLANE_WORKSPACE, snapGrid: DEFAULT_SNAP_GRID, placementElevation: 0,
    } as Parameters<typeof exportSkfProject>[0]);
    const files = unzipSync(bytes);
    const document = JSON.parse(strFromU8(files["project.json"]));
    expect(document.assets.filter((asset: { kind: string }) => asset.kind === "display-edges")).toHaveLength(1);
    // 50 Staende mit je 28 800 Zahlen standen vorher alle im Text; jetzt nur Verweise.
    expect(files["project.json"].length).toBeLessThan(200_000);
    const project = await importSkfProject(bytes);
    expect(new Set(project.history.map((entry) => entry.shapes[0].cadDisplayEdges)).size).toBe(1);
    expect(project.shapes[0].cadDisplayEdges).toEqual(edges);
  });
});
