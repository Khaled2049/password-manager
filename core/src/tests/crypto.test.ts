import { describe, it, expect } from "vitest";
import { deriveKey, encrypt, decrypt, generateSalt } from "./crypto";

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
      const password = "test-password";
      const salt = generateSalt();
      const key = await deriveKey(password, salt);

      expect(key).toBeInstanceOf(Uint8Array);
      expect(key.length).toBe(32);
    });

    it("should derive the same key with the same password and salt", async () => {
      const password = "test-password";
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
      const password = "test-password";
      const salt1 = generateSalt();
      const salt2 = generateSalt();

      const key1 = await deriveKey(password, salt1);
      const key2 = await deriveKey(password, salt2);

      expect(key1).not.toEqual(key2);
    });

    it("should throw error if salt length is incorrect", async () => {
      const password = "test-password";
      const invalidSalt = new Uint8Array(15); // Should be 16 bytes

      await expect(deriveKey(password, invalidSalt)).rejects.toThrow(
        "Salt must be 16 bytes"
      );
    });
  });

  describe("encrypt", () => {
    it("should encrypt plaintext data", async () => {
      const plaintext = new TextEncoder().encode("Hello, World!");
      const password = "test-password";
      const salt = generateSalt();
      const key = await deriveKey(password, salt);

      const encrypted = encrypt(plaintext, key, salt);

      expect(encrypted).toBeInstanceOf(Uint8Array);
      expect(encrypted.length).toBeGreaterThan(plaintext.length);
      expect(encrypted).not.toEqual(plaintext);
    });

    it("should include version, salt, nonce, tag, and ciphertext in output", async () => {
      const plaintext = new TextEncoder().encode("test data");
      const password = "test-password";
      const salt = generateSalt();
      const key = await deriveKey(password, salt);

      const encrypted = encrypt(plaintext, key, salt);

      // Format: VERSION (1) || SALT (16) || NONCE (24) || TAG (16) || CIPHERTEXT
      const minLength = 1 + 16 + 24 + 16 + plaintext.length;
      expect(encrypted.length).toBeGreaterThanOrEqual(minLength);

      // Check version byte
      expect(encrypted[0]).toBe(0x01);

      // Check salt is included
      const extractedSalt = encrypted.slice(1, 17);
      expect(extractedSalt).toEqual(salt);
    });

    it("should generate random salt if not provided", async () => {
      const plaintext = new TextEncoder().encode("test data");
      const password = "test-password";
      const key = await deriveKey(password, generateSalt());

      const encrypted1 = encrypt(plaintext, key);
      const encrypted2 = encrypt(plaintext, key);

      // Should have different salts (and thus different outputs)
      const salt1 = encrypted1.slice(1, 17);
      const salt2 = encrypted2.slice(1, 17);
      expect(salt1).not.toEqual(salt2);
    });

    it("should produce different ciphertexts for same plaintext (nonce changes)", async () => {
      const plaintext = new TextEncoder().encode("test data");
      const password = "test-password";
      const salt = generateSalt();
      const key = await deriveKey(password, salt);

      const encrypted1 = encrypt(plaintext, key, salt);
      const encrypted2 = encrypt(plaintext, key, salt);

      // Should be different due to random nonce
      expect(encrypted1).not.toEqual(encrypted2);
    });

    it("should throw error if key length is incorrect", () => {
      const plaintext = new TextEncoder().encode("test data");
      const invalidKey = new Uint8Array(31); // Should be 32 bytes

      expect(() => encrypt(plaintext, invalidKey)).toThrow(
        "Key must be 32 bytes"
      );
    });

    it("should throw error if salt length is incorrect when provided", async () => {
      const plaintext = new TextEncoder().encode("test data");
      const password = "test-password";
      const key = await deriveKey(password, generateSalt());
      const invalidSalt = new Uint8Array(15); // Should be 16 bytes

      expect(() => encrypt(plaintext, key, invalidSalt)).toThrow(
        "Salt must be 16 bytes"
      );
    });
  });

  describe("decrypt", () => {
    it("should decrypt encrypted data correctly", async () => {
      const plaintext = new TextEncoder().encode("Hello, World!");
      const password = "test-password";
      const salt = generateSalt();
      const key = await deriveKey(password, salt);

      const encrypted = encrypt(plaintext, key, salt);
      const decrypted = decrypt(encrypted, key);

      expect(decrypted).toEqual(plaintext);
      expect(new TextDecoder().decode(decrypted)).toBe("Hello, World!");
    });

    it("should decrypt empty data", async () => {
      const plaintext = new Uint8Array(0);
      const password = "test-password";
      const salt = generateSalt();
      const key = await deriveKey(password, salt);

      const encrypted = encrypt(plaintext, key, salt);
      const decrypted = decrypt(encrypted, key);

      expect(decrypted).toEqual(plaintext);
      expect(decrypted.length).toBe(0);
    });

    it("should decrypt large data", async () => {
      const plaintext = new Uint8Array(10000).fill(42);
      const password = "test-password";
      const salt = generateSalt();
      const key = await deriveKey(password, salt);

      const encrypted = encrypt(plaintext, key, salt);
      const decrypted = decrypt(encrypted, key);

      expect(decrypted).toEqual(plaintext);
    });

    it("should throw error if key length is incorrect", async () => {
      const plaintext = new TextEncoder().encode("test data");
      const password = "test-password";
      const salt = generateSalt();
      const key = await deriveKey(password, salt);
      const encrypted = encrypt(plaintext, key, salt);

      const invalidKey = new Uint8Array(31); // Should be 32 bytes

      expect(() => decrypt(encrypted, invalidKey)).toThrow(
        "Key must be 32 bytes"
      );
    });

    it("should throw error if ciphertext is too short", async () => {
      const password = "test-password";
      const salt = generateSalt();
      const key = await deriveKey(password, salt);
      const shortCiphertext = new Uint8Array(10); // Too short

      expect(() => decrypt(shortCiphertext, key)).toThrow(
        "Ciphertext too short"
      );
    });

    it("should throw error if version is unsupported", async () => {
      const plaintext = new TextEncoder().encode("test data");
      const password = "test-password";
      const salt = generateSalt();
      const key = await deriveKey(password, salt);
      const encrypted = encrypt(plaintext, key, salt);

      // Modify version byte
      encrypted[0] = 0x99; // Invalid version

      expect(() => decrypt(encrypted, key)).toThrow("Unsupported version");
    });

    it("should throw error if wrong password is used", async () => {
      const plaintext = new TextEncoder().encode("test data");
      const password1 = "password1";
      const password2 = "password2";
      const salt = generateSalt();
      const key1 = await deriveKey(password1, salt);

      const encrypted = encrypt(plaintext, key1, salt);

      // Try to decrypt with wrong password
      const key2 = await deriveKey(password2, salt);

      // Decryption should fail (either throw or produce garbage)
      // XChaCha20Poly1305 will throw if authentication fails
      expect(() => decrypt(encrypted, key2)).toThrow();
    });
  });

  describe("encrypt and decrypt roundtrip", () => {
    it("should encrypt and decrypt various data types", async () => {
      const testCases = [
        new TextEncoder().encode("Simple text"),
        new TextEncoder().encode("Text with special chars: !@#$%^&*()"),
        new TextEncoder().encode("Unicode: 🚀 你好 مرحبا"),
        new Uint8Array([0, 1, 2, 3, 255, 254, 253]),
        new Uint8Array(100).fill(0),
        new Uint8Array(100).fill(255),
      ];

      for (const plaintext of testCases) {
        const password = "test-password";
        const salt = generateSalt();
        const key = await deriveKey(password, salt);

        const encrypted = encrypt(plaintext, key, salt);
        const decrypted = decrypt(encrypted, key);

        expect(decrypted).toEqual(plaintext);
      }
    });
  });
});
