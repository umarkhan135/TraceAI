#!/usr/bin/env python3
"""
Test script to validate Pydantic models for TraceAI.
"""

import json
import sys
from pathlib import Path

# Add pipeline to path (go up to parent directory)
sys.path.insert(0, str(Path(__file__).parent.parent / 'pipeline'))

from traceai.models import (
    ConversationArtifact,
    ArtifactMetadata,
    ArtifactStats,
    PromptCodeMapping,
    ConversationMessage,
    ToolCall
)


def test_models():
    """Test creating a sample conversation artifact."""

    print("Testing TraceAI Pydantic Models")
    print("=" * 60)

    # Create sample data
    metadata = ArtifactMetadata(
        session_id="test-session-123",
        pr_number=42,
        repo_path="/Users/test/repos/myproject",
        repo_name="testuser/myproject",
        branch="feature/test",
        start_time="2026-01-10T15:00:00Z",
        end_time="2026-01-10T16:30:00Z",
        duration_seconds=5400.0
    )
    print("✅ Created ArtifactMetadata")

    stats = ArtifactStats(
        total_messages=4,
        total_prompts=2,
        files_modified=1,
        total_tokens=500
    )
    print("✅ Created ArtifactStats")

    # Create a tool call
    tool_call = ToolCall(
        name="Edit",
        id="toolu_123abc",
        input={
            "file_path": "/Users/test/repos/myproject/src/app.py",
            "old_string": "def hello():\n    pass",
            "new_string": "def hello():\n    print('Hello, World!')"
        }
    )
    print("✅ Created ToolCall")

    # Create conversation messages
    messages = [
        ConversationMessage(
            index=0,
            role="user",
            content="Add a hello function",
            timestamp="2026-01-10T15:00:00Z"
        ),
        ConversationMessage(
            index=1,
            role="assistant",
            content="I'll add a hello function to app.py",
            timestamp="2026-01-10T15:00:15Z",
            tool_calls=[tool_call],
            usage={"input_tokens": 100, "output_tokens": 150}
        )
    ]
    print("✅ Created ConversationMessages")

    # Create prompt-to-code mapping
    mapping = PromptCodeMapping(
        file="src/app.py",
        prompt_index=0,
        prompt_preview="Add a hello function",
        tool="Edit",
        timestamp="2026-01-10T15:00:15Z",
        tool_input={
            "file_path": "/Users/test/repos/myproject/src/app.py",
            "old_string": "def hello():\n    pass",
            "new_string": "def hello():\n    print('Hello, World!')"
        },
        lines=[10, 12],
        confidence=0.95
    )
    print("✅ Created PromptCodeMapping")

    # Create full artifact
    artifact = ConversationArtifact(
        version="1.0",
        conversation_id="traceai-test-session-123",
        metadata=metadata,
        mappings=[mapping],
        conversation=messages,
        stats=stats
    )
    print("✅ Created ConversationArtifact")

    # Serialize to JSON
    artifact_json = artifact.model_dump(mode='json')
    json_str = json.dumps(artifact_json, indent=2)

    print("\n" + "=" * 60)
    print("Generated JSON Artifact:")
    print("=" * 60)
    print(json_str)

    # Test deserialization
    print("\n" + "=" * 60)
    print("Testing Deserialization:")
    print("=" * 60)

    try:
        # Parse JSON back into model
        parsed_artifact = ConversationArtifact.model_validate(artifact_json)
        print("✅ Successfully parsed JSON back into ConversationArtifact")
        print(f"   Conversation ID: {parsed_artifact.conversation_id}")
        print(f"   Session ID: {parsed_artifact.metadata.session_id}")
        print(f"   Mappings: {len(parsed_artifact.mappings)}")
        print(f"   Messages: {len(parsed_artifact.conversation)}")
        print(f"   Files Modified: {parsed_artifact.stats.files_modified}")
    except Exception as e:
        print(f"❌ Deserialization failed: {e}")
        return False

    print("\n" + "=" * 60)
    print("🎉 All model tests passed!")
    print("=" * 60)

    return True


if __name__ == "__main__":
    success = test_models()
    exit(0 if success else 1)
