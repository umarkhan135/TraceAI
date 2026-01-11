export interface ConversationArtifact {
  version: string;
  conversation_id: string;
  metadata: ArtifactMetadata;
  mappings: CodeMapping[];
  conversation: ConversationMessage[];
  stats: ConversationStats;
  summary?: ConversationSummary | null;
}

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

export interface CodeMapping {
  file: string;
  lines: [number, number] | null;
  prompt_index: number;
  prompt_preview: string;
  timestamp: string;
  tool: string;
  tool_input: ToolInput;
  confidence: number;
}

export interface ToolInput {
  file_path: string;
  content?: string;
  old_string?: string;
  new_string?: string;
  [key: string]: unknown;
}

export interface ConversationMessage {
  index: number;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  tool_calls: ToolCall[];
  usage: TokenUsage | null;
}

export interface ToolCall {
  name: string;
  id: string;
  input: Record<string, unknown>;
}

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

export interface ConversationStats {
  total_messages: number;
  total_prompts: number;
  files_modified: number;
  total_tokens: number;
  ai_generated_lines: number | null;
}

export interface ConversationSummary {
  key_decisions: string[];
  files_summary: Record<string, string>;
  overview: string | null;
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

export interface TraceAIConfig {
  enableHover: boolean;
  cacheExpiration: number;
  showGutterIcons: boolean;
  showFileStats: boolean;
}
