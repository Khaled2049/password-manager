import { argon2id } from "@noble/hashes/argon2";
import { xchacha20poly1305 } from "@noble/ciphers/chacha";
import { randomBytes } from "@noble/hashes/utils";

// Encryption format: VERSION || SALT || NONCE || TAG || CIPHERTEXT
const VERSION_BYTE_LENGTH = 1;
const SALT_LENGTH = 16; // bytes for argon2id
const NONCE_LENGTH = 24; // bytes for xchacha20poly1305
const TAG_LENGTH = 16; // bytes for xchacha20poly1305 authentication tag
const CURRENT_VERSION = 0x01;

// Argon2id parameters (OWASP recommendations)
// For password managers, use higher memory cost for better security
const ARGON2_MEMORY_COST = 64 * 1024; // 64MB in KB (OWASP recommended minimum)
const ARGON2_ITERATIONS = 3; // OWASP recommended minimum
const ARGON2_PARALLELISM = 1; // Single-threaded (browser compatible)
const ARGON2_KEY_LENGTH = 32; // 32 bytes = 256 bits

/**
 * Derives a cryptographic key from a password using Argon2id
 *
 * This function is intentionally slow (takes ~100-300ms) to resist brute-force attacks.
 *
 * @param password - The password to derive the key from
 * @param salt - Random salt (16 bytes). Use the same salt to derive the same key.
 * @returns Derived key (32 bytes)
 * @throws Error if salt length is invalid
 */
export async function deriveKey(
  password: string,
  salt: Uint8Array
): Promise<Uint8Array> {
  if (salt.length !== SALT_LENGTH) {
    throw new Error(`Salt must be exactly ${SALT_LENGTH} bytes`);
  }

  if (!password || password.length === 0) {
    throw new Error("Password cannot be empty");
  }

  const passwordBytes = new TextEncoder().encode(password);

  try {
    const key = await argon2id(passwordBytes, salt, {
      t: ARGON2_ITERATIONS,
      m: ARGON2_MEMORY_COST,
      p: ARGON2_PARALLELISM,
      dkLen: ARGON2_KEY_LENGTH,
    });

    return key;
  } catch (error) {
    throw new Error(
      `Key derivation failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Encrypts plaintext using XChaCha20Poly1305 (authenticated encryption)
 *
 * Format: VERSION || SALT || NONCE || TAG || CIPHERTEXT
 *
 * @param plaintext - Data to encrypt
 * @param key - Encryption key (32 bytes) derived from password using deriveKey()
 * @param salt - Salt to include in output (16 bytes). Must match the salt used in deriveKey(). If not provided, generates a random one.
 * @returns Encrypted data with all necessary metadata for decryption
 * @throws Error if key or salt length is invalid
 */
export function encrypt(
  plaintext: Uint8Array,
  key: Uint8Array,
  salt?: Uint8Array
): Uint8Array {
  if (key.length !== ARGON2_KEY_LENGTH) {
    throw new Error(`Key must be exactly ${ARGON2_KEY_LENGTH} bytes`);
  }

  if (plaintext.length === 0) {
    throw new Error("Plaintext cannot be empty");
  }

  // Use provided salt or generate a random one
  const encryptionSalt = salt || randomBytes(SALT_LENGTH);
  if (encryptionSalt.length !== SALT_LENGTH) {
    throw new Error(`Salt must be exactly ${SALT_LENGTH} bytes`);
  }

  // Generate random nonce (MUST be unique for each encryption with the same key)
  const nonce = randomBytes(NONCE_LENGTH);

  try {
    // Create cipher instance
    const cipher = xchacha20poly1305(key, nonce);

    // Encrypt the plaintext (returns ciphertext || tag)
    const encrypted = cipher.encrypt(plaintext);

    // Extract tag and ciphertext from encrypted output
    const tag = encrypted.slice(-TAG_LENGTH);
    const ciphertext = encrypted.slice(0, -TAG_LENGTH);

    // Build the output: VERSION || SALT || NONCE || TAG || CIPHERTEXT
    const output = new Uint8Array(
      VERSION_BYTE_LENGTH +
        SALT_LENGTH +
        NONCE_LENGTH +
        TAG_LENGTH +
        ciphertext.length
    );
    let offset = 0;

    // Write VERSION
    output[offset] = CURRENT_VERSION;
    offset += VERSION_BYTE_LENGTH;

    // Write SALT
    output.set(encryptionSalt, offset);
    offset += SALT_LENGTH;

    // Write NONCE
    output.set(nonce, offset);
    offset += NONCE_LENGTH;

    // Write TAG
    output.set(tag, offset);
    offset += TAG_LENGTH;

    // Write CIPHERTEXT
    output.set(ciphertext, offset);

    return output;
  } catch (error) {
    throw new Error(
      `Encryption failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Decrypts ciphertext using XChaCha20Poly1305
 *
 * Verifies authenticity and integrity before returning plaintext.
 *
 * @param ciphertext - Encrypted data with format: VERSION || SALT || NONCE || TAG || CIPHERTEXT
 * @param key - Decryption key (32 bytes) derived using deriveKey() with the embedded salt
 * @returns Decrypted plaintext
 * @throws Error if authentication fails, version is unsupported, or format is invalid
 */
export function decrypt(ciphertext: Uint8Array, key: Uint8Array): Uint8Array {
  if (key.length !== ARGON2_KEY_LENGTH) {
    throw new Error(`Key must be exactly ${ARGON2_KEY_LENGTH} bytes`);
  }

  const minLength =
    VERSION_BYTE_LENGTH + SALT_LENGTH + NONCE_LENGTH + TAG_LENGTH;
  if (ciphertext.length < minLength) {
    throw new Error(
      `Invalid ciphertext: too short. Minimum length: ${minLength} bytes, got: ${ciphertext.length} bytes`
    );
  }

  let offset = 0;

  try {
    // Read VERSION
    const version = ciphertext[offset];
    offset += VERSION_BYTE_LENGTH;

    if (version !== CURRENT_VERSION) {
      throw new Error(
        `Unsupported version: 0x${version
          .toString(16)
          .padStart(2, "0")}. Expected: 0x${CURRENT_VERSION.toString(
          16
        ).padStart(2, "0")}`
      );
    }

    // Read SALT (stored but not used in decryption - key should already be derived)
    const salt = ciphertext.slice(offset, offset + SALT_LENGTH);
    offset += SALT_LENGTH;

    // Read NONCE
    const nonce = ciphertext.slice(offset, offset + NONCE_LENGTH);
    offset += NONCE_LENGTH;

    // Read TAG
    const tag = ciphertext.slice(offset, offset + TAG_LENGTH);
    offset += TAG_LENGTH;

    // Read CIPHERTEXT
    const encryptedData = ciphertext.slice(offset);

    // Reconstruct the encrypted format: ciphertext || tag
    const encrypted = new Uint8Array(encryptedData.length + TAG_LENGTH);
    encrypted.set(encryptedData, 0);
    encrypted.set(tag, encryptedData.length);

    // Create cipher instance and decrypt
    const cipher = xchacha20poly1305(key, nonce);
    const plaintext = cipher.decrypt(encrypted);

    return plaintext;
  } catch (error) {
    // Don't leak information about which step failed
    throw new Error("Decryption failed: invalid key or corrupted data");
  }
}

/**
 * Extracts the salt from an encrypted blob without decrypting
 *
 * Useful for deriving the correct key before attempting decryption.
 *
 * @param ciphertext - Encrypted data
 * @returns Salt (16 bytes)
 * @throws Error if ciphertext format is invalid
 */
export function extractSalt(ciphertext: Uint8Array): Uint8Array {
  const minLength = VERSION_BYTE_LENGTH + SALT_LENGTH;
  if (ciphertext.length < minLength) {
    throw new Error("Invalid ciphertext: too short to extract salt");
  }

  const version = ciphertext[0];
  if (version !== CURRENT_VERSION) {
    throw new Error(
      `Unsupported version: 0x${version.toString(16).padStart(2, "0")}`
    );
  }

  return ciphertext.slice(
    VERSION_BYTE_LENGTH,
    VERSION_BYTE_LENGTH + SALT_LENGTH
  );
}

/**
 * Generates a random salt for key derivation
 *
 * @returns Random salt (16 bytes)
 */
export function generateSalt(): Uint8Array {
  return randomBytes(SALT_LENGTH);
}

/**
 * Gets the current Argon2id configuration
 *
 * Useful for displaying security settings to users.
 *
 * @returns Configuration object
 */
export function getArgon2Config() {
  return {
    algorithm: "Argon2id",
    memoryCostKB: ARGON2_MEMORY_COST,
    memoryCostMB: ARGON2_MEMORY_COST / 1024,
    iterations: ARGON2_ITERATIONS,
    parallelism: ARGON2_PARALLELISM,
    keyLength: ARGON2_KEY_LENGTH,
  };
}
