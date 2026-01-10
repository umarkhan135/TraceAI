"""
AI-powered conversation summarization using Claude API.
"""
import os
import json
from typing import Optional, List, Dict, Any
from anthropic import Anthropic, APIError

from .models import ConversationArtifact, ConversationSummary


def is_anthropic_available() -> bool:
    """Check if Anthropic API is available."""
    try:
        import anthropic
        return bool(os.getenv('ANTHROPIC_API_KEY'))
    except ImportError:
        return False


def format_conversation_for_analysis(artifact: ConversationArtifact, max_messages: int = 50) -> str:
    """
    Format conversation for AI analysis.

    Args:
        artifact: The conversation artifact
        max_messages: Maximum messages to include (prevent token overflow)

    Returns:
        Formatted conversation string
    """
    lines = []

    # Take first half and last half if too many messages
    messages = artifact.conversation
    if len(messages) > max_messages:
        first_half = messages[:max_messages//2]
        last_half = messages[-(max_messages//2):]
        messages = first_half + last_half
        lines.append(f"[Showing {max_messages} of {len(artifact.conversation)} messages]\n")

    for msg in messages:
        if msg.role == 'user':
            lines.append(f"USER: {msg.content[:500]}")  # Truncate long prompts
        elif msg.role == 'assistant':
            # Show text response and tool calls
            if msg.content:
                lines.append(f"ASSISTANT: {msg.content[:300]}")
            if msg.tool_calls:
                tools = [f"{tc.name}({tc.input.get('file_path', 'N/A')})" for tc in msg.tool_calls]
                lines.append(f"  Tools used: {', '.join(tools)}")
        lines.append("")

    return '\n'.join(lines)


def format_mappings_for_analysis(artifact: ConversationArtifact) -> str:
    """Format code mappings for AI analysis."""
    lines = []

    # Group by file
    files_map: Dict[str, List[Any]] = {}
    for mapping in artifact.mappings:
        if mapping.file not in files_map:
            files_map[mapping.file] = []
        files_map[mapping.file].append(mapping)

    for file_path, mappings in files_map.items():
        lines.append(f"FILE: {file_path}")
        for m in mappings:
            lines.append(f"  - Prompt: {m.prompt_preview}")
            lines.append(f"    Tool: {m.tool}")
            if m.lines:
                lines.append(f"    Lines: {m.lines[0]}-{m.lines[1]}")
        lines.append("")

    return '\n'.join(lines)


def generate_ai_summary(artifact: ConversationArtifact) -> Optional[ConversationSummary]:
    """
    Generate intelligent summary using Claude API.

    Args:
        artifact: The conversation artifact to summarize

    Returns:
        ConversationSummary or None if generation fails
    """
    if not is_anthropic_available():
        print("Warning: Anthropic API not available (set ANTHROPIC_API_KEY)")
        return None

    try:
        client = Anthropic(api_key=os.getenv('ANTHROPIC_API_KEY'))

        # Build analysis prompt
        prompt = build_analysis_prompt(artifact)

        # Call Claude API
        response = client.messages.create(
            model="claude-sonnet-4-20250514",  # Latest Sonnet
            max_tokens=2000,
            temperature=0.3,  # Lower temperature for more focused analysis
            messages=[
                {
                    "role": "user",
                    "content": prompt
                }
            ]
        )

        # Parse response
        response_text = response.content[0].text

        # Extract JSON from response (Claude might wrap it in markdown)
        json_text = extract_json_from_response(response_text)
        summary_data = json.loads(json_text)

        # Validate and create ConversationSummary
        return ConversationSummary(
            overview=summary_data.get('overview'),
            key_decisions=summary_data.get('key_decisions', []),
            files_summary=summary_data.get('files_summary', {}),
        )

    except APIError as e:
        print(f"Warning: Claude API error: {e}")
        return None
    except json.JSONDecodeError as e:
        print(f"Warning: Failed to parse Claude response as JSON: {e}")
        return None
    except Exception as e:
        print(f"Warning: Failed to generate AI summary: {e}")
        return None


def build_analysis_prompt(artifact: ConversationArtifact) -> str:
    """Build the prompt for Claude to analyze the conversation."""

    conversation_text = format_conversation_for_analysis(artifact)
    mappings_text = format_mappings_for_analysis(artifact)

    prompt = f"""You are analyzing an AI-assisted coding session to generate a concise, useful summary for code reviewers.

## CONVERSATION HISTORY
{conversation_text}

## FILES CHANGED
{mappings_text}

## STATISTICS
- Total prompts: {artifact.stats.total_prompts}
- Files modified: {artifact.stats.files_modified}
- Total messages: {artifact.stats.total_messages}

## YOUR TASK

Analyze this conversation and provide:

1. **Overview** (1-2 sentences): What was built/changed and why?

2. **Key Decisions** (3-5 bullet points): Important technical choices made during development
   - Focus on architectural decisions, library choices, implementation approaches
   - Explain WHY, not just WHAT
   - Example: "Used React hooks instead of class components for cleaner state management"

3. **Files Summary** (for each modified file): Brief description of what changed and why
   - Format: {{"file_path": "description"}}
   - Keep descriptions concise (1 sentence each)
   - Focus on the PURPOSE of changes, not implementation details

## OUTPUT FORMAT

Return ONLY a valid JSON object with this structure:

{{
  "overview": "string (1-2 sentences)",
  "key_decisions": [
    "string (technical decision with rationale)",
    "string (technical decision with rationale)",
    ...
  ],
  "files_summary": {{
    "file_path": "brief description of changes and purpose",
    ...
  }}
}}

IMPORTANT:
- Return ONLY the JSON object, no markdown code blocks or extra text
- Ensure all strings are properly escaped
- Focus on insights useful for code review, not just listing what happened
- If the conversation shows iterations/refinements, mention them in key_decisions
- Be concise but informative

Generate the summary now:"""

    return prompt


def extract_json_from_response(response_text: str) -> str:
    """
    Extract JSON from Claude's response.

    Claude sometimes wraps JSON in markdown code blocks.
    """
    text = response_text.strip()

    # Check if wrapped in markdown code block
    if text.startswith('```json'):
        # Extract content between ```json and ```
        lines = text.split('\n')
        json_lines = []
        in_code_block = False

        for line in lines:
            if line.strip() == '```json':
                in_code_block = True
                continue
            elif line.strip() == '```' and in_code_block:
                break
            elif in_code_block:
                json_lines.append(line)

        return '\n'.join(json_lines)

    elif text.startswith('```'):
        # Generic code block
        lines = text.split('\n')
        json_lines = []
        in_code_block = False

        for line in lines:
            if line.strip().startswith('```'):
                if not in_code_block:
                    in_code_block = True
                    continue
                else:
                    break
            elif in_code_block:
                json_lines.append(line)

        return '\n'.join(json_lines)

    # Assume it's raw JSON
    return text


def generate_fallback_summary(artifact: ConversationArtifact) -> ConversationSummary:
    """
    Generate a basic summary without AI when API is unavailable.

    Args:
        artifact: The conversation artifact

    Returns:
        Basic ConversationSummary
    """
    # Extract file names
    files = list(set(m.file for m in artifact.mappings))

    # Create basic files summary
    files_summary = {}
    for file_path in files:
        file_mappings = [m for m in artifact.mappings if m.file == file_path]
        edit_count = len(file_mappings)
        files_summary[file_path] = f"Modified by {edit_count} AI edit{'s' if edit_count > 1 else ''}"

    # Basic overview
    overview = f"Modified {len(files)} file{'s' if len(files) != 1 else ''} through {artifact.stats.total_prompts} prompts"

    return ConversationSummary(
        overview=overview,
        key_decisions=[],
        files_summary=files_summary,
    )
