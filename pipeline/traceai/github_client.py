"""
GitHub client for TraceAI.

Handles uploading conversation artifacts to GitHub Gist.
"""

import os
import json
from datetime import datetime
from typing import Optional
from github import Github, GithubException, InputFileContent
from dotenv import load_dotenv

from .models import ConversationArtifact, GistUploadRequest, GistUploadResponse


class GitHubClient:
    """
    Client for interacting with GitHub API.

    Handles authentication and Gist operations for TraceAI.
    """

    def __init__(self, token: Optional[str] = None):
        """
        Initialize GitHub client.

        Args:
            token: GitHub personal access token. If None, will try to load from
                   GITHUB_TOKEN environment variable.

        Raises:
            ValueError: If no token is provided or found in environment.
        """
        # Load from .env if not provided
        if token is None:
            load_dotenv()
            token = os.getenv('GITHUB_TOKEN')

        if not token:
            raise ValueError(
                "GitHub token required. Provide via GITHUB_TOKEN environment variable "
                "or pass directly to GitHubClient(token='...')"
            )

        self.token = token
        self.github = Github(token)
        self._user = None

    @property
    def user(self):
        """Get authenticated user (cached)."""
        if self._user is None:
            self._user = self.github.get_user()
        return self._user

    def upload_artifact_to_gist(
        self,
        artifact: ConversationArtifact,
        description: str = "TraceAI Conversation Artifact",
        public: bool = False,
        filename: str = "conversation.json",
        include_markdown: bool = True
    ) -> GistUploadResponse:
        """
        Upload a conversation artifact to GitHub Gist.

        Args:
            artifact: ConversationArtifact to upload
            description: Gist description
            public: Whether to create a public (True) or secret (False) Gist
            filename: Filename for the JSON artifact
            include_markdown: Whether to also generate a human-readable Markdown file

        Returns:
            GistUploadResponse with Gist URLs and metadata

        Raises:
            GithubException: If upload fails
        """
        try:
            # Prepare files for Gist
            files = {}

            # Add JSON artifact
            artifact_json = artifact.model_dump(mode='json')
            files[filename] = InputFileContent(
                json.dumps(artifact_json, indent=2)
            )

            # Optionally add Markdown summary
            if include_markdown:
                markdown_content = self._generate_markdown_summary(artifact)
                files["README.md"] = InputFileContent(markdown_content)

            # Create Gist
            gist = self.user.create_gist(
                public=public,
                files=files,
                description=description
            )

            # Build response
            response = GistUploadResponse(
                gist_id=gist.id,
                id=gist.id,
                gist_url=gist.url,
                html_url=gist.html_url,
                public=public,
                description=description,
                created_at=gist.created_at.isoformat()
            )

            return response

        except GithubException as e:
            raise GithubException(
                status=e.status,
                data={
                    "message": f"Failed to upload Gist: {e.data.get('message', 'Unknown error')}",
                    "original_error": e.data
                },
                headers=e.headers
            )

    def get_gist(self, gist_id: str) -> dict:
        """
        Fetch a Gist by ID.

        Args:
            gist_id: GitHub Gist ID

        Returns:
            Gist data as dictionary

        Raises:
            GithubException: If Gist not found or access denied
        """
        try:
            gist = self.github.get_gist(gist_id)

            return {
                "id": gist.id,
                "url": gist.url,
                "html_url": gist.html_url,
                "description": gist.description,
                "public": gist.public,
                "created_at": gist.created_at.isoformat(),
                "updated_at": gist.updated_at.isoformat(),
                "files": {
                    filename: {
                        "filename": file_obj.filename,
                        "size": file_obj.size,
                        "raw_url": file_obj.raw_url,
                        "content": file_obj.content
                    }
                    for filename, file_obj in gist.files.items()
                }
            }

        except GithubException as e:
            if e.status == 404:
                raise GithubException(
                    status=404,
                    data={"message": f"Gist {gist_id} not found"},
                    headers=e.headers
                )
            raise

    def delete_gist(self, gist_id: str) -> None:
        """
        Delete a Gist by ID.

        Args:
            gist_id: GitHub Gist ID

        Raises:
            GithubException: If deletion fails
        """
        try:
            gist = self.github.get_gist(gist_id)
            gist.delete()
        except GithubException as e:
            raise GithubException(
                status=e.status,
                data={"message": f"Failed to delete Gist: {e.data.get('message', 'Unknown error')}"},
                headers=e.headers
            )

    def _generate_markdown_summary(self, artifact: ConversationArtifact) -> str:
        """
        Generate a human-readable Markdown summary of the conversation.

        Args:
            artifact: ConversationArtifact to summarize

        Returns:
            Markdown-formatted summary
        """
        md = []

        # Header
        md.append(f"# TraceAI Conversation: {artifact.conversation_id}")
        md.append("")
        md.append("This conversation was captured by [TraceAI](https://github.com/yourteam/traceai), ")
        md.append("an LLM-native code provenance tool for AI-assisted development.")
        md.append("")

        # Metadata
        md.append("## Metadata")
        md.append("")
        md.append(f"- **Session ID**: `{artifact.metadata.session_id}`")
        if artifact.metadata.pr_number:
            md.append(f"- **PR Number**: #{artifact.metadata.pr_number}")
        if artifact.metadata.repo_path:
            md.append(f"- **Repository**: {artifact.metadata.repo_path}")
        if artifact.metadata.branch:
            md.append(f"- **Branch**: `{artifact.metadata.branch}`")
        md.append(f"- **Started**: {artifact.metadata.start_time}")
        md.append(f"- **Ended**: {artifact.metadata.end_time}")
        if artifact.metadata.duration_seconds:
            duration_mins = artifact.metadata.duration_seconds / 60
            md.append(f"- **Duration**: {duration_mins:.1f} minutes")
        md.append("")

        # Stats
        md.append("## Summary")
        md.append("")
        md.append(f"- **Total Prompts**: {artifact.stats.total_prompts}")
        md.append(f"- **Files Modified**: {artifact.stats.files_modified}")
        md.append(f"- **Total Messages**: {artifact.stats.total_messages}")
        md.append(f"- **Tokens Used**: {artifact.stats.total_tokens:,}")
        md.append("")

        # Files modified
        if artifact.mappings:
            md.append("## Files Modified")
            md.append("")

            # Group mappings by file
            files_map = {}
            for mapping in artifact.mappings:
                file_path = mapping.file
                if file_path not in files_map:
                    files_map[file_path] = []
                files_map[file_path].append(mapping)

            for file_path, file_mappings in files_map.items():
                md.append(f"### `{file_path}`")
                md.append("")
                md.append(f"Modified {len(file_mappings)} time(s):")
                md.append("")

                for i, mapping in enumerate(file_mappings, 1):
                    prompt_preview = mapping.prompt_preview
                    md.append(f"{i}. **{prompt_preview}**")
                    md.append(f"   - Tool: `{mapping.tool}`")
                    if mapping.lines:
                        md.append(f"   - Lines: {mapping.lines[0]}-{mapping.lines[1]}")
                    md.append(f"   - Time: {mapping.timestamp}")
                    md.append("")

        # Conversation highlights (first 5 user prompts)
        md.append("## Conversation Highlights")
        md.append("")

        user_messages = [msg for msg in artifact.conversation if msg.role == "user"]
        for i, msg in enumerate(user_messages[:5], 1):
            content_preview = msg.content[:100] + "..." if len(msg.content) > 100 else msg.content
            md.append(f"{i}. **{content_preview}**")
            md.append(f"   - Time: {msg.timestamp}")
            md.append("")

        if len(user_messages) > 5:
            md.append(f"*... and {len(user_messages) - 5} more prompts*")
            md.append("")

        # Footer
        md.append("---")
        md.append("")
        md.append("*Generated by [TraceAI](https://github.com/yourteam/traceai) • ")
        md.append(f"Artifact Version {artifact.version}*")

        return "\n".join(md)

    def create_gist(
        self,
        artifact: ConversationArtifact,
        public: bool = False
    ) -> GistUploadResponse:
        """
        Create a new Gist with conversation artifact.

        Args:
            artifact: ConversationArtifact to upload
            public: Whether to create a public or secret Gist

        Returns:
            GistUploadResponse with Gist URLs
        """
        description = f"TraceAI Conversation (PR #{artifact.metadata.pr_number})" if artifact.metadata.pr_number else "TraceAI Conversation"
        return self.upload_artifact_to_gist(
            artifact,
            description=description,
            public=public
        )

    def create_or_update_gist(
        self,
        artifact: ConversationArtifact,
        existing_gist_id: Optional[str] = None,
        public: bool = False
    ) -> GistUploadResponse:
        """
        Create a new Gist or update an existing one.

        Args:
            artifact: ConversationArtifact to upload
            existing_gist_id: ID of existing Gist to update (None = create new)
            public: Whether to create a public or secret Gist

        Returns:
            GistUploadResponse with Gist URLs
        """
        if existing_gist_id:
            # Update existing Gist
            try:
                gist = self.github.get_gist(existing_gist_id)

                # Update files
                artifact_json = artifact.model_dump(mode='json')
                files = {
                    "conversation.json": InputFileContent(
                        json.dumps(artifact_json, indent=2)
                    )
                }

                # Optionally update Markdown
                markdown_content = self._generate_markdown_summary(artifact)
                files["README.md"] = InputFileContent(markdown_content)

                gist.edit(files=files)

                return GistUploadResponse(
                    gist_id=gist.id,
                    id=gist.id,
                    gist_url=gist.url,
                    html_url=gist.html_url,
                    public=gist.public,
                    description=gist.description or "",
                    created_at=gist.created_at.isoformat()
                )

            except GithubException as e:
                raise GithubException(
                    status=e.status,
                    data={"message": f"Failed to update Gist: {e.data.get('message', 'Unknown error')}"},
                    headers=e.headers
                )
        else:
            # Create new Gist
            return self.create_gist(artifact, public=public)

    def get_rate_limit(self) -> dict:
        """
        Get current API rate limit status.

        Returns:
            Dictionary with rate limit info
        """
        rate_limit = self.github.get_rate_limit()
        return {
            "core": {
                "limit": rate_limit.core.limit,
                "remaining": rate_limit.core.remaining,
                "reset": rate_limit.core.reset.isoformat()
            },
            "search": {
                "limit": rate_limit.search.limit,
                "remaining": rate_limit.search.remaining,
                "reset": rate_limit.search.reset.isoformat()
            }
        }
