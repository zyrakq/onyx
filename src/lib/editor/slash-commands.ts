/**
 * Slash Commands Plugin for Milkdown
 *
 * Provides a command palette triggered by typing `/` at the start of a line
 * or after whitespace. Allows quick insertion of markdown elements.
 *
 * Uses @floating-ui/dom for precise popup positioning near the cursor.
 */

import { $prose } from '@milkdown/utils';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import { TextSelection } from '@milkdown/prose/state';
import { EditorView } from '@milkdown/prose/view';
import { computePosition, flip, offset, shift } from '@floating-ui/dom';
import dayjs from 'dayjs';

// Plugin key
export const slashCommandsPluginKey = new PluginKey('slashCommands');

// Command definition
export interface SlashCommand {
  id: string;
  label: string;
  description: string;
  icon: string;
  keywords: string[];  // Additional search terms
  insert: (view: EditorView, from: number, to: number) => void;
}

// Slash command state
interface SlashCommandState {
  isOpen: boolean;
  triggerPos: number;    // Position where / was typed
  query: string;         // Text typed after /
  selectedIndex: number;
  filteredCommands: SlashCommand[];
}

// Module-level state
let currentState: SlashCommandState = {
  isOpen: false,
  triggerPos: -1,
  query: '',
  selectedIndex: 0,
  filteredCommands: [],
};

let popupElement: HTMLDivElement | null = null;
let keydownHandler: ((e: KeyboardEvent) => void) | null = null;

/**
 * Helper to insert text and position cursor
 */
function insertText(view: EditorView, from: number, to: number, text: string, cursorOffset?: number) {
  const tr = view.state.tr.replaceWith(
    from,
    to,
    view.state.schema.text(text)
  );
  
  // Position cursor
  const newPos = cursorOffset !== undefined ? from + cursorOffset : from + text.length;
  tr.setSelection(TextSelection.near(tr.doc.resolve(newPos)));
  
  view.dispatch(tr);
  view.focus();
}

/**
 * Helper to insert text with a specific cursor position marked by |
 */
function insertWithCursor(view: EditorView, from: number, to: number, template: string) {
  const cursorMarker = '|';
  const cursorPos = template.indexOf(cursorMarker);
  const text = template.replace(cursorMarker, '');
  
  insertText(view, from, to, text, cursorPos !== -1 ? cursorPos : undefined);
}

/**
 * All available slash commands
 */
export const slashCommands: SlashCommand[] = [
  // Headings
  {
    id: 'heading1',
    label: 'Heading 1',
    description: 'Large section heading',
    icon: 'H1',
    keywords: ['h1', 'title', 'header'],
    insert: (view, from, to) => insertWithCursor(view, from, to, '# |'),
  },
  {
    id: 'heading2',
    label: 'Heading 2',
    description: 'Medium section heading',
    icon: 'H2',
    keywords: ['h2', 'subtitle', 'header'],
    insert: (view, from, to) => insertWithCursor(view, from, to, '## |'),
  },
  {
    id: 'heading3',
    label: 'Heading 3',
    description: 'Small section heading',
    icon: 'H3',
    keywords: ['h3', 'header'],
    insert: (view, from, to) => insertWithCursor(view, from, to, '### |'),
  },
  
  // Lists
  {
    id: 'bullet',
    label: 'Bullet List',
    description: 'Create a bulleted list',
    icon: '•',
    keywords: ['ul', 'unordered', 'list', 'bullet'],
    insert: (view, from, to) => insertWithCursor(view, from, to, '- |'),
  },
  {
    id: 'numbered',
    label: 'Numbered List',
    description: 'Create a numbered list',
    icon: '1.',
    keywords: ['ol', 'ordered', 'list', 'number'],
    insert: (view, from, to) => insertWithCursor(view, from, to, '1. |'),
  },
  {
    id: 'todo',
    label: 'Task List',
    description: 'Create a task/checkbox item',
    icon: '☐',
    keywords: ['checkbox', 'task', 'check', 'todo'],
    insert: (view, from, to) => insertWithCursor(view, from, to, '- [ ] |'),
  },
  
  // Blocks
  {
    id: 'quote',
    label: 'Quote',
    description: 'Insert a blockquote',
    icon: '"',
    keywords: ['blockquote', 'citation'],
    insert: (view, from, to) => insertWithCursor(view, from, to, '> |'),
  },
  {
    id: 'code',
    label: 'Code Block',
    description: 'Insert a code block',
    icon: '</>',
    keywords: ['codeblock', 'pre', 'syntax', 'programming'],
    insert: (view, from, to) => insertWithCursor(view, from, to, '```\n|\n```'),
  },
  {
    id: 'divider',
    label: 'Divider',
    description: 'Insert a horizontal line',
    icon: '—',
    keywords: ['hr', 'horizontal', 'line', 'separator', 'rule'],
    insert: (view, from, to) => insertWithCursor(view, from, to, '---\n|'),
  },
  
  // Tables
  {
    id: 'table',
    label: 'Table',
    description: 'Insert a table',
    icon: '▦',
    keywords: ['grid', 'columns', 'rows'],
    insert: (view, from, to) => insertWithCursor(view, from, to, 
      '| Header 1 | Header 2 | Header 3 |\n| --- | --- | --- |\n| | | |\n|'),
  },
  
  // Callouts
  {
    id: 'callout-info',
    label: 'Info Callout',
    description: 'Informational callout box',
    icon: 'ℹ',
    keywords: ['note', 'info', 'information', 'admonition'],
    insert: (view, from, to) => insertWithCursor(view, from, to, '> [!info]\n> |'),
  },
  {
    id: 'callout-tip',
    label: 'Tip Callout',
    description: 'Helpful tip or hint',
    icon: '💡',
    keywords: ['hint', 'tip', 'suggestion', 'admonition'],
    insert: (view, from, to) => insertWithCursor(view, from, to, '> [!tip]\n> |'),
  },
  {
    id: 'callout-warning',
    label: 'Warning Callout',
    description: 'Warning or caution notice',
    icon: '⚠',
    keywords: ['caution', 'warning', 'alert', 'admonition'],
    insert: (view, from, to) => insertWithCursor(view, from, to, '> [!warning]\n> |'),
  },
  {
    id: 'callout-danger',
    label: 'Danger Callout',
    description: 'Important danger notice',
    icon: '🔴',
    keywords: ['error', 'danger', 'critical', 'admonition'],
    insert: (view, from, to) => insertWithCursor(view, from, to, '> [!danger]\n> |'),
  },
  {
    id: 'callout-question',
    label: 'Question Callout',
    description: 'Question or FAQ box',
    icon: '?',
    keywords: ['faq', 'question', 'ask', 'admonition'],
    insert: (view, from, to) => insertWithCursor(view, from, to, '> [!question]\n> |'),
  },
  
  // Date/Time
  {
    id: 'date',
    label: 'Today\'s Date',
    description: 'Insert current date',
    icon: '📅',
    keywords: ['today', 'now', 'current'],
    insert: (view, from, to) => {
      const date = dayjs().format('YYYY-MM-DD');
      insertText(view, from, to, date);
    },
  },
  {
    id: 'time',
    label: 'Current Time',
    description: 'Insert current time',
    icon: '🕐',
    keywords: ['now', 'clock'],
    insert: (view, from, to) => {
      const time = dayjs().format('HH:mm');
      insertText(view, from, to, time);
    },
  },
  {
    id: 'datetime',
    label: 'Date & Time',
    description: 'Insert current date and time',
    icon: '📆',
    keywords: ['now', 'timestamp'],
    insert: (view, from, to) => {
      const datetime = dayjs().format('YYYY-MM-DD HH:mm');
      insertText(view, from, to, datetime);
    },
  },
  
  // Links and media
  {
    id: 'link',
    label: 'Link',
    description: 'Insert a hyperlink',
    icon: '🔗',
    keywords: ['url', 'href', 'hyperlink'],
    insert: (view, from, to) => insertWithCursor(view, from, to, '[|](url)'),
  },
  {
    id: 'image',
    label: 'Image',
    description: 'Insert an image',
    icon: '🖼',
    keywords: ['img', 'picture', 'photo'],
    insert: (view, from, to) => insertWithCursor(view, from, to, '![|](image-url)'),
  },
  {
    id: 'wikilink',
    label: 'Wiki Link',
    description: 'Link to another note',
    icon: '[[',
    keywords: ['internal', 'note', 'reference'],
    insert: (view, from, to) => insertWithCursor(view, from, to, '[[|]]'),
  },
  
  // Text formatting helpers
  {
    id: 'bold',
    label: 'Bold',
    description: 'Bold text',
    icon: 'B',
    keywords: ['strong', 'emphasis'],
    insert: (view, from, to) => insertWithCursor(view, from, to, '**|**'),
  },
  {
    id: 'italic',
    label: 'Italic',
    description: 'Italic text',
    icon: 'I',
    keywords: ['emphasis', 'em'],
    insert: (view, from, to) => insertWithCursor(view, from, to, '*|*'),
  },
  {
    id: 'strikethrough',
    label: 'Strikethrough',
    description: 'Strikethrough text',
    icon: 'S̶',
    keywords: ['strike', 'delete', 'cross'],
    insert: (view, from, to) => insertWithCursor(view, from, to, '~~|~~'),
  },
  {
    id: 'highlight',
    label: 'Highlight',
    description: 'Highlighted text',
    icon: '🖍',
    keywords: ['mark', 'highlight'],
    insert: (view, from, to) => insertWithCursor(view, from, to, '==|=='),
  },
  {
    id: 'inline-code',
    label: 'Inline Code',
    description: 'Inline code snippet',
    icon: '`',
    keywords: ['code', 'monospace'],
    insert: (view, from, to) => insertWithCursor(view, from, to, '`|`'),
  },
];

/**
 * Filter commands by query
 */
function filterCommands(query: string): SlashCommand[] {
  if (!query) return slashCommands;
  
  const lowerQuery = query.toLowerCase();
  return slashCommands.filter(cmd => 
    cmd.label.toLowerCase().includes(lowerQuery) ||
    cmd.id.toLowerCase().includes(lowerQuery) ||
    cmd.description.toLowerCase().includes(lowerQuery) ||
    cmd.keywords.some(kw => kw.toLowerCase().includes(lowerQuery))
  );
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Create the popup element
 */
function createPopup(): HTMLDivElement {
  if (popupElement) return popupElement;

  popupElement = document.createElement('div');
  popupElement.className = 'slash-command-popup';
  popupElement.style.display = 'none';
  popupElement.style.position = 'fixed';
  popupElement.style.zIndex = '1000';
  document.body.appendChild(popupElement);

  return popupElement;
}

/**
 * Update popup content and position
 */
async function updatePopup(view: EditorView) {
  if (!popupElement) createPopup();
  if (!popupElement) return;

  if (!currentState.isOpen || currentState.filteredCommands.length === 0) {
    popupElement.style.display = 'none';
    return;
  }

  // Render commands
  popupElement.innerHTML = `
    <div class="slash-command-header">Commands</div>
    <div class="slash-command-list">
      ${currentState.filteredCommands.map((cmd, index) => `
        <div class="slash-command-option ${index === currentState.selectedIndex ? 'selected' : ''}" data-index="${index}">
          <span class="slash-command-icon">${escapeHtml(cmd.icon)}</span>
          <div class="slash-command-content">
            <span class="slash-command-label">${escapeHtml(cmd.label)}</span>
            <span class="slash-command-description">${escapeHtml(cmd.description)}</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  // Add click handlers
  popupElement.querySelectorAll('.slash-command-option').forEach((el) => {
    el.addEventListener('click', () => {
      const index = parseInt((el as HTMLElement).dataset.index || '0');
      currentState.selectedIndex = index;
      executeSelectedCommand(view);
    });
  });

  popupElement.style.display = 'block';

  // Position using floating-ui
  try {
    const coords = view.coordsAtPos(currentState.triggerPos);
    const virtualEl = {
      getBoundingClientRect: () => ({
        x: coords.left,
        y: coords.top,
        top: coords.top,
        left: coords.left,
        bottom: coords.bottom,
        right: coords.left + 1,
        width: 1,
        height: coords.bottom - coords.top,
      }),
    };

    const { x, y } = await computePosition(virtualEl as Element, popupElement, {
      placement: 'bottom-start',
      middleware: [offset(4), flip(), shift({ padding: 8 })],
    });

    popupElement.style.left = `${x}px`;
    popupElement.style.top = `${y}px`;
  } catch (err) {
    console.error('Failed to position slash command popup:', err);
  }

  // Scroll selected item into view
  const selectedEl = popupElement.querySelector('.slash-command-option.selected');
  if (selectedEl) {
    selectedEl.scrollIntoView({ block: 'nearest' });
  }
}

/**
 * Execute the selected command
 */
function executeSelectedCommand(view: EditorView) {
  const cmd = currentState.filteredCommands[currentState.selectedIndex];
  if (!cmd) return;

  const { state } = view;
  const from = currentState.triggerPos;
  const to = state.selection.from;

  // Close before executing to prevent re-triggering
  closeSlashCommands();

  // Execute the command's insert function
  cmd.insert(view, from, to);
}

/**
 * Close the slash commands popup
 */
function closeSlashCommands() {
  currentState = {
    isOpen: false,
    triggerPos: -1,
    query: '',
    selectedIndex: 0,
    filteredCommands: [],
  };

  if (popupElement) {
    popupElement.style.display = 'none';
  }
}

/**
 * Set up keyboard navigation
 */
function setupKeyboardHandler(view: EditorView) {
  if (keydownHandler) {
    window.removeEventListener('keydown', keydownHandler, true);
  }

  keydownHandler = (e: KeyboardEvent) => {
    if (!currentState.isOpen) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      currentState.selectedIndex = Math.min(
        currentState.selectedIndex + 1,
        currentState.filteredCommands.length - 1
      );
      updatePopup(view);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      currentState.selectedIndex = Math.max(currentState.selectedIndex - 1, 0);
      updatePopup(view);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (currentState.filteredCommands.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        executeSelectedCommand(view);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeSlashCommands();
    }
  };

  window.addEventListener('keydown', keydownHandler, true);
}

/**
 * Check for slash command trigger
 */
function checkForTrigger(view: EditorView) {
  const { state } = view;
  const { selection } = state;

  // Only trigger on cursor (no selection)
  if (!selection.empty) {
    closeSlashCommands();
    return;
  }

  const pos = selection.from;
  const $pos = state.doc.resolve(pos);
  const textBefore = $pos.parent.textBetween(0, $pos.parentOffset, '\n', '\n');

  // Check for / at start of line or after whitespace
  // Pattern: start of line + / + optional query
  // Or: whitespace + / + optional query
  const match = textBefore.match(/(?:^|[\s])\/([a-zA-Z0-9-]*)$/);

  if (!match) {
    if (currentState.isOpen) {
      closeSlashCommands();
    }
    return;
  }

  const query = match[1];
  const slashIndex = textBefore.lastIndexOf('/');
  const absoluteTriggerPos = pos - textBefore.length + slashIndex;

  // Update state
  currentState.isOpen = true;
  currentState.triggerPos = absoluteTriggerPos;
  currentState.query = query;
  currentState.filteredCommands = filterCommands(query);
  currentState.selectedIndex = 0;

  // Update popup
  updatePopup(view);

  // Ensure keyboard handler is set up
  setupKeyboardHandler(view);
}

/**
 * Debounced version of checkForTrigger
 */
let checkTimeout: number | null = null;
function debouncedCheck(view: EditorView) {
  if (checkTimeout) {
    clearTimeout(checkTimeout);
  }
  checkTimeout = window.setTimeout(() => {
    checkForTrigger(view);
  }, 50);
}

/**
 * ProseMirror plugin for slash commands
 */
export const slashCommandsPlugin = $prose(() => {
  return new Plugin({
    key: slashCommandsPluginKey,

    view(_editorView) {
      createPopup();

      return {
        update(view, prevState) {
          // Check for trigger on every update
          if (view.state.selection !== prevState.selection || view.state.doc !== prevState.doc) {
            debouncedCheck(view);
          }
        },
        destroy() {
          closeSlashCommands();
          if (keydownHandler) {
            window.removeEventListener('keydown', keydownHandler, true);
            keydownHandler = null;
          }
          if (popupElement) {
            popupElement.remove();
            popupElement = null;
          }
        },
      };
    },
  });
});
