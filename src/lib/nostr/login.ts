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
import { NRelay1 } from '@nostrify/nostrify';
import { invoke } from '@tauri-apps/api/core';
import type { NostrIdentity } from './types';

// Keyring helper functions
async function keyringSet(key: string, value: string): Promise<void> {
  await invoke('keyring_set', { key, value });
}

async function keyringGet(key: string): Promise<string | null> {
  return await invoke<string | null>('keyring_get', { key });
}

async function keyringDelete(key: string): Promise<void> {
  await invoke('keyring_delete', { key });
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

  if (callbackUrl) {
    uri.searchParams.set('callback', callbackUrl);
  }

  return uri.toString();
}

/**
 * Connect to relays and wait for NIP-46 response
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

    const cleanup = () => {
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
                cleanup();

                // The event.pubkey is the bunker pubkey
                // We need to get the actual user pubkey from the response
                // In NIP-46, the bunker signs the initial connection
                const bunkerPubkey = event.pubkey;

                // For now, use bunkerPubkey as user pubkey
                // In a proper implementation, we'd do a follow-up request
                const userPubkey = response.result === 'ack'
                  ? bunkerPubkey
                  : bunkerPubkey;

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
      } catch (e) {
        console.error(`Failed to connect to relay ${relayUrl}:`, e);
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
 * Storage key for logins
 */
const STORAGE_KEY = 'onyx:logins';
const PROFILE_STORAGE_KEY = 'onyx:profile';

// Keyring key prefixes
const KEYRING_NSEC_PREFIX = 'nsec:';
const KEYRING_BUNKER_PREFIX = 'bunker:';

/**
 * Save login - metadata to localStorage, secrets to keyring
 */
export async function saveLogin(login: StoredLogin): Promise<void> {
  // Extract metadata (no secrets)
  const meta: StoredLoginMeta = {
    id: login.id,
    type: login.type,
    pubkey: login.pubkey,
    createdAt: login.createdAt,
  };

  // Store secrets in keyring based on login type
  if (login.type === 'nsec' && login.nsec) {
    await keyringSet(`${KEYRING_NSEC_PREFIX}${login.id}`, login.nsec);
  } else if (login.type === 'bunker' && login.bunkerData) {
    meta.bunkerPubkey = login.bunkerData.bunkerPubkey;
    meta.bunkerRelays = login.bunkerData.relays;
    // Store secrets in keyring
    await keyringSet(`${KEYRING_BUNKER_PREFIX}${login.id}`, JSON.stringify({
      clientNsec: login.bunkerData.clientNsec,
      secret: login.bunkerData.secret,
    }));
  }

  // Store metadata in localStorage
  const metas = getLoginMetas();
  metas.unshift(meta);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(metas));
}

/**
 * Get login metadata from localStorage (sync, no secrets)
 */
export function getLoginMetas(): StoredLoginMeta[] {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return [];

  try {
    return JSON.parse(stored);
  } catch (e) {
    return [];
  }
}

/**
 * Get all logins with secrets from keyring (async)
 */
export async function getLogins(): Promise<StoredLogin[]> {
  const metas = getLoginMetas();
  const logins: StoredLogin[] = [];

  for (const meta of metas) {
    const login = await hydrateLogin(meta);
    if (login) {
      logins.push(login);
    }
  }

  return logins;
}

/**
 * Hydrate a login meta with secrets from keyring
 */
async function hydrateLogin(meta: StoredLoginMeta): Promise<StoredLogin | null> {
  const login: StoredLogin = {
    id: meta.id,
    type: meta.type,
    pubkey: meta.pubkey,
    createdAt: meta.createdAt,
  };

  try {
    if (meta.type === 'nsec') {
      const nsec = await keyringGet(`${KEYRING_NSEC_PREFIX}${meta.id}`);
      if (nsec) {
        login.nsec = nsec;
      }
    } else if (meta.type === 'bunker') {
      const bunkerSecrets = await keyringGet(`${KEYRING_BUNKER_PREFIX}${meta.id}`);
      if (bunkerSecrets && meta.bunkerPubkey && meta.bunkerRelays) {
        const secrets = JSON.parse(bunkerSecrets);
        login.bunkerData = {
          bunkerPubkey: meta.bunkerPubkey,
          relays: meta.bunkerRelays,
          clientNsec: secrets.clientNsec,
          secret: secrets.secret,
        };
      }
    }
    return login;
  } catch (e) {
    console.error('Failed to hydrate login:', e);
    return null;
  }
}

/**
 * Get the current (first) login - sync version for metadata only
 */
export function getCurrentLoginMeta(): StoredLoginMeta | null {
  const metas = getLoginMetas();
  return metas[0] || null;
}

/**
 * Get the current (first) login with secrets (async)
 */
export async function getCurrentLogin(): Promise<StoredLogin | null> {
  const meta = getCurrentLoginMeta();
  if (!meta) return null;
  return hydrateLogin(meta);
}

/**
 * Remove a login by ID - removes from both localStorage and keyring
 */
export async function removeLogin(id: string): Promise<void> {
  const metas = getLoginMetas();
  const meta = metas.find(m => m.id === id);

  if (meta) {
    // Remove secrets from keyring
    if (meta.type === 'nsec') {
      await keyringDelete(`${KEYRING_NSEC_PREFIX}${id}`);
    } else if (meta.type === 'bunker') {
      await keyringDelete(`${KEYRING_BUNKER_PREFIX}${id}`);
    }
  }

  // Remove from localStorage
  const filtered = metas.filter(m => m.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}

/**
 * Clear all logins - removes from both localStorage and keyring
 */
export async function clearLogins(): Promise<void> {
  const metas = getLoginMetas();

  // Remove all secrets from keyring
  for (const meta of metas) {
    if (meta.type === 'nsec') {
      await keyringDelete(`${KEYRING_NSEC_PREFIX}${meta.id}`);
    } else if (meta.type === 'bunker') {
      await keyringDelete(`${KEYRING_BUNKER_PREFIX}${meta.id}`);
    }
  }

  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(PROFILE_STORAGE_KEY);
}

/**
 * Save user profile to localStorage
 */
export function saveUserProfile(profile: UserProfile): void {
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
}

/**
 * Get user profile from localStorage
 */
export function getSavedProfile(): UserProfile | null {
  const stored = localStorage.getItem(PROFILE_STORAGE_KEY);
  if (!stored) return null;

  try {
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
