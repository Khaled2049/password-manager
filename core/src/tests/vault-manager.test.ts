import { describe, it, expect, beforeEach } from "vitest";
import { VaultManager } from "./vault-manager";

describe("VaultManager", () => {
  let vaultManager: VaultManager;

  beforeEach(() => {
    vaultManager = new VaultManager();
  });

  describe("create", () => {
    it("should create a new encrypted vault", async () => {
      const password = "test-password";
      const encryptedVault = await vaultManager.create(password);

      expect(encryptedVault).toBeInstanceOf(Uint8Array);
      expect(encryptedVault.length).toBeGreaterThan(0);
    });

    it("should create vault with initial data", async () => {
      const password = "test-password";
      const initialData = new TextEncoder().encode("initial data");
      const encryptedVault = await vaultManager.create(password, initialData);

      expect(encryptedVault).toBeInstanceOf(Uint8Array);
      expect(encryptedVault.length).toBeGreaterThan(initialData.length);
    });

    it("should create empty vault if no initial data provided", async () => {
      const password = "test-password";
      const encryptedVault = await vaultManager.create(password);

      // Should be able to unlock it
      const decrypted = await vaultManager.unlock(encryptedVault, password);
      expect(decrypted.length).toBe(0);
    });

    it("should store derived key and salt after creation", async () => {
      const password = "test-password";
      await vaultManager.create(password);

      expect(vaultManager.isUnlocked()).toBe(true);
    });

    it("should generate different vaults for same password", async () => {
      const password = "test-password";
      const vault1 = await vaultManager.create(password);

      const vaultManager2 = new VaultManager();
      const vault2 = await vaultManager2.create(password);

      // Should be different due to random salt
      expect(vault1).not.toEqual(vault2);
    });
  });

  describe("unlock", () => {
    it("should unlock and decrypt vault with correct password", async () => {
      const password = "test-password";
      const plaintext = new TextEncoder().encode("secret data");

      const encryptedVault = await vaultManager.create(password, plaintext);
      const decrypted = await vaultManager.unlock(encryptedVault, password);

      expect(decrypted).toEqual(plaintext);
      expect(vaultManager.isUnlocked()).toBe(true);
    });

    it("should unlock empty vault", async () => {
      const password = "test-password";
      const encryptedVault = await vaultManager.create(password);
      const decrypted = await vaultManager.unlock(encryptedVault, password);

      expect(decrypted.length).toBe(0);
    });

    it("should throw error if password is incorrect", async () => {
      const password = "correct-password";
      const plaintext = new TextEncoder().encode("secret data");

      const encryptedVault = await vaultManager.create(password, plaintext);

      await expect(
        vaultManager.unlock(encryptedVault, "wrong-password")
      ).rejects.toThrow();
    });

    it("should throw error if vault format is invalid (too short)", async () => {
      const invalidVault = new Uint8Array(10); // Too short

      await expect(
        vaultManager.unlock(invalidVault, "password")
      ).rejects.toThrow("Invalid vault format");
    });

    it("should extract salt from encrypted vault", async () => {
      const password = "test-password";
      const encryptedVault = await vaultManager.create(password);

      // Unlock should extract salt from vault
      await vaultManager.unlock(encryptedVault, password);
      expect(vaultManager.isUnlocked()).toBe(true);
    });
  });

  describe("save", () => {
    it("should save plaintext data as encrypted vault", async () => {
      const password = "test-password";
      const plaintext = new TextEncoder().encode("data to save");

      const encryptedVault = await vaultManager.save(plaintext, password);

      expect(encryptedVault).toBeInstanceOf(Uint8Array);
      expect(encryptedVault.length).toBeGreaterThan(plaintext.length);
    });

    it("should generate new salt for each save", async () => {
      const password = "test-password";
      const plaintext = new TextEncoder().encode("data");

      const vault1 = await vaultManager.save(plaintext, password);
      const vault2 = await vaultManager.save(plaintext, password);

      // Should be different due to new salt
      expect(vault1).not.toEqual(vault2);
    });

    it("should be able to unlock saved vault", async () => {
      const password = "test-password";
      const plaintext = new TextEncoder().encode("data to save");

      const encryptedVault = await vaultManager.save(plaintext, password);

      const vaultManager2 = new VaultManager();
      const decrypted = await vaultManager2.unlock(encryptedVault, password);

      expect(decrypted).toEqual(plaintext);
    });

    it("should update stored key and salt after save", async () => {
      const password = "test-password";
      const plaintext = new TextEncoder().encode("data");

      await vaultManager.save(plaintext, password);

      expect(vaultManager.isUnlocked()).toBe(true);
    });
  });

  describe("isUnlocked", () => {
    it("should return false for new vault manager", () => {
      expect(vaultManager.isUnlocked()).toBe(false);
    });

    it("should return true after create", async () => {
      await vaultManager.create("password");
      expect(vaultManager.isUnlocked()).toBe(true);
    });

    it("should return true after unlock", async () => {
      const password = "password";
      const encryptedVault = await vaultManager.create(password);

      vaultManager.lock();
      expect(vaultManager.isUnlocked()).toBe(false);

      await vaultManager.unlock(encryptedVault, password);
      expect(vaultManager.isUnlocked()).toBe(true);
    });

    it("should return true after save", async () => {
      await vaultManager.save(new Uint8Array([1, 2, 3]), "password");
      expect(vaultManager.isUnlocked()).toBe(true);
    });

    it("should return false after lock", async () => {
      await vaultManager.create("password");
      expect(vaultManager.isUnlocked()).toBe(true);

      vaultManager.lock();
      expect(vaultManager.isUnlocked()).toBe(false);
    });
  });

  describe("lock", () => {
    it("should clear derived key and salt", async () => {
      await vaultManager.create("password");
      expect(vaultManager.isUnlocked()).toBe(true);

      vaultManager.lock();
      expect(vaultManager.isUnlocked()).toBe(false);
    });

    it("should be safe to call lock multiple times", () => {
      vaultManager.lock();
      vaultManager.lock();
      expect(vaultManager.isUnlocked()).toBe(false);
    });
  });

  describe("integration scenarios", () => {
    it("should handle create -> unlock -> save -> unlock flow", async () => {
      const password = "test-password";

      // Create initial vault
      const initialData = new TextEncoder().encode("initial");
      const vault1 = await vaultManager.create(password, initialData);

      // Unlock it
      const decrypted1 = await vaultManager.unlock(vault1, password);
      expect(decrypted1).toEqual(initialData);

      // Save new data
      const newData = new TextEncoder().encode("updated");
      const vault2 = await vaultManager.save(newData, password);

      // Unlock new vault
      const vaultManager2 = new VaultManager();
      const decrypted2 = await vaultManager2.unlock(vault2, password);
      expect(decrypted2).toEqual(newData);
    });

    it("should handle multiple vaults with different passwords", async () => {
      const password1 = "password1";
      const password2 = "password2";
      const data1 = new TextEncoder().encode("data1");
      const data2 = new TextEncoder().encode("data2");

      const vault1 = await vaultManager.create(password1, data1);

      const vaultManager2 = new VaultManager();
      const vault2 = await vaultManager2.create(password2, data2);

      // Each vault should only unlock with its own password
      const decrypted1 = await vaultManager.unlock(vault1, password1);
      expect(decrypted1).toEqual(data1);

      const decrypted2 = await vaultManager2.unlock(vault2, password2);
      expect(decrypted2).toEqual(data2);

      // Wrong password should fail
      await expect(vaultManager.unlock(vault2, password1)).rejects.toThrow();
    });
  });
});
