/**
 * NotificationsPanel Component
 * 
 * Shows documents shared with the current user.
 * Displays sender info, document title, and allows preview/import.
 */

import { Component, For, Show } from 'solid-js';
import { formatPubkey } from '../lib/nostr/nip05';
import type { SharedDocument } from '../lib/nostr/types';

interface NotificationsPanelProps {
  /** List of shared documents */
  sharedDocuments: SharedDocument[];
  /** Whether data is loading */
  isLoading: boolean;
  /** Callback when a document is clicked for preview */
  onPreview: (doc: SharedDocument) => void;
  /** Callback to refresh the list */
  onRefresh: () => void;
  /** Callback when panel is closed */
  onClose: () => void;
}

const NotificationsPanel: Component<NotificationsPanelProps> = (props) => {
  const unreadCount = () => props.sharedDocuments.filter(d => !d.isRead).length;

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

  return (
    <div class="notifications-panel">
      <div class="notifications-header">
        <div class="notifications-title">
          <h3>Shared with you</h3>
          <Show when={unreadCount() > 0}>
            <span class="notifications-badge">{unreadCount()}</span>
          </Show>
        </div>
        <div class="notifications-actions">
          <button 
            class="notifications-refresh" 
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
          <button class="notifications-close" onClick={props.onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>

      <div class="notifications-body">
        <Show when={props.isLoading && props.sharedDocuments.length === 0}>
          <div class="notifications-loading">
            <div class="spinner"></div>
            <span>Loading shared documents...</span>
          </div>
        </Show>

        <Show when={!props.isLoading && props.sharedDocuments.length === 0}>
          <div class="notifications-empty">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
            </svg>
            <p>No documents shared with you yet</p>
            <span>When someone shares a document, it will appear here</span>
          </div>
        </Show>

        <Show when={props.sharedDocuments.length > 0}>
          <div class="notifications-list">
            <For each={props.sharedDocuments}>
              {(doc) => (
                <div 
                  class={`notification-item ${doc.isRead ? 'read' : 'unread'}`}
                  onClick={() => props.onPreview(doc)}
                >
                  <div class="notification-unread-dot">
                    <Show when={!doc.isRead}>
                      <span></span>
                    </Show>
                  </div>
                  <div class="notification-avatar">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                      <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                  </div>
                  <div class="notification-content">
                    <div class="notification-sender">
                      {doc.data.sharedBy.name || formatPubkey(doc.senderPubkey, 8)}
                    </div>
                    <div class="notification-title">{doc.title}</div>
                    <div class="notification-time">{formatTimeAgo(doc.createdAt)}</div>
                  </div>
                  <div class="notification-arrow">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
};

export default NotificationsPanel;
