import { useState, useCallback } from "react";
import { VaultManager, S3Client } from "@password-manager/core";
import { showError, showSuccess, showInfo } from "../utils/notifications";
import { listVaults, getVaultUrls, type VaultInfo } from "../api/vault-api";
import {
  getCurrentVaultKey,
  setCurrentVaultKey,
  upsertVault,
  getVaultName,
} from "../utils/vault-storage";

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

export const useVault = () => {
  const [vault, setVault] = useState<VaultData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [masterPassword, setMasterPassword] = useState<string>("");
  const [vaultExists, setVaultExists] = useState<boolean | null>(null);
  const [checkingVault, setCheckingVault] = useState(false);
  const [currentVaultKey, setCurrentVaultKeyState] = useState<string | null>(
    null
  );
  const [availableVaults, setAvailableVaults] = useState<VaultInfo[]>([]);
  const [loadingVaults, setLoadingVaults] = useState(false);

  // Fallback to environment variables for backward compatibility
  const fallbackGetUrl = import.meta.env.VITE_VAULT_GET_URL;
  const fallbackPutUrl = import.meta.env.VITE_VAULT_PUT_URL;

  const checkVaultExists = useCallback(
    async (vaultKey?: string) => {
      const keyToCheck = vaultKey || currentVaultKey;
      
      // If using API, check via API
      if (keyToCheck) {
        setCheckingVault(true);
        try {
          const urls = await getVaultUrls(keyToCheck);
          // If we got URLs, try to download to verify it exists
          const s3Client = new S3Client();
          try {
            await s3Client.download(urls.getUrl);
            setVaultExists(true);
          } catch (err) {
            // 404 means it doesn't exist yet
            setVaultExists(false);
          }
        } catch (err) {
          // Assume it doesn't exist
          setVaultExists(false);
        } finally {
          setCheckingVault(false);
        }
        return;
      }

      // Fallback to environment variable approach
      if (!fallbackGetUrl) {
        setVaultExists(false);
        return;
      }

      setCheckingVault(true);
      try {
        const s3Client = new S3Client();
        await s3Client.download(fallbackGetUrl);
        setVaultExists(true);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        // Check if it's a 404 error (vault doesn't exist)
        if (
          errorMessage.includes("404") ||
          errorMessage.includes("Failed to download")
        ) {
          setVaultExists(false);
        } else {
          // Other error - might be network issue, but assume vault doesn't exist for now
          setVaultExists(false);
        }
      } finally {
        setCheckingVault(false);
      }
    },
    [currentVaultKey]
  );

  const createVault = useCallback(
    async (password: string, vaultName?: string) => {
      setLoading(true);
      setError(null);

      try {
        const vaultManager = new VaultManager();
        const s3Client = new S3Client();

        // Determine vault key
        let vaultKey: string;
        let putUrl: string;
        let getUrl: string;

        if (vaultName) {
          // Use API to get URLs for new vault
          vaultKey = vaultName.endsWith(".dat")
            ? `vaults/${vaultName}`
            : `vaults/${vaultName}.dat`;
          const urls = await getVaultUrls(vaultKey);
          putUrl = urls.putUrl;
          getUrl = urls.getUrl;
        } else if (fallbackPutUrl) {
          // Fallback to environment variable
          vaultKey = "vault.dat";
          putUrl = fallbackPutUrl;
          getUrl = fallbackGetUrl || "";
        } else {
          throw new Error(
            "Vault name required. Please provide a name for the new vault."
          );
        }

        // Create initial vault data
        const initialVaultData: VaultData = {
          entries: [],
          created: new Date().toISOString(),
          lastModified: new Date().toISOString(),
        };

        // Convert to bytes
        const plaintext = new TextEncoder().encode(
          JSON.stringify(initialVaultData)
        );

        // Create encrypted vault
        const encryptedVault = await vaultManager.create(password, plaintext);

        // Upload to S3
        await s3Client.upload(putUrl, encryptedVault);

        // Update state
        setVault(initialVaultData);
        setMasterPassword(password);
        setVaultExists(true);
        setCurrentVaultKeyState(vaultKey);
        setCurrentVaultKey(vaultKey);

        // Update vault metadata
        upsertVault({
          key: vaultKey,
          name: vaultName || "default",
          lastAccessed: new Date().toISOString(),
        });

        // Refresh vault list
        await refreshVaultList();

        showSuccess("Vault created successfully");
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to create vault";
        setError(errorMessage);
        showError(errorMessage);
      } finally {
        setLoading(false);
      }
    },
    [fallbackPutUrl, fallbackGetUrl]
  );

  const unlock = useCallback(
    async (password: string, vaultKey?: string) => {
      const keyToUnlock = vaultKey || currentVaultKey;
      
      setLoading(true);
      setError(null);

      try {
        let getUrl: string;

        // Get URLs for the vault
        if (keyToUnlock) {
          const urls = await getVaultUrls(keyToUnlock);
          getUrl = urls.getUrl;
        } else if (fallbackGetUrl) {
          // Fallback to environment variable
          getUrl = fallbackGetUrl;
        } else {
          throw new Error(
            "Vault key not specified. Please select a vault or configure VITE_VAULT_GET_URL."
          );
        }

        const s3Client = new S3Client();
        const vaultManager = new VaultManager();

        // Download encrypted vault
        const { data: encryptedVault } = await s3Client.download(getUrl);

        // Unlock vault
        const plaintext = await vaultManager.unlock(encryptedVault, password);

        // Parse vault data
        const data = JSON.parse(
          new TextDecoder().decode(plaintext)
        ) as VaultData;

        setVault(data);
        setMasterPassword(password);
        setVaultExists(true);
        
        // Update current vault key if not already set
        if (keyToUnlock && keyToUnlock !== currentVaultKey) {
          setCurrentVaultKeyState(keyToUnlock);
          setCurrentVaultKey(keyToUnlock);
          upsertVault({
            key: keyToUnlock,
            name: getVaultName(keyToUnlock, "default"),
            lastAccessed: new Date().toISOString(),
          });
        }

        showSuccess("Vault unlocked successfully");
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";

        // Check if it's a 404 error (vault doesn't exist)
        // This could happen if vault was deleted between check and unlock
        if (
          errorMessage.includes("404") ||
          errorMessage.includes("Failed to download")
        ) {
          setVaultExists(false);
          const errMsg = "Vault not found. Please create a new vault.";
          setError(errMsg);
          showError(errMsg);
        } else {
          // Wrong password or decryption error
          const errMsg = "Failed to unlock vault. Check your password.";
          setError(errMsg);
          showError(errMsg);
        }
      } finally {
        setLoading(false);
      }
    },
    [currentVaultKey, fallbackGetUrl]
  );

  const lock = useCallback(() => {
    setVault(null);
    setMasterPassword("");
    setError(null);
    showInfo("Vault locked");
  }, []);

  const saveVault = useCallback(
    async (updatedVault: VaultData) => {
      if (!masterPassword) {
        const err = "Master password not available";
        setError(err);
        showError(err);
        return;
      }

      const keyToSave = currentVaultKey;
      if (!keyToSave && !fallbackPutUrl) {
        const err = "No vault selected. Please select a vault first.";
        setError(err);
        showError(err);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        let putUrl: string;

        // Get URLs for the vault
        if (keyToSave) {
          const urls = await getVaultUrls(keyToSave);
          putUrl = urls.putUrl;
        } else if (fallbackPutUrl) {
          // Fallback to environment variable
          putUrl = fallbackPutUrl;
        } else {
          throw new Error("No vault URL available");
        }

        const vaultManager = new VaultManager();
        const s3Client = new S3Client();

        // Encrypt updated vault
        const updatedPlaintext = new TextEncoder().encode(
          JSON.stringify(updatedVault)
        );
        const newEncryptedVault = await vaultManager.save(
          updatedPlaintext,
          masterPassword
        );

        // Upload to S3
        await s3Client.upload(putUrl, newEncryptedVault);

        setVault(updatedVault);
        showSuccess("Vault saved successfully");
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to save vault";
        setError(errorMessage);
        showError(errorMessage);
      } finally {
        setLoading(false);
      }
    },
    [currentVaultKey, masterPassword, fallbackPutUrl]
  );

  const addEntry = useCallback(
    async (entry: Omit<VaultEntry, "id">) => {
      if (!vault) return;

      const newEntry: VaultEntry = {
        ...entry,
        id: crypto.randomUUID(),
      };

      const updatedVault: VaultData = {
        ...vault,
        entries: [...vault.entries, newEntry],
        lastModified: new Date().toISOString(),
      };

      await saveVault(updatedVault);
    },
    [vault, saveVault]
  );

  const refreshVaultList = useCallback(async () => {
    setLoadingVaults(true);
    try {
      const vaults = await listVaults();
      setAvailableVaults(vaults);
    } catch (err) {
      console.error("Failed to refresh vault list:", err);
      // Don't show error to user, just log it
    } finally {
      setLoadingVaults(false);
    }
  }, []);

  const switchVault = useCallback(
    async (vaultKey: string) => {
      // Lock current vault first
      setVault(null);
      setMasterPassword("");
      setError(null);
      setCurrentVaultKeyState(vaultKey);
      setCurrentVaultKey(vaultKey);
      setVaultExists(null);
      
      // Update metadata
      upsertVault({
        key: vaultKey,
        name: getVaultName(vaultKey, "default"),
        lastAccessed: new Date().toISOString(),
      });
    },
    []
  );

  return {
    vault,
    loading,
    error,
    unlock,
    lock,
    addEntry,
    saveVault,
    vaultExists,
    checkingVault,
    checkVaultExists,
    createVault,
    currentVaultKey,
    availableVaults,
    loadingVaults,
    refreshVaultList,
    switchVault,
  };
};
