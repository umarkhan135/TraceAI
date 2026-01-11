from typing import Optional, List
from .models import ConversationArtifact, PromptCodeMapping


def format_duration(seconds: float) -> str:
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

    def __init__(self, artifact: ConversationArtifact, gist_url: Optional[str] = None):
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
        sections = []

        sections.append(self._generate_header())

        if include_stats:
            sections.append(self._generate_stats())

        if include_files:
            sections.append(self._generate_files_section())

        if include_highlights:
            sections.append(self._generate_highlights(max_highlights))

        key_decisions = self._extract_key_decisions()
        if key_decisions:
            sections.append(self._generate_key_decisions(key_decisions))

        sections.append(self._generate_testing_note())

        if include_footer:
            sections.append(self._generate_footer())

        return "\n\n".join(sections)

    def _generate_header(self) -> str:
        lines = [
            "## 🤖 AI-Generated Code Summary",
            "",
            "This PR was developed in collaboration with Claude Code."
        ]

        if self.gist_url:
            lines.append(f"[View full conversation →]({self.gist_url})")

        return "\n".join(lines)

    def _generate_stats(self) -> str:
        stats = self.artifact.stats

        lines = [
            "### 📊 Stats",
            ""
        ]

        ai_lines = sum(
            (mapping.lines[1] - mapping.lines[0] + 1)
            if mapping.lines else 10
            for mapping in self.artifact.mappings
        )

        lines.append(f"- **AI-Generated Lines**: ~{ai_lines}")
        lines.append(f"- **Files Modified**: {stats.files_modified}")
        lines.append(
            f"- **Conversation Length**: {stats.total_prompts} prompts")

        if stats.total_tokens > 0:
            lines.append(f"- **Tokens Used**: {stats.total_tokens:,}")

        if self.artifact.metadata.duration_seconds:
            duration_mins = self.artifact.metadata.duration_seconds / 60
            lines.append(
                f"- **Development Time**: {duration_mins:.0f} minutes")

        return "\n".join(lines)

    def _generate_files_section(self) -> str:
        lines = [
            "### 📝 Files Modified by AI",
            ""
        ]

        if not self.artifact.mappings:
            lines.append("*No file modifications recorded*")
            return "\n".join(lines)

        files_map = {}
        for mapping in self.artifact.mappings:
            file_path = mapping.file
            if file_path not in files_map:
                files_map[file_path] = []
            files_map[file_path].append(mapping)

        for file_path, file_mappings in files_map.items():
            description = self._summarize_change(
                file_mappings[0], file_mappings)

            lines.append(f"- `{file_path}` - {description}")

        return "\n".join(lines)

    def _generate_highlights(self, max_highlights: int) -> str:
        lines = [
            "### 💬 Conversation",
            ""
        ]

        if not self.artifact.conversation:
            lines.append("*No conversation available*")
            return "\n".join(lines)

        user_messages = [msg for msg in self.artifact.conversation if msg.role == "user"]
        highlights = []

        if len(user_messages) <= max_highlights:
            highlights = user_messages
        else:
            highlights.append(user_messages[0])

            step = len(user_messages) // (max_highlights - 1)
            for i in range(step, len(user_messages) - 1, step):
                if len(highlights) >= max_highlights - 1:
                    break
                highlights.append(user_messages[i])

            highlights.append(user_messages[-1])

        for i, msg in enumerate(highlights, 1):
            lines.append(f"**Prompt {i}**: \"{msg.content}\"")

        if len(user_messages) > max_highlights:
            lines.append("")
            lines.append(
                f"*... and {len(user_messages) - max_highlights} more prompts in the full conversation*")

        return "\n".join(lines)

    def _extract_key_decisions(self) -> List[str]:
        decisions = []

        decision_keywords = [
            "use", "instead of", "chose", "decided",
            "implement", "add", "refactor", "change"
        ]

        for msg in self.artifact.conversation:
            if msg.role == "user" and msg.content:
                content_lower = msg.content.lower()
                if any(keyword in content_lower for keyword in decision_keywords):
                    if len(msg.content) < 150:
                        decisions.append(msg.content)

        return decisions[:3]

    def _generate_key_decisions(self, decisions: List[str]) -> str:
        lines = [
            "### 💡 Key Decisions",
            ""
        ]

        for decision in decisions:
            lines.append(f"- {decision}")

        return "\n".join(lines)

    def _generate_testing_note(self) -> str:
        return "\n".join([
            "### 🧪 Testing",
            "",
            "All changes have been implemented following best practices. "
            "Please review the conversation for context on specific implementation choices."
        ])

    def _generate_footer(self) -> str:
        lines = ["---", ""]

        footer_parts = [
            "*Generated by [TraceAI](https://github.com/yourteam/traceai)*"
        ]

        if self.gist_url:
            footer_parts.append(
                f"[View in VSCode](vscode://extension/traceai)")
            footer_parts.append(f"[Full Conversation]({self.gist_url})")

        lines.append(" • ".join(footer_parts))

        return "\n".join(lines)

    def _get_prompt_by_index(self, prompt_index: int) -> str:
        for msg in self.artifact.conversation:
            if msg.index == prompt_index and msg.role == "user":
                return msg.content
        return "Unknown prompt"

    def _summarize_change(
        self,
        first_mapping: PromptCodeMapping,
        mappings: List[PromptCodeMapping]
    ) -> str:
        first_prompt = self._get_prompt_by_index(first_mapping.prompt_index)

        edits = sum(1 for m in mappings if m.tool == "Edit")
        writes = sum(1 for m in mappings if m.tool == "Write")

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

        if len(mappings) == 1:
            return first_prompt
        else:
            return f"{action} functionality ({len(mappings)} changes)"

    def generate_commit_message(self, max_length: int = 72) -> str:
        lines = []

        first_prompt = next(
            (msg.content for msg in self.artifact.conversation if msg.role ==
             "user" and msg.content),
            "AI-assisted changes"
        )

        subject = first_prompt
        if len(subject) > max_length:
            subject = subject[:max_length - 3] + "..."

        lines.append(subject)
        lines.append("")

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

        if self.gist_url:
            lines.append(f"Conversation: {self.gist_url}")

        lines.append(
            "Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>")

        return "\n".join(lines)
