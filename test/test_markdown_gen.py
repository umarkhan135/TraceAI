#!/usr/bin/env python3
"""
Test script for markdown PR summary generation.
"""

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
from traceai.markdown_gen import MarkdownGenerator


def create_realistic_artifact() -> ConversationArtifact:
    """Create a realistic conversation artifact for testing."""

    metadata = ArtifactMetadata(
        session_id="realistic-session-123",
        pr_number=42,
        repo_path="/Users/dev/repos/myapp",
        repo_name="myteam/myapp",
        branch="feature/authentication",
        start_time="2026-01-10T10:00:00Z",
        end_time="2026-01-10T11:30:00Z",
        duration_seconds=5400.0,
        gist_url="https://gist.github.com/user/abc123"
    )

    stats = ArtifactStats(
        total_messages=20,
        total_prompts=10,
        files_modified=4,
        total_tokens=8500,
        total_input_tokens=3000,
        total_output_tokens=5500
    )

    mappings = [
        PromptCodeMapping(
            file="src/auth/jwt.py",
            prompt_index=0,
            prompt_preview="Add user authentication with JWT tokens",
            tool="Write",
            timestamp="2026-01-10T10:06:00Z",
            tool_input={"file_path": "/path/to/jwt.py", "content": "..."},
            lines=[1, 45],
            confidence=0.98
        ),
        PromptCodeMapping(
            file="src/api/routes.py",
            prompt_index=2,
            prompt_preview="Add login endpoint to the API",
            tool="Edit",
            timestamp="2026-01-10T10:16:00Z",
            tool_input={"file_path": "/path/to/routes.py", "old_string": "...", "new_string": "..."},
            lines=[67, 89],
            confidence=0.95
        ),
        PromptCodeMapping(
            file="src/auth/jwt.py",
            prompt_index=4,
            prompt_preview="Add password hashing with bcrypt",
            tool="Edit",
            timestamp="2026-01-10T10:31:00Z",
            tool_input={"file_path": "/path/to/jwt.py", "old_string": "...", "new_string": "..."},
            lines=[20, 35],
            confidence=0.97
        ),
        PromptCodeMapping(
            file="src/api/routes.py",
            prompt_index=6,
            prompt_preview="Add logout endpoint with token invalidation",
            tool="Edit",
            timestamp="2026-01-10T10:46:00Z",
            tool_input={"file_path": "/path/to/routes.py", "old_string": "...", "new_string": "..."},
            lines=[90, 110],
            confidence=0.96
        ),
        PromptCodeMapping(
            file="tests/test_auth.py",
            prompt_index=8,
            prompt_preview="Add tests for authentication flow",
            tool="Write",
            timestamp="2026-01-10T11:02:00Z",
            tool_input={"file_path": "/path/to/test_auth.py", "content": "..."},
            lines=[1, 120],
            confidence=0.99
        ),
        PromptCodeMapping(
            file="requirements.txt",
            prompt_index=9,
            prompt_preview="Update requirements.txt with PyJWT and bcrypt",
            tool="Edit",
            timestamp="2026-01-10T11:15:30Z",
            tool_input={"file_path": "/path/to/requirements.txt", "old_string": "...", "new_string": "..."},
            lines=[15, 17],
            confidence=1.0
        )
    ]

    conversation = [
        ConversationMessage(
            index=0,
            role="user",
            content="Add user authentication with JWT tokens",
            timestamp="2026-01-10T10:05:00Z"
        ),
        ConversationMessage(
            index=1,
            role="assistant",
            content="I'll implement JWT authentication for your application.",
            timestamp="2026-01-10T10:05:30Z",
            tool_calls=[ToolCall(name="Write", id="toolu_1", input={})],
            usage={"input_tokens": 200, "output_tokens": 350}
        ),
        ConversationMessage(
            index=2,
            role="user",
            content="Add login endpoint to the API",
            timestamp="2026-01-10T10:15:00Z"
        ),
        ConversationMessage(
            index=3,
            role="assistant",
            content="I'll add a /login endpoint that accepts credentials and returns a JWT.",
            timestamp="2026-01-10T10:15:30Z",
            tool_calls=[ToolCall(name="Edit", id="toolu_2", input={})],
            usage={"input_tokens": 180, "output_tokens": 320}
        ),
        ConversationMessage(
            index=4,
            role="user",
            content="Make sure to use bcrypt for password hashing",
            timestamp="2026-01-10T10:25:00Z"
        ),
        ConversationMessage(
            index=5,
            role="user",
            content="Add password hashing with bcrypt",
            timestamp="2026-01-10T10:30:00Z"
        ),
        ConversationMessage(
            index=6,
            role="assistant",
            content="I'll add bcrypt password hashing for security.",
            timestamp="2026-01-10T10:30:30Z",
            tool_calls=[ToolCall(name="Edit", id="toolu_3", input={})],
            usage={"input_tokens": 190, "output_tokens": 280}
        ),
        ConversationMessage(
            index=7,
            role="user",
            content="Add logout endpoint with token invalidation",
            timestamp="2026-01-10T10:45:00Z"
        ),
        ConversationMessage(
            index=8,
            role="user",
            content="Add tests for authentication flow",
            timestamp="2026-01-10T11:00:00Z"
        ),
        ConversationMessage(
            index=9,
            role="user",
            content="Update requirements.txt with PyJWT and bcrypt",
            timestamp="2026-01-10T11:15:00Z"
        )
    ]

    artifact = ConversationArtifact(
        version="1.0",
        conversation_id="traceai-realistic-test",
        metadata=metadata,
        mappings=mappings,
        conversation=conversation,
        stats=stats
    )

    return artifact


def test_markdown_generation():
    """Test markdown generation."""

    print("Testing Markdown Generation")
    print("=" * 60)

    # Create artifact
    print("\n📦 Creating test artifact...")
    artifact = create_realistic_artifact()
    print(f"   Files modified: {artifact.stats.files_modified}")
    print(f"   Prompts: {artifact.stats.total_prompts}")

    # Initialize generator
    print("\n📝 Generating markdown...")
    generator = MarkdownGenerator(artifact)

    # Generate PR summary
    pr_summary = generator.generate_pr_summary()

    print("\n" + "=" * 60)
    print("GENERATED PR SUMMARY")
    print("=" * 60)
    print(pr_summary)
    print("=" * 60)

    # Generate commit message
    print("\n" + "=" * 60)
    print("GENERATED COMMIT MESSAGE")
    print("=" * 60)
    commit_message = generator.generate_commit_message()
    print(commit_message)
    print("=" * 60)

    # Save to file for inspection
    output_file = Path(__file__).parent / "example_pr_summary.md"
    with open(output_file, 'w') as f:
        f.write(pr_summary)

    print(f"\n✅ PR summary saved to: {output_file}")

    print("\n🎉 Markdown generation test complete!")

    return True


if __name__ == "__main__":
    success = test_markdown_generation()
    exit(0 if success else 1)
