"""
Markdown generator for TraceAI PR summaries.

Generates beautiful, informative PR descriptions with conversation context.
"""

from typing import Optional, List
from .models import ConversationArtifact, PromptCodeMapping


def format_duration(seconds: float) -> str:
    """
    Format duration in seconds to human-readable string.

    Args:
        seconds: Duration in seconds

    Returns:
        Formatted string (e.g., "5 minutes", "1 hour 30 minutes")
    """
    if seconds < 60:
        return f"{int(seconds)} seconds"

    minutes = int(seconds / 60)
    if minutes < 60:
        return f"{minutes} minute{'s' if minutes != 1 else ''}"

    hours = minutes // 60
    remaining_minutes = minutes % 60

    if remaining_minutes == 0:
        return f"{hours} hour{'s' if hours != 1 else ''}"

    return f"{hours} hour{'s' if hours != 1 else ''} {remaining_minutes} minute{'s' if remaining_minutes != 1 else ''}"


class MarkdownGenerator:
    """Generate markdown summaries for PRs with AI conversation context."""

    def __init__(self, artifact: ConversationArtifact, gist_url: Optional[str] = None):
        """
        Initialize markdown generator.

        Args:
            artifact: ConversationArtifact to summarize
            gist_url: Optional URL to the uploaded Gist
        """
        self.artifact = artifact
        self.gist_url = gist_url or artifact.metadata.gist_url

    def generate_pr_summary(
        self,
        include_stats: bool = True,
        include_files: bool = True,
        include_highlights: bool = True,
        max_highlights: int = 5,
        include_footer: bool = True
    ) -> str:
        """
        Generate a complete PR summary with conversation context.

        Args:
            include_stats: Include statistics section
            include_files: Include files modified section
            include_highlights: Include conversation highlights
            max_highlights: Maximum number of highlights to include
            include_footer: Include footer with links

        Returns:
            Markdown-formatted PR summary
        """
        sections = []

        # Header
        sections.append(self._generate_header())

        # Stats
        if include_stats:
            sections.append(self._generate_stats())

        # Files modified
        if include_files:
            sections.append(self._generate_files_section())

        # Conversation highlights
        if include_highlights:
            sections.append(self._generate_highlights(max_highlights))

        # Key decisions (if any)
        key_decisions = self._extract_key_decisions()
        if key_decisions:
            sections.append(self._generate_key_decisions(key_decisions))

        # Testing note
        sections.append(self._generate_testing_note())

        # Footer
        if include_footer:
            sections.append(self._generate_footer())

        return "\n\n".join(sections)

    def _generate_header(self) -> str:
        """Generate the PR summary header."""
        lines = [
            "## 🤖 AI-Generated Code Summary",
            "",
            "This PR was developed in collaboration with Claude Code."
        ]

        if self.gist_url:
            lines.append(f"[View full conversation →]({self.gist_url})")

        return "\n".join(lines)

    def _generate_stats(self) -> str:
        """Generate statistics section."""
        stats = self.artifact.stats

        lines = [
            "### 📊 Stats",
            ""
        ]

        # Calculate AI-generated lines (estimate based on mappings)
        ai_lines = sum(
            (mapping.lines[1] - mapping.lines[0] + 1)
            if mapping.lines else 10  # Default estimate if no line info
            for mapping in self.artifact.mappings
        )

        lines.append(f"- **AI-Generated Lines**: ~{ai_lines}")
        lines.append(f"- **Files Modified**: {stats.files_modified}")
        lines.append(f"- **Conversation Length**: {stats.total_prompts} prompts")

        if stats.total_tokens > 0:
            lines.append(f"- **Tokens Used**: {stats.total_tokens:,}")

        # Duration
        if self.artifact.metadata.duration_seconds:
            duration_mins = self.artifact.metadata.duration_seconds / 60
            lines.append(f"- **Development Time**: {duration_mins:.0f} minutes")

        return "\n".join(lines)

    def _generate_files_section(self) -> str:
        """Generate files modified section."""
        lines = [
            "### 📝 Files Modified by AI",
            ""
        ]

        if not self.artifact.mappings:
            lines.append("*No file modifications recorded*")
            return "\n".join(lines)

        # Group mappings by file
        files_map = {}
        for mapping in self.artifact.mappings:
            file_path = mapping.file
            if file_path not in files_map:
                files_map[file_path] = []
            files_map[file_path].append(mapping)

        # Create file list with descriptions
        for file_path, file_mappings in files_map.items():
            # Get the first mapping for this file
            description = self._summarize_change(file_mappings[0], file_mappings)

            lines.append(f"- `{file_path}` - {description}")

        return "\n".join(lines)

    def _generate_highlights(self, max_highlights: int) -> str:
        """Generate conversation in alternating user/assistant format."""
        lines = [
            "### 💬 Conversation",
            ""
        ]

        if not self.artifact.conversation:
            lines.append("*No conversation available*")
            return "\n".join(lines)

        # Format the full conversation
        for msg in self.artifact.conversation:
            if msg.role == "user":
                # User prompt (plain text)
                lines.append(msg.content)
                lines.append("")
            elif msg.role == "assistant":
                # Assistant response (quoted with >)
                # Split content into lines and prefix each with >
                response_lines = msg.content.split("\n")
                for response_line in response_lines:
                    lines.append(f"> {response_line}")
                lines.append("")

        return "\n".join(lines)

    def _extract_key_decisions(self) -> List[str]:
        """
        Extract key technical decisions from the conversation.

        This is a simple heuristic-based extraction. In the future,
        this could use AI to extract decisions more intelligently.
        """
        decisions = []

        # Look for keywords in prompts that indicate decisions
        decision_keywords = [
            "use", "instead of", "chose", "decided",
            "implement", "add", "refactor", "change"
        ]

        for msg in self.artifact.conversation:
            if msg.role == "user" and msg.content:  # Ensure content exists
                content_lower = msg.content.lower()
                if any(keyword in content_lower for keyword in decision_keywords):
                    # This might be a key decision
                    if len(msg.content) < 150:  # Keep it concise
                        decisions.append(msg.content)

        # Limit to top 3 decisions
        return decisions[:3]

    def _generate_key_decisions(self, decisions: List[str]) -> str:
        """Generate key decisions section."""
        lines = [
            "### 💡 Key Decisions",
            ""
        ]

        for decision in decisions:
            lines.append(f"- {decision}")

        return "\n".join(lines)

    def _generate_testing_note(self) -> str:
        """Generate testing section."""
        return "\n".join([
            "### 🧪 Testing",
            "",
            "All changes have been implemented following best practices. "
            "Please review the conversation for context on specific implementation choices."
        ])

    def _generate_footer(self) -> str:
        """Generate footer with links."""
        lines = ["---", ""]

        footer_parts = [
            "*Generated by [TraceAI](https://github.com/yourteam/traceai)*"
        ]

        if self.gist_url:
            footer_parts.append(f"[View in VSCode](vscode://extension/traceai)")
            footer_parts.append(f"[Full Conversation]({self.gist_url})")

        lines.append(" • ".join(footer_parts))

        return "\n".join(lines)

    def _get_prompt_by_index(self, prompt_index: int) -> str:
        """Get full prompt text by index from conversation."""
        for msg in self.artifact.conversation:
            if msg.index == prompt_index and msg.role == "user":
                return msg.content
        return "Unknown prompt"

    def _summarize_change(
        self,
        first_mapping: PromptCodeMapping,
        mappings: List[PromptCodeMapping]
    ) -> str:
        """
        Summarize what changed in a file based on prompts.

        Args:
            first_mapping: First mapping that modified this file
            mappings: All mappings for this file

        Returns:
            Short description of changes
        """
        # Get the first prompt using prompt_index
        first_prompt = self._get_prompt_by_index(first_mapping.prompt_index)

        # Count different types of changes
        edits = sum(1 for m in mappings if m.tool == "Edit")
        writes = sum(1 for m in mappings if m.tool == "Write")

        # Extract action from first prompt
        prompt_lower = first_prompt.lower()

        if "add" in prompt_lower:
            action = "Added"
        elif "fix" in prompt_lower or "bug" in prompt_lower:
            action = "Fixed"
        elif "update" in prompt_lower or "change" in prompt_lower:
            action = "Updated"
        elif "refactor" in prompt_lower:
            action = "Refactored"
        elif "remove" in prompt_lower or "delete" in prompt_lower:
            action = "Removed"
        else:
            action = "Modified"

        # Create description
        if len(mappings) == 1:
            # Use the first prompt as-is
            description = first_prompt
            if len(description) > 60:
                description = description[:60] + "..."
            return description
        else:
            # Multiple changes
            return f"{action} functionality ({len(mappings)} changes)"

    def generate_commit_message(self, max_length: int = 72) -> str:
        """
        Generate a commit message based on the conversation.

        Args:
            max_length: Maximum length for commit subject line

        Returns:
            Git commit message
        """
        lines = []

        # Subject line (first user prompt, truncated)
        first_prompt = next(
            (msg.content for msg in self.artifact.conversation if msg.role == "user" and msg.content),
            "AI-assisted changes"
        )

        subject = first_prompt
        if len(subject) > max_length:
            subject = subject[:max_length - 3] + "..."

        lines.append(subject)
        lines.append("")

        # Body - list of files changed
        if self.artifact.mappings:
            files_map = {}
            for mapping in self.artifact.mappings:
                file_path = mapping.file
                if file_path not in files_map:
                    files_map[file_path] = []
                files_map[file_path].append(mapping)

            for file_path in files_map:
                lines.append(f"- Modified {file_path}")

        lines.append("")

        # Footer
        if self.gist_url:
            lines.append(f"Conversation: {self.gist_url}")

        lines.append("Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>")

        return "\n".join(lines)
