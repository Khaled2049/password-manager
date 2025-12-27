const API_URL = import.meta.env.VITE_API_URL || "";

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
  if (!API_URL) {
    throw new Error(
      "VITE_API_URL not configured. Please set VITE_API_URL in your .env file."
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
 * @param vaultKey - The vault key (e.g., "personal-vault" or "vaults/personal-vault.dat")
 */
export async function getVaultUrls(vaultKey: string): Promise<VaultUrls> {
  if (!API_URL) {
    throw new Error(
      "VITE_API_URL not configured. Please set VITE_API_URL in your .env file."
    );
  }

  // Ensure vault key is properly formatted
  let key = vaultKey;
  if (!key.startsWith("vaults/")) {
    key = `vaults/${key}`;
  }
  if (!key.endsWith(".dat")) {
    key = `${key}.dat`;
  }

  // URL encode the key for the path
  const encodedKey = encodeURIComponent(key.replace("vaults/", ""));

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

