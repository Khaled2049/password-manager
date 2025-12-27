// Use mock API if enabled, otherwise use production API URL
const USE_MOCK_API = import.meta.env.VITE_USE_MOCK_API === "true";
const API_URL = USE_MOCK_API ? "" : (import.meta.env.VITE_API_URL || "");

export interface VaultInfo {
  key: string;
  name: string;
  lastModified?: string;
  size?: number;
}

export interface VaultUrls {
  getUrl: string;
  putUrl: string;
  etag: string | null;
  vaultKey: string;
}

export interface ApiError {
  error: string;
  message?: string;
}

/**
 * Lists all available vaults from the backend
 */
export async function listVaults(): Promise<VaultInfo[]> {
  if (!USE_MOCK_API && !API_URL) {
    throw new Error(
      "VITE_API_URL not configured. Please set VITE_API_URL in your .env file, or enable mock API with VITE_USE_MOCK_API=true."
    );
  }

  try {
    const response = await fetch(`${API_URL}/vaults`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error: ApiError = await response.json().catch(() => ({
        error: "Failed to list vaults",
      }));
      throw new Error(error.message || error.error || "Failed to list vaults");
    }

    const data = await response.json();
    return data.vaults || [];
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Unknown error occurred while listing vaults");
  }
}

/**
 * Gets pre-signed URLs for a specific vault
 * @param vaultKey - The vault key (e.g., "personal-vault", "vaults/personal-vault.dat", or full S3 key)
 *                   The backend will sanitize it, so any format is acceptable
 */
export async function getVaultUrls(vaultKey: string): Promise<VaultUrls> {
  if (!USE_MOCK_API && !API_URL) {
    throw new Error(
      "VITE_API_URL not configured. Please set VITE_API_URL in your .env file, or enable mock API with VITE_USE_MOCK_API=true."
    );
  }

  if (!vaultKey || vaultKey.trim() === "") {
    throw new Error("Vault key cannot be empty");
  }

  // Remove the "vaults/" prefix if present (backend will add it back during sanitization)
  // This ensures the path parameter is clean
  let keyForPath = vaultKey.trim();
  if (keyForPath.startsWith("vaults/")) {
    keyForPath = keyForPath.replace(/^vaults\//, "");
  }

  // URL encode the key for the path parameter
  // Backend will decode and sanitize it (adds vaults/ prefix and .dat suffix if needed)
  const encodedKey = encodeURIComponent(keyForPath);

  try {
    const response = await fetch(`${API_URL}/vaults/${encodedKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error: ApiError = await response.json().catch(() => ({
        error: "Failed to get vault URLs",
      }));
      throw new Error(
        error.message || error.error || "Failed to get vault URLs"
      );
    }

    const data = await response.json();
    return data;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Unknown error occurred while getting vault URLs");
  }
}
