#!/usr/bin/env python3
"""
Test script for Gist upload functionality.
Creates a test artifact and uploads it to GitHub Gist.
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
from traceai.github_client import GitHubClient


def create_test_artifact() -> ConversationArtifact:
    """Create a realistic test artifact."""

    metadata = ArtifactMetadata(
        session_id="test-gist-upload-session",
        pr_number=99,
        repo_path="/Users/test/repos/TraceAI",
        repo_name="testuser/TraceAI",
        branch="test/gist-upload",
        start_time="2026-01-10T14:00:00Z",
        end_time="2026-01-10T14:45:00Z",
        duration_seconds=2700.0
    )

    stats = ArtifactStats(
        total_messages=8,
        total_prompts=4,
        files_modified=2,
        total_tokens=1250,
        total_input_tokens=500,
        total_output_tokens=750
    )

    # Create mappings
    mappings = [
        PromptCodeMapping(
            file="src/utils.py",
            prompt_index=0,
            prompt_preview="Add a test function to utils.py",
            tool="Edit",
            timestamp="2026-01-10T14:10:30Z",
            tool_input={
                "file_path": "/Users/test/repos/TraceAI/src/utils.py",
                "old_string": "# Utils module",
                "new_string": "# Utils module\n\ndef test():\n    return True"
            },
            lines=[1, 4],
            confidence=0.98
        ),
        PromptCodeMapping(
            file="src/main.py",
            prompt_index=2,
            prompt_preview="Add error handling to the main function",
            tool="Edit",
            timestamp="2026-01-10T14:20:45Z",
            tool_input={
                "file_path": "/Users/test/repos/TraceAI/src/main.py",
                "old_string": "def main():\n    process()",
                "new_string": "def main():\n    try:\n        process()\n    except Exception as e:\n        print(f'Error: {e}')"
            },
            lines=[10, 15],
            confidence=0.95
        )
    ]

    # Create conversation
    conversation = [
        ConversationMessage(
            index=0,
            role="user",
            content="Add a test function to utils.py",
            timestamp="2026-01-10T14:10:00Z"
        ),
        ConversationMessage(
            index=1,
            role="assistant",
            content="I'll add a test function to utils.py",
            timestamp="2026-01-10T14:10:30Z",
            tool_calls=[
                ToolCall(
                    name="Edit",
                    id="toolu_abc123",
                    input=mappings[0].tool_input
                )
            ],
            usage={"input_tokens": 120, "output_tokens": 180}
        ),
        ConversationMessage(
            index=2,
            role="user",
            content="Add error handling to the main function",
            timestamp="2026-01-10T14:20:00Z"
        ),
        ConversationMessage(
            index=3,
            role="assistant",
            content="I'll add try-catch error handling",
            timestamp="2026-01-10T14:20:45Z",
            tool_calls=[
                ToolCall(
                    name="Edit",
                    id="toolu_def456",
                    input=mappings[1].tool_input
                )
            ],
            usage={"input_tokens": 150, "output_tokens": 220}
        )
    ]

    # Create artifact
    artifact = ConversationArtifact(
        version="1.0",
        conversation_id="traceai-test-gist-upload",
        metadata=metadata,
        mappings=mappings,
        conversation=conversation,
        stats=stats
    )

    return artifact


def test_gist_upload():
    """Test uploading an artifact to Gist."""

    print("Testing Gist Upload")
    print("=" * 60)

    # Create test artifact
    print("\n📦 Creating test artifact...")
    artifact = create_test_artifact()
    print(f"   Conversation ID: {artifact.conversation_id}")
    print(f"   Prompts: {artifact.stats.total_prompts}")
    print(f"   Files: {artifact.stats.files_modified}")

    # Initialize GitHub client
    print("\n🔑 Initializing GitHub client...")
    try:
        client = GitHubClient()
        print(f"   Authenticated as: {client.user.login}")
    except ValueError as e:
        print(f"❌ Error: {e}")
        return False

    # Upload to Gist
    print("\n⬆️  Uploading to Gist...")
    try:
        response = client.upload_artifact_to_gist(
            artifact=artifact,
            description="TraceAI Test Upload - Safe to delete",
            public=False,  # Secret gist
            include_markdown=True
        )

        print(f"✅ Gist created successfully!")
        print(f"   Gist ID: {response.gist_id}")
        print(f"   URL: {response.html_url}")
        print(f"   Created: {response.created_at}")

    except Exception as e:
        print(f"❌ Upload failed: {e}")
        return False

    # Test fetching the Gist back
    print("\n📥 Fetching Gist to verify...")
    try:
        gist_data = client.get_gist(response.gist_id)
        print(f"✅ Gist fetched successfully!")
        print(f"   Files: {', '.join(gist_data['files'].keys())}")
        print(f"   Description: {gist_data['description']}")

    except Exception as e:
        print(f"❌ Fetch failed: {e}")
        return False

    # Ask user if they want to delete the test Gist
    print("\n" + "=" * 60)
    print("Test Gist Information:")
    print("=" * 60)
    print(f"URL: {response.html_url}")
    print(f"ID: {response.gist_id}")
    print("\nYou can:")
    print("1. Visit the URL to inspect the Gist")
    print("2. Delete it manually later")
    print("3. Or let the script clean it up now")
    print("=" * 60)

    cleanup = input("\nDelete the test Gist now? (y/n): ").strip().lower()

    if cleanup == 'y':
        print("\n🧹 Cleaning up test Gist...")
        try:
            client.delete_gist(response.gist_id)
            print("✅ Test Gist deleted")
        except Exception as e:
            print(f"❌ Deletion failed: {e}")
            print(f"   Please delete manually: {response.html_url}")

    else:
        print(f"\n✅ Test Gist preserved at: {response.html_url}")
        print("   Remember to delete it manually when done!")

    print("\n" + "=" * 60)
    print("🎉 All Gist upload tests passed!")
    print("=" * 60)

    return True


if __name__ == "__main__":
    success = test_gist_upload()
    exit(0 if success else 1)
