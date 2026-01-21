/**
 * SharedDocPreview Component
 * 
 * Read-only preview of a shared document with import option.
 */

import { Component, Show, createSignal, createEffect } from 'solid-js';
import { formatPubkey } from '../lib/nostr/nip05';
import { fetchUserProfile } from '../lib/nostr/login';
import { getSyncEngine } from '../lib/nostr/sync';
import { sanitizeUrl, sanitizeImageUrl } from '../lib/security';
import type { SharedDocument, NostrProfile } from '../lib/nostr/types';

interface SharedDocPreviewProps {
  /** The shared document to preview */
  document: SharedDocument;
  /** Whether import is in progress */
  isImporting?: boolean;
  /** Callback when user wants to import the document */
  onImport: (doc: SharedDocument) => void;
  /** Callback to close the preview */
  onClose: () => void;
  /** Callback to dismiss (mark as read without importing) */
  onDismiss: (doc: SharedDocument) => void;
  /** Callback to block the sender */
  onBlockUser: (pubkey: string) => void;
}

const SharedDocPreview: Component<SharedDocPreviewProps> = (props) => {
  const [importSuccess, setImportSuccess] = createSignal(false);
  const [senderProfile, setSenderProfile] = createSignal<NostrProfile | null>(null);
  const [isBlocking, setIsBlocking] = createSignal(false);
  const [showBlockConfirm, setShowBlockConfirm] = createSignal(false);

  // Fetch sender's profile on mount
  createEffect(() => {
    const pubkey = props.document.senderPubkey;
    
    const engine = getSyncEngine();
    const relays = engine.getConfig().relays;
    
    fetchUserProfile(pubkey, relays).then(profile => {
      if (profile) {
        setSenderProfile({
          pubkey,
          name: profile.displayName || profile.name,
          picture: profile.picture,
          nip05: profile.nip05,
        });
      }
    }).catch(err => {
      console.error('Failed to fetch sender profile:', err);
    });
  });

  // Get display name for sender (profile name or fallback to embedded or pubkey)
  const getSenderName = (): string => {
    const profile = senderProfile();
    if (profile?.name) return profile.name;
    if (props.document.data.sharedBy.name) return props.document.data.sharedBy.name;
    return formatPubkey(props.document.senderPubkey, 8);
  };

  // Extract a clean display name (handles Windows/Unix paths and extensions)
  const getDisplayName = (): string => {
    let name = props.document.title || props.document.data.path || 'Untitled';
    
    // If it looks like a path (Windows or Unix), extract just the filename
    if (name.includes('/') || name.includes('\\')) {
      const parts = name.split(/[/\\]/);
      name = parts[parts.length - 1] || name;
    }
    
    // Remove file extension if present
    name = name.replace(/\.[^/.]+$/, '');
    
    return name || 'Untitled';
  };

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleImport = () => {
    props.onImport(props.document);
    setImportSuccess(true);
  };

  const handleDismiss = () => {
    props.onDismiss(props.document);
    props.onClose();
  };

  const handleBlockUser = async () => {
    setIsBlocking(true);
    try {
      await props.onBlockUser(props.document.senderPubkey);
      props.onClose();
    } catch (err) {
      console.error('Failed to block user:', err);
    } finally {
      setIsBlocking(false);
    }
  };

  // Simple markdown to HTML conversion for preview
  // SECURITY: This function carefully escapes HTML first, then only adds safe markup
  const renderContent = (content: string): string => {
    // Basic markdown rendering for preview
    let html = content
      // SECURITY: Escape HTML entities FIRST to prevent XSS
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      // Headers (safe: only adds structural tags)
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      // Bold (safe: only adds formatting)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      // Italic (safe: only adds formatting)
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      // Code blocks (safe: content already escaped)
      .replace(/```[\s\S]*?```/g, (match) => {
        const code = match.slice(3, -3).replace(/^\w*\n/, '');
        return `<pre><code>${code}</code></pre>`;
      })
      // Inline code (safe: content already escaped)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // Line breaks (safe: only adds structural tags)
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>');

    // SECURITY: Process links separately with URL sanitization
    // Links need special handling to sanitize href while preserving display text
    html = html.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g, 
      (_, text, url) => {
        const safeUrl = sanitizeUrl(url);
        // Add rel="noopener noreferrer" and target="_blank" for external links
        return `<a href="${safeUrl}" rel="noopener noreferrer" target="_blank">${text}</a>`;
      }
    );

    return `<p>${html}</p>`;
  };

  return (
    <div class="modal-overlay" onClick={props.onClose}>
      <div class="shared-doc-preview" onClick={(e) => e.stopPropagation()}>
        <div class="shared-doc-header">
          <div class="shared-doc-title-section">
            <h2>{getDisplayName()}</h2>
            <div class="shared-doc-meta">
              <div class="shared-doc-sender">
                <div class="shared-doc-sender-avatar">
                  <Show when={sanitizeImageUrl(senderProfile()?.picture)} fallback={
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                      <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                  }>
                    <img src={sanitizeImageUrl(senderProfile()!.picture)} alt="" />
                  </Show>
                </div>
                <span>Shared by {getSenderName()}</span>
              </div>
              <span class="shared-doc-date">
                {formatDate(props.document.data.sharedAt)}
              </span>
            </div>
          </div>
          <button class="modal-close" onClick={props.onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div class="shared-doc-content">
          <div class="shared-doc-content-inner" innerHTML={renderContent(props.document.data.content)} />
        </div>

        {/* Block confirmation banner */}
        <Show when={showBlockConfirm()}>
          <div class="shared-doc-block-confirm">
            <div class="block-confirm-content">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
              </svg>
              <span>Block {getSenderName()}? You won't receive shares from them anymore.</span>
            </div>
            <div class="block-confirm-actions">
              <button 
                class="setting-button secondary small" 
                onClick={() => setShowBlockConfirm(false)}
                disabled={isBlocking()}
              >
                Cancel
              </button>
              <button 
                class="setting-button danger small" 
                onClick={handleBlockUser}
                disabled={isBlocking()}
              >
                <Show when={isBlocking()}>
                  <div class="spinner small"></div>
                </Show>
                <Show when={!isBlocking()}>
                  Block User
                </Show>
              </button>
            </div>
          </div>
        </Show>

        <div class="shared-doc-footer">
          <div class="shared-doc-footer-left">
            <button 
              class="setting-button danger-outline" 
              onClick={() => setShowBlockConfirm(true)}
              disabled={showBlockConfirm()}
              title="Block this user"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
              </svg>
              Block
            </button>
          </div>
          <div class="shared-doc-footer-right">
            <button class="setting-button secondary" onClick={handleDismiss}>
              Dismiss
            </button>
            <button
              class="setting-button"
              onClick={handleImport}
              disabled={props.isImporting || importSuccess()}
            >
              <Show when={props.isImporting}>
                <div class="spinner small"></div>
                Importing...
              </Show>
              <Show when={!props.isImporting && !importSuccess()}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                Import to Vault
              </Show>
              <Show when={importSuccess()}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                Imported!
              </Show>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SharedDocPreview;
