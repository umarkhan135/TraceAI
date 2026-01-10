"""
Data models for TraceAI conversation artifacts.
"""
from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class ToolCall(BaseModel):
    """Represents a tool call in the conversation."""
    name: str
    id: str
    input: Dict[str, Any]


class ConversationMessage(BaseModel):
    """Represents a single message in the conversation."""
    index: int
    role: str  # 'user' or 'assistant'
    content: str
    timestamp: str
    tool_calls: List[ToolCall] = Field(default_factory=list)
    usage: Optional[Dict[str, Any]] = None  # Changed from Dict[str, int] to handle complex usage objects


class CodeMapping(BaseModel):
    """Maps a prompt to specific code changes."""
    file: str
    lines: Optional[List[int]] = None  # [start, end] or None for file-level
    prompt_index: int
    prompt_preview: str  # First 100 chars of prompt
    timestamp: str
    tool: str  # 'Edit', 'Write', etc.
    tool_input: Dict[str, Any]
    confidence: float = 1.0  # 0-1, how confident we are in this mapping


class ConversationStats(BaseModel):
    """Statistics about the conversation."""
    total_messages: int
    total_prompts: int
    files_modified: int
    total_tokens: int
    ai_generated_lines: Optional[int] = None


class ArtifactMetadata(BaseModel):
    """Metadata about the conversation artifact."""
    session_id: str
    pr_number: Optional[int] = None
    repo_path: str
    branch: Optional[str] = None
    start_time: Optional[str] = None  # Made optional to handle conversations without timestamps
    end_time: Optional[str] = None    # Made optional to handle conversations without timestamps
    duration_seconds: Optional[float] = None
    claude_code_version: Optional[str] = None
    gist_url: Optional[str] = None


class ConversationSummary(BaseModel):
    """AI-generated summary of the conversation (stretch goal)."""
    key_decisions: List[str] = Field(default_factory=list)
    files_summary: Dict[str, str] = Field(default_factory=dict)  # file -> description
    overview: Optional[str] = None


class ConversationArtifact(BaseModel):
    """
    Complete conversation artifact for storage and display.
    This is the main structure uploaded to GitHub Gist.
    """
    version: str = "1.0"
    conversation_id: str
    metadata: ArtifactMetadata
    mappings: List[CodeMapping]
    conversation: List[ConversationMessage]
    stats: ConversationStats
    summary: Optional[ConversationSummary] = None

    def to_json_dict(self) -> Dict[str, Any]:
        """Convert to JSON-serializable dict."""
        return self.model_dump(mode='json')

    def to_json_string(self, indent: int = 2) -> str:
        """Convert to formatted JSON string."""
        return self.model_dump_json(indent=indent)


# Raw JSONL entry models (for parsing)

class RawUserMessage(BaseModel):
    """Raw user message from JSONL."""
    type: str = "user"
    uuid: str
    parentUuid: Optional[str] = None
    timestamp: str
    sessionId: str
    cwd: str
    message: Dict[str, Any]


class RawAssistantMessage(BaseModel):
    """Raw assistant message from JSONL."""
    type: str = "assistant"
    uuid: str
    parentUuid: Optional[str] = None
    timestamp: str
    sessionId: str
    message: Dict[str, Any]


class RawToolResult(BaseModel):
    """Raw tool result from JSONL."""
    type: str = "tool_result"
    uuid: str
    parentUuid: Optional[str] = None
    timestamp: str
    sessionId: str
    message: Dict[str, Any]
