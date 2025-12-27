import { VaultManager, S3Client } from "@password-manager/core";
import { getVaultUrls, listVaults, type VaultInfo } from "../api/vault-api";

export interface VaultEntry {
  id: string;
  title: string;
  username: string;
  password: string;
  url?: string;
}

export interface VaultData {
  entries: VaultEntry[];
  created: string;
  lastModified: string;
}

export interface VaultSession {
  vaultManager: VaultManager;
  etag: string | null;
  vaultKey: string;
  masterPassword: string;
}

export interface VaultUrls {
  getUrl: string;
  putUrl: string;
  vaultKey: string;
}

/**
 * Error classification for better error handling
 */
export class VaultError extends Error {
  public readonly code:
    | "NOT_FOUND"
    | "NETWORK_ERROR"
    | "CONFIG_ERROR"
    | "DECRYPTION_ERROR"
    | "CONCURRENT_MODIFICATION";

  constructor(
    message: string,
    code:
      | "NOT_FOUND"
      | "NETWORK_ERROR"
      | "CONFIG_ERROR"
      | "DECRYPTION_ERROR"
      | "CONCURRENT_MODIFICATION"
  ) {
    super(message);
    this.name = "VaultError";
    this.code = code;
  }
}

// Fallback URLs from environment variables
const fallbackGetUrl = import.meta.env.VITE_VAULT_GET_URL;
const fallbackPutUrl = import.meta.env.VITE_VAULT_PUT_URL;

/**
 * Default vault key for fallback mode
 */
const DEFAULT_FALLBACK_VAULT_KEY = "vaults/vault.dat";

/**
 * Service layer for vault operations - pure business logic without React state
 */
export class VaultService {
  /**
   * Private resolver: Centralizes vault URL resolution logic with fallback support
   * This eliminates duplication between checkVaultExists and getVaultUrlsForOperation
   */
  private async resolveVaultUrls(
    vaultKey: string | undefined,
    operation: "get" | "put"
  ): Promise<VaultUrls> {
    // If vault key is provided, use API to get URLs
    if (vaultKey) {
      const urls = await getVaultUrls(vaultKey);
      return {
        getUrl: urls.getUrl,
        putUrl: urls.putUrl,
        vaultKey: urls.vaultKey,
      };
    }

    // Fallback to environment variables
    const requiredUrl = operation === "get" ? fallbackGetUrl : fallbackPutUrl;
    if (!requiredUrl) {
      throw new VaultError(
        `Vault key not specified and ${
          operation === "get" ? "VITE_VAULT_GET_URL" : "VITE_VAULT_PUT_URL"
        } not configured. Please select a vault or configure environment variables.`,
        "CONFIG_ERROR"
      );
    }

    // Return fallback URLs with predictable defaults
    return {
      getUrl: fallbackGetUrl || fallbackPutUrl || requiredUrl,
      putUrl: fallbackPutUrl || fallbackGetUrl || requiredUrl,
      vaultKey: DEFAULT_FALLBACK_VAULT_KEY,
    };
  }

  /**
   * Classify error type from exception
   */
  private classifyError(err: unknown): VaultError {
    if (err instanceof VaultError) {
      return err;
    }

    const message = err instanceof Error ? err.message : "Unknown error";
    const lowerMessage = message.toLowerCase();

    if (lowerMessage.includes("404") || lowerMessage.includes("not_found")) {
      return new VaultError(message, "NOT_FOUND");
    }

    if (
      lowerMessage.includes("precondition_failed") ||
      lowerMessage.includes("etag mismatch") ||
      lowerMessage.includes("412")
    ) {
      return new VaultError(message, "CONCURRENT_MODIFICATION");
    }

    if (
      lowerMessage.includes("failed to download") ||
      lowerMessage.includes("network") ||
      lowerMessage.includes("fetch")
    ) {
      return new VaultError(message, "NETWORK_ERROR");
    }

    if (
      lowerMessage.includes("decrypt") ||
      lowerMessage.includes("password") ||
      lowerMessage.includes("unlock")
    ) {
      return new VaultError(message, "DECRYPTION_ERROR");
    }

    // Default to network error for unknown cases
    return new VaultError(message, "NETWORK_ERROR");
  }

  /**
   * Check if a vault exists
   */
  async checkVaultExists(vaultKey?: string): Promise<boolean> {
    try {
      const urls = await this.resolveVaultUrls(vaultKey, "get");
      const s3Client = new S3Client();
      await s3Client.download(urls.getUrl);
      return true;
    } catch (err) {
      const vaultError = this.classifyError(err);
      // Only return false for NOT_FOUND, re-throw other errors
      if (vaultError.code === "NOT_FOUND") {
        return false;
      }
      // For config errors, also return false (no vault configured)
      if (vaultError.code === "CONFIG_ERROR") {
        return false;
      }
      // Re-throw unexpected errors
      throw vaultError;
    }
  }

  /**
   * List all available vaults
   */
  async listAvailableVaults(): Promise<VaultInfo[]> {
    return await listVaults();
  }

  /**
   * Get URLs for a vault (with fallback support)
   * Delegates to private resolver for consistent logic
   */
  async getVaultUrlsForOperation(
    vaultKey?: string,
    operation: "get" | "put" = "get"
  ): Promise<VaultUrls> {
    return await this.resolveVaultUrls(vaultKey, operation);
  }

  /**
   * Create a new vault
   */
  async createVault(
    password: string,
    vaultName?: string
  ): Promise<{
    session: VaultSession;
    vaultData: VaultData;
  }> {
    const vaultManager = new VaultManager();
    const s3Client = new S3Client();

    // Determine vault key and name
    let vaultKey: string;
    let finalVaultName: string;

    if (vaultName) {
      finalVaultName = vaultName;
    } else if (fallbackPutUrl) {
      finalVaultName = "default";
    } else {
      finalVaultName = "default-vault";
    }

    if (fallbackPutUrl) {
      vaultKey = "vaults/vault.dat";
    } else {
      const rawKey = finalVaultName.endsWith(".dat")
        ? `vaults/${finalVaultName}`
        : `vaults/${finalVaultName}.dat`;
      const urls = await getVaultUrls(rawKey);
      vaultKey = urls.vaultKey;
    }

    // Create initial vault data
    const initialVaultData: VaultData = {
      entries: [],
      created: new Date().toISOString(),
      lastModified: new Date().toISOString(),
    };

    // Convert to bytes and encrypt
    const plaintext = new TextEncoder().encode(
      JSON.stringify(initialVaultData)
    );
    const encryptedVault = await vaultManager.create(password, plaintext);

    // Upload to S3
    const urls = await this.getVaultUrlsForOperation(vaultKey, "put");
    const etag = await s3Client.upload(urls.putUrl, encryptedVault);

    return {
      session: {
        vaultManager,
        etag,
        vaultKey,
        masterPassword: password,
      },
      vaultData: initialVaultData,
    };
  }

  /**
   * Unlock an existing vault
   */
  async unlockVault(
    password: string,
    vaultKey?: string
  ): Promise<{
    session: VaultSession;
    vaultData: VaultData;
  }> {
    try {
      const urls = await this.getVaultUrlsForOperation(vaultKey, "get");
      const s3Client = new S3Client();
      const vaultManager = new VaultManager();

      // Download encrypted vault
      const { data: encryptedVault, etag } = await s3Client.download(
        urls.getUrl
      );

      // Decrypt
      const plaintext = await vaultManager.unlock(encryptedVault, password);

      // Parse vault data
      const vaultData = JSON.parse(
        new TextDecoder().decode(plaintext)
      ) as VaultData;

      return {
        session: {
          vaultManager,
          etag: etag || null,
          vaultKey: urls.vaultKey,
          masterPassword: password,
        },
        vaultData,
      };
    } catch (err) {
      const vaultError = this.classifyError(err);
      // Re-classify decryption errors more specifically
      if (
        vaultError.code === "NETWORK_ERROR" &&
        err instanceof Error &&
        (err.message.includes("decrypt") ||
          err.message.includes("password") ||
          err.message.includes("unlock"))
      ) {
        throw new VaultError(
          "Failed to unlock vault. Check your password.",
          "DECRYPTION_ERROR"
        );
      }
      throw vaultError;
    }
  }

  /**
   * Save vault data (update existing vault)
   */
  async saveVault(
    vaultData: VaultData,
    session: VaultSession
  ): Promise<{
    newEtag: string;
    updatedSession: VaultSession;
  }> {
    try {
      const urls = await this.getVaultUrlsForOperation(session.vaultKey, "put");
      const s3Client = new S3Client();

      // Convert to bytes
      const plaintext = new TextEncoder().encode(JSON.stringify(vaultData));

      let encryptedVault: Uint8Array;
      let updatedVaultManager = session.vaultManager;

      // Use fast path if vault is unlocked
      if (session.vaultManager.isUnlocked()) {
        try {
          encryptedVault = await session.vaultManager.update(plaintext);
        } catch (err) {
          // If update fails, re-initialize and use save method
          updatedVaultManager = new VaultManager();
          encryptedVault = await updatedVaultManager.save(
            plaintext,
            session.masterPassword
          );
        }
      } else {
        // Vault is locked, need password
        updatedVaultManager = new VaultManager();
        encryptedVault = await updatedVaultManager.save(
          plaintext,
          session.masterPassword
        );
      }

      // Upload with optimistic locking
      const newEtag = await s3Client.upload(urls.putUrl, encryptedVault, {
        ifMatch: session.etag || undefined,
      });

      return {
        newEtag,
        updatedSession: {
          ...session,
          vaultManager: updatedVaultManager,
          etag: newEtag,
          vaultKey: urls.vaultKey, // Use sanitized key if changed
        },
      };
    } catch (err) {
      throw this.classifyError(err);
    }
  }

  /**
   * Lock a vault session (clears keys from memory)
   */
  lockSession(session: VaultSession): void {
    session.vaultManager.lock();
  }
}
