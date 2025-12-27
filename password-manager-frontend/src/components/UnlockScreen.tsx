import { useState, useEffect } from "react";
import type { FormEvent } from "react";
import VaultSelector from "./VaultSelector";
import type { VaultInfo } from "../api/vault-api";
import {
  getPendingVaultName,
  setPendingVaultName,
} from "../utils/vault-storage";

interface UnlockScreenProps {
  mode: "create" | "unlock";
  onUnlock: (password: string, vaultKey?: string) => void;
  onCreate: (password: string, vaultName?: string) => void;
  loading: boolean;
  error: string | null;
  availableVaults?: VaultInfo[];
  currentVaultKey?: string | null;
  onSwitchVault?: (vaultKey: string | null) => void;
  loadingVaults?: boolean;
}

export default function UnlockScreen({
  mode,
  onUnlock,
  onCreate,
  loading,
  error,
  availableVaults = [],
  currentVaultKey = null,
  onSwitchVault,
  loadingVaults = false,
}: UnlockScreenProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [newVaultName, setNewVaultName] = useState("");
  const [showVaultNameInput, setShowVaultNameInput] = useState(false);

  // Check for pending vault name when component mounts or mode changes to create
  useEffect(() => {
    if (mode === "create") {
      const pendingName = getPendingVaultName();
      if (pendingName) {
        setNewVaultName(pendingName);
        setShowVaultNameInput(true);
        // Clear the pending name so it doesn't persist
        setPendingVaultName(null);
      }
    }
  }, [mode]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (mode === "create") {
      if (password.trim() && password === confirmPassword) {
        const vaultName =
          showVaultNameInput && newVaultName.trim()
            ? newVaultName.trim()
            : undefined;
        onCreate(password, vaultName);
      }
    } else {
      if (password.trim()) {
        onUnlock(password, currentVaultKey || undefined);
      }
    }
  };

  const isFormValid =
    mode === "create"
      ? password.trim() && password === confirmPassword && password.length > 0
      : password.trim().length > 0;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-blue-400 mb-2">ShieldVault</h1>
          <p className="text-gray-400">Secure password management</p>
        </div>

        <div className="bg-gray-800 rounded-xl shadow-xl border border-gray-700 p-8">
          <h2 className="text-2xl font-semibold mb-6 text-center">
            {mode === "create" ? "Create Your Vault" : "Unlock your Vault"}
          </h2>

          {/* Vault Selector for unlock mode or when vaults exist */}
          {(mode === "unlock" || availableVaults.length > 0) &&
            onSwitchVault && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Select Vault
                </label>
                <VaultSelector
                  availableVaults={availableVaults}
                  currentVaultKey={currentVaultKey}
                  onSwitchVault={(vaultKey) => {
                    // If switching to create mode (empty/null), clear selection
                    if (!vaultKey) {
                      onSwitchVault("");
                    } else {
                      onSwitchVault(vaultKey);
                    }
                  }}
                  onCreateVault={(name) => {
                    setNewVaultName(name);
                    setShowVaultNameInput(true);
                    // Clear current vault selection to switch to create mode
                    if (onSwitchVault && currentVaultKey) {
                      onSwitchVault(null);
                    }
                  }}
                  loading={loadingVaults}
                />
              </div>
            )}

          {/* Vault Name Input for Create Mode */}
          {mode === "create" && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-300">
                  Vault Name (Optional)
                </label>
                {!showVaultNameInput && (
                  <button
                    type="button"
                    onClick={() => setShowVaultNameInput(true)}
                    className="text-sm text-blue-400 hover:text-blue-300"
                  >
                    Set custom name
                  </button>
                )}
              </div>
              {showVaultNameInput && (
                <input
                  type="text"
                  value={newVaultName}
                  onChange={(e) => setNewVaultName(e.target.value)}
                  placeholder="e.g., personal-vault"
                  className="w-full px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-colors text-white placeholder-gray-500"
                  disabled={loading}
                />
              )}
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            className="space-y-4"
            autoComplete="off"
          >
            <div>
              <label htmlFor="password" className="sr-only">
                Master Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Master Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={(e) => {
                    e.target.setAttribute("autocomplete", "off");
                  }}
                  className="w-full px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-colors text-white placeholder-gray-500"
                  disabled={loading}
                  autoFocus
                  autoComplete="new-password"
                  aria-label="Master Password"
                  aria-describedby={error ? "password-error" : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300 focus:outline-none focus:text-gray-300"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.29 3.29m0 0L3 3m3.29 3.29L3 3"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {mode === "create" && (
              <div>
                <label htmlFor="confirmPassword" className="sr-only">
                  Confirm Master Password
                </label>
                <div className="relative">
                  <input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Confirm Master Password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    onFocus={(e) => {
                      e.target.setAttribute("autocomplete", "off");
                    }}
                    className="w-full px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-colors text-white placeholder-gray-500"
                    disabled={loading}
                    autoComplete="new-password"
                    aria-label="Confirm Master Password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300 focus:outline-none focus:text-gray-300"
                    aria-label={
                      showConfirmPassword ? "Hide password" : "Show password"
                    }
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? (
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.29 3.29m0 0L3 3m3.29 3.29L3 3"
                        />
                      </svg>
                    ) : (
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                        />
                      </svg>
                    )}
                  </button>
                </div>
                {confirmPassword &&
                  password !== confirmPassword &&
                  confirmPassword.length > 0 && (
                    <p className="mt-2 text-sm text-red-400" role="alert">
                      Passwords do not match
                    </p>
                  )}
              </div>
            )}

            {error && (
              <p
                id="password-error"
                className="text-sm text-red-400"
                role="alert"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !isFormValid}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed py-3 rounded-lg font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800"
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <svg
                    className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  {mode === "create" ? "Creating..." : "Decrypting..."}
                </span>
              ) : mode === "create" ? (
                "Create Vault"
              ) : (
                "Unlock"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
