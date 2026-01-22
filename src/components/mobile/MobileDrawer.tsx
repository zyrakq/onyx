/**
 * Mobile Drawer Component
 * 
 * Slide-out drawer that overlays the screen for mobile navigation.
 * Contains the file tree, search, or bookmarks depending on active view.
 */

import { Component, Show, JSX } from 'solid-js';

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  /** Optional action button in header (e.g., for opening vault) */
  headerAction?: JSX.Element;
  children: JSX.Element;
}

const MobileDrawer: Component<MobileDrawerProps> = (props) => {
  // Close on backdrop click
  const handleBackdropClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget) {
      props.onClose();
    }
  };

  // Close on escape key
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      props.onClose();
    }
  };

  return (
    <Show when={props.isOpen}>
      <div 
        class="mobile-drawer-backdrop"
        onClick={handleBackdropClick}
        onKeyDown={handleKeyDown}
        tabIndex={-1}
      >
        <aside class="mobile-drawer">
          <div class="mobile-drawer-header">
            <Show when={props.title}>
              <h2 class="mobile-drawer-title">{props.title}</h2>
            </Show>
            <div class="mobile-drawer-header-actions">
              <Show when={props.headerAction}>
                {props.headerAction}
              </Show>
              <button 
                class="mobile-drawer-close"
                onClick={props.onClose}
                aria-label="Close drawer"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          </div>
          <div class="mobile-drawer-content">
            {props.children}
          </div>
        </aside>
      </div>
    </Show>
  );
};

export default MobileDrawer;
