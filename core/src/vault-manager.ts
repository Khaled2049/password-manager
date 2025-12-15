import { deriveKey, encrypt, decrypt } from './crypto';

/**
 * Manages encrypted vault operations including creation, unlocking, and saving
 */
export class VaultManager {
  private derivedKey: Uint8Array | null = null;
  private salt: Uint8Array | null = null;

  /**
   * Creates a new encrypted vault
   * @param password - Password to encrypt the vault with
   * @param initialData - Optional initial data to store in the vault (defaults to empty)
   * @returns Encrypted vault data
   */
  async create(password: string, initialData?: Uint8Array): Promise<Uint8Array> {
    const data = initialData || new Uint8Array(0);
    
    // Generate a random salt for this vault
    const { generateSalt } = await import('./crypto');
    this.salt = generateSalt();
    
    // Derive key from password using the salt
    this.derivedKey = await deriveKey(password, this.salt);
    
    // Encrypt the data, passing the salt so it's included in the output
    const encrypted = encrypt(data, this.derivedKey, this.salt);
    
    return encrypted;
  }

  /**
   * Unlocks (decrypts) an encrypted vault
   * @param encryptedVault - Encrypted vault data
   * @param password - Password to decrypt the vault
   * @returns Decrypted vault data
   */
  async unlock(encryptedVault: Uint8Array, password: string): Promise<Uint8Array> {
    // Extract salt from encrypted vault (it's embedded in the format)
    // Format: VERSION || SALT || NONCE || TAG || CIPHERTEXT
    const VERSION_BYTE_LENGTH = 1;
    const SALT_LENGTH = 16;
    
    if (encryptedVault.length < VERSION_BYTE_LENGTH + SALT_LENGTH) {
      throw new Error('Invalid vault format: too short');
    }
    
    // Read salt from the encrypted vault
    this.salt = encryptedVault.slice(VERSION_BYTE_LENGTH, VERSION_BYTE_LENGTH + SALT_LENGTH);
    
    // Derive key from password using the salt from the vault
    this.derivedKey = await deriveKey(password, this.salt);
    
    // Decrypt the vault
    const plaintext = decrypt(encryptedVault, this.derivedKey);
    
    return plaintext;
  }

  /**
   * Saves (encrypts) plaintext data to create a new encrypted vault
   * Always generates a new salt for security
   * @param plaintext - Plaintext data to encrypt
   * @param password - Password to encrypt with
   * @returns Encrypted vault data
   */
  async save(plaintext: Uint8Array, password: string): Promise<Uint8Array> {
    // Generate a new salt for each save operation
    const { generateSalt } = await import('./crypto');
    const salt = generateSalt();
    
    // Derive key from password using the salt
    const key = await deriveKey(password, salt);
    
    // Encrypt the data, passing the salt so it's included in the output
    const encrypted = encrypt(plaintext, key, salt);
    
    // Update stored key and salt for potential future use
    this.salt = salt;
    this.derivedKey = key;
    
    return encrypted;
  }

  /**
   * Checks if the vault is currently unlocked (has a derived key)
   * @returns True if vault is unlocked
   */
  isUnlocked(): boolean {
    return this.derivedKey !== null;
  }

  /**
   * Locks the vault by clearing the derived key
   */
  lock(): void {
    this.derivedKey = null;
    this.salt = null;
  }
}

