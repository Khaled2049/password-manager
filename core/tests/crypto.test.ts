import { describe, it, expect } from "vitest";
import {
  deriveKey,
  encrypt,
  decrypt,
  generateSalt,
  extractSalt,
  getArgon2Config,
} from "../src/crypto";

describe("crypto", () => {
  describe("generateSalt", () => {
    it("should generate a salt of correct length", () => {
      const salt = generateSalt();
      expect(salt.length).toBe(16);
    });

    it("should generate different salts on each call", () => {
      const salt1 = generateSalt();
      const salt2 = generateSalt();
      expect(salt1).not.toEqual(salt2);
    });

    it("should generate a Uint8Array", () => {
      const salt = generateSalt();
      expect(salt).toBeInstanceOf(Uint8Array);
    });
  });

  describe("deriveKey", () => {
    it("should derive a key from a password and salt", async () => {
      const password = "test-password-123";
      const salt = generateSalt();
      const key = await deriveKey(password, salt);
      expect(key).toBeInstanceOf(Uint8Array);
      expect(key.length).toBe(32);
    });

    it("should derive the same key with the same password and salt", async () => {
      const password = "test-password-123";
      const salt = generateSalt();
      const key1 = await deriveKey(password, salt);
      const key2 = await deriveKey(password, salt);
      expect(key1).toEqual(key2);
    });

    it("should derive different keys with different passwords", async () => {
      const salt = generateSalt();
      const key1 = await deriveKey("password1", salt);
      const key2 = await deriveKey("password2", salt);
      expect(key1).not.toEqual(key2);
    });

    it("should derive different keys with different salts", async () => {
      const password = "test-password-123";
      const salt1 = generateSalt();
      const salt2 = generateSalt();
      const key1 = await deriveKey(password, salt1);
      const key2 = await deriveKey(password, salt2);
      expect(key1).not.toEqual(key2);
    });

    it("should throw error if salt length is incorrect", async () => {
      const password = "test-password-123";
      const invalidSalt = new Uint8Array(15); // Should be 16 bytes
      await expect(deriveKey(password, invalidSalt)).rejects.toThrow(
        "Salt must be exactly 16 bytes"
      );
    });

    it("should throw error if password is empty", async () => {
      const salt = generateSalt();
      await expect(deriveKey("", salt)).rejects.toThrow(
        "Password cannot be empty"
      );
    });

    it("should handle long passwords", async () => {
      const longPassword = "a".repeat(1000);
      const salt = generateSalt();
      const key = await deriveKey(longPassword, salt);
      expect(key.length).toBe(32);
    });

    it("should handle special characters in password", async () => {
      const specialPassword = "!@#$%^&*()_+-=[]{}|;:,.<>?";
      const salt = generateSalt();
      const key = await deriveKey(specialPassword, salt);
      expect(key.length).toBe(32);
    });
  });

  describe("encrypt", () => {
    it("should encrypt plaintext with a key", async () => {
      const password = "test-password-123";
      const salt = generateSalt();
      const key = await deriveKey(password, salt);
      const plaintext = new TextEncoder().encode("Hello, World!");

      const encrypted = encrypt(plaintext, key, salt);
      expect(encrypted).toBeInstanceOf(Uint8Array);
      expect(encrypted.length).toBeGreaterThan(plaintext.length);
    });

    it("should generate different ciphertexts for same plaintext (nonce changes)", async () => {
      const password = "test-password-123";
      const salt = generateSalt();
      const key = await deriveKey(password, salt);
      const plaintext = new TextEncoder().encode("Hello, World!");

      const encrypted1 = encrypt(plaintext, key, salt);
      const encrypted2 = encrypt(plaintext, key, salt);

      // Should be different due to random nonce
      expect(encrypted1).not.toEqual(encrypted2);
    });

    it("should include version, salt, nonce, tag, and ciphertext in output", async () => {
      const password = "test-password-123";
      const salt = generateSalt();
      const key = await deriveKey(password, salt);
      const plaintext = new TextEncoder().encode("Test data");

      const encrypted = encrypt(plaintext, key, salt);

      // Minimum size: VERSION (1) + SALT (16) + NONCE (24) + TAG (16) + ciphertext
      expect(encrypted.length).toBeGreaterThanOrEqual(57);
    });

    it("should throw error if key length is incorrect", () => {
      const invalidKey = new Uint8Array(31); // Should be 32 bytes
      const plaintext = new TextEncoder().encode("Test");
      const salt = generateSalt();

      expect(() => encrypt(plaintext, invalidKey, salt)).toThrow(
        "Key must be exactly 32 bytes"
      );
    });

    it("should throw error if plaintext is empty", async () => {
      const password = "test-password-123";
      const salt = generateSalt();
      const key = await deriveKey(password, salt);
      const emptyPlaintext = new Uint8Array(0);

      expect(() => encrypt(emptyPlaintext, key, salt)).toThrow(
        "Plaintext cannot be empty"
      );
    });

    it("should generate salt if not provided", async () => {
      const password = "test-password-123";
      const salt = generateSalt();
      const key = await deriveKey(password, salt);
      const plaintext = new TextEncoder().encode("Test data");

      const encrypted = encrypt(plaintext, key);
      expect(encrypted.length).toBeGreaterThan(0);
    });

    it("should handle large plaintext", async () => {
      const password = "test-password-123";
      const salt = generateSalt();
      const key = await deriveKey(password, salt);
      const largePlaintext = new Uint8Array(10000).fill(65); // 10KB of 'A'

      const encrypted = encrypt(largePlaintext, key, salt);
      expect(encrypted.length).toBeGreaterThan(largePlaintext.length);
    });
  });

  describe("decrypt", () => {
    it("should decrypt encrypted data correctly", async () => {
      const password = "test-password-123";
      const salt = generateSalt();
      const key = await deriveKey(password, salt);
      const plaintext = new TextEncoder().encode("Hello, World!");

      const encrypted = encrypt(plaintext, key, salt);
      const decrypted = decrypt(encrypted, key);

      expect(decrypted).toEqual(plaintext);
    });

    it("should decrypt to original plaintext", async () => {
      const password = "test-password-123";
      const salt = generateSalt();
      const key = await deriveKey(password, salt);
      const originalText = "This is a test message with special chars: !@#$%";
      const plaintext = new TextEncoder().encode(originalText);

      const encrypted = encrypt(plaintext, key, salt);
      const decrypted = decrypt(encrypted, key);
      const decryptedText = new TextDecoder().decode(decrypted);

      expect(decryptedText).toBe(originalText);
    });

    it("should throw error if key is incorrect", async () => {
      const password1 = "password1";
      const password2 = "password2";
      const salt = generateSalt();
      const key1 = await deriveKey(password1, salt);
      const key2 = await deriveKey(password2, salt);
      const plaintext = new TextEncoder().encode("Test");

      const encrypted = encrypt(plaintext, key1, salt);

      expect(() => decrypt(encrypted, key2)).toThrow(
        "Decryption failed: invalid key or corrupted data"
      );
    });

    it("should throw error if ciphertext is too short", async () => {
      const password = "test-password-123";
      const salt = generateSalt();
      const key = await deriveKey(password, salt);
      const shortCiphertext = new Uint8Array(10);

      expect(() => decrypt(shortCiphertext, key)).toThrow(
        "Invalid ciphertext: too short"
      );
    });

    it("should throw error if version is unsupported", async () => {
      const password = "test-password-123";
      const salt = generateSalt();
      const key = await deriveKey(password, salt);
      const plaintext = new TextEncoder().encode("Test");

      const encrypted = encrypt(plaintext, key, salt);
      // Modify version byte
      encrypted[0] = 0xff;

      expect(() => decrypt(encrypted, key)).toThrow("Unsupported version");
    });

    it("should throw error if key length is incorrect", async () => {
      const password = "test-password-123";
      const salt = generateSalt();
      const key = await deriveKey(password, salt);
      const plaintext = new TextEncoder().encode("Test");
      const encrypted = encrypt(plaintext, key, salt);
      const invalidKey = new Uint8Array(31);

      expect(() => decrypt(encrypted, invalidKey)).toThrow(
        "Key must be exactly 32 bytes"
      );
    });

    it("should detect tampered ciphertext", async () => {
      const password = "test-password-123";
      const salt = generateSalt();
      const key = await deriveKey(password, salt);
      const plaintext = new TextEncoder().encode("Test");

      const encrypted = encrypt(plaintext, key, salt);
      // Tamper with the ciphertext
      encrypted[encrypted.length - 1] ^= 1;

      expect(() => decrypt(encrypted, key)).toThrow(
        "Decryption failed: invalid key or corrupted data"
      );
    });

    it("should detect tampered tag", async () => {
      const password = "test-password-123";
      const salt = generateSalt();
      const key = await deriveKey(password, salt);
      const plaintext = new TextEncoder().encode("Test");

      const encrypted = encrypt(plaintext, key, salt);
      // Tamper with the tag (starts after VERSION + SALT + NONCE = 1 + 16 + 24 = 41)
      encrypted[41] ^= 1;

      expect(() => decrypt(encrypted, key)).toThrow(
        "Decryption failed: invalid key or corrupted data"
      );
    });
  });

  describe("extractSalt", () => {
    it("should extract salt from encrypted data", async () => {
      const password = "test-password-123";
      const salt = generateSalt();
      const key = await deriveKey(password, salt);
      const plaintext = new TextEncoder().encode("Test");

      const encrypted = encrypt(plaintext, key, salt);
      const extractedSalt = extractSalt(encrypted);

      expect(extractedSalt).toEqual(salt);
    });

    it("should throw error if ciphertext is too short", () => {
      const shortData = new Uint8Array(10);
      expect(() => extractSalt(shortData)).toThrow(
        "Invalid ciphertext: too short to extract salt"
      );
    });

    it("should throw error if version is unsupported", async () => {
      const password = "test-password-123";
      const salt = generateSalt();
      const key = await deriveKey(password, salt);
      const plaintext = new TextEncoder().encode("Test");

      const encrypted = encrypt(plaintext, key, salt);
      encrypted[0] = 0xff; // Invalid version

      expect(() => extractSalt(encrypted)).toThrow("Unsupported version");
    });
  });

  describe("getArgon2Config", () => {
    it("should return Argon2 configuration", () => {
      const config = getArgon2Config();

      expect(config).toHaveProperty("algorithm");
      expect(config).toHaveProperty("memoryCostKB");
      expect(config).toHaveProperty("memoryCostMB");
      expect(config).toHaveProperty("iterations");
      expect(config).toHaveProperty("parallelism");
      expect(config).toHaveProperty("keyLength");

      expect(config.algorithm).toBe("Argon2id");
      expect(config.memoryCostKB).toBe(64 * 1024);
      expect(config.memoryCostMB).toBe(64);
      expect(config.iterations).toBe(3);
      expect(config.parallelism).toBe(1);
      expect(config.keyLength).toBe(32);
    });
  });

  describe("integration tests", () => {
    it("should encrypt and decrypt round-trip correctly", async () => {
      const password = "test-password-123";
      const salt = generateSalt();
      const key = await deriveKey(password, salt);
      const originalText = "Round trip test";
      const plaintext = new TextEncoder().encode(originalText);

      const encrypted = encrypt(plaintext, key, salt);
      const decrypted = decrypt(encrypted, key);
      const decryptedText = new TextDecoder().decode(decrypted);

      expect(decryptedText).toBe(originalText);
    });

    it("should work with binary data", async () => {
      const password = "test-password-123";
      const salt = generateSalt();
      const key = await deriveKey(password, salt);
      const binaryData = new Uint8Array([0x00, 0xff, 0x42, 0x13, 0x37]);

      const encrypted = encrypt(binaryData, key, salt);
      const decrypted = decrypt(encrypted, key);

      expect(decrypted).toEqual(binaryData);
    });

    it("should work with Unicode text", async () => {
      const password = "test-password-123";
      const salt = generateSalt();
      const key = await deriveKey(password, salt);
      const unicodeText = "Hello 世界 🌍 Привет";
      const plaintext = new TextEncoder().encode(unicodeText);

      const encrypted = encrypt(plaintext, key, salt);
      const decrypted = decrypt(encrypted, key);
      const decryptedText = new TextDecoder().decode(decrypted);

      expect(decryptedText).toBe(unicodeText);
    });
  });
});

