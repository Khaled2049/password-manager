// API-based vault storage (replaces localStorage)
// In mock mode, uses /mock-api/preferences endpoint
// In production mode, falls back to localStorage for UI preferences

const USE_MOCK_API = import.meta.env.VITE_USE_MOCK_API === "true";
// In mock mode, use empty string (relative URLs), otherwise use API_URL
const API_URL = USE_MOCK_API ? "" : import.meta.env.VITE_API_URL || "";

export interface VaultMetadata {
  key: string;
  name: string;
  displayName?: string;
  lastAccessed?: string;
}

interface Preferences {
  currentVaultKey: string | null;
  vaultNames: { [key: string]: string };
}

// Cache preferences in memory for synchronous access
let preferencesCache: Preferences | null = null;
let preferencesPromise: Promise<Preferences> | null = null;

/**
 * Load preferences from API (mock mode) or localStorage (production mode)
 */
async function loadPreferences(): Promise<Preferences> {
  if (USE_MOCK_API) {
    try {
      const response = await fetch(`${API_URL}/mock-api/preferences`);
      if (!response.ok) {
        throw new Error("Failed to load preferences");
      }
      const prefs = await response.json();
      preferencesCache = {
        currentVaultKey: prefs.currentVaultKey ?? null,
        vaultNames: prefs.vaultNames || {},
      };
      return preferencesCache;
    } catch (error) {
      console.error("Failed to load preferences:", error);
      return {
        currentVaultKey: null,
        vaultNames: {},
      };
    }
  } else {
    // Production mode: use localStorage
    try {
      const currentVaultKey = localStorage.getItem(
        "password-manager:current-vault"
      );
      const namesJson = localStorage.getItem("password-manager:vault-names");
      const vaultNames = namesJson ? JSON.parse(namesJson) : {};

      preferencesCache = {
        currentVaultKey,
        vaultNames,
      };
      return preferencesCache;
    } catch {
      return {
        currentVaultKey: null,
        vaultNames: {},
      };
    }
  }
}

/**
 * Save preferences to API (mock mode) or localStorage (production mode)
 */
async function savePreferences(prefs: Partial<Preferences>): Promise<void> {
  if (USE_MOCK_API) {
    try {
      const currentPrefs = preferencesCache || (await loadPreferences());
      const updatedPrefs = {
        currentVaultKey: prefs.currentVaultKey ?? currentPrefs.currentVaultKey,
        vaultNames: prefs.vaultNames ?? currentPrefs.vaultNames,
      };

      await fetch(`${API_URL}/mock-api/preferences`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedPrefs),
      });

      preferencesCache = updatedPrefs;
    } catch (error) {
      console.error("Failed to save preferences:", error);
    }
  } else {
    // Production mode: use localStorage
    try {
      if (prefs.currentVaultKey !== undefined) {
        if (prefs.currentVaultKey) {
          localStorage.setItem(
            "password-manager:current-vault",
            prefs.currentVaultKey
          );
        } else {
          localStorage.removeItem("password-manager:current-vault");
        }
      }
      if (prefs.vaultNames !== undefined) {
        localStorage.setItem(
          "password-manager:vault-names",
          JSON.stringify(prefs.vaultNames)
        );
      }

      // Update cache
      if (preferencesCache) {
        preferencesCache = {
          currentVaultKey:
            prefs.currentVaultKey ?? preferencesCache.currentVaultKey,
          vaultNames: prefs.vaultNames ?? preferencesCache.vaultNames,
        };
      }
    } catch (error) {
      console.error("Failed to save preferences:", error);
    }
  }
}

/**
 * Initialize preferences (call this early in the app)
 */
export async function initPreferences(): Promise<void> {
  if (!preferencesPromise) {
    preferencesPromise = loadPreferences().catch((error) => {
      console.error("Failed to initialize preferences:", error);
      // Return default preferences on error
      preferencesCache = {
        currentVaultKey: null,
        vaultNames: {},
      };
      return preferencesCache;
    });
  }
  await preferencesPromise;
}

/**
 * Get the currently selected vault key
 */
export async function getCurrentVaultKey(): Promise<string | null> {
  if (!preferencesCache) {
    await initPreferences();
  }
  return preferencesCache?.currentVaultKey ?? null;
}

/**
 * Synchronous version for backward compatibility (uses cache)
 * Use getCurrentVaultKey() for async version
 */
export function getCurrentVaultKeySync(): string | null {
  return preferencesCache?.currentVaultKey ?? null;
}

/**
 * Set the currently selected vault key
 */
export async function setCurrentVaultKey(
  vaultKey: string | null
): Promise<void> {
  await savePreferences({ currentVaultKey: vaultKey });
}

/**
 * Get custom display name for a vault
 */
export async function getVaultDisplayName(
  vaultKey: string
): Promise<string | null> {
  if (!preferencesCache) {
    await initPreferences();
  }
  return preferencesCache?.vaultNames[vaultKey] || null;
}

/**
 * Synchronous version for backward compatibility (uses cache)
 * Use getVaultDisplayName() for async version
 */
export function getVaultDisplayNameSync(vaultKey: string): string | null {
  return preferencesCache?.vaultNames[vaultKey] || null;
}

/**
 * Set custom display name for a vault
 */
export async function setVaultDisplayName(
  vaultKey: string,
  displayName: string
): Promise<void> {
  if (!preferencesCache) {
    await initPreferences();
  }
  const vaultNames = { ...(preferencesCache?.vaultNames || {}) };
  vaultNames[vaultKey] = displayName;
  await savePreferences({ vaultNames });
}

/**
 * Get display name for a vault (custom name or default name)
 */
export function getVaultName(vaultKey: string, defaultName: string): string {
  const customName = getVaultDisplayNameSync(vaultKey);
  return customName || defaultName;
}

/**
 * Get pending vault name (set when user wants to create a vault from VaultSelector)
 * Note: This still uses localStorage as it's temporary UI state
 */
export function getPendingVaultName(): string | null {
  try {
    return localStorage.getItem("password-manager:pending-vault-name");
  } catch {
    return null;
  }
}

/**
 * Set pending vault name
 * Note: This still uses localStorage as it's temporary UI state
 */
export function setPendingVaultName(vaultName: string | null): void {
  try {
    if (vaultName) {
      localStorage.setItem("password-manager:pending-vault-name", vaultName);
    } else {
      localStorage.removeItem("password-manager:pending-vault-name");
    }
  } catch (error) {
    console.error("Failed to save pending vault name:", error);
  }
}
