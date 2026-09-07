import { defineConfig, type Plugin } from "vite";
import path from "path";
import { createReadStream, existsSync, statSync } from "node:fs";

/**
 * Dev-only: serve Harbor V2 staging candidates (`art-source/harbor-v2/_staging`)
 * under `/staging-assets/*` so a zone GLB can be reviewed in-game with
 * `?harborZones=staging` before it is promoted into `client/public`.
 */
function stagingAssetsPlugin(): Plugin {
  const stagingRoot = path.resolve(__dirname, "../art-source/harbor-v2/_staging");
  return {
    name: "catch-and-run-staging-assets",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/staging-assets", (req, res, next) => {
        const requested = decodeURIComponent((req.url ?? "/").split("?")[0]);
        const file = path.resolve(stagingRoot, `.${requested}`);
        if (!file.startsWith(stagingRoot) || !existsSync(file) || !statSync(file).isFile()) {
          next();
          return;
        }
        res.setHeader("Content-Type", file.endsWith(".glb") ? "model/gltf-binary" : "application/octet-stream");
        res.setHeader("Cache-Control", "no-store");
        createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig(() => {
  const privateRoot = process.env.WATER_PRO_PATH;
  const privateEntry = privateRoot
    ? path.resolve(privateRoot, "build/index.js")
    : "";
  const hasWaterPro = privateEntry !== "" && existsSync(privateEntry);

  return {
    plugins: [stagingAssetsPlugin()],
    define: {
      __WATER_PRO_AVAILABLE__: JSON.stringify(hasWaterPro),
    },
    server: {
      port: 5173,
      host: true,
      fs: {
        allow: [
          path.resolve(__dirname, ".."),
          ...(privateRoot ? [path.resolve(privateRoot)] : []),
        ],
      },
    },
    resolve: {
      alias: {
        "@catch-and-run/shared": path.resolve(__dirname, "../shared/src"),
        "threejs-water-pro": hasWaterPro
          ? privateEntry
          : path.resolve(__dirname, "src/vendor/threejsWaterProStub.ts"),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (id.includes("/node_modules/three/")) return "three-vendor";
            if (id.includes("/node_modules/colyseus")) return "network-vendor";
            return undefined;
          },
        },
      },
    },
  };
});
