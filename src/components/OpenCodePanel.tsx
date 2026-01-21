/**
 * OpenCodePanel - Wrapper component that allows switching between Chat and Terminal modes
 */

import { Component, createSignal, Show } from 'solid-js';
import OpenCodeTerminal from './OpenCodeTerminal';
import OpenCodeChat from './OpenCodeChat';

type OpenCodeMode = 'chat' | 'terminal';

interface OpenCodePanelProps {
  vaultPath: string | null;
  currentFile?: { path: string; content: string } | null;
  onClose: () => void;
}

const OpenCodePanel: Component<OpenCodePanelProps> = (props) => {
  const [mode, setMode] = createSignal<OpenCodeMode>(
    (localStorage.getItem('opencode_mode') as OpenCodeMode) || 'chat'
  );

  // Persist mode preference
  const handleModeChange = (newMode: OpenCodeMode) => {
    setMode(newMode);
    localStorage.setItem('opencode_mode', newMode);
  };

  return (
    <div class="opencode-panel">
      {/* Header with mode toggle */}
      <div class="opencode-panel-header">
        <div class="opencode-panel-title">
          <svg width="18" height="18" viewBox="0 0 512 512" fill="currentColor">
            <path fill-rule="evenodd" clip-rule="evenodd" d="M384 416H128V96H384V416ZM320 160H192V352H320V160Z"/>
          </svg>
          <span>OpenCode</span>
        </div>
        
        <div class="opencode-panel-actions">
          {/* Mode toggle */}
          <div class="opencode-mode-toggle">
            <button
              class={`mode-btn ${mode() === 'chat' ? 'active' : ''}`}
              onClick={() => handleModeChange('chat')}
              title="Chat Mode - Friendly chat interface"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
              Chat
            </button>
            <button
              class={`mode-btn ${mode() === 'terminal' ? 'active' : ''}`}
              onClick={() => handleModeChange('terminal')}
              title="Advanced Mode - Full terminal interface"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="4 17 10 11 4 5"></polyline>
                <line x1="12" y1="19" x2="20" y2="19"></line>
              </svg>
              Advanced
            </button>
          </div>
          
          {/* Close button */}
          <button class="opencode-close-btn" onClick={props.onClose} title="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>

      {/* Content area */}
      <div class="opencode-panel-content">
        <Show when={mode() === 'chat'}>
          <OpenCodeChat
            vaultPath={props.vaultPath}
            currentFile={props.currentFile}
          />
        </Show>
        <Show when={mode() === 'terminal'}>
          <OpenCodeTerminal
            vaultPath={props.vaultPath}
          />
        </Show>
      </div>
    </div>
  );
};

export default OpenCodePanel;
