import {
  deriveKey,
  encrypt,
  decrypt,
  generateSalt,
  extractSalt,
} from "./crypto";

/**
 * Manages encrypted vault operations including creation, unlocking, and saving
 */
export class VaultManager {
  private derivedKey: Uint8Array | null = null;
  private salt: Uint8Array | null = null;
  private isLocked: boolean = true;

  /**
   * Creates a new encrypted vault with a fresh salt
   * @param password
   * @param initialData
   * @returns Encrypted vault data with embedded salt
   * @throws Error if password is empty or encryption fails
   */
  async create(
    password: string,
    initialData?: Uint8Array,
  ): Promise<Uint8Array> {
    this.validatePassword(password);

    const data = initialData || new Uint8Array(0);

    this.salt = generateSalt();

    this.derivedKey = await deriveKey(password, this.salt);

    const encrypted = encrypt(data, this.derivedKey, this.salt);

    this.isLocked = false;

    return encrypted;
  }

  /**
   * Unlocks (decrypts) an encrypted vault
   * @param encryptedVault - Encrypted vault data
   * @param password - Password to decrypt the vault
   * @returns Decrypted vault data
   * @throws Error if password is wrong, vault is corrupted, or format is invalid
   */
  async unlock(
    encryptedVault: Uint8Array,
    password: string,
  ): Promise<Uint8Array> {
    this.validatePassword(password);
    this.validateVaultData(encryptedVault);

    try {
      this.salt = extractSalt(encryptedVault);

      this.derivedKey = await deriveKey(password, this.salt);

      const plaintext = decrypt(encryptedVault, this.derivedKey);

      this.isLocked = false;

      return plaintext;
    } catch (error) {
      this.lock();
      throw new Error(
        "Failed to unlock vault: incorrect password or corrupted data",
      );
    }
  }

  /**
   * Re-encrypts data using the current vault's salt (if unlocked) or generates a new salt
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

    const salt = this.isLocked ? generateSalt() : this.salt!;

    const key = await deriveKey(password, salt);

    const encrypted = encrypt(plaintext, key, salt);

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
    newPassword: string,
  ): Promise<Uint8Array> {
    this.validatePassword(currentPassword);
    this.validatePassword(newPassword);

    if (currentPassword === newPassword) {
      throw new Error("New password must be different from current password");
    }

    const plaintext = await this.unlock(encryptedVault, currentPassword);

    const newSalt = generateSalt();
    const newKey = await deriveKey(newPassword, newSalt);

    const reencrypted = encrypt(plaintext, newKey, newSalt);

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

    if (vault.length < 57) {
      throw new Error("Invalid vault format: data too short");
    }
  }
}
