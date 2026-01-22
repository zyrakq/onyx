/**
 * Haptic Feedback Utility
 * 
 * Provides haptic feedback for touch interactions on mobile platforms.
 */

import { isMobile } from './platform';

// Dynamically import the haptics plugin only on mobile
let hapticsModule: typeof import('@tauri-apps/plugin-haptics') | null = null;

async function getHapticsModule() {
  if (!isMobile()) return null;
  
  if (!hapticsModule) {
    try {
      hapticsModule = await import('@tauri-apps/plugin-haptics');
    } catch (err) {
      console.warn('[Haptics] Failed to load haptics module:', err);
      return null;
    }
  }
  return hapticsModule;
}

/**
 * Light impact feedback - for subtle UI interactions
 * Use for: toggles, selections, minor button taps
 */
export async function impactLight(): Promise<void> {
  const haptics = await getHapticsModule();
  if (!haptics) return;
  
  try {
    await haptics.impactFeedback('light');
  } catch (err) {
    // Silently fail - haptics are not critical
  }
}

/**
 * Medium impact feedback - for standard interactions
 * Use for: button presses, confirming actions
 */
export async function impactMedium(): Promise<void> {
  const haptics = await getHapticsModule();
  if (!haptics) return;
  
  try {
    await haptics.impactFeedback('medium');
  } catch (err) {
    // Silently fail
  }
}

/**
 * Heavy impact feedback - for significant actions
 * Use for: destructive actions, important confirmations
 */
export async function impactHeavy(): Promise<void> {
  const haptics = await getHapticsModule();
  if (!haptics) return;
  
  try {
    await haptics.impactFeedback('heavy');
  } catch (err) {
    // Silently fail
  }
}

/**
 * Success notification feedback
 * Use for: successful operations, sync complete, file saved
 */
export async function notificationSuccess(): Promise<void> {
  const haptics = await getHapticsModule();
  if (!haptics) return;
  
  try {
    await haptics.notificationFeedback('success');
  } catch (err) {
    // Silently fail
  }
}

/**
 * Warning notification feedback
 * Use for: warnings, potential issues
 */
export async function notificationWarning(): Promise<void> {
  const haptics = await getHapticsModule();
  if (!haptics) return;
  
  try {
    await haptics.notificationFeedback('warning');
  } catch (err) {
    // Silently fail
  }
}

/**
 * Error notification feedback
 * Use for: errors, failed operations
 */
export async function notificationError(): Promise<void> {
  const haptics = await getHapticsModule();
  if (!haptics) return;
  
  try {
    await haptics.notificationFeedback('error');
  } catch (err) {
    // Silently fail
  }
}

/**
 * Selection changed feedback
 * Use for: picker changes, segment control changes
 */
export async function selectionChanged(): Promise<void> {
  const haptics = await getHapticsModule();
  if (!haptics) return;
  
  try {
    await haptics.selectionFeedback();
  } catch (err) {
    // Silently fail
  }
}

/**
 * Vibrate for a specified duration
 * Use for: custom feedback patterns
 */
export async function vibrate(durationMs: number): Promise<void> {
  const haptics = await getHapticsModule();
  if (!haptics) return;
  
  try {
    await haptics.vibrate(durationMs);
  } catch (err) {
    // Silently fail
  }
}
