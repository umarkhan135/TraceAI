from typing import Any, Dict, List, Optional, Union
from pydantic import BaseModel, Field


class ToolCall(BaseModel):
    name: str = Field(...)
    id: str = Field(...)
    input: Dict[str, Any] = Field(...)


class ConversationMessage(BaseModel):
    index: int = Field(...)
    role: str = Field(...)
    content: str = Field(...)
    timestamp: str = Field(...)
    tool_calls: List[ToolCall] = Field(default_factory=list)
    usage: Optional[Dict[str, Any]] = Field(default=None)


class PromptCodeMapping(BaseModel):
    file: str = Field(...)
    lines: Optional[List[int]] = Field(default=None)
    prompt_index: int = Field(...)
    prompt_preview: str = Field(...)
    timestamp: str = Field(...)
    tool: str = Field(...)
    tool_input: Dict[str, Any] = Field(...)
    confidence: float = Field(default=0.9, ge=0.0, le=1.0)


class CodeMapping(PromptCodeMapping):
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)


class ArtifactMetadata(BaseModel):
    session_id: str = Field(...)
    pr_number: Optional[int] = Field(default=None)
    repo_path: str = Field(...)
    branch: Optional[str] = Field(default=None)
    start_time: Optional[str] = Field(default=None)
    end_time: Optional[str] = Field(default=None)
    duration_seconds: Optional[float] = Field(default=None)
    claude_code_version: Optional[str] = Field(default=None)
    gist_url: Optional[str] = Field(default=None)


class ArtifactStats(BaseModel):
    total_messages: int = Field(...)
    total_prompts: int = Field(...)
    files_modified: int = Field(...)
    total_tokens: int = Field(default=0)
    ai_generated_lines: Optional[int] = Field(default=None)


class ConversationStats(ArtifactStats):
    pass


class ConversationSummary(BaseModel):
    key_decisions: List[str] = Field(default_factory=list)
    files_summary: Dict[str, str] = Field(default_factory=dict)
    overview: Optional[str] = None


class ConversationArtifact(BaseModel):
    version: str = Field(default="1.0")
    conversation_id: str = Field(...)
    metadata: ArtifactMetadata = Field(...)
    mappings: List[PromptCodeMapping] = Field(default_factory=list)
    conversation: List[ConversationMessage] = Field(default_factory=list)
    stats: ArtifactStats = Field(...)
    summary: Optional[Union[ConversationSummary, Dict[str, Any]]] = Field(default=None)

    class Config:
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
        return self.model_dump(mode='json')

    def to_json_string(self, indent: int = 2) -> str:
        return self.model_dump_json(indent=indent)


class GistUploadRequest(BaseModel):
    artifact: ConversationArtifact = Field(...)
    description: str = Field(default="TraceAI Conversation Artifact")
    public: bool = Field(default=False)
    filename: str = Field(default="conversation.json")


class GistUploadResponse(BaseModel):
    gist_id: str = Field(...)
    id: str = Field(...)
    gist_url: str = Field(...)
    html_url: str = Field(...)
    public: bool = Field(default=False)
    description: str = Field(default="")
    created_at: str = Field(...)

    class Config:
        json_schema_extra = {
            "example": {
                "gist_id": "abc123def456",
                "id": "abc123def456",
                "gist_url": "https://api.github.com/gists/abc123def456",
                "html_url": "https://gist.github.com/username/abc123def456",
                "public": False,
                "description": "TraceAI Conversation",
                "created_at": "2026-01-10T16:00:00Z"
            }
        }


class RawUserMessage(BaseModel):
    type: str = "user"
    uuid: str
    parentUuid: Optional[str] = None
    timestamp: str
    sessionId: str
    cwd: str
    message: Dict[str, Any]


class RawAssistantMessage(BaseModel):
    type: str = "assistant"
    uuid: str
    parentUuid: Optional[str] = None
    timestamp: str
    sessionId: str
    message: Dict[str, Any]


class RawToolResult(BaseModel):
    type: str = "tool_result"
    uuid: str
    parentUuid: Optional[str] = None
    timestamp: str
    sessionId: str
    message: Dict[str, Any]
