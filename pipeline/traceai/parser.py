"""
Parser for Claude Code conversation files.
"""
import json
from pathlib import Path
from typing import Dict, Any, List, Iterator, Optional
from datetime import datetime


def get_project_directory_name(project_path: str) -> str:
    """
    Convert project path to Claude's directory name format.

    Example:
        /Users/dylan/Desktop/repos/TraceAI -> -Users-dylan-Desktop-repos-TraceAI
    """
    # Remove leading slash and replace remaining slashes with hyphens
    normalized = project_path.replace('/', '-')
    if normalized.startswith('-'):
        return normalized
    return '-' + normalized


def find_claude_projects_dir(project_path: str) -> Path:
    """Find the Claude projects directory for a given project."""
    project_dir_name = get_project_directory_name(project_path)
    claude_projects_dir = Path.home() / '.claude' / 'projects' / project_dir_name

    if not claude_projects_dir.exists():
        raise ValueError(
            f"No Claude Code conversations found for {project_path}\n"
            f"Expected directory: {claude_projects_dir}"
        )

    return claude_projects_dir


def find_conversation_file(
    project_path: str,
    session_id: Optional[str] = None
) -> Path:
    """
    Find the conversation file for a project.

    Args:
        project_path: Absolute path to project (e.g., /Users/dylan/Desktop/repos/TraceAI)
        session_id: Optional specific session ID. If None, finds the most recent.

    Returns:
        Path to .jsonl conversation file

    Raises:
        ValueError: If no conversation files found
    """
    claude_projects_dir = find_claude_projects_dir(project_path)

    if session_id:
        conv_file = claude_projects_dir / f"{session_id}.jsonl"
        if not conv_file.exists():
            raise ValueError(f"Session {session_id} not found in {claude_projects_dir}")
        return conv_file

    # Find most recent conversation (by file modification time)
    jsonl_files = list(claude_projects_dir.glob("*.jsonl"))
    if not jsonl_files:
        raise ValueError(f"No conversation files found in {claude_projects_dir}")

    return max(jsonl_files, key=lambda p: p.stat().st_mtime)


def list_conversation_files(project_path: str) -> List[Dict[str, Any]]:
    """
    List all conversation files for a project with metadata.

    Returns:
        List of dicts with session_id, path, modified_time
    """
    try:
        claude_projects_dir = find_claude_projects_dir(project_path)
    except ValueError:
        return []

    conversations = []
    for jsonl_file in claude_projects_dir.glob("*.jsonl"):
        conversations.append({
            'session_id': jsonl_file.stem,
            'path': str(jsonl_file),
            'modified_time': datetime.fromtimestamp(jsonl_file.stat().st_mtime).isoformat(),
            'size_bytes': jsonl_file.stat().st_size,
        })

    # Sort by modification time, newest first
    conversations.sort(key=lambda x: x['modified_time'], reverse=True)
    return conversations


def parse_conversation(jsonl_path: Path) -> Iterator[Dict[str, Any]]:
    """
    Parse JSONL conversation file line by line.

    Yields:
        Dictionary for each message entry

    Note:
        Skips malformed lines with a warning instead of crashing
    """
    if not jsonl_path.exists():
        raise FileNotFoundError(f"Conversation file not found: {jsonl_path}")

    with open(jsonl_path, 'r', encoding='utf-8') as f:
        for line_num, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue

            try:
                entry = json.loads(line)
                yield entry
            except json.JSONDecodeError as e:
                print(f"Warning: Failed to parse line {line_num} in {jsonl_path}: {e}")
                continue


def get_conversation_metadata(jsonl_path: Path) -> Dict[str, Any]:
    """
    Extract metadata from conversation without parsing the entire file.

    Returns:
        Dict with session_id, start_time, end_time, message_count
    """
    messages = list(parse_conversation(jsonl_path))

    if not messages:
        raise ValueError(f"No valid messages found in {jsonl_path}")

    session_id = messages[0].get('sessionId', 'unknown')
    start_time = messages[0].get('timestamp')
    end_time = messages[-1].get('timestamp')

    # Count message types
    user_messages = sum(1 for m in messages if m.get('type') == 'user')
    assistant_messages = sum(1 for m in messages if m.get('type') == 'assistant')

    return {
        'session_id': session_id,
        'start_time': start_time,
        'end_time': end_time,
        'total_messages': len(messages),
        'user_messages': user_messages,
        'assistant_messages': assistant_messages,
    }


def extract_tool_calls_from_message(message_content: Any) -> List[Dict[str, Any]]:
    """
    Extract tool calls from an assistant message content.

    Args:
        message_content: The 'content' field from an assistant message

    Returns:
        List of tool call dicts with name, id, and input
    """
    if not isinstance(message_content, list):
        return []

    tool_calls = []
    for item in message_content:
        if isinstance(item, dict) and item.get('type') == 'tool_use':
            tool_calls.append({
                'name': item.get('name'),
                'id': item.get('id'),
                'input': item.get('input', {}),
            })

    return tool_calls


def extract_text_from_message(message_content: Any) -> str:
    """
    Extract text content from a message (handles both string and list formats).

    Args:
        message_content: The 'content' field from a message

    Returns:
        Concatenated text content
    """
    if isinstance(message_content, str):
        return message_content

    if isinstance(message_content, list):
        text_parts = []
        for item in message_content:
            if isinstance(item, dict) and item.get('type') == 'text':
                text_parts.append(item.get('text', ''))
            elif isinstance(item, str):
                text_parts.append(item)
        return ' '.join(text_parts)

    return str(message_content)


def find_user_prompt_for_message(
    messages: List[Dict[str, Any]],
    current_index: int
) -> Optional[Dict[str, Any]]:
    """
    Find the user prompt that triggered an assistant message.

    Args:
        messages: List of all messages
        current_index: Index of current assistant message

    Returns:
        User message dict or None if not found
    """
    # Look backwards for the most recent user message
    for i in range(current_index - 1, -1, -1):
        if messages[i].get('type') == 'user':
            return messages[i]
    return None
