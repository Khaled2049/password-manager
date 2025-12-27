import {
  deriveKey,
  encrypt,
  decrypt,
  generateSalt,
  extractSalt,
} from "./crypto";

/**
 * Manages encrypted vault operations including creation, unlocking, and saving
 *
 * Security notes:
 * - Derived keys are kept in memory only while vault is unlocked
 * - Each vault has a unique salt embedded in the encrypted data
 * - Re-encrypting with the same password uses the existing salt (maintains key consistency)
 */
export class VaultManager {
  private derivedKey: Uint8Array | null = null;
  private salt: Uint8Array | null = null;
  private isLocked: boolean = true;

  /**
   * Creates a new encrypted vault with a fresh salt
   *
   * @param password - Password to encrypt the vault with
   * @param initialData - Optional initial data to store in the vault (defaults to empty)
   * @returns Encrypted vault data with embedded salt
   * @throws Error if password is empty or encryption fails
   */
  async create(
    password: string,
    initialData?: Uint8Array
  ): Promise<Uint8Array> {
    this.validatePassword(password);

    const data = initialData || new Uint8Array(0);

    // Generate a random salt for this new vault
    this.salt = generateSalt();

    // Derive key from password using the salt
    this.derivedKey = await deriveKey(password, this.salt);

    // Encrypt the data, passing the salt so it's included in the output
    const encrypted = encrypt(data, this.derivedKey, this.salt);

    this.isLocked = false;

    return encrypted;
  }

  /**
   * Unlocks (decrypts) an encrypted vault
   *
   * @param encryptedVault - Encrypted vault data
   * @param password - Password to decrypt the vault
   * @returns Decrypted vault data
   * @throws Error if password is wrong, vault is corrupted, or format is invalid
   */
  async unlock(
    encryptedVault: Uint8Array,
    password: string
  ): Promise<Uint8Array> {
    this.validatePassword(password);
    this.validateVaultData(encryptedVault);

    try {
      // Extract salt from encrypted vault using the crypto utility
      this.salt = extractSalt(encryptedVault);

      // Derive key from password using the extracted salt
      this.derivedKey = await deriveKey(password, this.salt);

      // Decrypt the vault
      const plaintext = decrypt(encryptedVault, this.derivedKey);

      this.isLocked = false;

      return plaintext;
    } catch (error) {
      // Clear any partially derived keys on failure
      this.lock();
      throw new Error(
        "Failed to unlock vault: incorrect password or corrupted data"
      );
    }
  }

  /**
   * Re-encrypts data using the current vault's salt (if unlocked) or generates a new salt
   *
   * Use case 1: Vault is unlocked - re-encrypt with existing salt (maintains key consistency)
   * Use case 2: Vault is locked - create new vault with fresh salt
   *
   * @param plaintext - Plaintext data to encrypt
   * @param password - Password to encrypt with
   * @returns Encrypted vault data
   * @throws Error if password is empty or plaintext is invalid
   */
  async save(plaintext: Uint8Array, password: string): Promise<Uint8Array> {
    this.validatePassword(password);

    if (!plaintext || plaintext.length === 0) {
      throw new Error("Cannot save empty data");
    }

    // Use existing salt if vault is unlocked, otherwise generate new one
    const salt = this.isLocked ? generateSalt() : this.salt!;

    // Derive key from password using the salt
    const key = await deriveKey(password, salt);

    // Encrypt the data
    const encrypted = encrypt(plaintext, key, salt);

    // Update stored key and salt
    this.salt = salt;
    this.derivedKey = key;
    this.isLocked = false;

    return encrypted;
  }

  /**
   * Re-encrypts the vault with a new password while preserving data
   *
   * @param encryptedVault - Current encrypted vault
   * @param currentPassword - Current password
   * @param newPassword - New password to use
   * @returns Re-encrypted vault with new password
   * @throws Error if current password is wrong or passwords are invalid
   */
  async changePassword(
    encryptedVault: Uint8Array,
    currentPassword: string,
    newPassword: string
  ): Promise<Uint8Array> {
    this.validatePassword(currentPassword);
    this.validatePassword(newPassword);

    if (currentPassword === newPassword) {
      throw new Error("New password must be different from current password");
    }

    // Unlock with current password
    const plaintext = await this.unlock(encryptedVault, currentPassword);

    // Generate new salt for the new password
    const newSalt = generateSalt();
    const newKey = await deriveKey(newPassword, newSalt);

    // Re-encrypt with new key and salt
    const reencrypted = encrypt(plaintext, newKey, newSalt);

    // Update stored credentials
    this.salt = newSalt;
    this.derivedKey = newKey;

    return reencrypted;
  }

  /**
   * Updates vault data without changing password (uses existing salt)
   * Vault must be unlocked before calling this method
   *
   * @param plaintext - New plaintext data to encrypt
   * @returns Encrypted vault data
   * @throws Error if vault is locked or data is invalid
   */
  async update(plaintext: Uint8Array): Promise<Uint8Array> {
    if (this.isLocked || !this.derivedKey || !this.salt) {
      throw new Error("Vault must be unlocked before updating");
    }

    if (!plaintext || plaintext.length === 0) {
      throw new Error("Cannot save empty data");
    }

    // Re-encrypt using existing key and salt
    const encrypted = encrypt(plaintext, this.derivedKey, this.salt);

    return encrypted;
  }

  /**
   * Checks if the vault is currently unlocked (has a derived key)
   *
   * @returns True if vault is unlocked
   */
  isUnlocked(): boolean {
    return !this.isLocked && this.derivedKey !== null && this.salt !== null;
  }

  /**
   * Locks the vault by clearing the derived key and salt from memory
   *
   * Note: JavaScript doesn't provide true secure memory wiping,
   * but we zero out the arrays before dereferencing
   */
  lock(): void {
    // Best-effort memory clearing (JS limitation: can't guarantee secure wipe)
    if (this.derivedKey) {
      this.derivedKey.fill(0);
      this.derivedKey = null;
    }

    if (this.salt) {
      this.salt.fill(0);
      this.salt = null;
    }

    this.isLocked = true;
  }

  /**
   * Gets the current salt if vault is unlocked
   * Useful for debugging or key derivation verification
   *
   * @returns Salt or null if locked
   */
  getSalt(): Uint8Array | null {
    return this.salt;
  }

  /**
   * Validates password meets minimum requirements
   *
   * @param password - Password to validate
   * @throws Error if password is invalid
   */
  private validatePassword(password: string): void {
    if (!password || password.length === 0) {
      throw new Error("Password cannot be empty");
    }

    if (password.length < 8) {
      throw new Error("Password must be at least 8 characters long");
    }
  }

  /**
   * Validates vault data format
   *
   * @param vault - Encrypted vault data to validate
   * @throws Error if vault format is invalid
   */
  private validateVaultData(vault: Uint8Array): void {
    if (!vault || vault.length === 0) {
      throw new Error("Vault data cannot be empty");
    }

    // Minimum size: VERSION (1) + SALT (16) + NONCE (24) + TAG (16) = 57 bytes
    if (vault.length < 57) {
      throw new Error("Invalid vault format: data too short");
    }
  }
}
