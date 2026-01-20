/**
 * SentSharesPanel Component
 * 
 * Shows documents the current user has shared with others.
 * Allows revoking shares.
 */

import { Component, For, Show, createSignal } from 'solid-js';
import { formatPubkey } from '../lib/nostr/nip05';
import type { SentShare } from '../lib/nostr/types';

interface SentSharesPanelProps {
  /** List of sent shares */
  sentShares: SentShare[];
  /** Whether data is loading */
  isLoading: boolean;
  /** Callback when user wants to revoke a share */
  onRevoke: (share: SentShare) => void;
  /** Callback to refresh the list */
  onRefresh: () => void;
  /** Callback when panel is closed */
  onClose: () => void;
}

const SentSharesPanel: Component<SentSharesPanelProps> = (props) => {
  const [revokingId, setRevokingId] = createSignal<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = createSignal<SentShare | null>(null);

  const formatTimeAgo = (timestamp: number): string => {
    const now = Math.floor(Date.now() / 1000);
    const diff = now - timestamp;

    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString();
  };

  const handleRevokeClick = (share: SentShare) => {
    setConfirmRevoke(share);
  };

  const handleConfirmRevoke = async () => {
    const share = confirmRevoke();
    if (!share) return;

    setRevokingId(share.eventId);
    setConfirmRevoke(null);

    try {
      await props.onRevoke(share);
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <div class="sent-shares-panel">
      <div class="sent-shares-header">
        <h3>Documents you've shared</h3>
        <div class="sent-shares-actions">
          <button 
            class="sent-shares-refresh" 
            onClick={props.onRefresh}
            disabled={props.isLoading}
            title="Refresh"
          >
            <svg 
              width="16" 
              height="16" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              stroke-width="2"
              class={props.isLoading ? 'spinning' : ''}
            >
              <polyline points="23 4 23 10 17 10"></polyline>
              <polyline points="1 20 1 14 7 14"></polyline>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
          </button>
          <button class="sent-shares-close" onClick={props.onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>

      <div class="sent-shares-body">
        <Show when={props.isLoading && props.sentShares.length === 0}>
          <div class="sent-shares-loading">
            <div class="spinner"></div>
            <span>Loading shared documents...</span>
          </div>
        </Show>

        <Show when={!props.isLoading && props.sentShares.length === 0}>
          <div class="sent-shares-empty">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path>
              <polyline points="16 6 12 2 8 6"></polyline>
              <line x1="12" y1="2" x2="12" y2="15"></line>
            </svg>
            <p>You haven't shared any documents yet</p>
            <span>Right-click a file and select "Share" to share it</span>
          </div>
        </Show>

        <Show when={props.sentShares.length > 0}>
          <div class="sent-shares-list">
            <For each={props.sentShares}>
              {(share) => (
                <div class="sent-share-item">
                  <div class="sent-share-info">
                    <div class="sent-share-title">{share.title}</div>
                    <div class="sent-share-meta">
                      <span>Shared with {share.recipientName || formatPubkey(share.recipientPubkey, 8)}</span>
                      <span class="sent-share-time">{formatTimeAgo(share.sharedAt)}</span>
                    </div>
                  </div>
                  <button
                    class="sent-share-revoke"
                    onClick={() => handleRevokeClick(share)}
                    disabled={revokingId() === share.eventId}
                    title="Revoke share"
                  >
                    <Show when={revokingId() === share.eventId}>
                      <div class="spinner small"></div>
                    </Show>
                    <Show when={revokingId() !== share.eventId}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                      </svg>
                    </Show>
                  </button>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>

      {/* Revoke Confirmation Modal */}
      <Show when={confirmRevoke()}>
        <div class="modal-overlay" onClick={() => setConfirmRevoke(null)}>
          <div class="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div class="modal-header">
              <h3>Revoke Share</h3>
              <button class="modal-close" onClick={() => setConfirmRevoke(null)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <div class="modal-body">
              <p>
                Are you sure you want to revoke access to "{confirmRevoke()!.title}"?
              </p>
              <p class="modal-hint">
                The recipient will no longer be able to view this document 
                (unless they've already imported it).
              </p>
            </div>
            <div class="modal-footer">
              <button class="setting-button secondary" onClick={() => setConfirmRevoke(null)}>
                Cancel
              </button>
              <button class="setting-button danger" onClick={handleConfirmRevoke}>
                Revoke Access
              </button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};

export default SentSharesPanel;
