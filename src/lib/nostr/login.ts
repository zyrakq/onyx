/**
 * Nostr Login Service
 *
 * Handles multiple login methods:
 * - Generate new keypair
 * - Import nsec/hex private key
 * - NIP-46 Nostr Connect (bunker)
 *
 * Secrets (nsec, bunker keys) are stored in the OS keyring via Tauri.
 * Only non-sensitive metadata is stored in localStorage.
 */

import { nip19, generateSecretKey, getPublicKey, nip44 } from 'nostr-tools';
import { bytesToHex, hexToBytes, randomBytes } from '@noble/hashes/utils.js';
import { NRelay1, NSecSigner, NConnectSigner } from '@nostrify/nostrify';
import { invoke } from '@tauri-apps/api/core';
import type { NostrIdentity } from './types';

// Keyring helper functions
async function keyringSet(key: string, value: string): Promise<void> {
  try {
    await invoke('keyring_set', { key, value });
  } catch (e) {
    console.error('Keyring set failed:', e);
    throw e;
  }
}

async function keyringGet(key: string): Promise<string | null> {
  try {
    const result = await invoke<string | null>('keyring_get', { key });
    return result;
  } catch (e) {
    console.error('Keyring get failed:', e);
    throw e;
  }
}

async function keyringDelete(key: string): Promise<void> {
  try {
    await invoke('keyring_delete', { key });
  } catch (e) {
    console.error('Keyring delete failed:', e);
    throw e;
  }
}

// NIP-46 event kind
export const KIND_NIP46_REQUEST = 24133;
export const KIND_NIP65_RELAY_LIST = 10002;
export const KIND_BLOSSOM_SERVER_LIST = 10063;

/**
 * Login type
 */
export type LoginType = 'nsec' | 'bunker' | 'extension';

/**
 * Login metadata stored in localStorage (no secrets)
 */
export interface StoredLoginMeta {
  id: string;
  type: LoginType;
  pubkey: string;
  createdAt: number;
  // For bunker logins - non-secret data only
  bunkerPubkey?: string;
  bunkerRelays?: string[];
}

/**
 * Full login data (metadata + secrets from keyring)
 */
export interface StoredLogin {
  id: string;
  type: LoginType;
  pubkey: string;
  createdAt: number;
  // For nsec logins - retrieved from keyring
  nsec?: string;
  // For bunker logins
  bunkerData?: {
    bunkerPubkey: string;
    clientNsec: string;
    relays: string[];
    secret: string;
  };
}

/**
 * Nostr Connect parameters
 */
export interface NostrConnectParams {
  clientSecretKey: Uint8Array;
  clientPubkey: string;
  secret: string;
  relays: string[];
}

/**
 * Relay entry from NIP-65
 */
export interface RelayEntry {
  url: string;
  read: boolean;
  write: boolean;
}

/**
 * Generate a unique login ID
 */
function generateLoginId(): string {
  return bytesToHex(randomBytes(8));
}

/**
 * Generate a new Nostr keypair and create login
 */
export function generateNewLogin(): { identity: NostrIdentity; login: StoredLogin } {
  const sk = generateSecretKey();
  const privkey = bytesToHex(sk);
  const pubkey = getPublicKey(sk);

  const identity: NostrIdentity = {
    pubkey,
    privkey,
    npub: nip19.npubEncode(pubkey),
    nsec: nip19.nsecEncode(sk),
  };

  const login: StoredLogin = {
    id: generateLoginId(),
    type: 'nsec',
    pubkey,
    createdAt: Math.floor(Date.now() / 1000),
    nsec: identity.nsec,
  };

  return { identity, login };
}

/**
 * Import a private key (nsec or hex) and create login
 */
export function importNsecLogin(key: string): { identity: NostrIdentity; login: StoredLogin } {
  let sk: Uint8Array;

  if (key.startsWith('nsec')) {
    const decoded = nip19.decode(key);
    if (decoded.type !== 'nsec') {
      throw new Error('Invalid nsec');
    }
    sk = decoded.data;
  } else {
    // Assume hex
    sk = hexToBytes(key);
  }

  const privkey = bytesToHex(sk);
  const pubkey = getPublicKey(sk);

  const identity: NostrIdentity = {
    pubkey,
    privkey,
    npub: nip19.npubEncode(pubkey),
    nsec: nip19.nsecEncode(sk),
  };

  const login: StoredLogin = {
    id: generateLoginId(),
    type: 'nsec',
    pubkey,
    createdAt: Math.floor(Date.now() / 1000),
    nsec: identity.nsec,
  };

  return { identity, login };
}

/**
 * Generate Nostr Connect parameters for QR code
 */
export function generateNostrConnectParams(relays: string[]): NostrConnectParams {
  const clientSecretKey = generateSecretKey();
  const clientPubkey = getPublicKey(clientSecretKey);
  const secret = bytesToHex(randomBytes(4)); // 8 char hex secret

  return {
    clientSecretKey,
    clientPubkey,
    secret,
    relays,
  };
}

/**
 * Build nostrconnect:// URI for QR code
 */
export function buildNostrConnectUri(
  params: NostrConnectParams,
  appName: string = 'Onyx',
  callbackUrl?: string
): string {
  const uri = new URL(`nostrconnect://${params.clientPubkey}`);

  params.relays.forEach(relay => {
    uri.searchParams.append('relay', relay);
  });

  uri.searchParams.set('secret', params.secret);
  uri.searchParams.set('name', appName);

  // Request permissions for signing events and encryption
  // sign_event:30800 = file events, sign_event:30801 = vault index events
  // nip44_encrypt and nip44_decrypt for encrypted content
  uri.searchParams.set('perms', 'sign_event:30800,sign_event:30801,nip44_encrypt,nip44_decrypt');

  if (callbackUrl) {
    uri.searchParams.set('callback', callbackUrl);
  }

  return uri.toString();
}

/**
 * Simple relay adapter for NConnectSigner
 */
class SimpleRelayGroup {
  private relays: NRelay1[] = [];
  private urls: string[];

  constructor(urls: string[]) {
    this.urls = urls;
  }

  async ensureConnected(): Promise<void> {
    if (this.relays.length > 0) return;
    
    for (const url of this.urls) {
      try {
        const relay = new NRelay1(url);
        this.relays.push(relay);
      } catch {
        // Ignore connection errors
      }
    }
  }

  req(filters: any[], opts?: { signal?: AbortSignal }): AsyncIterable<[string, string, any]> {
    const self = this;
    return {
      async *[Symbol.asyncIterator]() {
        await self.ensureConnected();
        
        // Use first connected relay
        for (const relay of self.relays) {
          try {
            const sub = relay.req(filters, opts);
            for await (const msg of sub) {
              yield msg;
            }
            return;
          } catch {
            continue;
          }
        }
      }
    };
  }

  async event(event: any): Promise<void> {
    await this.ensureConnected();
    
    for (const relay of this.relays) {
      try {
        await relay.event(event);
        return;
      } catch {
        continue;
      }
    }
    throw new Error('Failed to publish to any relay');
  }

  close(): void {
    this.relays.forEach(r => {
      try { r.close(); } catch { /* ignore */ }
    });
    this.relays = [];
  }
}

/**
 * Connect to relays and wait for NIP-46 response
 * Per NIP-46: After connection, we MUST call get_public_key to get the actual user pubkey
 */
export async function waitForNostrConnect(
  params: NostrConnectParams,
  timeoutMs: number = 120000
): Promise<StoredLogin> {
  const clientSk = params.clientSecretKey;
  const clientPubkey = params.clientPubkey;

  return new Promise((resolve, reject) => {
    const relayConnections: NRelay1[] = [];
    let resolved = false;
    let cleaningUp = false;

    const cleanup = () => {
      cleaningUp = true;
      relayConnections.forEach(relay => {
        try {
          relay.close();
        } catch (e) {
          // Ignore close errors
        }
      });
    };

    // Set timeout
    const timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        cleanup();
        reject(new Error('Connection timeout. Please try again.'));
      }
    }, timeoutMs);

    // Connect to all relays and subscribe
    params.relays.forEach(async (relayUrl) => {
      try {
        const relay = new NRelay1(relayUrl);
        relayConnections.push(relay);

        // Subscribe to NIP-46 responses
        const sub = relay.req([
          {
            kinds: [KIND_NIP46_REQUEST],
            '#p': [clientPubkey],
            since: Math.floor(Date.now() / 1000) - 10,
          },
        ]);

        for await (const msg of sub) {
          if (resolved) break;

          if (msg[0] === 'EVENT') {
            const event = msg[2];

            try {
              // Decrypt the response using NIP-44
              const conversationKey = nip44.v2.utils.getConversationKey(
                clientSk,
                event.pubkey
              );
              const decrypted = nip44.v2.decrypt(event.content, conversationKey);
              const response = JSON.parse(decrypted);

              // Check if this is an "ack" or matches our secret
              if (response.result === params.secret || response.result === 'ack') {
                resolved = true;
                clearTimeout(timeoutId);
                
                // The event.pubkey is the bunker/remote-signer pubkey
                const bunkerPubkey = event.pubkey;

                // Per NIP-46: We MUST call get_public_key to get the actual user pubkey
                // The bunker pubkey may be different from the user pubkey
                let userPubkey = bunkerPubkey; // Default fallback
                
                try {
                  // Create a temporary NConnectSigner to get the user pubkey
                  const clientSigner = new NSecSigner(clientSk);
                  const relayGroup = new SimpleRelayGroup(params.relays);
                  
                  const tempSigner = new NConnectSigner({
                    relay: relayGroup as any,
                    pubkey: bunkerPubkey,
                    signer: clientSigner,
                    timeout: 30000, // 30 second timeout for get_public_key
                  });

                  // Call get_public_key to get the actual user pubkey
                  userPubkey = await tempSigner.getPublicKey();
                  
                  // Clean up the temporary relay group
                  relayGroup.close();
                } catch (e) {
                  console.warn('Failed to get user pubkey via get_public_key, using bunker pubkey:', e);
                  // Fall back to bunker pubkey if get_public_key fails
                }

                cleanup();

                const login: StoredLogin = {
                  id: generateLoginId(),
                  type: 'bunker',
                  pubkey: userPubkey,
                  createdAt: Math.floor(Date.now() / 1000),
                  bunkerData: {
                    bunkerPubkey,
                    clientNsec: nip19.nsecEncode(clientSk),
                    relays: params.relays,
                    secret: params.secret,
                  },
                };

                resolve(login);
                return;
              }
            } catch (e) {
              console.error('Failed to process NIP-46 response:', e);
            }
          }
        }
      } catch (e: any) {
        // Don't log errors if we're intentionally cleaning up
        if (!cleaningUp && e?.name !== 'AbortError') {
          console.error(`Failed to connect to relay ${relayUrl}:`, e);
        }
      }
    });
  });
}

/**
 * Fetch NIP-65 relay list for a user
 */
export async function fetchUserRelays(
  pubkey: string,
  relays: string[]
): Promise<RelayEntry[]> {
  const results: RelayEntry[] = [];

  for (const relayUrl of relays) {
    try {
      const relay = new NRelay1(relayUrl);

      const sub = relay.req([
        {
          kinds: [KIND_NIP65_RELAY_LIST],
          authors: [pubkey],
          limit: 1,
        },
      ]);

      const timeout = setTimeout(() => {
        relay.close();
      }, 5000);

      for await (const msg of sub) {
        if (msg[0] === 'EVENT') {
          const event = msg[2];
          clearTimeout(timeout);
          relay.close();

          // Parse relay tags
          const relayEntries = event.tags
            .filter(([name]: string[]) => name === 'r')
            .map(([_, url, marker]: string[]) => ({
              url,
              read: !marker || marker === 'read',
              write: !marker || marker === 'write',
            }));

          return relayEntries;
        } else if (msg[0] === 'EOSE') {
          clearTimeout(timeout);
          relay.close();
          break;
        }
      }
    } catch (e) {
      console.error(`Failed to fetch from ${relayUrl}:`, e);
    }
  }

  return results;
}

/**
 * Fetch blossom server list for a user (kind 10063)
 */
export async function fetchUserBlossomServers(
  pubkey: string,
  relays: string[]
): Promise<string[]> {
  for (const relayUrl of relays) {
    try {
      const relay = new NRelay1(relayUrl);

      const sub = relay.req([
        {
          kinds: [KIND_BLOSSOM_SERVER_LIST],
          authors: [pubkey],
          limit: 1,
        },
      ]);

      const timeout = setTimeout(() => {
        relay.close();
      }, 5000);

      for await (const msg of sub) {
        if (msg[0] === 'EVENT') {
          const event = msg[2];
          clearTimeout(timeout);
          relay.close();

          // Parse server tags
          const servers = event.tags
            .filter(([name]: string[]) => name === 'server')
            .map(([_, url]: string[]) => url);

          return servers;
        } else if (msg[0] === 'EOSE') {
          clearTimeout(timeout);
          relay.close();
          break;
        }
      }
    } catch (e) {
      console.error(`Failed to fetch blossom servers from ${relayUrl}:`, e);
    }
  }

  return [];
}

/**
 * User profile metadata (kind 0)
 */
export interface UserProfile {
  name?: string;
  displayName?: string;
  picture?: string;
  about?: string;
  nip05?: string;
  banner?: string;
  lud16?: string;
}

/**
 * Fetch user profile (kind 0 metadata)
 */
export async function fetchUserProfile(
  pubkey: string,
  relays: string[]
): Promise<UserProfile | null> {
  for (const relayUrl of relays) {
    try {
      const relay = new NRelay1(relayUrl);

      const sub = relay.req([
        {
          kinds: [0],
          authors: [pubkey],
          limit: 1,
        },
      ]);

      const timeout = setTimeout(() => {
        relay.close();
      }, 5000);

      for await (const msg of sub) {
        if (msg[0] === 'EVENT') {
          const event = msg[2];
          clearTimeout(timeout);
          relay.close();

          try {
            const profile = JSON.parse(event.content) as UserProfile;
            return profile;
          } catch (e) {
            console.error('Failed to parse profile:', e);
            return null;
          }
        } else if (msg[0] === 'EOSE') {
          clearTimeout(timeout);
          relay.close();
          break;
        }
      }
    } catch (e) {
      console.error(`Failed to fetch profile from ${relayUrl}:`, e);
    }
  }

  return null;
}

/**
 * Keyring keys - all sensitive data stored securely in OS keyring
 */
const KEYRING_LOGIN_KEY = 'onyx:login';
const KEYRING_PROFILE_KEY = 'onyx:profile';

/**
 * Save login to keyring (entire login stored securely)
 */
export async function saveLogin(login: StoredLogin): Promise<void> {
  await keyringSet(KEYRING_LOGIN_KEY, JSON.stringify(login));
}

/**
 * Get login metadata (async, from keyring)
 */
export async function getLoginMetas(): Promise<StoredLoginMeta[]> {
  const login = await getCurrentLogin();
  if (!login) return [];

  const meta: StoredLoginMeta = {
    id: login.id,
    type: login.type,
    pubkey: login.pubkey,
    createdAt: login.createdAt,
  };

  if (login.type === 'bunker' && login.bunkerData) {
    meta.bunkerPubkey = login.bunkerData.bunkerPubkey;
    meta.bunkerRelays = login.bunkerData.relays;
  }

  return [meta];
}

/**
 * Get all logins from keyring (async)
 */
export async function getLogins(): Promise<StoredLogin[]> {
  const login = await getCurrentLogin();
  return login ? [login] : [];
}

/**
 * Get the current login from keyring (async)
 */
export async function getCurrentLogin(): Promise<StoredLogin | null> {
  try {
    const stored = await keyringGet(KEYRING_LOGIN_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as StoredLogin;
  } catch {
    return null;
  }
}

/**
 * Get the current login metadata - async version
 * Note: This is now async since we store everything in keyring
 */
export async function getCurrentLoginMeta(): Promise<StoredLoginMeta | null> {
  const login = await getCurrentLogin();
  if (!login) return null;

  const meta: StoredLoginMeta = {
    id: login.id,
    type: login.type,
    pubkey: login.pubkey,
    createdAt: login.createdAt,
  };

  if (login.type === 'bunker' && login.bunkerData) {
    meta.bunkerPubkey = login.bunkerData.bunkerPubkey;
    meta.bunkerRelays = login.bunkerData.relays;
  }

  return meta;
}

/**
 * Remove a login by ID from keyring
 */
export async function removeLogin(_id: string): Promise<void> {
  await keyringDelete(KEYRING_LOGIN_KEY);
}

/**
 * Clear all logins from keyring
 */
export async function clearLogins(): Promise<void> {
  await keyringDelete(KEYRING_LOGIN_KEY);
  await keyringDelete(KEYRING_PROFILE_KEY);
}

/**
 * Save user profile to keyring
 */
export async function saveUserProfile(profile: UserProfile): Promise<void> {
  await keyringSet(KEYRING_PROFILE_KEY, JSON.stringify(profile));
}

/**
 * Get user profile from keyring
 */
export async function getSavedProfile(): Promise<UserProfile | null> {
  try {
    const stored = await keyringGet(KEYRING_PROFILE_KEY);
    if (!stored) return null;
    return JSON.parse(stored);
  } catch (e) {
    return null;
  }
}

/**
 * Get NostrIdentity from a stored login (for nsec logins)
 */
export function getIdentityFromLogin(login: StoredLogin): NostrIdentity | null {
  if (login.type !== 'nsec' || !login.nsec) {
    return null;
  }

  try {
    const decoded = nip19.decode(login.nsec);
    if (decoded.type !== 'nsec') return null;

    const sk = decoded.data;
    const privkey = bytesToHex(sk);
    const pubkey = getPublicKey(sk);

    return {
      pubkey,
      privkey,
      npub: nip19.npubEncode(pubkey),
      nsec: login.nsec,
    };
  } catch (e) {
    return null;
  }
}
