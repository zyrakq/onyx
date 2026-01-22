/**
 * Platform Detection Utility
 * 
 * Provides centralized platform detection for conditional UI rendering.
 * Caches the result from Tauri's get_platform_info() command.
 */

import { invoke } from '@tauri-apps/api/core';
import { createSignal } from 'solid-js';

export interface PlatformInfo {
  platform: 'android' | 'ios' | 'macos' | 'windows' | 'linux';
  default_vault_path: string;
}

// Cached platform info
let cachedPlatformInfo: PlatformInfo | null = null;
let platformPromise: Promise<PlatformInfo> | null = null;

// Reactive signal for components to use
const [platformInfo, setPlatformInfo] = createSignal<PlatformInfo | null>(null);

/**
 * Initialize platform detection - call this once at app startup
 */
export async function initPlatform(): Promise<PlatformInfo> {
  if (cachedPlatformInfo) {
    return cachedPlatformInfo;
  }

  if (platformPromise) {
    return platformPromise;
  }

  platformPromise = invoke<PlatformInfo>('get_platform_info')
    .then((info) => {
      cachedPlatformInfo = info;
      setPlatformInfo(info);
      console.log('[Platform] Detected:', info.platform);
      return info;
    })
    .catch((err) => {
      console.error('[Platform] Failed to detect platform:', err);
      // Fallback to a reasonable default
      const fallback: PlatformInfo = {
        platform: 'linux',
        default_vault_path: '',
      };
      cachedPlatformInfo = fallback;
      setPlatformInfo(fallback);
      return fallback;
    });

  return platformPromise;
}

/**
 * Get platform info synchronously (returns null if not yet initialized)
 */
export function getPlatformInfo(): PlatformInfo | null {
  return platformInfo();
}

/**
 * Get platform info as a reactive signal
 */
export function usePlatformInfo() {
  return platformInfo;
}

/**
 * Check if running on Android
 */
export function isAndroid(): boolean {
  return cachedPlatformInfo?.platform === 'android';
}

/**
 * Check if running on iOS
 */
export function isIOS(): boolean {
  return cachedPlatformInfo?.platform === 'ios';
}

/**
 * Check if running on a mobile platform (Android or iOS)
 */
export function isMobile(): boolean {
  const platform = cachedPlatformInfo?.platform;
  return platform === 'android' || platform === 'ios';
}

/**
 * Check if running on a desktop platform (macOS, Windows, Linux)
 */
export function isDesktop(): boolean {
  return !isMobile();
}

/**
 * Check if running on macOS
 */
export function isMacOS(): boolean {
  return cachedPlatformInfo?.platform === 'macos';
}

/**
 * Check if running on Windows
 */
export function isWindows(): boolean {
  return cachedPlatformInfo?.platform === 'windows';
}

/**
 * Check if running on Linux
 */
export function isLinux(): boolean {
  return cachedPlatformInfo?.platform === 'linux';
}

/**
 * Get the platform name
 */
export function getPlatformName(): string {
  return cachedPlatformInfo?.platform || 'unknown';
}
