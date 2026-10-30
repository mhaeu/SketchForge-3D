import path from "node:path";
import { defineConfig } from "vitest/config";

const rootDir = path.resolve(__dirname, "..");

export default defineConfig({
  root: rootDir,
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "apps/web/src"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    /*
     * Die Tests der Oberflaechenstruktur rechnen echte Reliefs mit
     * zehntausenden Dreiecken. Allein braucht einer 1,7 s, in der ganzen
     * Reihe neben 150 anderen Dateien auch 5,5 s - die fuenf Sekunden der
     * Vorgabe reichen dann nicht.
     */
    testTimeout: 30_000,
  },
});
