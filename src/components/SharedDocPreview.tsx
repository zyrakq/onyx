/**
 * SharedDocPreview Component
 * 
 * Read-only preview of a shared document with import option.
 */

import { Component, Show, createSignal } from 'solid-js';
import { formatPubkey } from '../lib/nostr/nip05';
import type { SharedDocument } from '../lib/nostr/types';

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
}

const SharedDocPreview: Component<SharedDocPreviewProps> = (props) => {
  const [importSuccess, setImportSuccess] = createSignal(false);

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

  // Simple markdown to HTML conversion for preview
  const renderContent = (content: string): string => {
    // Basic markdown rendering for preview
    let html = content
      // Escape HTML
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      // Headers
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      // Bold
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      // Italic
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      // Code blocks
      .replace(/```[\s\S]*?```/g, (match) => {
        const code = match.slice(3, -3).replace(/^\w*\n/, '');
        return `<pre><code>${code}</code></pre>`;
      })
      // Inline code
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // Links
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
      // Line breaks
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>');

    return `<p>${html}</p>`;
  };

  return (
    <div class="modal-overlay" onClick={props.onClose}>
      <div class="shared-doc-preview" onClick={(e) => e.stopPropagation()}>
        <div class="shared-doc-header">
          <div class="shared-doc-title-section">
            <h2>{props.document.title}</h2>
            <div class="shared-doc-meta">
              <span class="shared-doc-sender">
                Shared by {props.document.data.sharedBy.name || formatPubkey(props.document.senderPubkey, 8)}
              </span>
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

        <div class="shared-doc-footer">
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
  );
};

export default SharedDocPreview;
