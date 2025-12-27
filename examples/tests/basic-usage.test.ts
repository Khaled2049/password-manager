import { describe, it, expect, beforeEach, vi } from "vitest";
import { VaultManager, S3Client } from "@password-manager/core";

// Mock the dependencies
vi.mock("dotenv", () => ({
  config: vi.fn(),
}));

vi.mock("fs", () => ({
  existsSync: vi.fn(() => false),
}));

vi.mock("child_process", () => ({
  execSync: vi.fn(),
}));

// Mock console methods to avoid noise in tests
const consoleSpy = {
  log: vi.spyOn(console, "log").mockImplementation(() => {}),
  error: vi.spyOn(console, "error").mockImplementation(() => {}),
  warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
};

describe("basic-usage example", () => {
  let vaultManager: VaultManager;
  let s3Client: S3Client;
  const testPassword = "test-password-123";

  beforeEach(() => {
    vaultManager = new VaultManager();
    s3Client = new S3Client({
      maxRetries: 1,
      retryDelay: 100,
      timeout: 5000,
    });
    vi.clearAllMocks();
  });

  describe("VaultManager integration", () => {
    it("should create a new vault with initial data", async () => {
      const initialData = new TextEncoder().encode('{"entries":[]}');
      const encrypted = await vaultManager.create(testPassword, initialData);

      expect(encrypted).toBeInstanceOf(Uint8Array);
      expect(encrypted.length).toBeGreaterThan(0);
      expect(vaultManager.isUnlocked()).toBe(true);
    });

    it("should unlock a vault with correct password", async () => {
      const originalData = new TextEncoder().encode('{"entries":[]}');
      const encrypted = await vaultManager.create(testPassword, originalData);

      vaultManager.lock();
      const decrypted = await vaultManager.unlock(encrypted, testPassword);

      expect(decrypted).toEqual(originalData);
      expect(vaultManager.isUnlocked()).toBe(true);
    });

    it("should fail to unlock with incorrect password", async () => {
      const originalData = new TextEncoder().encode('{"entries":[]}');
      const encrypted = await vaultManager.create(testPassword, originalData);

      vaultManager.lock();
      await expect(
        vaultManager.unlock(encrypted, "wrong-password")
      ).rejects.toThrow("Failed to unlock vault");
    });

    it("should update vault data when unlocked", async () => {
      const initialData = new TextEncoder().encode('{"entries":[]}');
      await vaultManager.create(testPassword, initialData);

      const updatedData = new TextEncoder().encode('{"entries":[{"id":"1"}]}');
      const encrypted = await vaultManager.update(updatedData);

      expect(encrypted).toBeInstanceOf(Uint8Array);
      expect(vaultManager.isUnlocked()).toBe(true);
    });

    it("should lock vault and clear keys", async () => {
      const initialData = new TextEncoder().encode('{"entries":[]}');
      await vaultManager.create(testPassword, initialData);
      expect(vaultManager.isUnlocked()).toBe(true);

      vaultManager.lock();
      expect(vaultManager.isUnlocked()).toBe(false);
      expect(vaultManager.getSalt()).toBeNull();
    });
  });

  describe("VaultData structure", () => {
    it("should create valid vault data structure", () => {
      const vaultData = {
        entries: [],
        created: new Date().toISOString(),
        lastModified: new Date().toISOString(),
      };

      expect(vaultData).toHaveProperty("entries");
      expect(vaultData).toHaveProperty("created");
      expect(vaultData).toHaveProperty("lastModified");
      expect(Array.isArray(vaultData.entries)).toBe(true);
    });

    it("should create vault entry with all fields", () => {
      const entry = {
        id: crypto.randomUUID(),
        title: "Example Website",
        username: "user@example.com",
        password: "SecurePassword123!",
        url: "https://example.com",
        notes: "This is a sample entry",
      };

      expect(entry).toHaveProperty("id");
      expect(entry).toHaveProperty("title");
      expect(entry).toHaveProperty("username");
      expect(entry).toHaveProperty("password");
      expect(entry).toHaveProperty("url");
      expect(entry).toHaveProperty("notes");
      expect(typeof entry.id).toBe("string");
      expect(entry.id.length).toBeGreaterThan(0);
    });

    it("should serialize and deserialize vault data", async () => {
      const vaultData = {
        entries: [
          {
            id: crypto.randomUUID(),
            title: "Test Site",
            username: "test@example.com",
            password: "password123",
            url: "https://test.com",
            notes: "Test notes",
          },
        ],
        created: new Date().toISOString(),
        lastModified: new Date().toISOString(),
      };

      const plaintext = new TextEncoder().encode(JSON.stringify(vaultData));
      const encrypted = await vaultManager.create(testPassword, plaintext);

      vaultManager.lock();
      const decrypted = await vaultManager.unlock(encrypted, testPassword);
      const decryptedData = JSON.parse(new TextDecoder().decode(decrypted));

      expect(decryptedData.entries.length).toBe(1);
      expect(decryptedData.entries[0].title).toBe("Test Site");
      expect(decryptedData.entries[0].username).toBe("test@example.com");
    });
  });

  describe("S3Client integration scenarios", () => {
    it("should handle download with ETag verification", async () => {
      // Mock fetch for download
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
          etag: '"test-etag-123"',
          "content-length": "100",
        }),
        arrayBuffer: async () => new ArrayBuffer(100),
      } as Response);

      const result = await s3Client.download("https://example.com/vault", {
        expectedEtag: "test-etag-123",
      });

      expect(result.etag).toBe("test-etag-123");
      expect(result.data).toBeInstanceOf(Uint8Array);
      expect(result.contentLength).toBe(100);
    });

    it("should detect ETag mismatch on download", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
          etag: '"different-etag"',
          "content-length": "100",
        }),
        arrayBuffer: async () => new ArrayBuffer(100),
      } as Response);

      await expect(
        s3Client.download("https://example.com/vault", {
          expectedEtag: "expected-etag",
        })
      ).rejects.toThrow("ETag mismatch");
    });

    it("should handle 404 not found error", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
        headers: new Headers(),
      } as Response);

      await expect(
        s3Client.download("https://example.com/vault")
      ).rejects.toThrow();
    });

    it("should upload with optimistic locking", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
          etag: '"new-etag-456"',
        }),
      } as Response);

      const data = new Uint8Array([1, 2, 3, 4, 5]);
      const etag = await s3Client.upload("https://example.com/vault", data, {
        ifMatch: "old-etag-123",
      });

      expect(etag).toBe("new-etag-456");
      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: "PUT",
          headers: expect.objectContaining({
            "If-Match": "old-etag-123",
          }),
        })
      );
    });

    it("should handle precondition failed (412) error", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 412,
        statusText: "Precondition Failed",
        headers: new Headers(),
      } as Response);

      const data = new Uint8Array([1, 2, 3]);
      
      // Verify the error has the correct code
      try {
        await s3Client.upload("https://example.com/vault", data, {
          ifMatch: "old-etag",
        });
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.code).toBe("PRECONDITION_FAILED");
        expect(error.message).toContain("File was modified");
      }
    });
  });

  describe("Error handling scenarios", () => {
    it("should handle vault unlock failure gracefully", async () => {
      const initialData = new TextEncoder().encode('{"entries":[]}');
      const encrypted = await vaultManager.create(testPassword, initialData);
      vaultManager.lock();

      try {
        await vaultManager.unlock(encrypted, "wrong-password");
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.message).toContain("Failed to unlock vault");
        expect(vaultManager.isUnlocked()).toBe(false);
      }
    });

    it("should handle empty vault data error", async () => {
      await expect(
        vaultManager.unlock(new Uint8Array(0), testPassword)
      ).rejects.toThrow("Vault data cannot be empty");
    });

    it("should handle update when vault is locked", async () => {
      const data = new TextEncoder().encode('{"entries":[]}');
      await expect(vaultManager.update(data)).rejects.toThrow(
        "Vault must be unlocked before updating"
      );
    });

    it("should handle network errors", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Failed to fetch"));

      await expect(
        s3Client.download("https://example.com/vault")
      ).rejects.toThrow("Network error");
    });
  });

  describe("Vault operations workflow", () => {
    it("should complete full workflow: create, unlock, update, lock", async () => {
      // Create vault
      const initialData = new TextEncoder().encode('{"entries":[]}');
      const encrypted1 = await vaultManager.create(testPassword, initialData);
      expect(vaultManager.isUnlocked()).toBe(true);

      // Lock
      vaultManager.lock();
      expect(vaultManager.isUnlocked()).toBe(false);

      // Unlock
      const decrypted1 = await vaultManager.unlock(encrypted1, testPassword);
      expect(decrypted1).toEqual(initialData);
      expect(vaultManager.isUnlocked()).toBe(true);

      // Update
      const updatedData = new TextEncoder().encode('{"entries":[{"id":"1"}]}');
      const encrypted2 = await vaultManager.update(updatedData);
      expect(vaultManager.isUnlocked()).toBe(true);

      // Lock again
      vaultManager.lock();
      expect(vaultManager.isUnlocked()).toBe(false);

      // Verify updated data
      const decrypted2 = await vaultManager.unlock(encrypted2, testPassword);
      expect(decrypted2).toEqual(updatedData);
    });

    it("should handle vault with multiple entries", async () => {
      const vaultData = {
        entries: [
          {
            id: crypto.randomUUID(),
            title: "Site 1",
            username: "user1@example.com",
            password: "pass1",
          },
          {
            id: crypto.randomUUID(),
            title: "Site 2",
            username: "user2@example.com",
            password: "pass2",
            url: "https://site2.com",
          },
        ],
        created: new Date().toISOString(),
        lastModified: new Date().toISOString(),
      };

      const plaintext = new TextEncoder().encode(JSON.stringify(vaultData));
      const encrypted = await vaultManager.create(testPassword, plaintext);

      vaultManager.lock();
      const decrypted = await vaultManager.unlock(encrypted, testPassword);
      const decryptedData = JSON.parse(new TextDecoder().decode(decrypted));

      expect(decryptedData.entries.length).toBe(2);
      expect(decryptedData.entries[0].title).toBe("Site 1");
      expect(decryptedData.entries[1].title).toBe("Site 2");
    });
  });

  describe("Password change workflow", () => {
    it("should change password and maintain data integrity", async () => {
      const originalData = new TextEncoder().encode('{"entries":[{"id":"1"}]}');
      const encrypted = await vaultManager.create(testPassword, originalData);

      const newPassword = "new-password-456";
      const reencrypted = await vaultManager.changePassword(
        encrypted,
        testPassword,
        newPassword
      );

      // Should be able to unlock with new password
      vaultManager.lock();
      const decrypted = await vaultManager.unlock(reencrypted, newPassword);
      expect(decrypted).toEqual(originalData);

      // Should not be able to unlock with old password
      vaultManager.lock();
      await expect(
        vaultManager.unlock(reencrypted, testPassword)
      ).rejects.toThrow("Failed to unlock vault");
    });
  });
});
