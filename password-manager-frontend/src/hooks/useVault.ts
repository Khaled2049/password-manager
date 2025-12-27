import { useState, useCallback, useRef } from "react";
import { showError, showSuccess, showInfo } from "../utils/notifications";
import { setCurrentVaultKey } from "../utils/vault-storage";
import {
  VaultService,
  type VaultData,
  type VaultEntry,
  type VaultSession,
} from "../services/vault-service";
import type { VaultInfo } from "../api/vault-api";

// Re-export types for backward compatibility
export type { VaultEntry, VaultData };

/**
 * Consolidated status state
 */
type VaultStatus =
  | { type: "idle" }
  | { type: "checking" }
  | { type: "loading" }
  | { type: "loadingVaults" }
  | { type: "error"; message: string };

/**
 * Main vault hook with simplified state management
 */
export const useVault = () => {
  const [status, setStatus] = useState<VaultStatus>({ type: "idle" });
  const [vault, setVault] = useState<VaultData | null>(null);
  const [vaultExists, setVaultExists] = useState<boolean | null>(null);
  const [currentVaultKey, setCurrentVaultKeyState] = useState<string | null>(
    null
  );
  const [availableVaults, setAvailableVaults] = useState<VaultInfo[]>([]);

  const serviceRef = useRef<VaultService>(new VaultService());
  const sessionRef = useRef<VaultSession | null>(null);
  const checkingVaultKeyRef = useRef<string | null>(null);

  /**
   * QUERY: Check if a vault exists (doesn't modify state directly)
   */
  const checkVaultExists = useCallback(
    async (vaultKey?: string) => {
      const keyToCheck = vaultKey || currentVaultKey;
      const checkId = keyToCheck || "__fallback__";

      // Prevent race conditions
      checkingVaultKeyRef.current = checkId;
      setStatus({ type: "checking" });

      try {
        // Add timeout to prevent hanging
        const timeoutPromise = new Promise<boolean>((_, reject) => {
          setTimeout(() => reject(new Error("Timeout")), 10000);
        });

        const exists = await Promise.race([
          serviceRef.current.checkVaultExists(keyToCheck || undefined),
          timeoutPromise,
        ]);

        // Only update if we're still checking the same vault
        if (checkingVaultKeyRef.current === checkId) {
          setVaultExists(exists);
          setStatus({ type: "idle" });
        }
      } catch (err) {
        console.error("Error checking vault exists:", err);
        // Always set vaultExists to false on error (create mode)
        if (checkingVaultKeyRef.current === checkId) {
          setVaultExists(false);
          setStatus({ type: "idle" });
        }
      } finally {
        if (checkingVaultKeyRef.current === checkId) {
          checkingVaultKeyRef.current = null;
        }
      }
    },
    [currentVaultKey]
  );

  /**
   * QUERY: Refresh vault list (doesn't modify vault state)
   */
  const refreshVaultList = useCallback(async () => {
    setStatus({ type: "loadingVaults" });
    try {
      const vaults = await serviceRef.current.listAvailableVaults();
      setAvailableVaults(vaults);
      setStatus({ type: "idle" });
    } catch (err) {
      console.error("Failed to refresh vault list:", err);
      setStatus({ type: "idle" });
    }
  }, []);

  /**
   * COMMAND: Create a new vault
   */
  const createVault = useCallback(
    async (password: string, vaultName?: string) => {
      setStatus({ type: "loading" });

      try {
        const result = await serviceRef.current.createVault(
          password,
          vaultName
        );

        // Update state
        sessionRef.current = result.session;
        setVault(result.vaultData);
        setVaultExists(true);
        setCurrentVaultKeyState(result.session.vaultKey);
        await setCurrentVaultKey(result.session.vaultKey);

        // Refresh vault list
        await refreshVaultList();

        setStatus({ type: "idle" });
        showSuccess("Vault created successfully");
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to create vault";
        setStatus({ type: "error", message: errorMessage });
        sessionRef.current = null;
        showError(errorMessage);
      }
    },
    [refreshVaultList]
  );

  /**
   * COMMAND: Unlock an existing vault
   */
  const unlock = useCallback(
    async (password: string, vaultKey?: string) => {
      const targetKey = vaultKey || currentVaultKey;
      setStatus({ type: "loading" });

      try {
        const result = await serviceRef.current.unlockVault(
          password,
          targetKey || undefined
        );

        // Update state
        sessionRef.current = result.session;
        setVault(result.vaultData);
        setVaultExists(true);

        const key = result.session.vaultKey;
        if (key !== currentVaultKey) {
          setCurrentVaultKeyState(key);
          await setCurrentVaultKey(key);
        }

        setStatus({ type: "idle" });
        showSuccess("Vault unlocked successfully");
      } catch (err: any) {
        sessionRef.current = null;
        const is404 =
          err.message?.includes("404") || err.message?.includes("NOT_FOUND");

        if (is404) setVaultExists(false);

        const msg = is404 ? "Vault not found." : "Incorrect password.";
        setStatus({ type: "error", message: msg });
        showError(msg);
      }
    },
    [currentVaultKey]
  );
  /**
   * COMMAND: Lock the vault
   */
  const lock = useCallback(() => {
    if (sessionRef.current) {
      serviceRef.current.lockSession(sessionRef.current);
      sessionRef.current = null;
    }
    setVault(null);
    setStatus({ type: "idle" });
    showInfo("Vault locked");
  }, []);

  /**
   * COMMAND: Save vault data
   */
  const saveVault = useCallback(
    async (updatedVault: VaultData) => {
      if (!sessionRef.current) {
        const err = "No vault session. Please unlock the vault first.";
        setStatus({ type: "error", message: err });
        showError(err);
        return;
      }

      setStatus({ type: "loading" });

      try {
        const result = await serviceRef.current.saveVault(
          updatedVault,
          sessionRef.current
        );

        // Update session and state
        sessionRef.current = result.updatedSession;
        setVault(updatedVault);

        // Update vault key if it was sanitized
        if (
          result.updatedSession.vaultKey !== currentVaultKey &&
          result.updatedSession.vaultKey
        ) {
          setCurrentVaultKeyState(result.updatedSession.vaultKey);
          await setCurrentVaultKey(result.updatedSession.vaultKey);
        }

        setStatus({ type: "idle" });
        showSuccess("Vault saved successfully");
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to save vault";

        // Handle ETag conflict (concurrent modification)
        if (
          errorMessage.includes("PRECONDITION_FAILED") ||
          errorMessage.includes("ETag mismatch") ||
          errorMessage.includes("412")
        ) {
          const conflictMsg =
            "Vault was modified by another process. Please refresh and try again.";
          setStatus({ type: "error", message: conflictMsg });
          showError(conflictMsg);
        } else {
          setStatus({ type: "error", message: errorMessage });
          showError(errorMessage);
        }
      }
    },
    [currentVaultKey]
  );

  /**
   * COMMAND: Add entry to vault
   */
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

  /**
   * COMMAND: Switch to a different vault (or clear selection with null)
   */
  const switchVault = useCallback(async (vaultKey: string | null) => {
    // Lock current vault first
    if (sessionRef.current) {
      serviceRef.current.lockSession(sessionRef.current);
      sessionRef.current = null;
    }
    // Clear any ongoing vault check to prevent race conditions
    checkingVaultKeyRef.current = null;
    setVault(null);
    setStatus({ type: "idle" });
    setCurrentVaultKeyState(vaultKey);
    await setCurrentVaultKey(vaultKey);
    setVaultExists(null);
  }, []);

  return {
    vault,
    loading: status.type === "loading",
    checkingVault: status.type === "checking",
    loadingVaults: status.type === "loadingVaults",
    error: status.type === "error" ? status.message : null,
    status, // Export the raw status for more complex UI logic
    unlock,
    lock,
    addEntry,
    saveVault,
    vaultExists,
    checkVaultExists,
    createVault,
    currentVaultKey,
    availableVaults,
    refreshVaultList,
    switchVault,
  };
};
