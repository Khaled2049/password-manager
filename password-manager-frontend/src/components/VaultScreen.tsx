import { useState } from "react";
import type { VaultData } from "../hooks/useVault";
import PasswordEntry from "./PasswordEntry";
import AddEntryModal from "./AddEntryModal";
import VaultSelector from "./VaultSelector";
import type { VaultInfo } from "../api/vault-api";

interface VaultScreenProps {
  vault: VaultData;
  onLock: () => void;
  onAddEntry: (
    entry: Omit<import("../hooks/useVault").VaultEntry, "id">
  ) => void;
  currentVaultKey: string | null;
  availableVaults: VaultInfo[];
  onSwitchVault: (vaultKey: string) => void;
  onCreateVault: (vaultName: string) => Promise<void>;
  onRefreshVaults: () => void;
  loadingVaults?: boolean;
}

export default function VaultScreen({
  vault,
  onLock,
  onAddEntry,
  currentVaultKey,
  availableVaults,
  onSwitchVault,
  onCreateVault,
  onRefreshVaults,
  loadingVaults = false,
}: VaultScreenProps) {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isCreatingVault, setIsCreatingVault] = useState(false);

  const handleCreateVault = async (vaultName: string) => {
    setIsCreatingVault(true);
    try {
      await onCreateVault(vaultName);
      await onRefreshVaults();
    } finally {
      setIsCreatingVault(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-bold text-blue-400">ShieldVault</h1>
              <VaultSelector
                availableVaults={availableVaults}
                currentVaultKey={currentVaultKey}
                onSwitchVault={onSwitchVault}
                onCreateVault={handleCreateVault}
                loading={loadingVaults || isCreatingVault}
              />
              <span className="text-sm text-gray-400 hidden sm:inline">
                {vault.entries.length}{" "}
                {vault.entries.length === 1 ? "entry" : "entries"}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800 sm:hidden"
                aria-label="Add entry"
              >
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
                    d="M12 4v16m8-8H4"
                  />
                </svg>
              </button>
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="hidden sm:flex bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800 items-center gap-2"
              >
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
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                Add Entry
              </button>
              <button
                onClick={onLock}
                className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:ring-offset-gray-800"
              >
                Lock
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {vault.entries.length === 0 ? (
          <div className="text-center py-16">
            <div className="mb-4">
              <svg
                className="w-16 h-16 text-gray-600 mx-auto"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-400 mb-2">
              No passwords yet
            </h2>
            <p className="text-gray-500 mb-6">
              Get started by adding your first password entry.
            </p>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="bg-blue-600 hover:bg-blue-500 px-6 py-3 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900"
            >
              Add Your First Entry
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {vault.entries.map((entry) => (
              <PasswordEntry key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </main>

      {/* Floating Action Button for Mobile */}
      <button
        onClick={() => setIsAddModalOpen(true)}
        className="fixed bottom-6 right-6 sm:hidden bg-blue-600 hover:bg-blue-500 text-white rounded-full w-14 h-14 shadow-lg flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900 z-30"
        aria-label="Add entry"
      >
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 4v16m8-8H4"
          />
        </svg>
      </button>

      {/* Add Entry Modal */}
      <AddEntryModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSave={onAddEntry}
      />
    </div>
  );
}
