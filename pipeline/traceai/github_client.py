import os
import json
from datetime import datetime
from typing import Optional
from github import Github, GithubException, InputFileContent
from dotenv import load_dotenv

from .models import ConversationArtifact, GistUploadRequest, GistUploadResponse


class GitHubClient:

    def __init__(self, token: Optional[str] = None):
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
        try:
            files = {}

            artifact_json = artifact.model_dump(mode='json')
            files[filename] = InputFileContent(
                json.dumps(artifact_json, indent=2)
            )

            if include_markdown:
                markdown_content = self._generate_markdown_summary(artifact)
                files["README.md"] = InputFileContent(markdown_content)

            gist = self.user.create_gist(
                public=public,
                files=files,
                description=description
            )

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
        try:
            gist = self.github.get_gist(gist_id)
            gist.delete()
        except GithubException as e:
            raise GithubException(
                status=e.status,
                data={
                    "message": f"Failed to delete Gist: {e.data.get('message', 'Unknown error')}"},
                headers=e.headers
            )

    def _generate_markdown_summary(self, artifact: ConversationArtifact) -> str:
        md = []

        md.append(f"# TraceAI Conversation: {artifact.conversation_id}")
        md.append("")
        md.append(
            "This conversation was captured by [TraceAI](https://github.com/yourteam/traceai), ")
        md.append("an LLM-native code provenance tool for AI-assisted development.")
        md.append("")

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

        md.append("## Summary")
        md.append("")
        md.append(f"- **Total Prompts**: {artifact.stats.total_prompts}")
        md.append(f"- **Files Modified**: {artifact.stats.files_modified}")
        md.append(f"- **Total Messages**: {artifact.stats.total_messages}")
        md.append(f"- **Tokens Used**: {artifact.stats.total_tokens:,}")
        md.append("")

        if artifact.mappings:
            md.append("## Files Modified")
            md.append("")

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
                    prompt_text = mapping.prompt_preview[:80] + "..." if len(
                        mapping.prompt_preview) > 80 else mapping.prompt_preview
                    md.append(f"{i}. **{prompt_text}**")
                    md.append(f"   - Tool: `{mapping.tool}`")
                    if mapping.lines:
                        md.append(
                            f"   - Lines: {mapping.lines[0]}-{mapping.lines[1]}")
                    md.append(f"   - Time: {mapping.timestamp}")
                    md.append("")

        md.append("## 💬 Conversation")
        md.append("")

        for msg in artifact.conversation:
            if msg.role == "user":
                md.append(msg.content)
                md.append("")
            elif msg.role == "assistant":
                response_lines = msg.content.split("\n")
                for line in response_lines:
                    md.append(f"> {line}")
                md.append("")

        md.append("---")
        md.append("")
        md.append(
            "*Generated by [TraceAI](https://github.com/yourteam/traceai) • ")
        md.append(f"Artifact Version {artifact.version}*")

        return "\n".join(md)

    def create_gist(
        self,
        artifact: ConversationArtifact,
        public: bool = False,
        description: Optional[str] = None
    ):
        if description is None:
            description = f"TraceAI Conversation - {artifact.conversation_id}"

        files = {}

        artifact_json = artifact.model_dump(mode='json')
        files["conversation.json"] = InputFileContent(
            json.dumps(artifact_json, indent=2)
        )

        markdown_content = self._generate_markdown_summary(artifact)
        files["README.md"] = InputFileContent(markdown_content)

        gist = self.user.create_gist(
            public=public,
            files=files,
            description=description
        )

        return gist

    def update_gist(
        self,
        gist_id: str,
        artifact: ConversationArtifact
    ):
        gist = self.github.get_gist(gist_id)

        files = {}

        artifact_json = artifact.model_dump(mode='json')
        files["conversation.json"] = InputFileContent(
            json.dumps(artifact_json, indent=2)
        )

        markdown_content = self._generate_markdown_summary(artifact)
        files["README.md"] = InputFileContent(markdown_content)

        gist.edit(files=files)

        return gist

    def create_or_update_gist(
        self,
        artifact: ConversationArtifact,
        existing_gist_id: Optional[str] = None,
        public: bool = False
    ) -> GistUploadResponse:
        if existing_gist_id:
            try:
                gist = self.github.get_gist(existing_gist_id)

                artifact_json = artifact.model_dump(mode='json')
                files = {
                    "conversation.json": InputFileContent(
                        json.dumps(artifact_json, indent=2)
                    )
                }

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
                    data={
                        "message": f"Failed to update Gist: {e.data.get('message', 'Unknown error')}"},
                    headers=e.headers
                )
        else:
            gist = self.create_gist(artifact, public=public)
            return GistUploadResponse(
                gist_id=gist.id,
                id=gist.id,
                gist_url=gist.url,
                html_url=gist.html_url,
                public=gist.public,
                description=gist.description or "",
                created_at=gist.created_at.isoformat()
            )

    def get_rate_limit(self) -> dict:
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
