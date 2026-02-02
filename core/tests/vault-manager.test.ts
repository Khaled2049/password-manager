import { describe, it, expect, beforeEach } from "vitest";
import { VaultManager } from "../src/vault-manager";
import { generateSalt, extractSalt } from "../src/crypto";

describe("VaultManager", () => {
  let vaultManager: VaultManager;
  const validPassword = "test-password-123";
  const shortPassword = "short";

  beforeEach(() => {
    vaultManager = new VaultManager();
  });

  describe("create", () => {
    it("should create a new encrypted vault", async () => {
      const initialData = new TextEncoder().encode('{"entries":[]}');
      const encrypted = await vaultManager.create(validPassword, initialData);

      expect(encrypted).toBeInstanceOf(Uint8Array);
      expect(encrypted.length).toBeGreaterThan(0);
      expect(vaultManager.isUnlocked()).toBe(true);
    });

    it("should create vault with empty data if not provided", async () => {
      const encrypted = await vaultManager.create(validPassword);

      expect(encrypted).toBeInstanceOf(Uint8Array);
      expect(encrypted.length).toBeGreaterThan(0);
      expect(vaultManager.isUnlocked()).toBe(true);
    });

    it("should throw error if password is empty", async () => {
      await expect(vaultManager.create("")).rejects.toThrow(
        "Password cannot be empty"
      );
    });

    it("should throw error if password is too short", async () => {
      await expect(vaultManager.create(shortPassword)).rejects.toThrow(
        "Password must be at least 8 characters long"
      );
    });

    it("should create different vaults with same password", async () => {
      const data = new TextEncoder().encode('{"test": "data"}');
      const encrypted1 = await vaultManager.create(validPassword, data);

      vaultManager.lock();
      const vaultManager2 = new VaultManager();
      const encrypted2 = await vaultManager2.create(validPassword, data);

      // Should be different due to different salts
      expect(encrypted1).not.toEqual(encrypted2);
    });

    it("should unlock vault after creation", async () => {
      await vaultManager.create(validPassword);
      expect(vaultManager.isUnlocked()).toBe(true);
    });
  });

  describe("unlock", () => {
    it("should unlock an encrypted vault with correct password", async () => {
      const originalData = new TextEncoder().encode('{"entries":[]}');
      const encrypted = await vaultManager.create(validPassword, originalData);

      vaultManager.lock();
      const decrypted = await vaultManager.unlock(encrypted, validPassword);

      expect(decrypted).toEqual(originalData);
      expect(vaultManager.isUnlocked()).toBe(true);
    });

    it("should throw error if password is incorrect", async () => {
      const originalData = new TextEncoder().encode('{"entries":[]}');
      const encrypted = await vaultManager.create(validPassword, originalData);

      vaultManager.lock();
      await expect(
        vaultManager.unlock(encrypted, "wrong-password")
      ).rejects.toThrow("Failed to unlock vault");
    });

    it("should throw error if password is empty", async () => {
      const encrypted = await vaultManager.create(validPassword);
      vaultManager.lock();

      await expect(vaultManager.unlock(encrypted, "")).rejects.toThrow(
        "Password cannot be empty"
      );
    });

    it("should throw error if password is too short", async () => {
      const encrypted = await vaultManager.create(validPassword);
      vaultManager.lock();

      await expect(vaultManager.unlock(encrypted, shortPassword)).rejects.toThrow(
        "Password must be at least 8 characters long"
      );
    });

    it("should throw error if vault data is empty", async () => {
      await expect(
        vaultManager.unlock(new Uint8Array(0), validPassword)
      ).rejects.toThrow("Vault data cannot be empty");
    });

    it("should throw error if vault data is too short", async () => {
      const shortData = new Uint8Array(10);
      await expect(
        vaultManager.unlock(shortData, validPassword)
      ).rejects.toThrow("Invalid vault format");
    });

    it("should lock vault on unlock failure", async () => {
      const encrypted = await vaultManager.create(validPassword);
      vaultManager.lock();

      try {
        await vaultManager.unlock(encrypted, "wrong-password");
      } catch {
        // Expected to fail
      }

      expect(vaultManager.isUnlocked()).toBe(false);
    });

    it("should preserve data integrity after unlock", async () => {
      const originalData = new TextEncoder().encode(
        '{"entries":[{"id":"1","title":"Test"}]}'
      );
      const encrypted = await vaultManager.create(validPassword, originalData);

      vaultManager.lock();
      const decrypted = await vaultManager.unlock(encrypted, validPassword);
      const decryptedText = new TextDecoder().decode(decrypted);
      const originalText = new TextDecoder().decode(originalData);

      expect(decryptedText).toBe(originalText);
    });
  });

  describe("save", () => {
    it("should save data when vault is unlocked", async () => {
      const initialData = new TextEncoder().encode('{"entries":[]}');
      await vaultManager.create(validPassword, initialData);

      const newData = new TextEncoder().encode('{"entries":[{"id":"1"}]}');
      const encrypted = await vaultManager.save(newData, validPassword);

      expect(encrypted).toBeInstanceOf(Uint8Array);
      expect(encrypted.length).toBeGreaterThan(0);
      expect(vaultManager.isUnlocked()).toBe(true);
    });

    it("should save data when vault is locked (creates new vault)", async () => {
      const newData = new TextEncoder().encode('{"entries":[{"id":"1"}]}');
      const encrypted = await vaultManager.save(newData, validPassword);

      expect(encrypted).toBeInstanceOf(Uint8Array);
      expect(encrypted.length).toBeGreaterThan(0);
      expect(vaultManager.isUnlocked()).toBe(true);
    });

    it("should use existing salt when vault is unlocked", async () => {
      const initialData = new TextEncoder().encode('{"entries":[]}');
      const encrypted1 = await vaultManager.create(validPassword, initialData);
      const salt1 = vaultManager.getSalt();

      const newData = new TextEncoder().encode('{"entries":[{"id":"1"}]}');
      const encrypted2 = await vaultManager.save(newData, validPassword);
      const salt2 = vaultManager.getSalt();

      // Salt should be the same when vault is unlocked
      expect(salt1).toEqual(salt2);
    });

    it("should generate new salt when vault is locked", async () => {
      const initialData = new TextEncoder().encode('{"entries":[]}');
      await vaultManager.create(validPassword, initialData);
      vaultManager.lock();

      const newData = new TextEncoder().encode('{"entries":[{"id":"1"}]}');
      const encrypted = await vaultManager.save(newData, validPassword);

      expect(encrypted).toBeInstanceOf(Uint8Array);
      expect(vaultManager.isUnlocked()).toBe(true);
    });

    it("should throw error if password is empty", async () => {
      await expect(
        vaultManager.save(new TextEncoder().encode("data"), "")
      ).rejects.toThrow("Password cannot be empty");
    });

    it("should throw error if password is too short", async () => {
      await expect(
        vaultManager.save(new TextEncoder().encode("data"), shortPassword)
      ).rejects.toThrow("Password must be at least 8 characters long");
    });

    it("should throw error if plaintext is empty", async () => {
      await expect(
        vaultManager.save(new Uint8Array(0), validPassword)
      ).rejects.toThrow("Cannot save empty data");
    });
  });

  describe("changePassword", () => {
    it("should change password and re-encrypt vault", async () => {
      const originalData = new TextEncoder().encode('{"entries":[]}');
      const encrypted = await vaultManager.create(validPassword, originalData);

      const newPassword = "new-password-456";
      const reencrypted = await vaultManager.changePassword(
        encrypted,
        validPassword,
        newPassword
      );

      expect(reencrypted).toBeInstanceOf(Uint8Array);
      expect(reencrypted).not.toEqual(encrypted);

      // Should be able to unlock with new password
      vaultManager.lock();
      const decrypted = await vaultManager.unlock(reencrypted, newPassword);
      expect(decrypted).toEqual(originalData);
    });

    it("should throw error if current password is wrong", async () => {
      const encrypted = await vaultManager.create(validPassword);
      vaultManager.lock();

      await expect(
        vaultManager.changePassword(
          encrypted,
          "wrong-password",
          "new-password-456"
        )
      ).rejects.toThrow("Failed to unlock vault");
    });

    it("should throw error if passwords are the same", async () => {
      const encrypted = await vaultManager.create(validPassword);

      await expect(
        vaultManager.changePassword(encrypted, validPassword, validPassword)
      ).rejects.toThrow("New password must be different from current password");
    });

    it("should throw error if current password is empty", async () => {
      const encrypted = await vaultManager.create(validPassword);

      await expect(
        vaultManager.changePassword(encrypted, "", "new-password-456")
      ).rejects.toThrow("Password cannot be empty");
    });

    it("should throw error if new password is empty", async () => {
      const encrypted = await vaultManager.create(validPassword);

      await expect(
        vaultManager.changePassword(encrypted, validPassword, "")
      ).rejects.toThrow("Password cannot be empty");
    });

    it("should generate new salt when changing password", async () => {
      const encrypted = await vaultManager.create(validPassword);
      const oldSalt = extractSalt(encrypted);

      const newPassword = "new-password-456";
      const reencrypted = await vaultManager.changePassword(
        encrypted,
        validPassword,
        newPassword
      );
      const newSalt = extractSalt(reencrypted);

      expect(newSalt).not.toEqual(oldSalt);
    });

    it("should preserve data when changing password", async () => {
      const originalData = new TextEncoder().encode(
        '{"entries":[{"id":"1","title":"Test"}]}'
      );
      const encrypted = await vaultManager.create(validPassword, originalData);

      const newPassword = "new-password-456";
      const reencrypted = await vaultManager.changePassword(
        encrypted,
        validPassword,
        newPassword
      );

      vaultManager.lock();
      const decrypted = await vaultManager.unlock(reencrypted, newPassword);
      expect(decrypted).toEqual(originalData);
    });
  });

  describe("update", () => {
    it("should update vault data when unlocked", async () => {
      const initialData = new TextEncoder().encode('{"entries":[]}');
      await vaultManager.create(validPassword, initialData);

      const newData = new TextEncoder().encode('{"entries":[{"id":"1"}]}');
      const encrypted = await vaultManager.update(newData);

      expect(encrypted).toBeInstanceOf(Uint8Array);
      expect(encrypted.length).toBeGreaterThan(0);
    });

    it("should throw error if vault is locked", async () => {
      const newData = new TextEncoder().encode('{"entries":[{"id":"1"}]}');

      await expect(vaultManager.update(newData)).rejects.toThrow(
        "Vault must be unlocked before updating"
      );
    });

    it("should throw error if plaintext is empty", async () => {
      await vaultManager.create(validPassword);

      await expect(vaultManager.update(new Uint8Array(0))).rejects.toThrow(
        "Cannot save empty data"
      );
    });

    it("should use same salt when updating", async () => {
      const initialData = new TextEncoder().encode('{"entries":[]}');
      await vaultManager.create(validPassword, initialData);
      const salt1 = vaultManager.getSalt();

      const newData = new TextEncoder().encode('{"entries":[{"id":"1"}]}');
      await vaultManager.update(newData);
      const salt2 = vaultManager.getSalt();

      expect(salt1).toEqual(salt2);
    });

    it("should preserve unlock state after update", async () => {
      await vaultManager.create(validPassword);
      const newData = new TextEncoder().encode('{"entries":[{"id":"1"}]}');
      await vaultManager.update(newData);

      expect(vaultManager.isUnlocked()).toBe(true);
    });
  });

  describe("isUnlocked", () => {
    it("should return false for new vault manager", () => {
      expect(vaultManager.isUnlocked()).toBe(false);
    });

    it("should return true after create", async () => {
      await vaultManager.create(validPassword);
      expect(vaultManager.isUnlocked()).toBe(true);
    });

    it("should return true after unlock", async () => {
      const encrypted = await vaultManager.create(validPassword);
      vaultManager.lock();
      await vaultManager.unlock(encrypted, validPassword);
      expect(vaultManager.isUnlocked()).toBe(true);
    });

    it("should return false after lock", async () => {
      await vaultManager.create(validPassword);
      vaultManager.lock();
      expect(vaultManager.isUnlocked()).toBe(false);
    });
  });

  describe("lock", () => {
    it("should lock vault and clear keys", async () => {
      await vaultManager.create(validPassword);
      expect(vaultManager.isUnlocked()).toBe(true);

      vaultManager.lock();
      expect(vaultManager.isUnlocked()).toBe(false);
      expect(vaultManager.getSalt()).toBeNull();
    });

    it("should be safe to call lock multiple times", async () => {
      await vaultManager.create(validPassword);
      vaultManager.lock();
      vaultManager.lock();
      vaultManager.lock();

      expect(vaultManager.isUnlocked()).toBe(false);
    });

    it("should clear salt when locking", async () => {
      await vaultManager.create(validPassword);
      expect(vaultManager.getSalt()).not.toBeNull();

      vaultManager.lock();
      expect(vaultManager.getSalt()).toBeNull();
    });
  });

  describe("getSalt", () => {
    it("should return null when vault is locked", () => {
      expect(vaultManager.getSalt()).toBeNull();
    });

    it("should return salt when vault is unlocked", async () => {
      await vaultManager.create(validPassword);
      const salt = vaultManager.getSalt();

      expect(salt).toBeInstanceOf(Uint8Array);
      expect(salt?.length).toBe(16);
    });

    it("should return same salt after update", async () => {
      await vaultManager.create(validPassword);
      const salt1 = vaultManager.getSalt();

      await vaultManager.update(new TextEncoder().encode('{"test":"data"}'));
      const salt2 = vaultManager.getSalt();

      expect(salt1).toEqual(salt2);
    });

    it("should return null after lock", async () => {
      await vaultManager.create(validPassword);
      vaultManager.lock();
      expect(vaultManager.getSalt()).toBeNull();
    });
  });

  describe("integration tests", () => {
    it("should create, unlock, update, and save vault", async () => {
      // Create
      const initialData = new TextEncoder().encode('{"entries":[]}');
      const encrypted1 = await vaultManager.create(validPassword, initialData);

      // Lock and unlock
      vaultManager.lock();
      const decrypted1 = await vaultManager.unlock(encrypted1, validPassword);
      expect(decrypted1).toEqual(initialData);

      // Update
      const updatedData = new TextEncoder().encode('{"entries":[{"id":"1"}]}');
      const encrypted2 = await vaultManager.update(updatedData);

      // Lock and unlock again
      vaultManager.lock();
      const decrypted2 = await vaultManager.unlock(encrypted2, validPassword);
      expect(decrypted2).toEqual(updatedData);
    });

    it("should handle multiple create/unlock cycles", async () => {
      const data1 = new TextEncoder().encode('{"test": "1"}');
      const encrypted1 = await vaultManager.create(validPassword, data1);

      vaultManager.lock();
      const decrypted1 = await vaultManager.unlock(encrypted1, validPassword);
      expect(decrypted1).toEqual(data1);

      vaultManager.lock();
      const data2 = new TextEncoder().encode('{"test": "2"}');
      const encrypted2 = await vaultManager.create(validPassword, data2);

      vaultManager.lock();
      const decrypted2 = await vaultManager.unlock(encrypted2, validPassword);
      expect(decrypted2).toEqual(data2);
    });

    it("should maintain salt consistency across updates", async () => {
      const initialData = new TextEncoder().encode('{"entries":[]}');
      const encrypted1 = await vaultManager.create(validPassword, initialData);
      const salt1 = extractSalt(encrypted1);

      const updatedData = new TextEncoder().encode('{"entries":[{"id":"1"}]}');
      const encrypted2 = await vaultManager.update(updatedData);
      const salt2 = extractSalt(encrypted2);

      expect(salt1).toEqual(salt2);
    });
  });
});

