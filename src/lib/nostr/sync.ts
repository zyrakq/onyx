/**
 * Sync Engine for NIP-XX Encrypted File Sync
 *
 * Handles synchronization of files between local storage and Nostr relays.
 * Supports both local signing (nsec) and remote signing (NIP-46 bunker).
 */

import { SimplePool, finalizeEvent, nip44, type Event } from 'nostr-tools';
import { v4 as uuidv4 } from 'uuid';
import { hexToBytes } from '@noble/hashes/utils.js';
import {
  KIND_FILE,
  KIND_VAULT_INDEX,
  ENCRYPTION_METHOD,
  type NostrIdentity,
  type Vault,
  type VaultIndexPayload,
  type VaultFileEntry,
  type FilePayload,
  type SyncedFile,
  type SyncConfig,
  type RelayStatus,
  type SyncConflict,
  DEFAULT_SYNC_CONFIG,
} from './types';
import {
  getConversationKey,
  encryptFilePayload,
  decryptFilePayload,
  encryptVaultPayload,
  decryptVaultPayload,
  calculateChecksum,
} from './crypto';
import type { NostrSigner } from './signer';

/**
 * Sync Engine class
 */
export class SyncEngine {
  private pool: SimplePool;
  private identity: NostrIdentity | null = null;
  private conversationKey: Uint8Array | null = null;
  private signer: NostrSigner | null = null;
  private pubkey: string | null = null;
  private config: SyncConfig;
  private relayStatuses: Map<string, RelayStatus> = new Map();
  private subscriptions: Map<string, { close: () => void }> = new Map();

  constructor(config: Partial<SyncConfig> = {}) {
    this.pool = new SimplePool();
    this.config = { ...DEFAULT_SYNC_CONFIG, ...config };
  }

  /**
   * Set the identity (keys) for this sync engine (legacy method for local signing)
   */
  setIdentity(identity: NostrIdentity | null): void {
    this.identity = identity;
    if (identity) {
      this.conversationKey = getConversationKey(identity.privkey, identity.pubkey);
      this.pubkey = identity.pubkey;
    } else {
      this.conversationKey = null;
      this.pubkey = null;
    }
    // Clear signer when using identity directly
    this.signer = null;
  }

  /**
   * Set a signer for signing events (supports local and NIP-46 remote signing)
   */
  async setSigner(signer: NostrSigner | null, conversationKey?: Uint8Array): Promise<void> {
    this.signer = signer;
    if (signer) {
      this.pubkey = await signer.getPublicKey();
      // For NIP-46, we need to get the conversation key differently
      // The caller should provide it if available (for local signers)
      this.conversationKey = conversationKey || null;
    } else {
      this.pubkey = null;
      this.conversationKey = null;
    }
    // Clear legacy identity when using signer
    this.identity = null;
  }

  /**
   * Check if identity/signer is set
   */
  hasIdentity(): boolean {
    return this.identity !== null || this.signer !== null;
  }

  /**
   * Get the current identity (legacy)
   */
  getIdentity(): NostrIdentity | null {
    return this.identity;
  }

  /**
   * Get the current signer
   */
  getSigner(): NostrSigner | null {
    return this.signer;
  }

  /**
   * Get the current pubkey (works for both identity and signer)
   */
  getPubkey(): string | null {
    return this.pubkey;
  }

  /**
   * Update sync configuration
   */
  setConfig(config: Partial<SyncConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): SyncConfig {
    return { ...this.config };
  }

  /**
   * Get relay statuses
   */
  getRelayStatuses(): RelayStatus[] {
    return Array.from(this.relayStatuses.values());
  }

  /**
   * Ensure identity/signer is configured
   */
  private ensureIdentity(): void {
    if (!this.pubkey) {
      throw new Error('Identity not set. Call setIdentity() or setSigner() first.');
    }
  }

  /**
   * Sign an event using the configured signer or legacy identity
   */
  private async signEvent(unsignedEvent: {
    kind: number;
    created_at: number;
    tags: string[][];
    content: string;
  }): Promise<Event> {
    if (this.signer) {
      // Use the signer (supports both local and NIP-46)
      return await this.signer.signEvent(unsignedEvent) as Event;
    } else if (this.identity) {
      // Legacy: use finalizeEvent with private key
      return finalizeEvent(unsignedEvent, hexToBytes(this.identity.privkey));
    } else {
      throw new Error('No signer or identity configured');
    }
  }

  /**
   * Encrypt content using NIP-44
   * For NIP-46, uses remote encryption; for local, uses conversation key
   */
  private async encryptContent(plaintext: string): Promise<string> {
    if (this.signer?.nip44 && this.pubkey) {
      // Use signer's NIP-44 (works for both local and remote)
      return await this.signer.nip44.encrypt(this.pubkey, plaintext);
    } else if (this.conversationKey) {
      // Legacy: use conversation key directly
      return nip44.v2.encrypt(plaintext, this.conversationKey);
    } else {
      throw new Error('No encryption method available');
    }
  }

  /**
   * Decrypt content using NIP-44
   * For NIP-46, uses remote decryption; for local, uses conversation key
   */
  private async decryptContent(ciphertext: string): Promise<string> {
    if (this.signer?.nip44 && this.pubkey) {
      // Use signer's NIP-44 (works for both local and remote)
      return await this.signer.nip44.decrypt(this.pubkey, ciphertext);
    } else if (this.conversationKey) {
      // Legacy: use conversation key directly
      return nip44.v2.decrypt(ciphertext, this.conversationKey);
    } else {
      throw new Error('No decryption method available');
    }
  }

  /**
   * Fetch all vault indices for the current user
   */
  async fetchVaults(): Promise<Vault[]> {
    this.ensureIdentity();

    const events = await this.pool.querySync(
      this.config.relays,
      {
        kinds: [KIND_VAULT_INDEX],
        authors: [this.pubkey!],
      }
    );

    const vaults: Vault[] = [];

    for (const event of events) {
      try {
        const decrypted = await this.decryptContent(event.content);
        const data = JSON.parse(decrypted) as VaultIndexPayload;
        const dTag = event.tags.find(t => t[0] === 'd')?.[1];

        if (dTag) {
          vaults.push({
            eventId: event.id,
            d: dTag,
            data,
            lastSync: event.created_at,
          });
        }
      } catch (err) {
        console.error('Failed to decrypt vault:', err);
      }
    }

    return vaults;
  }

  /**
   * Create a new vault
   */
  async createVault(name: string, description?: string): Promise<Vault> {
    this.ensureIdentity();

    const d = uuidv4();
    const now = Math.floor(Date.now() / 1000);

    const payload: VaultIndexPayload = {
      name,
      description,
      created: now,
      files: [],
      deleted: [],
      settings: {
        defaultFolder: '/',
        attachmentFolder: '/attachments',
      },
    };

    const encryptedContent = await this.encryptContent(JSON.stringify(payload));

    const event = await this.signEvent({
      kind: KIND_VAULT_INDEX,
      created_at: now,
      tags: [
        ['d', d],
        ['encrypted', ENCRYPTION_METHOD],
      ],
      content: encryptedContent,
    });

    await this.publishEvent(event);

    return {
      eventId: event.id,
      d,
      data: payload,
      lastSync: now,
    };
  }

  /**
   * Update a vault index
   */
  async updateVaultIndex(vault: Vault): Promise<Vault> {
    this.ensureIdentity();

    const now = Math.floor(Date.now() / 1000);
    const encryptedContent = await this.encryptContent(JSON.stringify(vault.data));

    const event = await this.signEvent({
      kind: KIND_VAULT_INDEX,
      created_at: now,
      tags: [
        ['d', vault.d],
        ['encrypted', ENCRYPTION_METHOD],
      ],
      content: encryptedContent,
    });

    await this.publishEvent(event);

    return {
      ...vault,
      eventId: event.id,
      lastSync: now,
    };
  }

  /**
   * Fetch all files for a vault
   */
  async fetchVaultFiles(vault: Vault): Promise<SyncedFile[]> {
    this.ensureIdentity();

    const eventIds = vault.data.files.map(f => f.eventId);
    if (eventIds.length === 0) return [];

    const events = await this.pool.querySync(
      this.config.relays,
      {
        ids: eventIds,
      }
    );

    const files: SyncedFile[] = [];

    for (const event of events) {
      try {
        const decrypted = await this.decryptContent(event.content);
        const data = JSON.parse(decrypted) as FilePayload;
        const dTag = event.tags.find(t => t[0] === 'd')?.[1];

        if (dTag) {
          files.push({
            eventId: event.id,
            d: dTag,
            data,
            createdAt: event.created_at,
          });
        }
      } catch (err) {
        console.error('Failed to decrypt file:', err);
      }
    }

    return files;
  }

  /**
   * Publish a file to relays
   */
  async publishFile(
    vault: Vault,
    path: string,
    content: string,
    existingFile?: SyncedFile
  ): Promise<{ file: SyncedFile; vault: Vault }> {
    this.ensureIdentity();

    const now = Math.floor(Date.now() / 1000);
    const checksum = calculateChecksum(content);
    const d = existingFile?.d ?? uuidv4();
    const version = existingFile ? existingFile.data.version + 1 : 1;

    const payload: FilePayload = {
      path,
      content,
      checksum,
      version,
      modified: now,
      previousEventId: existingFile?.eventId ?? null,
      contentType: 'text/markdown',
    };

    const encryptedContent = await this.encryptContent(JSON.stringify(payload));

    const event = await this.signEvent({
      kind: KIND_FILE,
      created_at: now,
      tags: [
        ['d', d],
        ['encrypted', ENCRYPTION_METHOD],
      ],
      content: encryptedContent,
    });

    await this.publishEvent(event);

    const syncedFile: SyncedFile = {
      eventId: event.id,
      d,
      data: payload,
      createdAt: now,
    };

    // Update vault index
    const fileEntry: VaultFileEntry = {
      eventId: event.id,
      d,
      path,
      checksum,
      version,
      modified: now,
    };

    // Remove existing entry if updating
    const updatedFiles = vault.data.files.filter(f => f.d !== d);
    updatedFiles.push(fileEntry);

    const updatedVault: Vault = {
      ...vault,
      data: {
        ...vault.data,
        files: updatedFiles,
      },
    };

    const savedVault = await this.updateVaultIndex(updatedVault);

    return { file: syncedFile, vault: savedVault };
  }

  /**
   * Delete a file (add tombstone)
   */
  async deleteFile(vault: Vault, path: string): Promise<Vault> {
    this.ensureIdentity();

    const now = Math.floor(Date.now() / 1000);
    const existingFile = vault.data.files.find(f => f.path === path);

    if (!existingFile) {
      throw new Error(`File not found in vault: ${path}`);
    }

    // Remove from files array
    const updatedFiles = vault.data.files.filter(f => f.path !== path);

    // Add to deleted array
    const deletedEntry = {
      path,
      deletedAt: now,
      lastEventId: existingFile.eventId,
    };

    const updatedDeleted = [...(vault.data.deleted || []), deletedEntry];

    const updatedVault: Vault = {
      ...vault,
      data: {
        ...vault.data,
        files: updatedFiles,
        deleted: updatedDeleted,
      },
    };

    return this.updateVaultIndex(updatedVault);
  }

  /**
   * Publish event to all configured relays
   */
  private async publishEvent(event: Event): Promise<void> {
    const results = await Promise.allSettled(
      this.config.relays.map(relay => this.pool.publish([relay], event))
    );

    const successes = results.filter(r => r.status === 'fulfilled').length;
    if (successes === 0) {
      throw new Error('Failed to publish to any relay');
    }

    console.log(`Published event ${event.id} to ${successes}/${this.config.relays.length} relays`);
  }

  /**
   * Subscribe to updates for a vault
   */
  subscribeToVault(
    vault: Vault,
    onUpdate: (event: Event) => void
  ): () => void {
    this.ensureIdentity();

    const subId = `vault-${vault.d}`;

    // Close existing subscription if any
    this.subscriptions.get(subId)?.close();

    const sub = this.pool.subscribeMany(
      this.config.relays,
      [
        {
          kinds: [KIND_FILE, KIND_VAULT_INDEX],
          authors: [this.pubkey!],
          since: Math.floor(Date.now() / 1000),
        },
      ],
      {
        onevent: onUpdate,
        oneose: () => {
          console.log(`Subscription ${subId} caught up`);
        },
      }
    );

    this.subscriptions.set(subId, sub);

    return () => {
      sub.close();
      this.subscriptions.delete(subId);
    };
  }

  /**
   * Check for conflicts between local and remote
   */
  checkConflict(
    localContent: string,
    localVersion: number,
    remoteFile: SyncedFile
  ): SyncConflict | null {
    const localChecksum = calculateChecksum(localContent);

    // No conflict if checksums match
    if (localChecksum === remoteFile.data.checksum) {
      return null;
    }

    // No conflict if local is based on remote
    if (localVersion === remoteFile.data.version) {
      return null;
    }

    // Conflict detected
    return {
      path: remoteFile.data.path,
      local: {
        content: localContent,
        checksum: localChecksum,
        version: localVersion,
        modified: Math.floor(Date.now() / 1000),
      },
      remote: {
        eventId: remoteFile.eventId,
        content: remoteFile.data.content,
        checksum: remoteFile.data.checksum,
        version: remoteFile.data.version,
        modified: remoteFile.data.modified,
      },
    };
  }

  /**
   * Close all connections
   */
  close(): void {
    for (const sub of this.subscriptions.values()) {
      sub.close();
    }
    this.subscriptions.clear();
    this.pool.close(this.config.relays);
  }
}

/**
 * Create a singleton sync engine instance
 */
let syncEngineInstance: SyncEngine | null = null;

export function getSyncEngine(): SyncEngine {
  if (!syncEngineInstance) {
    syncEngineInstance = new SyncEngine();
  }
  return syncEngineInstance;
}

export function resetSyncEngine(): void {
  syncEngineInstance?.close();
  syncEngineInstance = null;
}

/**
 * Debounced sync trigger for "on save" functionality
 * Waits 2 seconds after last call before triggering sync
 */
let syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let onSaveSyncCallback: (() => Promise<void>) | null = null;

export function setOnSaveSyncCallback(callback: () => Promise<void>): void {
  onSaveSyncCallback = callback;
}

export function triggerSyncOnSave(): void {
  // Check if on-save sync is enabled
  const syncEnabled = localStorage.getItem('sync_enabled') === 'true';
  const syncFrequency = localStorage.getItem('sync_frequency');

  if (!syncEnabled || syncFrequency !== 'onsave') {
    return;
  }

  // Debounce: wait 2 seconds after last save before syncing
  if (syncDebounceTimer) {
    clearTimeout(syncDebounceTimer);
  }

  syncDebounceTimer = setTimeout(() => {
    syncDebounceTimer = null;
    if (onSaveSyncCallback) {
      console.log('Triggering sync on save (debounced)');
      onSaveSyncCallback().catch(err => {
        console.error('Sync on save failed:', err);
      });
    }
  }, 2000);
}
