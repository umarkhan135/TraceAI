"""
Maps prompts to code changes using tool calls and git blame.
"""
import re
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timedelta
import git

from .parser import (
    parse_conversation,
    extract_tool_calls_from_message,
    extract_text_from_message,
    find_user_prompt_for_message,
)
from .models import CodeMapping


def extract_code_mappings(
    jsonl_path: Path,
    repo_path: Optional[Path] = None
) -> List[Dict[str, Any]]:
    """
    Extract prompt-to-code mappings from conversation.

    Args:
        jsonl_path: Path to conversation JSONL file
        repo_path: Optional path to git repo for enhanced mapping

    Returns:
        List of mapping dicts with prompt, tool calls, timestamps, files
    """
    mappings = []
    messages = list(parse_conversation(jsonl_path))

    for i, entry in enumerate(messages):
        # Only process assistant messages with tool calls
        if entry.get('type') != 'assistant':
            continue

        content = entry['message'].get('content', [])
        if not isinstance(content, list):
            continue

        # Extract assistant's text explanation
        assistant_text = extract_text_from_message(content)

        # Extract tool calls
        tool_calls = extract_tool_calls_from_message(content)

        if not tool_calls:
            continue

        # Find the user prompt that triggered this
        user_message = find_user_prompt_for_message(messages, i)
        if not user_message:
            continue

        prompt = extract_text_from_message(user_message['message'].get('content', ''))
        prompt_timestamp = user_message['timestamp']

        # Process each tool call
        for tool_call in tool_calls:
            tool_name = tool_call.get('name')
            tool_input = tool_call.get('input', {})

            # Focus on file-modifying tools
            if tool_name not in ['Edit', 'Write']:
                continue

            file_path = tool_input.get('file_path')
            if not file_path:
                continue

            # Normalize to relative path if repo_path provided
            if repo_path:
                try:
                    file_path = str(Path(file_path).relative_to(repo_path))
                except ValueError:
                    # File is outside repo, keep absolute path
                    pass

            # Extract line information if available (Edit tool)
            lines = None
            confidence = 0.9  # Default confidence

            if tool_name == 'Edit' and repo_path:
                lines, confidence = extract_line_numbers_from_edit(
                    tool_input,
                    repo_path / file_path if not Path(file_path).is_absolute() else Path(file_path)
                )

            mapping = {
                'file': file_path,
                'lines': lines,
                'prompt_index': i,
                'prompt_preview': prompt[:100] + '...' if len(prompt) > 100 else prompt,
                'timestamp': entry['timestamp'],
                'tool': tool_name,
                'tool_input': tool_input,
                'confidence': confidence,
            }

            mappings.append(mapping)

    return mappings


def extract_line_numbers_from_edit(
    tool_input: Dict[str, Any],
    file_path: Path
) -> Tuple[Optional[List[int]], float]:
    """
    Extract line numbers from an Edit tool call.

    Args:
        tool_input: The Edit tool's input dict (contains old_string, new_string)
        file_path: Path to the file being edited

    Returns:
        Tuple of ([start_line, end_line], confidence)
        Returns (None, 0.5) if line numbers cannot be determined
    """
    old_string = tool_input.get('old_string', '')
    if not old_string or not file_path.exists():
        return None, 0.5

    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            file_content = f.read()

        # Find the old_string in the file
        if old_string not in file_content:
            # File may have changed since the edit, can't determine lines
            return None, 0.3

        # Find the line numbers
        lines_before = file_content[:file_content.index(old_string)].count('\n')
        lines_in_old = old_string.count('\n')

        start_line = lines_before + 1  # 1-indexed
        end_line = start_line + lines_in_old

        return [start_line, end_line], 0.95

    except Exception as e:
        print(f"Warning: Could not extract line numbers from {file_path}: {e}")
        return None, 0.5


def correlate_with_git_blame(
    mappings: List[Dict[str, Any]],
    repo_path: Path,
    time_window_seconds: int = 300  # ±5 minutes
) -> List[Dict[str, Any]]:
    """
    Enhance mappings with git blame correlation.

    Args:
        mappings: List of mapping dicts from extract_code_mappings
        repo_path: Path to git repository
        time_window_seconds: Time window for matching (default 5 minutes)

    Returns:
        Enhanced mappings with git commit info and updated confidence scores
    """
    try:
        repo = git.Repo(repo_path)
    except git.exc.InvalidGitRepositoryError:
        print(f"Warning: {repo_path} is not a git repository, skipping git correlation")
        return mappings

    enhanced_mappings = []

    for mapping in mappings:
        file_path = mapping['file']
        timestamp_str = mapping['timestamp']

        # Parse timestamp
        try:
            mapping_time = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
        except ValueError:
            enhanced_mappings.append(mapping)
            continue

        # Get git blame for the file
        try:
            # Convert to absolute path for git
            abs_file_path = repo_path / file_path if not Path(file_path).is_absolute() else Path(file_path)

            if not abs_file_path.exists():
                enhanced_mappings.append(mapping)
                continue

            # Get commits that touched this file around the mapping time
            commits = list(repo.iter_commits(
                paths=str(abs_file_path.relative_to(repo_path)),
                max_count=10
            ))

            # Find commits within time window
            matching_commits = []
            for commit in commits:
                commit_time = datetime.fromtimestamp(commit.committed_date)
                time_diff = abs((commit_time - mapping_time.replace(tzinfo=None)).total_seconds())

                if time_diff <= time_window_seconds:
                    matching_commits.append({
                        'sha': commit.hexsha[:7],
                        'time': commit_time.isoformat(),
                        'message': commit.message.strip().split('\n')[0],
                        'time_diff_seconds': time_diff,
                    })

            if matching_commits:
                # Boost confidence if git commit found nearby
                mapping['confidence'] = min(mapping['confidence'] + 0.05, 1.0)
                mapping['git_commits'] = matching_commits

        except Exception as e:
            print(f"Warning: Could not correlate git blame for {file_path}: {e}")

        enhanced_mappings.append(mapping)

    return enhanced_mappings


def aggregate_mappings_by_file(mappings: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    """
    Group mappings by file for easier analysis.

    Returns:
        Dict mapping file path to list of mappings for that file
    """
    by_file = {}
    for mapping in mappings:
        file_path = mapping['file']
        if file_path not in by_file:
            by_file[file_path] = []
        by_file[file_path].append(mapping)

    return by_file


def get_mapping_summary(mappings: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Generate summary statistics about mappings.

    Returns:
        Dict with counts, confidence metrics, etc.
    """
    if not mappings:
        return {
            'total_mappings': 0,
            'unique_files': 0,
            'avg_confidence': 0.0,
            'tools_used': {},
        }

    unique_files = set(m['file'] for m in mappings)
    avg_confidence = sum(m['confidence'] for m in mappings) / len(mappings)

    # Count tool usage
    tools_used = {}
    for mapping in mappings:
        tool = mapping['tool']
        tools_used[tool] = tools_used.get(tool, 0) + 1

    # Count line-level vs file-level mappings
    line_level = sum(1 for m in mappings if m['lines'] is not None)
    file_level = len(mappings) - line_level

    return {
        'total_mappings': len(mappings),
        'unique_files': len(unique_files),
        'avg_confidence': round(avg_confidence, 2),
        'line_level_mappings': line_level,
        'file_level_mappings': file_level,
        'tools_used': tools_used,
    }
