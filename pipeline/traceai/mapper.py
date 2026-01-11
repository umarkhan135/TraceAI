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
    mappings = []
    messages = list(parse_conversation(jsonl_path))

    for i, entry in enumerate(messages):
        if entry.get('type') != 'assistant':
            continue

        content = entry['message'].get('content', [])
        if not isinstance(content, list):
            continue

        assistant_text = extract_text_from_message(content)
        tool_calls = extract_tool_calls_from_message(content)

        if not tool_calls:
            continue

        user_message = find_user_prompt_for_message(messages, i)
        if not user_message:
            continue

        prompt = extract_text_from_message(user_message.get('message', {}).get('content', ''))
        prompt_timestamp = user_message.get('timestamp')

        user_message_index = None
        for idx, msg in enumerate(messages):
            if msg is user_message:
                user_message_index = idx
                break

        for tool_call in tool_calls:
            tool_name = tool_call.get('name')
            tool_input = tool_call.get('input', {})

            if tool_name not in ['Edit', 'Write']:
                continue

            file_path = tool_input.get('file_path')
            if not file_path:
                continue

            if repo_path:
                try:
                    file_path = str(Path(file_path).relative_to(repo_path))
                except ValueError:
                    pass

            lines = None
            confidence = 0.9

            if tool_name == 'Edit' and repo_path:
                lines, confidence = extract_line_numbers_from_edit(
                    tool_input,
                    repo_path / file_path if not Path(file_path).is_absolute() else Path(file_path)
                )
            elif tool_name == 'Write':
                lines, confidence = extract_line_numbers_from_write(tool_input)

            mapping = {
                'file': file_path,
                'lines': lines,
                'prompt_index': user_message_index if user_message_index is not None else i,
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
    old_string = tool_input.get('old_string', '')
    if not old_string or not file_path.exists():
        return None, 0.5

    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            file_content = f.read()

        if old_string not in file_content:
            return None, 0.3

        lines_before = file_content[:file_content.index(old_string)].count('\n')
        lines_in_old = old_string.count('\n')

        start_line = lines_before + 1
        end_line = start_line + lines_in_old

        return [start_line, end_line], 0.95

    except Exception as e:
        print(f"Warning: Could not extract line numbers from {file_path}: {e}")
        return None, 0.5


def extract_line_numbers_from_write(
    tool_input: Dict[str, Any]
) -> Tuple[Optional[List[int]], float]:
    content = tool_input.get('content', '')
    if not content:
        return None, 0.5

    num_lines = content.count('\n')

    if content and not content.endswith('\n'):
        num_lines += 1

    if num_lines == 0:
        num_lines = 1

    return [1, num_lines], 0.95


def correlate_with_git_blame(
    mappings: List[Dict[str, Any]],
    repo_path: Path,
    time_window_seconds: int = 300
) -> List[Dict[str, Any]]:
    try:
        repo = git.Repo(repo_path)
    except git.exc.InvalidGitRepositoryError:
        print(f"Warning: {repo_path} is not a git repository, skipping git correlation")
        return mappings

    enhanced_mappings = []

    for mapping in mappings:
        file_path = mapping['file']
        timestamp_str = mapping['timestamp']

        try:
            mapping_time = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
        except ValueError:
            enhanced_mappings.append(mapping)
            continue

        try:
            abs_file_path = repo_path / file_path if not Path(file_path).is_absolute() else Path(file_path)

            if not abs_file_path.exists():
                enhanced_mappings.append(mapping)
                continue

            commits = list(repo.iter_commits(
                paths=str(abs_file_path.relative_to(repo_path)),
                max_count=10
            ))

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
                mapping['confidence'] = min(mapping['confidence'] + 0.05, 1.0)
                mapping['git_commits'] = matching_commits

        except Exception as e:
            print(f"Warning: Could not correlate git blame for {file_path}: {e}")

        enhanced_mappings.append(mapping)

    return enhanced_mappings


def aggregate_mappings_by_file(mappings: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    by_file = {}
    for mapping in mappings:
        file_path = mapping['file']
        if file_path not in by_file:
            by_file[file_path] = []
        by_file[file_path].append(mapping)

    return by_file


def get_mapping_summary(mappings: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not mappings:
        return {
            'total_mappings': 0,
            'unique_files': 0,
            'avg_confidence': 0.0,
            'tools_used': {},
        }

    unique_files = set(m['file'] for m in mappings)
    avg_confidence = sum(m['confidence'] for m in mappings) / len(mappings)

    tools_used = {}
    for mapping in mappings:
        tool = mapping['tool']
        tools_used[tool] = tools_used.get(tool, 0) + 1

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
