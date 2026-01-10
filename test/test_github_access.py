#!/usr/bin/env python3
"""
Test script to verify GitHub API access and Gist creation.
Run this to ensure your GITHUB_TOKEN is working correctly.
"""

import os
from pathlib import Path
from dotenv import load_dotenv
from github import Github, GithubException, InputFileContent

def test_github_access():
    """Test GitHub API access and Gist permissions."""

    # Load environment variables from .env
    load_dotenv()
    token = os.getenv('GITHUB_TOKEN')

    if not token or token == 'paste_your_token_here':
        print("❌ ERROR: GITHUB_TOKEN not set in .env file")
        print("Please edit .env and add your GitHub personal access token")
        return False

    print("🔑 GitHub token found in .env")

    try:
        # Initialize GitHub client
        g = Github(token)

        # Test: Get authenticated user
        user = g.get_user()
        print(f"✅ Successfully authenticated as: {user.login}")
        print(f"   Name: {user.name}")
        print(f"   Email: {user.email}")

        # Test: Check rate limit
        rate_limit = g.get_rate_limit()
        print(f"\n📊 API Rate Limit:")
        print(f"   Core: {rate_limit.core.remaining}/{rate_limit.core.limit}")
        print(f"   Resets at: {rate_limit.core.reset}")

        # Test: Create a test Gist
        print("\n🧪 Testing Gist creation...")
        test_gist = g.get_user().create_gist(
            public=False,  # Secret gist for testing
            files={
                "test_traceai.md": InputFileContent(
                    "# TraceAI Test Gist\n\nThis is a test gist created by TraceAI to verify GitHub API access."
                )
            },
            description="TraceAI API Test - Safe to delete"
        )

        print(f"✅ Test Gist created successfully!")
        print(f"   URL: {test_gist.html_url}")
        print(f"   ID: {test_gist.id}")

        # Clean up: Delete the test gist
        print("\n🧹 Cleaning up test Gist...")
        test_gist.delete()
        print("✅ Test Gist deleted")

        print("\n🎉 All tests passed! GitHub API is working correctly.")
        print("   You're ready to build the TraceAI pipeline!")

        return True

    except GithubException as e:
        print(f"\n❌ GitHub API Error: {e.status} - {e.data.get('message', 'Unknown error')}")
        if e.status == 401:
            print("   Check that your token is valid and has not expired")
        elif e.status == 403:
            print("   Check that your token has 'gist' scope enabled")
        return False

    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        return False

if __name__ == "__main__":
    print("=" * 60)
    print("TraceAI - GitHub API Access Test")
    print("=" * 60)
    print()

    success = test_github_access()

    print("\n" + "=" * 60)

    exit(0 if success else 1)
