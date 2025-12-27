import type { Plugin, ViteDevServer } from "vite";
import type { IncomingMessage, ServerResponse } from "http";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";

// --- Types & Interfaces ---

interface VaultEntry {
  data: Uint8Array;
  etag: string;
  lastModified: string;
  size: number;
}

// --- Storage Engine ---

interface VaultsJson {
  vaults: {
    [key: string]: {
      data: string; // base64 encoded
      etag: string;
      lastModified: string;
      size: number;
    };
  };
  preferences?: {
    currentVaultKey?: string | null;
    vaultNames?: { [key: string]: string }; // custom display names
  };
}

class MockVaultStore {
  private storage = new Map<string, VaultEntry>();
  private preferences: {
    currentVaultKey?: string | null;
    vaultNames?: { [key: string]: string };
  } = {};
  private logger?: (message: string, options?: { timestamp?: boolean }) => void;
  private dataFilePath: string;

  constructor() {
    // Get the path to the .mock-data directory relative to project root
    // process.cwd() returns the project root when running from the project directory
    const projectRoot = process.cwd();
    this.dataFilePath = join(projectRoot, ".mock-data", "vaults.json");
  }

  setLogger(
    logger: (message: string, options?: { timestamp?: boolean }) => void
  ) {
    this.logger = logger;
  }

  /**
   * Load vaults from the JSON file
   */
  loadFromFile(): void {
    try {
      if (!existsSync(this.dataFilePath)) {
        if (this.logger) {
          this.logger(
            `[Mock API] Vaults file not found at ${this.dataFilePath}, starting with empty storage`,
            { timestamp: true }
          );
        }
        return;
      }

      const fileContent = readFileSync(this.dataFilePath, "utf-8");
      const jsonData: VaultsJson = JSON.parse(fileContent);

      let loadedCount = 0;
      for (const [key, entry] of Object.entries(jsonData.vaults || {})) {
        try {
          // Convert base64 string to Uint8Array
          const buffer = Buffer.from(entry.data, "base64");
          const data = new Uint8Array(buffer);

          this.storage.set(key, {
            data,
            etag: entry.etag,
            lastModified: entry.lastModified,
            size: entry.size,
          });
          loadedCount++;
        } catch (err: any) {
          if (this.logger) {
            this.logger(
              `[Mock API] Failed to load vault ${key}: ${err.message}`,
              { timestamp: true }
            );
          }
        }
      }

      // Load preferences
      if (jsonData.preferences) {
        this.preferences = {
          currentVaultKey: jsonData.preferences.currentVaultKey ?? null,
          vaultNames: jsonData.preferences.vaultNames || {},
        };
      }

      if (this.logger) {
        this.logger(
          `[Mock API] Loaded ${loadedCount} vault(s) from ${this.dataFilePath}`,
          { timestamp: true }
        );
      }
    } catch (err: any) {
      if (this.logger) {
        this.logger(
          `[Mock API] Failed to load vaults file: ${err.message}`,
          { timestamp: true }
        );
      }
    }
  }

  /**
   * Persist vaults to the JSON file
   */
  persistToFile(): void {
    try {
      const jsonData: VaultsJson = { 
        vaults: {},
        preferences: {
          currentVaultKey: this.preferences.currentVaultKey ?? null,
          vaultNames: this.preferences.vaultNames || {},
        },
      };

      for (const [key, entry] of this.storage.entries()) {
        // Convert Uint8Array to base64 string
        const buffer = Buffer.from(entry.data);
        const base64Data = buffer.toString("base64");

        jsonData.vaults[key] = {
          data: base64Data,
          etag: entry.etag,
          lastModified: entry.lastModified,
          size: entry.size,
        };
      }

      // Ensure directory exists
      const dataDir = dirname(this.dataFilePath);
      if (!existsSync(dataDir)) {
        mkdirSync(dataDir, { recursive: true });
      }

      writeFileSync(this.dataFilePath, JSON.stringify(jsonData, null, 2), "utf-8");

      if (this.logger) {
        this.logger(
          `[Mock API] Persisted ${this.storage.size} vault(s) to ${this.dataFilePath}`,
          { timestamp: true }
        );
      }
    } catch (err: any) {
      if (this.logger) {
        this.logger(
          `[Mock API] Failed to persist vaults file: ${err.message}`,
          { timestamp: true }
        );
      }
    }
  }

  /**
   * Get preferences
   */
  getPreferences() {
    return {
      currentVaultKey: this.preferences.currentVaultKey ?? null,
      vaultNames: { ...(this.preferences.vaultNames || {}) },
    };
  }

  /**
   * Update preferences
   */
  updatePreferences(updates: {
    currentVaultKey?: string | null;
    vaultNames?: { [key: string]: string };
  }): void {
    if (updates.currentVaultKey !== undefined) {
      this.preferences.currentVaultKey = updates.currentVaultKey;
    }
    if (updates.vaultNames !== undefined) {
      this.preferences.vaultNames = { ...updates.vaultNames };
    }
    this.persistToFile();
  }

  async save(key: string, data: Uint8Array): Promise<string> {
    const etag = this.generateETag(data);
    this.storage.set(key, {
      data,
      etag,
      lastModified: new Date().toUTCString(),
      size: data.length,
    });

    if (this.logger) {
      this.logger(`[Mock API] Saved vault: ${key} (${data.length} bytes)`, {
        timestamp: true,
      });
    }

    // Persist to file after saving
    this.persistToFile();

    return etag;
  }

  get(key: string): VaultEntry | undefined {
    return this.storage.get(key);
  }

  list() {
    return Array.from(this.storage.entries()).map(([key, entry]) => ({
      key,
      name: key.replace("vaults/", "").replace(/\.dat$/, ""),
      lastModified: entry.lastModified,
      size: entry.size,
    }));
  }

  private generateETag(data: Uint8Array): string {
    // Simple but effective hash for mock purposes
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      hash = (hash << 5) - hash + data[i];
      hash |= 0;
    }
    return Math.abs(hash).toString(16);
  }
}

// --- Utils ---

const sanitizeKey = (key: string) => {
  const normalized = key.replace(/\.\./g, "").replace(/^\/+/, "");
  const withPrefix = normalized.startsWith("vaults/")
    ? normalized
    : `vaults/${normalized}`;
  return withPrefix.endsWith(".dat") ? withPrefix : `${withPrefix}.dat`;
};

const sendJson = (res: ServerResponse, data: any, status = 200) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.statusCode = status;
  res.end(JSON.stringify(data));
};

// --- The Plugin ---

export function mockApiPlugin(): Plugin {
  const S3_BASE = "/mock-s3";
  const store = new MockVaultStore();

  return {
    name: "vite-plugin-mock-vault",
    enforce: "pre",

    async configureServer(server: ViteDevServer) {
      const { logger } = server.config;

      // Set logger for store
      store.setLogger(logger.info.bind(logger));

      // Load vaults from file on server start
      store.loadFromFile();

      server.middlewares.use(
        async (req: IncomingMessage, res: ServerResponse, next) => {
          try {
            // Extract pathname from req.url (handles both absolute URLs and paths)
            let pathname = req.url || "/";
            try {
              // Try to parse as URL first (handles query params, etc.)
              if (req.headers.host) {
                const url = new URL(pathname, `http://${req.headers.host}`);
                pathname = url.pathname;
              } else {
                // If no host, assume req.url is already a pathname
                const urlMatch = pathname.match(/^([^?]+)/);
                pathname = urlMatch ? urlMatch[1] : pathname;
              }
            } catch {
              // If URL parsing fails, use req.url as-is (should be pathname)
              const urlMatch = pathname.match(/^([^?]+)/);
              pathname = urlMatch ? urlMatch[1] : pathname;
            }

            // Debug logging for vault-related requests
            if (
              pathname.startsWith("/vaults") ||
              pathname.startsWith("/mock-s3") ||
              pathname.startsWith("/mock-api")
            ) {
              logger.info(`[Mock API] ${req.method} ${pathname}`, {
                timestamp: true,
              });
            }

            // 1. CORS Preflight
            if (req.method === "OPTIONS") {
              res.setHeader("Access-Control-Allow-Origin", "*");
              res.setHeader(
                "Access-Control-Allow-Methods",
                "GET,POST,PUT,DELETE,OPTIONS"
              );
              res.setHeader(
                "Access-Control-Allow-Headers",
                "Content-Type,If-Match,Authorization"
              );
              res.statusCode = 204;
              return res.end();
            }

            // 2. Route: List Vaults
            if (pathname === "/vaults" && req.method === "GET") {
              return sendJson(res, { vaults: store.list() });
            }

            // 2a. Route: Get Preferences
            if (pathname === "/mock-api/preferences" && req.method === "GET") {
              return sendJson(res, store.getPreferences());
            }

            // 2b. Route: Update Preferences
            if (pathname === "/mock-api/preferences" && req.method === "PUT") {
              const chunks: any[] = [];
              for await (const chunk of req) chunks.push(chunk);
              const body = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
              
              store.updatePreferences({
                currentVaultKey: body.currentVaultKey,
                vaultNames: body.vaultNames,
              });
              
              return sendJson(res, { success: true });
            }

            // 3. Route: Get S3 Signed URLs
            const vaultMatch = pathname.match(/^\/vaults\/(.+)$/);
            if (vaultMatch && req.method === "POST") {
              try {
                const key = sanitizeKey(decodeURIComponent(vaultMatch[1]));
                const existing = store.get(key);

                logger.info(`[Mock API] Getting URLs for vault: ${key}`, {
                  timestamp: true,
                });

                return sendJson(res, {
                  vaultKey: key,
                  getUrl: `${S3_BASE}/get/${encodeURIComponent(key)}`,
                  putUrl: `${S3_BASE}/put/${encodeURIComponent(key)}`,
                  etag: existing?.etag || null,
                });
              } catch (err: any) {
                logger.error(
                  `[Mock API] Error getting vault URLs: ${err.message}`,
                  { timestamp: true }
                );
                return sendJson(
                  res,
                  { error: err.message || "Failed to get vault URLs" },
                  500
                );
              }
            }

            // 4. Route: Mock S3 GET
            if (
              pathname.startsWith(`${S3_BASE}/get/`) &&
              req.method === "GET"
            ) {
              const key = decodeURIComponent(
                pathname.replace(`${S3_BASE}/get/`, "")
              );
              const entry = store.get(key);

              if (!entry) {
                logger.error(`[Mock S3] 404: ${key}`, { timestamp: true });
                return sendJson(res, { error: "Vault not found" }, 404);
              }

              res.setHeader("Content-Type", "application/octet-stream");
              res.setHeader("ETag", `"${entry.etag}"`);
              res.setHeader("Access-Control-Allow-Origin", "*");
              res.statusCode = 200;
              return res.end(Buffer.from(entry.data));
            }

            // 5. Route: Mock S3 PUT
            if (
              pathname.startsWith(`${S3_BASE}/put/`) &&
              req.method === "PUT"
            ) {
              const key = decodeURIComponent(
                pathname.replace(`${S3_BASE}/put/`, "")
              );
              const ifMatch = req.headers["if-match"]?.replace(/"/g, "");

              const existing = store.get(key);
              if (ifMatch && existing && existing.etag !== ifMatch) {
                return sendJson(
                  res,
                  { error: "Precondition Failed (ETag Mismatch)" },
                  412
                );
              }

              const chunks: any[] = [];
              for await (const chunk of req) chunks.push(chunk);
              const buffer = Buffer.concat(chunks);
              const uint8 = new Uint8Array(buffer);

              const newEtag = await store.save(key, uint8);
              logger.info(`[Mock S3] Saved: ${key} (${uint8.length} bytes)`, {
                timestamp: true,
              });

              res.setHeader("ETag", `"${newEtag}"`);
              res.setHeader("Access-Control-Allow-Origin", "*");
              res.statusCode = 200;
              return res.end();
            }

            next();
          } catch (err: any) {
            logger.error(`[Mock API] Unhandled error: ${err.message}`, {
              timestamp: true,
            });
            if (!res.headersSent) {
              return sendJson(
                res,
                { error: err.message || "Internal server error" },
                500
              );
            }
          }
        }
      );

      logger.info("🚀 Vault Mock API Active", { timestamp: true });
    },
  };
}
