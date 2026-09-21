import { describe, expect, it } from "vitest";
import { placementWorkplaneFromSurface } from "@/lib/placementWorkplane";
import {
  mergeProjectsForStorage,
  parseStoredProjects,
  projectForStorage,
  type DashboardProject,
} from "@/lib/dashboardProjects";

const STORED_WITHOUT_TIMESTAMPS = JSON.stringify([
  { id: "p1", name: "Ein Projekt" },
]);

/**
 * The dashboard reads the stored list, merges it with what it holds, writes the
 * result and feeds it back into its own state - all in one effect. Everything
 * in that chain therefore has to settle: an input that gives a different answer
 * on every read makes the effect run for ever, and React stops the page with
 * "maximum update depth exceeded".
 */
describe("dashboard project storage", () => {
  it("reads a record without timestamps the same way every time", () => {
    const first = parseStoredProjects(STORED_WITHOUT_TIMESTAMPS);
    const second = parseStoredProjects(STORED_WITHOUT_TIMESTAMPS);
    expect(JSON.stringify(second.projects)).toBe(JSON.stringify(first.projects));
    expect(first.projects[0].revision).toBe(0);
    expect(first.projects[0].updatedAt).toBe(0);
  });

  it("keeps the timestamps a record does carry", () => {
    const { projects } = parseStoredProjects(JSON.stringify([
      { id: "p1", name: "Ein Projekt", updatedAt: 1700, revision: 1800 },
    ]));
    expect(projects[0].updatedAt).toBe(1700);
    expect(projects[0].createdAt).toBe(1700);
    expect(projects[0].revision).toBe(1800);
  });

  it("settles after one merge", () => {
    const { projects } = parseStoredProjects(STORED_WITHOUT_TIMESTAMPS);
    const once = mergeProjectsForStorage(projects, projects);
    const twice = mergeProjectsForStorage(once, once);
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });

  it("stops the dashboard's read-merge-write round trip", () => {
    // The effect in page.tsx, in miniature: parse what is stored, merge it with
    // the list in memory, write the result back, and take it as the new list.
    let stored = STORED_WITHOUT_TIMESTAMPS;
    let projects = parseStoredProjects(stored).projects;
    let lastWritten = "";
    let passes = 0;
    for (let round = 0; round < 10; round += 1) {
      const merged = mergeProjectsForStorage(projects, parseStoredProjects(stored).projects);
      const serialized = JSON.stringify(merged);
      if (serialized === lastWritten) break;
      passes += 1;
      stored = serialized;
      lastWritten = serialized;
      projects = merged;
    }
    expect(passes).toBeLessThanOrEqual(2);
  });

  it("lets a newer record on disk win, once", () => {
    const inMemory: DashboardProject = {
      ...parseStoredProjects(JSON.stringify([{ id: "p1", name: "Ein Projekt", updatedAt: 10, revision: 10, shapes: 1 }])).projects[0],
    };
    const onDisk: DashboardProject = { ...inMemory, revision: 99, updatedAt: 99, shapes: 7 };
    const merged = mergeProjectsForStorage([inMemory], [onDisk]);
    expect(merged[0].revision).toBe(99);
    expect(merged[0].shapes).toBe(7);
    // And the result no longer moves: the merged record is as new as the disk.
    expect(JSON.stringify(mergeProjectsForStorage(merged, [onDisk]))).toBe(JSON.stringify(merged));
  });

  it("normalizes a record for storage without changing it again", () => {
    const { projects } = parseStoredProjects(JSON.stringify([
      { id: "p1", name: "Ein Projekt", updatedAt: 5, revision: 5, accent: "violet", thumbnailUrl: 7 },
    ]));
    const once = projectForStorage(projects[0]);
    expect(JSON.stringify(projectForStorage(once))).toBe(JSON.stringify(once));
    expect(once.thumbnailUrl).toBeNull();
    expect(["cyan", "green", "gold", "red"]).toContain(once.accent);
});

  /**
   * Der Fall, der die Seite anhielt: ein Projekt mit einer gekippten
   * Arbeitsebene. Ihr Wiederaufbau wanderte im letzten Bit, also sah die
   * Wirkung bei jedem Durchlauf eine andere Liste und schrieb wieder.
   */
  it("settles for a project with a tilted workplane", () => {
    const tilted = placementWorkplaneFromSurface({ x: 3, y: 7, z: -2 }, { x: 0.3, y: 0.8, z: -0.51 }, { x: 1, y: 0.2, z: 0.4 });
    let stored = JSON.stringify([
      { id: "p1", name: "Gekippt", createdAt: 5, updatedAt: 5, revision: 5, shapes: 2, accent: "cyan", placementWorkplane: tilted },
    ]);
    let projects = parseStoredProjects(stored).projects;
    let lastWritten = "";
    let passes = 0;
    for (let round = 0; round < 20; round += 1) {
      const merged = mergeProjectsForStorage(projects, parseStoredProjects(stored).projects);
      const serialized = JSON.stringify(merged);
      if (serialized === lastWritten) break;
      passes += 1;
      stored = serialized;
      lastWritten = serialized;
      projects = merged;
    }
    expect(passes).toBeLessThanOrEqual(2);
  });
});
