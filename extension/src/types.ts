/**
 * ============================================================================
 * TRACEAI TYPE DEFINITIONS
 * ============================================================================
 *
 * These types match the artifact format produced by the Python pipeline.
 * See: demo/.traceai/newArtifactFormat.json for the reference format.
 *
 * IMPORTANT: Keep these types in sync with pipeline/traceai/models.py
 */

/**
 * Complete conversation artifact - the main structure from GitHub Gist
 */
export interface ConversationArtifact {
  version: string;
  conversation_id: string;
  metadata: ArtifactMetadata;
  mappings: CodeMapping[];
  conversation: ConversationMessage[];
  stats: ConversationStats;
  summary?: ConversationSummary | null;
}

/**
 * Metadata about the conversation session
 */
export interface ArtifactMetadata {
  session_id: string;
  pr_number: number | null;
  repo_path: string;
  branch: string | null;
  start_time: string | null;
  end_time: string;
  duration_seconds: number | null;
  claude_code_version: string | null;
  gist_url: string | null;
}

/**
 * Maps a prompt to specific code changes
 */
export interface CodeMapping {
  file: string;
  lines: [number, number] | null;  // [start, end] or null for file-level
  prompt_index: number;
  prompt_preview: string;
  timestamp: string;
  tool: string;  // 'Edit', 'Write', etc.
  tool_input: ToolInput;
  confidence: number;
}

/**
 * Tool input parameters (varies by tool type)
 */
export interface ToolInput {
  file_path: string;
  content?: string;       // For Write tool
  old_string?: string;    // For Edit tool
  new_string?: string;    // For Edit tool
  [key: string]: unknown; // Allow other tool-specific params
}

/**
 * A single message in the conversation
 */
export interface ConversationMessage {
  index: number;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  tool_calls: ToolCall[];
  usage: TokenUsage | null;
}

/**
 * Tool call within an assistant message
 */
export interface ToolCall {
  name: string;
  id: string;
  input: Record<string, unknown>;
}

/**
 * Token usage statistics
 */
export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation?: {
    ephemeral_5m_input_tokens: number;
    ephemeral_1h_input_tokens: number;
  };
  service_tier?: string;
}

/**
 * Statistics about the conversation
 */
export interface ConversationStats {
  total_messages: number;
  total_prompts: number;
  files_modified: number;
  total_tokens: number;
  ai_generated_lines: number | null;
}

/**
 * AI-generated summary of the conversation (optional)
 */
export interface ConversationSummary {
  key_decisions: string[];
  files_summary: Record<string, string>;
  overview: string | null;
}

/**
 * Git repository information
 */
export interface GitInfo {
  repo: string;
  branch: string;
  commit: string;
  remoteUrl: string;
}

/**
 * Cache entry wrapper with expiration
 */
export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

/**
 * Extension configuration from VSCode settings
 */
export interface TraceAIConfig {
  githubToken: string;
  enableHover: boolean;
  cacheExpiration: number;
  showGutterIcons: boolean;
  showFileStats: boolean;
}

/**
 * Configuration file stored in .traceai/config.json
 * Matches the TraceAIConfig model from pipeline/traceai/models.py
 */
export interface LocalArtifactConfig {
  artifact_files: string[];  // List of artifact JSON filenames
  pr_number?: number | null;
  branch?: string | null;
  last_updated: string;
}
