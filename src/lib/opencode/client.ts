/**
 * OpenCode Client Wrapper
 * 
 * Provides a simplified interface to the OpenCode SDK for the chat UI.
 */

import { createOpencodeClient, type OpencodeClient } from '@opencode-ai/sdk/client';

// Server configuration
const DEFAULT_PORT = 4096;
const DEFAULT_HOST = 'http://127.0.0.1';

let client: OpencodeClient | null = null;
let serverUrl: string | null = null;

/**
 * Initialize the OpenCode client
 */
export function initClient(port: number = DEFAULT_PORT): OpencodeClient {
  serverUrl = `${DEFAULT_HOST}:${port}`;
  client = createOpencodeClient({
    baseUrl: serverUrl,
  });
  return client;
}

/**
 * Get the current client instance
 */
export function getClient(): OpencodeClient | null {
  return client;
}

/**
 * Check if the OpenCode server is running
 */
export async function isServerRunning(): Promise<boolean> {
  if (!client) {
    initClient();
  }
  
  try {
    const response = await client!.config.get();
    return response.response.ok;
  } catch {
    return false;
  }
}

/**
 * Get the server URL
 */
export function getServerUrl(): string | null {
  return serverUrl;
}

/**
 * Message part types from OpenCode
 */
export interface TextPart {
  type: 'text';
  text: string;
}

export interface ToolCallPart {
  type: 'tool-call';
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
}

export interface ToolResultPart {
  type: 'tool-result';
  toolCallId: string;
  toolName: string;
  result: unknown;
}

export type MessagePart = TextPart | ToolCallPart | ToolResultPart;

/**
 * Chat message structure for the UI
 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  parts: MessagePart[];
  timestamp: number;
  isStreaming?: boolean;
}

/**
 * Session info
 */
export interface SessionInfo {
  id: string;
  title?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Create a new chat session
 */
export async function createSession(title?: string): Promise<SessionInfo> {
  if (!client) {
    initClient();
  }
  
  const response = await client!.session.create({
    body: { title },
  });
  
  if (!response.data) {
    throw new Error('Failed to create session');
  }
  
  return {
    id: response.data.id,
    title: response.data.title,
    createdAt: response.data.time?.created ? new Date(response.data.time.created).getTime() : Date.now(),
    updatedAt: response.data.time?.updated ? new Date(response.data.time.updated).getTime() : Date.now(),
  };
}

/**
 * List all sessions
 */
export async function listSessions(): Promise<SessionInfo[]> {
  if (!client) {
    initClient();
  }
  
  const response = await client!.session.list();
  
  if (!response.data) {
    return [];
  }
  
  return response.data.map((s) => ({
    id: s.id,
    title: s.title,
    createdAt: s.time?.created ? new Date(s.time.created).getTime() : Date.now(),
    updatedAt: s.time?.updated ? new Date(s.time.updated).getTime() : Date.now(),
  }));
}

/**
 * Get messages for a session
 */
export async function getSessionMessages(sessionId: string): Promise<ChatMessage[]> {
  if (!client) {
    initClient();
  }
  
  const response = await client!.session.messages({
    path: { id: sessionId },
  });
  
  if (!response.data) {
    return [];
  }
  
  // The SDK returns messages with info wrapper
  const messages = response.data as unknown as Array<{
    info?: { id: string; role: string; time?: { created?: string } };
    parts?: unknown[];
  }>;
  
  return messages.map((msg) => ({
    id: msg.info?.id || crypto.randomUUID(),
    role: (msg.info?.role || 'assistant') as 'user' | 'assistant',
    parts: (msg.parts || []).map(parsePart),
    timestamp: msg.info?.time?.created ? new Date(msg.info.time.created).getTime() : Date.now(),
  }));
}

/**
 * Parse a message part from the API response
 */
function parsePart(part: unknown): MessagePart {
  const p = part as Record<string, unknown>;
  
  if (p.type === 'text') {
    return { type: 'text', text: p.text as string };
  }
  
  if (p.type === 'tool-call') {
    return {
      type: 'tool-call',
      toolCallId: p.toolCallId as string,
      toolName: p.toolName as string,
      args: p.args as Record<string, unknown>,
    };
  }
  
  if (p.type === 'tool-result') {
    return {
      type: 'tool-result',
      toolCallId: p.toolCallId as string,
      toolName: p.toolName as string,
      result: p.result,
    };
  }
  
  // Default to text
  return { type: 'text', text: String(p.text || p.content || '') };
}

/**
 * Send a prompt to a session (non-streaming)
 */
export async function sendPrompt(
  sessionId: string,
  text: string
): Promise<ChatMessage> {
  if (!client) {
    initClient();
  }
  
  const response = await client!.session.prompt({
    path: { id: sessionId },
    body: {
      parts: [{ type: 'text', text }],
    },
  });
  
  if (!response.data) {
    throw new Error('Failed to send prompt');
  }
  
  const msg = response.data as { info?: { id?: string }; parts?: unknown[] };
  return {
    id: msg.info?.id || crypto.randomUUID(),
    role: 'assistant',
    parts: (msg.parts || []).map(parsePart),
    timestamp: Date.now(),
  };
}

/**
 * Send a prompt asynchronously (for streaming)
 * Returns immediately, subscribe to events for updates
 */
export async function sendPromptAsync(
  sessionId: string,
  text: string
): Promise<void> {
  if (!client) {
    initClient();
  }
  
  await client!.session.promptAsync({
    path: { id: sessionId },
    body: {
      parts: [{ type: 'text', text }],
    },
  });
}

/**
 * Subscribe to server-sent events for real-time updates
 */
export async function subscribeToEvents(
  onEvent: (event: { type: string; properties: Record<string, unknown> }) => void,
  onError?: (error: Error) => void
): Promise<() => void> {
  if (!client) {
    initClient();
  }
  
  try {
    const eventStream = await client!.event.subscribe();
    
    // Process events asynchronously
    (async () => {
      try {
        for await (const event of eventStream.stream) {
          onEvent(event as { type: string; properties: Record<string, unknown> });
        }
      } catch (err) {
        onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    })();
    
    // Return cleanup function
    return () => {
      // The stream will close when iteration stops
    };
  } catch (err) {
    onError?.(err instanceof Error ? err : new Error(String(err)));
    return () => {};
  }
}

/**
 * Abort the current operation in a session
 */
export async function abortSession(sessionId: string): Promise<void> {
  if (!client) {
    initClient();
  }
  
  await client!.session.abort({
    path: { id: sessionId },
  });
}

/**
 * Delete a session
 */
export async function deleteSession(sessionId: string): Promise<void> {
  if (!client) {
    initClient();
  }
  
  await client!.session.delete({
    path: { id: sessionId },
  });
}

/**
 * Get session status (idle, busy, etc.)
 */
export async function getSessionStatus(_sessionId: string): Promise<string> {
  // TODO: Fix SDK typing issue - for now we'll track status via events
  return 'idle';
}
