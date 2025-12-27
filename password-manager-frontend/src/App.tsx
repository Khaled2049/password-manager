import { useEffect } from "react";
import { useVault } from "./hooks/useVault";
import UnlockScreen from "./components/UnlockScreen";
import VaultScreen from "./components/VaultScreen";
import MockServerBanner from "./components/MockServerBanner";
import { getCurrentVaultKey, initPreferences } from "./utils/vault-storage";

export default function App() {
  const {
    vault,
    loading,
    error,
    unlock,
    lock,
    addEntry,
    vaultExists,
    checkingVault,
    checkVaultExists,
    createVault,
    currentVaultKey,
    availableVaults,
    loadingVaults,
    refreshVaultList,
    switchVault,
  } = useVault();

  // Initialize vault list and current vault on mount
  useEffect(() => {
    const initialize = async () => {
      try {
        await initPreferences();
        await refreshVaultList();
        const storedVaultKey = await getCurrentVaultKey();
        if (storedVaultKey && storedVaultKey !== currentVaultKey) {
          await switchVault(storedVaultKey);
        }
      } catch (error) {
        console.error("Failed to initialize:", error);
        if (vaultExists === null && !checkingVault) {
          checkVaultExists();
        }
      }
    };

    initialize();
  }, []);

  // Check if current vault exists
  useEffect(() => {
    if (vaultExists !== null || checkingVault) return;
    checkVaultExists(currentVaultKey || undefined);
  }, [currentVaultKey, vaultExists, checkingVault, checkVaultExists]);

  const useMockApi = import.meta.env.VITE_USE_MOCK_API === "true";

  // Show loading state while checking if vault exists
  if (checkingVault || vaultExists === null) {
    return (
      <>
        <MockServerBanner />
        <div
          className={`min-h-screen flex items-center justify-center px-4 py-12 ${
            useMockApi ? "pt-20" : ""
          }`}
        >
          <div className="text-center">
            <div className="mb-4">
              <svg
                className="animate-spin h-8 w-8 text-blue-400 mx-auto"
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
            </div>
            <p className="text-gray-400">Checking vault status...</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <MockServerBanner />
      <div className={useMockApi ? "pt-10" : ""}>
        {!vault ? (
          <UnlockScreen
            mode={currentVaultKey ? "unlock" : "create"}
            onUnlock={unlock}
            onCreate={createVault}
            loading={loading}
            error={error}
            availableVaults={availableVaults}
            currentVaultKey={currentVaultKey}
            onSwitchVault={switchVault}
            loadingVaults={loadingVaults}
          />
        ) : (
          <VaultScreen
            vault={vault}
            onLock={lock}
            onAddEntry={addEntry}
            currentVaultKey={currentVaultKey}
            availableVaults={availableVaults}
            onSwitchVault={switchVault}
            loadingVaults={loadingVaults}
          />
        )}
      </div>
    </>
  );
}
