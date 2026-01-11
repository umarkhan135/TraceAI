/**
 * TraceAI Data Models
 * Enhanced TypeScript models with versioning and migration support
 */

export interface ToolCall {
  name: string;
  id: string;
  input: Record<string, any>;
}

export interface ConversationMessage {
  index: number;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  tool_calls?: ToolCall[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_tokens?: number;
    cache_creation_tokens?: number;
  };
}

export interface CodeMapping {
  file: string;
  lines?: [number, number] | null;
  prompt_index: number;
  prompt_preview: string;
  timestamp: string;
  tool: 'Edit' | 'Write';
  tool_input: Record<string, any>;
  confidence: number;
  git_commits?: Array<{
    sha: string;
    time: string;
    message: string;
    time_diff_seconds: number;
  }>;
}

export interface ConversationStats {
  total_messages: number;
  total_prompts: number;
  files_modified: number;
  total_tokens: number;
  total_lines_changed?: number;
}

export interface ArtifactMetadata {
  version: string; // Artifact format version (e.g., "2.0.0")
  session_id: string;
  session_ids?: string[]; // Multiple sessions merged
  pr_number?: number;
  repo_path: string;
  repo_name?: string;
  branch?: string;
  start_time: string;
  end_time: string;
  duration_seconds?: number;
  gist_url?: string;
  gist_id?: string;
  created_at: string; // When artifact was created
  updated_at?: string; // When artifact was last updated
}

export interface ConversationArtifact {
  conversation_id: string;
  metadata: ArtifactMetadata;
  mappings: CodeMapping[];
  conversation: ConversationMessage[];
  stats: ConversationStats;
  summary?: string;
}

/**
 * New enhanced config format with versioning
 */
export interface TraceAIConfig {
  version: string; // Config format version (e.g., "2.0.0")
  gist_id: string;
  gist_url: string;
  branch?: string;
  pr_number?: number;
  session_ids: string[];
  last_updated: string;
  artifact_version: string; // Version of artifact in gist
  metadata?: {
    repo_name?: string;
    total_sessions?: number;
    files_modified?: number;
  };
}

/**
 * Legacy config format (from Python implementation)
 */
export interface LegacyTraceAIConfig {
  gist_id: string;
  gist_url: string;
  branch?: string;
  pr_number?: number;
  session_id: string;
  last_updated: string;
}

/**
 * Claude Code conversation entry from JSONL
 */
export interface ClaudeConversationEntry {
  type: 'user' | 'assistant';
  timestamp: string;
  sessionId: string;
  message: {
    content: string | any[];
    role?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_tokens?: number;
      cache_creation_tokens?: number;
    };
  };
}

/**
 * Conversation metadata extracted from JSONL
 */
export interface ConversationMetadata {
  session_id: string;
  start_time: string;
  end_time: string;
  total_messages: number;
  user_messages: number;
  assistant_messages: number;
}

/**
 * File info for tracking conversations
 */
export interface ConversationFileInfo {
  session_id: string;
  path: string;
  modified_time: string;
  size_bytes: number;
}

/**
 * Git repository information
 */
export interface GitRepoInfo {
  path: string;
  branch: string;
  remote?: string;
  fullName?: string; // e.g., "owner/repo"
}

/**
 * Unpushed commit information
 */
export interface GitCommit {
  sha: string;
  message: string;
  author: string;
  timestamp: string;
  files: string[];
}

/**
 * Processing result
 */
export interface ProcessingResult {
  success: boolean;
  artifact?: ConversationArtifact;
  gist_url?: string;
  gist_id?: string;
  error?: string;
  warnings?: string[];
  sessions_processed: number;
  files_modified: number;
}

/**
 * Hook installation result
 */
export interface HookInstallResult {
  success: boolean;
  hook_path?: string;
  already_installed?: boolean;
  error?: string;
}
