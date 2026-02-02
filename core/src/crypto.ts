import { argon2id } from "@noble/hashes/argon2";
import { xchacha20poly1305 } from "@noble/ciphers/chacha";
import { randomBytes } from "@noble/hashes/utils";

const VERSION_BYTE_LENGTH = 1;
const SALT_LENGTH = 16;
const NONCE_LENGTH = 24;
const TAG_LENGTH = 16;
const CURRENT_VERSION = 0x01;

const ARGON2_MEMORY_COST = 64 * 1024;
const ARGON2_ITERATIONS = 3;
const ARGON2_PARALLELISM = 1;
const ARGON2_KEY_LENGTH = 32;

/**
 * Derives a cryptographic key from a password using Argon2id
 *
 * This function is intentionally slow (takes ~100-300ms) to resist brute-force attacks.
 *
 * @param password
 * @param salt
 * @returns
 * @throws
 */
export async function deriveKey(
  password: string,
  salt: Uint8Array,
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
      }`,
    );
  }
}

/**
 * Encrypts plaintext using XChaCha20Poly1305 (authenticated encryption)
 * @param plaintext
 * @param key
 * @param salt
 * @returns
 * @throws
 */
export function encrypt(
  plaintext: Uint8Array,
  key: Uint8Array,
  salt?: Uint8Array,
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

  const nonce = randomBytes(NONCE_LENGTH);

  try {
    const cipher = xchacha20poly1305(key, nonce);

    const encrypted = cipher.encrypt(plaintext);

    const tag = encrypted.slice(-TAG_LENGTH);
    const ciphertext = encrypted.slice(0, -TAG_LENGTH);

    const output = new Uint8Array(
      VERSION_BYTE_LENGTH +
        SALT_LENGTH +
        NONCE_LENGTH +
        TAG_LENGTH +
        ciphertext.length,
    );
    let offset = 0;

    output[offset] = CURRENT_VERSION;
    offset += VERSION_BYTE_LENGTH;

    output.set(encryptionSalt, offset);
    offset += SALT_LENGTH;

    output.set(nonce, offset);
    offset += NONCE_LENGTH;

    output.set(tag, offset);
    offset += TAG_LENGTH;

    output.set(ciphertext, offset);

    return output;
  } catch (error) {
    throw new Error(
      `Encryption failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }
}

/**
 * Decrypts ciphertext using XChaCha20Poly1305
 *
 * Verifies authenticity and integrity before returning plaintext.
 *
 * @param ciphertext
 * @param key
 * @returns
 * @throws
 */
export function decrypt(ciphertext: Uint8Array, key: Uint8Array): Uint8Array {
  if (key.length !== ARGON2_KEY_LENGTH) {
    throw new Error(`Key must be exactly ${ARGON2_KEY_LENGTH} bytes`);
  }

  const minLength =
    VERSION_BYTE_LENGTH + SALT_LENGTH + NONCE_LENGTH + TAG_LENGTH;
  if (ciphertext.length < minLength) {
    throw new Error(
      `Invalid ciphertext: too short. Minimum length: ${minLength} bytes, got: ${ciphertext.length} bytes`,
    );
  }

  let offset = 0;

  try {
    const version = ciphertext[offset];
    offset += VERSION_BYTE_LENGTH;

    if (version !== CURRENT_VERSION) {
      throw new Error(
        `Unsupported version: 0x${version
          .toString(16)
          .padStart(2, "0")}. Expected: 0x${CURRENT_VERSION.toString(
          16,
        ).padStart(2, "0")}`,
      );
    }

    offset += SALT_LENGTH;

    const nonce = ciphertext.slice(offset, offset + NONCE_LENGTH);
    offset += NONCE_LENGTH;

    const tag = ciphertext.slice(offset, offset + TAG_LENGTH);
    offset += TAG_LENGTH;

    const encryptedData = ciphertext.slice(offset);

    const encrypted = new Uint8Array(encryptedData.length + TAG_LENGTH);
    encrypted.set(encryptedData, 0);
    encrypted.set(tag, encryptedData.length);

    const cipher = xchacha20poly1305(key, nonce);
    const plaintext = cipher.decrypt(encrypted);

    return plaintext;
  } catch (error) {
    throw new Error("Decryption failed: invalid key or corrupted data");
  }
}

/**
 * Extracts the salt from an encrypted blob without decrypting
 * @param ciphertext
 * @returns
 * @throws
 */
export function extractSalt(ciphertext: Uint8Array): Uint8Array {
  const minLength = VERSION_BYTE_LENGTH + SALT_LENGTH;
  if (ciphertext.length < minLength) {
    throw new Error("Invalid ciphertext: too short to extract salt");
  }

  const version = ciphertext[0];
  if (version !== CURRENT_VERSION) {
    throw new Error(
      `Unsupported version: 0x${version.toString(16).padStart(2, "0")}`,
    );
  }

  return ciphertext.slice(
    VERSION_BYTE_LENGTH,
    VERSION_BYTE_LENGTH + SALT_LENGTH,
  );
}

/**
 * Generates a random salt for key derivation
 * @returns Random salt (16 bytes)
 */
export function generateSalt(): Uint8Array {
  return randomBytes(SALT_LENGTH);
}

/**
 * Gets the current Argon2id configuration
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
