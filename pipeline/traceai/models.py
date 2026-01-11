"""
Pydantic models for TraceAI conversation artifacts.

These models define the JSON schema for storing and transmitting
conversation data, ensuring type safety and validation.

Data models for TraceAI conversation artifacts.
"""

from typing import Any, Dict, List, Optional, Union
from pydantic import BaseModel, Field


class ToolCall(BaseModel):
    """Represents a single tool call made by the assistant."""

    name: str = Field(..., description="Tool name (e.g., 'Edit', 'Write', 'Bash')")
    id: str = Field(..., description="Unique tool call ID")
    input: Dict[str, Any] = Field(..., description="Tool input parameters")


class ConversationMessage(BaseModel):
    """A single message in the conversation history."""

    index: int = Field(..., description="Message index in conversation")
    role: str = Field(..., description="Message role: 'user' or 'assistant'")
    content: str = Field(..., description="Message content (text)")
    timestamp: str = Field(..., description="ISO 8601 timestamp")
    tool_calls: List[ToolCall] = Field(
        default_factory=list,
        description="Tool calls (for assistant messages only)"
    )
    usage: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Token usage stats (for assistant messages only)"
    )


class PromptCodeMapping(BaseModel):
    """Maps a user prompt to specific code changes."""

    file: str = Field(..., description="Absolute or repo-relative file path")
    lines: Optional[List[int]] = Field(
        default=None,
        description="Line range [start, end] affected by this change"
    )
    prompt_index: int = Field(..., description="Index of prompt in conversation array")
    prompt_preview: str = Field(..., description="Short preview of the prompt (first 100 chars)")
    timestamp: str = Field(..., description="When the change was made")
    tool: str = Field(..., description="Tool used: 'Edit', 'Write', etc.")
    tool_input: Dict[str, Any] = Field(
        ...,
        description="Tool input (includes old_string/new_string for Edit, content for Write)"
    )
    confidence: float = Field(
        default=0.9,
        ge=0.0,
        le=1.0,
        description="Mapping confidence score (0.0-1.0)"
    )


class CodeMapping(PromptCodeMapping):
    """Maps a prompt to specific code changes (compatibility alias)."""

    confidence: float = Field(
        default=1.0,
        ge=0.0,
        le=1.0,
        description="Mapping confidence score (0.0-1.0)"
    )


class ArtifactMetadata(BaseModel):
    """Metadata about the conversation artifact."""

    session_id: str = Field(..., description="Claude Code session UUID")
    pr_number: Optional[int] = Field(default=None, description="Associated PR number")
    repo_path: str = Field(..., description="Absolute path to git repository")
    branch: Optional[str] = Field(default=None, description="Git branch name")
    start_time: Optional[str] = Field(default=None, description="Conversation start timestamp")
    end_time: Optional[str] = Field(
        default=None,
        description="Conversation end timestamp"
    )
    duration_seconds: Optional[float] = Field(
        default=None,
        description="Total conversation duration in seconds"
    )
    claude_code_version: Optional[str] = Field(
        default=None,
        description="Version of Claude Code used"
    )


class ArtifactStats(BaseModel):
    """Summary statistics about the conversation."""

    total_messages: int = Field(..., description="Total messages in conversation")
    total_prompts: int = Field(..., description="Number of user prompts")
    files_modified: int = Field(..., description="Number of unique files modified")
    total_tokens: int = Field(default=0, description="Total tokens used (input + output)")
    ai_generated_lines: Optional[int] = Field(
        default=None,
        description="Estimated number of AI-generated lines of code"
    )


class ConversationStats(ArtifactStats):
    """Statistics about the conversation (compatibility alias)."""
    pass


class ConversationSummary(BaseModel):
    """AI-generated summary of the conversation (stretch goal)."""

    key_decisions: List[str] = Field(default_factory=list)
    files_summary: Dict[str, str] = Field(default_factory=dict)  # file -> description
    overview: Optional[str] = None


class ConversationArtifact(BaseModel):
    """
    Complete conversation artifact for TraceAI.

    This is the main data structure that gets uploaded to GitHub Gist
    and consumed by the VSCode extension.
    """

    version: str = Field(
        default="1.0",
        description="Artifact schema version"
    )
    conversation_id: str = Field(
        ...,
        description="Unique identifier (format: 'traceai-{session-id}')"
    )
    metadata: ArtifactMetadata = Field(..., description="Conversation metadata")
    mappings: List[PromptCodeMapping] = Field(
        default_factory=list,
        description="Prompt-to-code mappings"
    )
    conversation: List[ConversationMessage] = Field(
        default_factory=list,
        description="Full conversation history"
    )
    stats: ArtifactStats = Field(..., description="Summary statistics")
    summary: Optional[Union[ConversationSummary, Dict[str, Any]]] = Field(
        default=None,
        description="Optional AI-generated summary"
    )

    class Config:
        """Pydantic configuration."""
        json_schema_extra = {
            "example": {
                "version": "1.0",
                "conversation_id": "traceai-3654a31c-b91b-4c5c-80fa-0860b9c6766c",
                "metadata": {
                    "session_id": "3654a31c-b91b-4c5c-80fa-0860b9c6766c",
                    "pr_number": 42,
                    "repo_path": "/Users/user/repos/myproject",
                    "branch": "feature/auth",
                    "start_time": "2026-01-10T15:00:00Z",
                    "end_time": "2026-01-10T16:30:00Z",
                    "duration_seconds": 5400,
                    "claude_code_version": "1.0.0",
                    "gist_url": None
                },
                "mappings": [
                    {
                        "file": "src/components/Auth.tsx",
                        "lines": [45, 67],
                        "prompt_index": 12,
                        "prompt_preview": "Add logout button to the navigation bar",
                        "timestamp": "2026-01-10T15:25:30Z",
                        "tool": "Edit",
                        "tool_input": {
                            "file_path": "/absolute/path/to/Auth.tsx",
                            "old_string": "old code...",
                            "new_string": "new code..."
                        },
                        "confidence": 0.95
                    }
                ],
                "stats": {
                    "total_messages": 30,
                    "total_prompts": 15,
                    "files_modified": 3,
                    "total_tokens": 12500,
                    "ai_generated_lines": 127
                },
                "summary": None
            }
        }

    def to_json_dict(self) -> Dict[str, Any]:
        """Convert to JSON-serializable dict."""
        return self.model_dump(mode='json')

    def to_json_string(self, indent: int = 2) -> str:
        """Convert to formatted JSON string."""
        return self.model_dump_json(indent=indent)


class TraceAIConfig(BaseModel):
    """Configuration file stored in .traceai/config.json."""

    artifact_files: List[str] = Field(
        default_factory=list,
        description="List of artifact JSON filenames in .traceai/ directory"
    )
    pr_number: Optional[int] = Field(default=None, description="Associated PR number")
    branch: Optional[str] = Field(default=None, description="Git branch name")
    last_updated: str = Field(..., description="ISO 8601 timestamp of last update")

    class Config:
        """Pydantic configuration."""
        json_schema_extra = {
            "example": {
                "artifact_files": ["42.json", "abc123.json"],
                "pr_number": 42,
                "branch": "feature/auth",
                "last_updated": "2026-01-10T16:00:00Z"
            }
        }


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


# ============================================================================
# Helper Functions
# ============================================================================

def get_artifact_filename(session_id: str, pr_number: Optional[int] = None) -> str:
    """
    Generate artifact filename based on PR number or session ID.

    Args:
        session_id: Claude Code session UUID
        pr_number: Optional PR number

    Returns:
        "{pr_number}.json" if PR known, else "{session_id}.json"

    Examples:
        >>> get_artifact_filename("abc123", 42)
        "42.json"
        >>> get_artifact_filename("abc123")
        "abc123.json"
    """
    if pr_number:
        return f"{pr_number}.json"
    return f"{session_id}.json"


def get_artifact_markdown_filename(session_id: str, pr_number: Optional[int] = None) -> str:
    """
    Generate markdown filename based on PR number or session ID.

    Args:
        session_id: Claude Code session UUID
        pr_number: Optional PR number

    Returns:
        "{pr_number}.md" if PR known, else "{session_id}.md"

    Examples:
        >>> get_artifact_markdown_filename("abc123", 42)
        "42.md"
        >>> get_artifact_markdown_filename("abc123")
        "abc123.md"
    """
    if pr_number:
        return f"{pr_number}.md"
    return f"{session_id}.md"
