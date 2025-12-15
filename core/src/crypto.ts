import { argon2id } from "@noble/hashes/argon2";
import { xchacha20poly1305 } from "@noble/ciphers/chacha";
import { randomBytes } from "@noble/hashes/utils";

// Encryption format: VERSION || SALT || NONCE || TAG || CIPHERTEXT
const VERSION_BYTE_LENGTH = 1;
const SALT_LENGTH = 16; // bytes for argon2id
const NONCE_LENGTH = 24; // bytes for xchacha20poly1305
const TAG_LENGTH = 16; // bytes for xchacha20poly1305 authentication tag
const CURRENT_VERSION = 0x01;

// Argon2id parameters
// Memory cost in kilobytes (64MB = 64 * 1024 KB)

const ARGON2_MEMORY_COST = 16 * 1024; // 16MB in KB
const ARGON2_ITERATIONS = 3;
const ARGON2_KEY_LENGTH = 32; // 32 bytes = 256 bits

/**
 * Derives a cryptographic key from a password using Argon2id
 * @param password - The password to derive the key from
 * @param salt - Random salt (16 bytes)
 * @returns Derived key (32 bytes)
 */
export async function deriveKey(
  password: string,
  salt: Uint8Array
): Promise<Uint8Array> {
  if (salt.length !== SALT_LENGTH) {
    throw new Error(`Salt must be ${SALT_LENGTH} bytes`);
  }

  const passwordBytes = new TextEncoder().encode(password);

  const key = await argon2id(passwordBytes, salt, {
    t: ARGON2_ITERATIONS,
    m: ARGON2_MEMORY_COST,
    p: 1, // parallelism
    dkLen: ARGON2_KEY_LENGTH,
  });

  return key;
}

/**
 * Encrypts plaintext using XChaCha20Poly1305
 * Format: VERSION || SALT || NONCE || TAG || CIPHERTEXT
 * @param plaintext - Data to encrypt
 * @param key - Encryption key (32 bytes) - must be derived using the same salt passed here
 * @param salt - Salt to include in output (16 bytes). If not provided, generates a random one.
 * @returns Encrypted data with format header
 */
export function encrypt(
  plaintext: Uint8Array,
  key: Uint8Array,
  salt?: Uint8Array
): Uint8Array {
  if (key.length !== ARGON2_KEY_LENGTH) {
    throw new Error(`Key must be ${ARGON2_KEY_LENGTH} bytes`);
  }

  // Use provided salt or generate a random one
  const encryptionSalt = salt || randomBytes(SALT_LENGTH);
  if (encryptionSalt.length !== SALT_LENGTH) {
    throw new Error(`Salt must be ${SALT_LENGTH} bytes`);
  }

  // Generate random nonce
  const nonce = randomBytes(NONCE_LENGTH);

  // Create cipher instance
  const cipher = xchacha20poly1305(key, nonce);

  // Encrypt the plaintext
  const encrypted = cipher.encrypt(plaintext);

  // Extract tag and ciphertext from encrypted output
  // xchacha20poly1305 returns: ciphertext || tag
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
}

/**
 * Decrypts ciphertext using XChaCha20Poly1305
 * @param ciphertext - Encrypted data with format: VERSION || SALT || NONCE || TAG || CIPHERTEXT
 * @param key - Decryption key (32 bytes)
 * @returns Decrypted plaintext
 */
export function decrypt(ciphertext: Uint8Array, key: Uint8Array): Uint8Array {
  if (key.length !== ARGON2_KEY_LENGTH) {
    throw new Error(`Key must be ${ARGON2_KEY_LENGTH} bytes`);
  }

  const minLength =
    VERSION_BYTE_LENGTH + SALT_LENGTH + NONCE_LENGTH + TAG_LENGTH;
  if (ciphertext.length < minLength) {
    throw new Error(`Ciphertext too short. Minimum length: ${minLength} bytes`);
  }

  let offset = 0;

  // Read VERSION
  const version = ciphertext[offset];
  offset += VERSION_BYTE_LENGTH;

  if (version !== CURRENT_VERSION) {
    throw new Error(
      `Unsupported version: ${version}. Expected: ${CURRENT_VERSION}`
    );
  }

  // Read SALT
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
}

/**
 * Generates a random salt for key derivation
 * @returns Random salt (16 bytes)
 */
export function generateSalt(): Uint8Array {
  return randomBytes(SALT_LENGTH);
}
