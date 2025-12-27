import { useState, useEffect, useRef } from "react";
import type { VaultInfo } from "../api/vault-api";
import { getVaultName } from "../utils/vault-storage";

interface VaultSelectorProps {
  availableVaults: VaultInfo[];
  currentVaultKey: string | null;
  onSwitchVault: (vaultKey: string) => void;
  onCreateVault: (vaultName: string) => void;
  loading?: boolean;
}

export default function VaultSelector({
  availableVaults,
  currentVaultKey,
  onSwitchVault,
  onCreateVault,
  loading = false,
}: VaultSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newVaultName, setNewVaultName] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setIsCreating(false);
        setNewVaultName("");
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const currentVaultName = currentVaultKey
    ? getVaultName(
        currentVaultKey,
        availableVaults.find((v) => v.key === currentVaultKey)?.name ||
          "Unknown"
      )
    : "No vault selected";

  const handleCreateVault = () => {
    if (newVaultName.trim()) {
      onCreateVault(newVaultName.trim());
      setIsCreating(false);
      setNewVaultName("");
      setIsOpen(false);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800"
        disabled={loading}
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
          />
        </svg>
        <span className="max-w-[150px] truncate">{currentVaultName}</span>
        <svg
          className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-64 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50">
          <div className="p-2">
            {/* Create New Vault Section */}
            {!isCreating ? (
              <button
                onClick={() => setIsCreating(true)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-blue-400 hover:bg-gray-700 rounded-lg transition-colors"
              >
                <svg
                  className="w-4 h-4"
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
                Create New Vault
              </button>
            ) : (
              <div className="p-2 bg-gray-700 rounded-lg mb-2">
                <input
                  type="text"
                  value={newVaultName}
                  onChange={(e) => setNewVaultName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleCreateVault();
                    } else if (e.key === "Escape") {
                      setIsCreating(false);
                      setNewVaultName("");
                    }
                  }}
                  placeholder="Vault name..."
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={handleCreateVault}
                    disabled={!newVaultName.trim()}
                    className="flex-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed rounded text-sm font-medium transition-colors"
                  >
                    Create
                  </button>
                  <button
                    onClick={() => {
                      setIsCreating(false);
                      setNewVaultName("");
                    }}
                    className="flex-1 px-3 py-1.5 bg-gray-600 hover:bg-gray-500 rounded text-sm font-medium transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Vault List */}
            {availableVaults.length > 0 && (
              <>
                <div className="border-t border-gray-700 my-2"></div>
                <div className="max-h-64 overflow-y-auto">
                  {availableVaults.map((vault) => {
                    const displayName = getVaultName(vault.key, vault.name);
                    const isSelected = vault.key === currentVaultKey;
                    return (
                      <button
                        key={vault.key}
                        onClick={() => {
                          if (!isSelected) {
                            onSwitchVault(vault.key);
                          }
                          setIsOpen(false);
                        }}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm rounded-lg transition-colors ${
                          isSelected
                            ? "bg-blue-600 text-white"
                            : "text-gray-300 hover:bg-gray-700"
                        }`}
                      >
                        <svg
                          className="w-4 h-4"
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
                        <span className="flex-1 truncate">{displayName}</span>
                        {isSelected && (
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {availableVaults.length === 0 && !isCreating && (
              <div className="py-4 text-center text-sm text-gray-400">
                No vaults found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

