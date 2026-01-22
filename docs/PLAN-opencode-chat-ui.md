# Plan: OpenCode Chat UI Integration

## Current State

Onyx currently integrates OpenCode via a **PTY (pseudo-terminal)** that spawns `opencode` as a subprocess and displays its TUI in an xterm.js terminal. This works but has limitations:

- Terminal UI is not very user-friendly for non-developers
- No native integration with Onyx's UI/styling
- Can't access message history programmatically
- Can't customize the experience (e.g., inject context about current file)

## Goal

Replace the terminal-based OpenCode integration with a **native chat UI** that:
1. Looks like a modern chat interface (similar to ChatGPT, Claude)
2. Integrates visually with Onyx's design system
3. Can programmatically send context (current file, vault info)
4. Supports streaming responses
5. Shows tool usage and file edits in a nice way

## OpenCode Integration Options

### Option A: HTTP API + SDK (Recommended)

**Architecture:**
```
┌─────────────────────────────────────────────────────────┐
│                        Onyx App                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │              Chat UI Component                   │    │
│  │  - Message bubbles (user/assistant)             │    │
│  │  - Streaming text display                       │    │
│  │  - File edit previews                           │    │
│  │  - Tool execution indicators                    │    │
│  └─────────────────────────────────────────────────┘    │
│                          │                               │
│                          ▼                               │
│  ┌─────────────────────────────────────────────────┐    │
│  │         OpenCode Client (SDK wrapper)            │    │
│  │  - @opencode-ai/sdk                              │    │
│  │  - Session management                            │    │
│  │  - SSE event streaming                           │    │
│  └─────────────────────────────────────────────────┘    │
│                          │                               │
└──────────────────────────┼───────────────────────────────┘
                           │ HTTP + SSE
                           ▼
              ┌────────────────────────┐
              │   OpenCode Server      │
              │   (Background Process) │
              │   opencode serve       │
              │   --port 4096          │
              └────────────────────────┘
```

**How it works:**
1. On app start (or first use), spawn `opencode serve --port 4096` as a background process via Tauri
2. Use `@opencode-ai/sdk` in the frontend to communicate with the server
3. Create sessions, send prompts, receive streaming responses via SSE
4. Display messages in a custom chat UI

**Pros:**
- Full control over UI/UX
- Access to all OpenCode features via typed SDK
- Real-time streaming via SSE
- Can inject context (current file content, vault structure)
- Session persistence

**Cons:**
- Need to manage OpenCode server lifecycle
- More complex implementation
- Need to handle server startup/shutdown

### Option B: ACP Protocol (stdin/stdout JSON-RPC)

**Architecture:**
```
┌─────────────────────────────────────────────────────────┐
│                        Onyx App                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │              Chat UI Component                   │    │
│  └─────────────────────────────────────────────────┘    │
│                          │                               │
│                          ▼                               │
│  ┌─────────────────────────────────────────────────┐    │
│  │         Tauri Backend (Rust)                     │    │
│  │  - Spawn opencode acp                            │    │
│  │  - JSON-RPC over stdin/stdout                    │    │
│  │  - Bridge to frontend via events                 │    │
│  └─────────────────────────────────────────────────┘    │
│                          │                               │
└──────────────────────────┼───────────────────────────────┘
                           │ stdin/stdout
                           ▼
              ┌────────────────────────┐
              │   opencode acp         │
              │   (JSON-RPC process)   │
              └────────────────────────┘
```

**How it works:**
1. Spawn `opencode acp` as a child process
2. Send JSON-RPC messages via stdin
3. Receive responses via stdout (newline-delimited JSON)
4. Bridge to frontend via Tauri events

**Pros:**
- Simpler server management (no port allocation)
- Used by IDE integrations (proven approach)

**Cons:**
- Less documentation available for ACP protocol
- More Rust code needed to handle stdin/stdout parsing
- May have less features than HTTP API

### Option C: Hybrid (Launch TUI in Background, Use API)

**How it works:**
1. Start `opencode` normally (with TUI) but hidden/minimized
2. Use the API to connect to its built-in server
3. This gives you the full OpenCode experience "backing" your chat UI

**Pros:**
- OpenCode handles all its own state
- Could optionally show TUI for power users

**Cons:**
- Wasteful (running TUI nobody sees)
- Complex window management

## Recommended Approach: Option A (HTTP API + SDK)

### Implementation Plan

#### Phase 1: Backend Setup
1. **Tauri command to start OpenCode server**
   ```rust
   #[tauri::command]
   async fn start_opencode_server(port: u16) -> Result<(), String>
   
   #[tauri::command]
   async fn stop_opencode_server() -> Result<(), String>
   
   #[tauri::command]
   async fn get_opencode_status() -> Result<OpenCodeStatus, String>
   ```

2. **Auto-start on app launch** (optional, could be lazy)
3. **Health check endpoint** to verify server is running

#### Phase 2: SDK Integration
1. **Install SDK**
   ```bash
   npm install @opencode-ai/sdk
   ```

2. **Create OpenCode service wrapper**
   ```typescript
   // src/lib/opencode/client.ts
   import { createOpencodeClient } from '@opencode-ai/sdk'
   
   let client: OpencodeClient | null = null
   
   export async function getOpenCodeClient() {
     if (!client) {
       client = createOpencodeClient({ baseUrl: 'http://localhost:4096' })
     }
     return client
   }
   
   export async function createSession(title?: string) { ... }
   export async function sendPrompt(sessionId: string, text: string) { ... }
   export async function subscribeToEvents(sessionId: string) { ... }
   ```

#### Phase 3: Chat UI Component
1. **Message types**
   ```typescript
   interface ChatMessage {
     id: string
     role: 'user' | 'assistant'
     content: string
     parts: Part[]  // For tool calls, file edits, etc.
     timestamp: number
     isStreaming?: boolean
   }
   ```

2. **Component structure**
   ```
   OpenCodeChat/
   ├── OpenCodeChat.tsx       # Main container
   ├── ChatMessage.tsx        # Individual message bubble
   ├── ChatInput.tsx          # Input field with send button
   ├── ToolCallDisplay.tsx    # Shows tool executions
   ├── FileEditPreview.tsx    # Shows file changes
   └── StreamingIndicator.tsx # Typing indicator
   ```

3. **Key features**
   - Markdown rendering in messages
   - Syntax highlighting for code blocks
   - Collapsible tool call details
   - File diff view for edits
   - "Apply changes" / "Reject changes" buttons
   - Session history in sidebar

#### Phase 4: Context Integration
1. **Auto-inject current file context**
   ```typescript
   const prompt = `
   I'm working on: ${currentFile.path}
   
   Current content:
   \`\`\`${currentFile.language}
   ${currentFile.content}
   \`\`\`
   
   User request: ${userMessage}
   `
   ```

2. **Vault awareness**
   - Pass vault path to OpenCode config
   - Show relevant files in UI

#### Phase 5: Polish
1. **Keyboard shortcuts**
   - `Cmd/Ctrl+Enter` to send
   - `Escape` to cancel streaming
   - Arrow keys for history

2. **Session management**
   - List past sessions
   - Continue previous conversations
   - Delete sessions

3. **Settings**
   - Model selection
   - Temperature/creativity slider
   - Context window size

## UI Mockup

```
┌─────────────────────────────────────────────────────────────────┐
│  OpenCode Assistant                              [−] [□] [×]    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 👤 User                                      10:30 AM   │   │
│  │ Can you add a function to validate email addresses?     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 🤖 Assistant                                 10:30 AM   │   │
│  │ I'll add an email validation function to your file.     │   │
│  │                                                         │   │
│  │ ┌─────────────────────────────────────────────────────┐ │   │
│  │ │ 📝 Editing: src/utils/validation.ts                 │ │   │
│  │ │ + export function isValidEmail(email: string) {     │ │   │
│  │ │ +   const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/     │ │   │
│  │ │ +   return regex.test(email)                        │ │   │
│  │ │ + }                                                 │ │   │
│  │ │                                                     │ │   │
│  │ │ [✓ Apply] [✗ Reject] [View Full Diff]              │ │   │
│  │ └─────────────────────────────────────────────────────┘ │   │
│  │                                                         │   │
│  │ I've added the `isValidEmail` function. Would you like  │   │
│  │ me to add unit tests for it as well?                    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 👤 User                                      10:31 AM   │   │
│  │ Yes, please add tests                                   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 🤖 Assistant                                            │   │
│  │ ▋ Creating test file...                                 │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Ask OpenCode anything...                           [Send ➤] │ │
│ └─────────────────────────────────────────────────────────────┘ │
│ 📎 Attach file   🔧 Current file: validation.ts                 │
└─────────────────────────────────────────────────────────────────┘
```

## Considerations

### Server Lifecycle
- Start server on first chat open (lazy) vs app start (eager)
- Handle server crashes gracefully (auto-restart)
- Clean shutdown on app close
- Port conflict handling (find available port)

### Performance
- Lazy load chat component (code splitting)
- Virtualize message list for long conversations
- Debounce file context updates

### Security
- Server only listens on localhost
- Could add password auth if needed
- Sanitize any HTML in responses

### Offline Support
- Show clear error when server unavailable
- Cache recent messages locally
- Queue prompts for retry

## Files to Create/Modify

### New Files
```
src/
├── components/
│   └── OpenCodeChat/
│       ├── OpenCodeChat.tsx
│       ├── ChatMessage.tsx
│       ├── ChatInput.tsx
│       ├── ToolCallDisplay.tsx
│       ├── FileEditPreview.tsx
│       └── index.ts
├── lib/
│   └── opencode/
│       ├── client.ts
│       ├── types.ts
│       └── index.ts
└── styles/
    └── opencode-chat.css

src-tauri/
└── src/
    └── opencode.rs  # Server management commands
```

### Modified Files
```
src/App.tsx           # Add chat panel, remove terminal
src/styles.css        # Remove terminal styles, add chat styles
src-tauri/src/lib.rs  # Add opencode commands
package.json          # Add @opencode-ai/sdk
```

## UI Mode Toggle

Users can switch between two modes:

### Chat Mode (Default)
- Friendly chat interface
- Best for most users
- Cleaner display of tool outputs and file edits

### Advanced Mode (Terminal)
- Full OpenCode TUI in terminal
- For power users who prefer the terminal experience
- Access to all OpenCode keyboard shortcuts and features

**Toggle location:** Button in the chat header or Settings > OpenCode

**Persistence:** Save preference in localStorage (`opencode_mode: 'chat' | 'terminal'`)

```
┌─────────────────────────────────────────────────────────────┐
│  OpenCode                    [Chat ▾] [Advanced]  [−] [×]   │
├─────────────────────────────────────────────────────────────┤
```

When user clicks "Advanced", switch to terminal view. When they click "Chat", switch back.

## Open Questions

1. Should chat be a panel (like current terminal) or a modal?
2. Should we show tool calls inline or in a collapsible section?
3. How to handle file permissions (approve each edit vs auto-apply)?
4. Should we persist chat history across app restarts?
5. Multiple simultaneous sessions or one at a time?

## Timeline Estimate

- Phase 1 (Backend): 1-2 days
- Phase 2 (SDK Integration): 1 day
- Phase 3 (Chat UI): 3-4 days
- Phase 4 (Context Integration): 1-2 days
- Phase 5 (Polish): 2-3 days

**Total: ~2 weeks**
