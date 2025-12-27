import { useState } from "react";
import type { VaultEntry } from "../hooks/useVault";
import { showSuccess } from "../utils/notifications";

interface PasswordEntryProps {
  entry: VaultEntry;
}

export default function PasswordEntry({ entry }: PasswordEntryProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopyPassword = async () => {
    try {
      await navigator.clipboard.writeText(entry.password);
      setCopied(true);
      showSuccess("Password copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy password:", err);
    }
  };

  const handleCopyUsername = async () => {
    try {
      await navigator.clipboard.writeText(entry.username);
      showSuccess("Username copied to clipboard");
    } catch (err) {
      console.error("Failed to copy username:", err);
    }
  };

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 hover:border-blue-500/50 transition-colors p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h3
            className="font-semibold text-lg text-white mb-1 truncate"
            title={entry.title}
          >
            {entry.title}
          </h3>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">Username:</span>
              <button
                onClick={handleCopyUsername}
                className="text-sm text-gray-300 hover:text-blue-400 transition-colors truncate flex-1 text-left"
                title={entry.username}
              >
                {entry.username}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">Password:</span>
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-sm text-gray-300 font-mono truncate">
                  {showPassword ? entry.password : "••••••••"}
                </span>
                <button
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-gray-400 hover:text-gray-300 focus:outline-none transition-colors flex-shrink-0"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
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
                        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.29 3.29m0 0L3 3m3.29 3.29L3 3"
                      />
                    </svg>
                  ) : (
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

            {entry.url && (
              <a
                href={entry.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-400 hover:text-blue-300 transition-colors truncate block"
                title={entry.url}
              >
                {entry.url}
              </a>
            )}
          </div>
        </div>

        <button
          onClick={handleCopyPassword}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800 flex-shrink-0 ${
            copied
              ? "bg-green-600 hover:bg-green-500 text-white"
              : "bg-gray-700 hover:bg-gray-600 text-gray-300"
          }`}
          aria-label="Copy password"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </div>
  );
}
