const STORAGE_KEY_VAULTS = "password-manager:vaults";
const STORAGE_KEY_CURRENT_VAULT = "password-manager:current-vault";
const STORAGE_KEY_VAULT_NAMES = "password-manager:vault-names";

export interface VaultMetadata {
  key: string;
  name: string;
  displayName?: string;
  lastAccessed?: string;
}

/**
 * Get all stored vault metadata
 */
export function getStoredVaults(): VaultMetadata[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_VAULTS);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

/**
 * Save vault metadata list
 */
export function saveVaults(vaults: VaultMetadata[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_VAULTS, JSON.stringify(vaults));
  } catch (error) {
    console.error("Failed to save vaults to localStorage:", error);
  }
}

/**
 * Add or update a vault in storage
 */
export function upsertVault(vault: VaultMetadata): void {
  const vaults = getStoredVaults();
  const index = vaults.findIndex((v) => v.key === vault.key);
  
  if (index >= 0) {
    vaults[index] = { ...vaults[index], ...vault };
  } else {
    vaults.push(vault);
  }
  
  saveVaults(vaults);
}

/**
 * Remove a vault from storage
 */
export function removeVault(vaultKey: string): void {
  const vaults = getStoredVaults();
  const filtered = vaults.filter((v) => v.key !== vaultKey);
  saveVaults(filtered);
}

/**
 * Get the currently selected vault key
 */
export function getCurrentVaultKey(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY_CURRENT_VAULT);
  } catch {
    return null;
  }
}

/**
 * Set the currently selected vault key
 */
export function setCurrentVaultKey(vaultKey: string | null): void {
  try {
    if (vaultKey) {
      localStorage.setItem(STORAGE_KEY_CURRENT_VAULT, vaultKey);
    } else {
      localStorage.removeItem(STORAGE_KEY_CURRENT_VAULT);
    }
  } catch (error) {
    console.error("Failed to save current vault key:", error);
  }
}

/**
 * Get custom display name for a vault
 */
export function getVaultDisplayName(vaultKey: string): string | null {
  try {
    const names = localStorage.getItem(STORAGE_KEY_VAULT_NAMES);
    if (!names) return null;
    const nameMap: Record<string, string> = JSON.parse(names);
    return nameMap[vaultKey] || null;
  } catch {
    return null;
  }
}

/**
 * Set custom display name for a vault
 */
export function setVaultDisplayName(vaultKey: string, displayName: string): void {
  try {
    const names = localStorage.getItem(STORAGE_KEY_VAULT_NAMES);
    const nameMap: Record<string, string> = names ? JSON.parse(names) : {};
    nameMap[vaultKey] = displayName;
    localStorage.setItem(STORAGE_KEY_VAULT_NAMES, JSON.stringify(nameMap));
  } catch (error) {
    console.error("Failed to save vault display name:", error);
  }
}

/**
 * Get display name for a vault (custom name or default name)
 */
export function getVaultName(vaultKey: string, defaultName: string): string {
  const customName = getVaultDisplayName(vaultKey);
  return customName || defaultName;
}

