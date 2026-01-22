/**
 * Biometric Authentication Utility
 * 
 * Provides biometric (fingerprint/face) authentication for mobile platforms.
 * Used to protect access to sensitive data like nsec.
 */

import { isMobile } from './platform';

// Dynamically import the biometric plugin only on mobile
let biometricModule: typeof import('@tauri-apps/plugin-biometric') | null = null;

/**
 * Check if biometric authentication is available on this device
 */
export async function isBiometricAvailable(): Promise<boolean> {
  if (!isMobile()) {
    return false;
  }

  try {
    if (!biometricModule) {
      biometricModule = await import('@tauri-apps/plugin-biometric');
    }
    const status = await biometricModule.checkStatus();
    return status.isAvailable;
  } catch (err) {
    console.error('[Biometric] Failed to check availability:', err);
    return false;
  }
}

/**
 * Prompt user for biometric authentication
 * @param reason - Reason shown to user (e.g., "Unlock your Nostr identity")
 * @returns true if authentication succeeded, false otherwise
 */
export async function authenticateWithBiometric(reason: string): Promise<boolean> {
  if (!isMobile()) {
    // On desktop, we don't use biometric - the OS keychain handles security
    return true;
  }

  try {
    if (!biometricModule) {
      biometricModule = await import('@tauri-apps/plugin-biometric');
    }

    // Check if biometric is available first
    const status = await biometricModule.checkStatus();
    if (!status.isAvailable) {
      console.log('[Biometric] Not available, allowing access without biometric');
      // If biometric isn't available, allow access (device may not have fingerprint)
      return true;
    }

    // Authenticate
    await biometricModule.authenticate(reason, {
      allowDeviceCredential: true, // Allow PIN/password as fallback
    });

    return true;
  } catch (err) {
    console.error('[Biometric] Authentication failed:', err);
    return false;
  }
}

/**
 * Require biometric authentication before executing a callback
 * @param reason - Reason shown to user
 * @param callback - Function to execute if auth succeeds
 * @returns Result of callback, or null if auth failed
 */
export async function withBiometricAuth<T>(
  reason: string,
  callback: () => T | Promise<T>
): Promise<T | null> {
  const authenticated = await authenticateWithBiometric(reason);
  if (!authenticated) {
    return null;
  }
  return await callback();
}
