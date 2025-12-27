import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import { mockApiPlugin } from "./src/mock-api/mock-server";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  const plugins = [
    react(),
    tailwindcss(),
    ...(env.VITE_USE_MOCK_API === "true" ? [mockApiPlugin()] : []),
  ];
  return {
    plugins, // 3. Return the array containing the mock plugin
    resolve: {
      alias: {
        "@password-manager/core": path.resolve(
          __dirname,
          "../core/dist/index.js"
        ),
      },
    },
  };
});
