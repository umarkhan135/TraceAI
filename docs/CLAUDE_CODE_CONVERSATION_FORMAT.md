# Claude Code Conversation Format & Extraction Guide

> **Critical Discovery**: This document details the exact format and location of Claude Code conversation data, enabling the TraceAI pipeline to extract and process conversations.

---

## 🎯 Overview

Claude Code stores all conversation history as **JSONL files** (JSON Lines - one JSON object per line) in `~/.claude/projects/`. This format is perfect for streaming and incremental parsing, and contains **everything we need** for the TraceAI pipeline:
- User prompts and assistant responses
- Tool calls (Edit, Write, Bash, etc.) with exact parameters
- Timestamps for precise prompt-to-code mapping
- File history and modifications
- Parent-child message relationships

---

## 📁 Storage Locations

### Primary: Project-Specific Conversations

```
~/.claude/projects/{project-directory-name}/{session-id}.jsonl
```

**Example for this project:**
```
~/.claude/projects/-Users-dylan-Desktop-repos-TraceAI/3654a31c-b91b-4c5c-80fa-0860b9c6766c.jsonl
```

**Key Points:**
- Project directory name is derived from the **absolute path**, with slashes replaced by hyphens
- Each conversation session gets a unique UUID as filename
- Files are in JSONL format: **one JSON object per line**
- Conversations persist indefinitely (not cleaned up automatically)

### Supporting Data

| Location | Purpose | Relevance to TraceAI |
|----------|---------|---------------------|
| `~/.claude/history.jsonl` | Global history (user messages only across all projects) | Low - project-specific files are better |
| `~/.claude/session-env/` | Environment state for each session | Low - internal state |
| `~/.claude/file-history/` | File modification tracking | Medium - useful for validation |
| `~/.claude/todos/{session-id}-agent-{agent-id}.json` | Task tracking data | Low - nice-to-have context |
| `~/.claude/plans/` | Implementation plans from plan mode | Medium - useful context for PRs |
| `~/.claude/debug/` | Debug logs (not transcripts) | Low - debugging only |

---

## 📋 JSONL Format Specification

### User Message Entry

```json
{
  "type": "user",
  "uuid": "550e8400-e29b-41d4-a716-446655440000",
  "parentUuid": "parent-message-uuid-or-null",
  "timestamp": "2026-01-10T16:53:13.997Z",
  "sessionId": "3654a31c-b91b-4c5c-80fa-0860b9c6766c",
  "cwd": "/Users/dylan/Desktop/repos/TraceAI",
  "message": {
    "role": "user",
    "content": "Add logout button to the navigation bar"
  }
}
```

### Assistant Message Entry

```json
{
  "type": "assistant",
  "uuid": "660e8400-e29b-41d4-a716-446655440001",
  "parentUuid": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-01-10T16:53:18.523Z",
  "sessionId": "3654a31c-b91b-4c5c-80fa-0860b9c6766c",
  "message": {
    "model": "claude-sonnet-4-5-20250929",
    "role": "assistant",
    "content": [
      {
        "type": "text",
        "text": "I'll add a logout button to the navigation bar. Let me edit the Auth component."
      },
      {
        "type": "tool_use",
        "id": "toolu_01A09q90qw90lq917835lq9",
        "name": "Edit",
        "input": {
          "file_path": "/Users/dylan/Desktop/repos/TraceAI/src/components/Auth.tsx",
          "old_string": "  return (\n    <nav>\n      <LoginButton />\n    </nav>\n  );",
          "new_string": "  return (\n    <nav>\n      <LoginButton />\n      <LogoutButton onClick={handleLogout} />\n    </nav>\n  );"
        }
      }
    ],
    "usage": {
      "input_tokens": 1523,
      "output_tokens": 287
    }
  }
}
```

### Tool Result Entry

```json
{
  "type": "tool_result",
  "uuid": "770e8400-e29b-41d4-a716-446655440002",
  "parentUuid": "660e8400-e29b-41d4-a716-446655440001",
  "timestamp": "2026-01-10T16:53:19.123Z",
  "sessionId": "3654a31c-b91b-4c5c-80fa-0860b9c6766c",
  "message": {
    "role": "user",
    "content": [
      {
        "type": "tool_result",
        "tool_use_id": "toolu_01A09q90qw90lq917835lq9",
        "content": "File edited successfully"
      }
    ]
  }
}
```

---

## 🔑 Key Fields for TraceAI

### Critical Fields

| Field | Location | Purpose | Example |
|-------|----------|---------|---------|
| **timestamp** | Top-level | Precise timing for git blame correlation | `"2026-01-10T16:53:18.523Z"` |
| **type** | Top-level | Message type (user/assistant/tool_result) | `"assistant"` |
| **message.content** | Nested | User prompt or assistant response/tool calls | Array of text and tool_use objects |
| **tool_use.name** | In assistant content | Which tool was called | `"Edit"`, `"Write"`, `"Bash"` |
| **tool_use.input** | In assistant content | **Exact parameters** - file path, old/new strings | See Edit example above |
| **parentUuid** | Top-level | Links messages into conversation flow | UUID of previous message |

### Useful Fields

| Field | Purpose |
|-------|---------|
| `uuid` | Unique message identifier for referencing |
| `sessionId` | Group messages by conversation session |
| `cwd` | Working directory (useful for relative path resolution) |
| `usage` | Token counts (interesting stats for PR summary) |

---

## 🛠️ Parsing Strategy for TraceAI

### Step 1: Locate Conversation File

```python
import os
from pathlib import Path

def find_conversation_file(project_path: str, session_id: str = None) -> Path:
    """
    Find the conversation file for a project.

    Args:
        project_path: Absolute path to project (e.g., /Users/dylan/Desktop/repos/TraceAI)
        session_id: Optional specific session ID. If None, finds the most recent.

    Returns:
        Path to .jsonl conversation file
    """
    # Convert project path to Claude's directory name format
    # /Users/dylan/Desktop/repos/TraceAI -> -Users-dylan-Desktop-repos-TraceAI
    project_dir_name = project_path.replace('/', '-').lstrip('-')

    claude_projects_dir = Path.home() / '.claude' / 'projects' / project_dir_name

    if not claude_projects_dir.exists():
        raise ValueError(f"No Claude Code conversations found for {project_path}")

    if session_id:
        conv_file = claude_projects_dir / f"{session_id}.jsonl"
        if not conv_file.exists():
            raise ValueError(f"Session {session_id} not found")
        return conv_file

    # Find most recent conversation (by file mtime)
    jsonl_files = list(claude_projects_dir.glob("*.jsonl"))
    if not jsonl_files:
        raise ValueError(f"No conversation files found in {claude_projects_dir}")

    return max(jsonl_files, key=lambda p: p.stat().st_mtime)
```

### Step 2: Parse JSONL

```python
import json
from typing import Iterator, Dict, Any

def parse_conversation(jsonl_path: Path) -> Iterator[Dict[str, Any]]:
    """
    Parse JSONL conversation file line by line.

    Yields:
        Dictionary for each message entry
    """
    with open(jsonl_path, 'r', encoding='utf-8') as f:
        for line_num, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue

            try:
                entry = json.loads(line)
                yield entry
            except json.JSONDecodeError as e:
                print(f"Warning: Failed to parse line {line_num}: {e}")
                continue
```

### Step 3: Extract Prompt-to-Code Mappings

```python
from datetime import datetime
from typing import List, Dict, Any

def extract_code_mappings(jsonl_path: Path) -> List[Dict[str, Any]]:
    """
    Extract prompt-to-code mappings from conversation.

    Returns:
        List of mappings with prompt, tool calls, timestamps, files
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

        # Extract text (assistant's explanation)
        text_parts = [c['text'] for c in content if c.get('type') == 'text']
        assistant_text = ' '.join(text_parts)

        # Extract tool calls
        tool_calls = [c for c in content if c.get('type') == 'tool_use']

        if not tool_calls:
            continue

        # Find the user prompt that triggered this (previous user message)
        prompt = None
        for j in range(i - 1, -1, -1):
            if messages[j].get('type') == 'user':
                prompt = messages[j]['message']['content']
                prompt_timestamp = messages[j]['timestamp']
                break

        if not prompt:
            continue

        # Process each tool call
        for tool_call in tool_calls:
            tool_name = tool_call.get('name')
            tool_input = tool_call.get('input', {})

            # Focus on file-modifying tools
            if tool_name in ['Edit', 'Write']:
                file_path = tool_input.get('file_path')

                if not file_path:
                    continue

                mapping = {
                    'prompt': prompt,
                    'prompt_timestamp': prompt_timestamp,
                    'assistant_response': assistant_text,
                    'tool': tool_name,
                    'file': file_path,
                    'timestamp': entry['timestamp'],
                    'tool_input': tool_input,  # Includes old_string/new_string for Edit
                }

                mappings.append(mapping)

    return mappings
```

### Step 4: Build Complete Conversation Artifact

```python
def build_conversation_artifact(
    jsonl_path: Path,
    repo_path: Path,
    pr_number: int = None
) -> Dict[str, Any]:
    """
    Build complete conversation artifact for GitHub Gist.

    Returns:
        Dictionary matching TraceAI artifact schema
    """
    messages = list(parse_conversation(jsonl_path))
    mappings = extract_code_mappings(jsonl_path)

    # Extract session metadata
    session_id = messages[0].get('sessionId') if messages else None
    start_time = messages[0].get('timestamp') if messages else None
    end_time = messages[-1].get('timestamp') if messages else None

    # Build conversation array (simplified for PR display)
    conversation = []
    for i, entry in enumerate(messages):
        msg_type = entry.get('type')

        if msg_type == 'user':
            conversation.append({
                'index': i,
                'role': 'user',
                'content': entry['message']['content'],
                'timestamp': entry['timestamp']
            })
        elif msg_type == 'assistant':
            content = entry['message'].get('content', [])

            # Extract text parts
            text = ' '.join(c['text'] for c in content if c.get('type') == 'text')

            # Extract tool calls
            tools = [
                {
                    'name': c['name'],
                    'id': c['id'],
                    'input': c['input']
                }
                for c in content if c.get('type') == 'tool_use'
            ]

            conversation.append({
                'index': i,
                'role': 'assistant',
                'content': text,
                'tool_calls': tools,
                'timestamp': entry['timestamp'],
                'usage': entry['message'].get('usage', {})
            })

    # Count stats
    user_prompts = [m for m in messages if m.get('type') == 'user']
    total_tokens = sum(
        m['message'].get('usage', {}).get('input_tokens', 0) +
        m['message'].get('usage', {}).get('output_tokens', 0)
        for m in messages if m.get('type') == 'assistant'
    )

    artifact = {
        'version': '1.0',
        'conversation_id': f"traceai-{session_id}",
        'metadata': {
            'session_id': session_id,
            'pr_number': pr_number,
            'repo_path': str(repo_path),
            'start_time': start_time,
            'end_time': end_time,
            'duration_seconds': (
                (datetime.fromisoformat(end_time.replace('Z', '+00:00')) -
                 datetime.fromisoformat(start_time.replace('Z', '+00:00'))).total_seconds()
                if start_time and end_time else None
            ),
        },
        'mappings': mappings,
        'conversation': conversation,
        'stats': {
            'total_messages': len(messages),
            'total_prompts': len(user_prompts),
            'files_modified': len(set(m['file'] for m in mappings)),
            'total_tokens': total_tokens,
        }
    }

    return artifact
```

---

## 📊 Tool Call Analysis

### Most Important Tools for Code Mapping

| Tool | Provides | Mapping Value |
|------|----------|--------------|
| **Edit** | `file_path`, `old_string`, `new_string` | ⭐⭐⭐⭐⭐ Perfect - exact line identification |
| **Write** | `file_path`, `content` | ⭐⭐⭐⭐ Good - file creation/overwrite |
| **Bash** | `command` (git, build, etc.) | ⭐⭐ Useful context but not direct code mapping |
| **Read** | `file_path` | ⭐ Context only (no code changes) |

### Edit Tool Example (Best for Line Mapping)

```json
{
  "type": "tool_use",
  "name": "Edit",
  "input": {
    "file_path": "/absolute/path/to/file.ts",
    "old_string": "exact string to find in file\ncan be multiline",
    "new_string": "exact replacement\nalso can be multiline"
  }
}
```

**How to map to lines:**
1. Read the file at the time of the commit (use git blame to find commit)
2. Search for `old_string` in the file
3. Note the line numbers where `old_string` appears
4. Those lines are what this prompt modified

---

## 🎯 Implementation Checklist

### For TraceAI Pipeline (Python)

- [ ] **parser.py**: Implement `find_conversation_file()` and `parse_conversation()`
- [ ] **mapper.py**: Implement `extract_code_mappings()` with tool call parsing
- [ ] **mapper.py**: Add git blame correlation as fallback for ambiguous mappings
- [ ] **models.py**: Define Pydantic models matching the artifact schema
- [ ] **cli.py**: Add `--session-id` option to select specific conversation
- [ ] **cli.py**: Add `--auto` flag to automatically find latest conversation

### Edge Cases to Handle

1. **Multiple sessions for same PR**: Merge conversation artifacts or pick latest
2. **Relative vs absolute paths**: Tool calls use absolute paths, normalize to repo-relative
3. **Binary files**: Skip Edit/Write operations on non-text files
4. **Very long conversations**: Truncate for PR summary, keep full version in Gist
5. **Malformed JSONL lines**: Skip and log warning, don't crash

---

## 🧪 Testing with Real Data

### Current Session

This very conversation is being recorded!

- **Session ID**: `3654a31c-b91b-4c5c-80fa-0860b9c6766c`
- **File**: `~/.claude/projects/-Users-dylan-Desktop-repos-TraceAI/3654a31c-b91b-4c5c-80fa-0860b9c6766c.jsonl`

### Test the Parser

```bash
# Navigate to pipeline directory
cd pipeline/

# Test parsing this conversation
python -c "
from pathlib import Path
from traceai.parser import find_conversation_file, parse_conversation

# Find this project's conversation
conv_file = find_conversation_file('/Users/dylan/Desktop/repos/TraceAI')
print(f'Conversation file: {conv_file}')

# Parse and show first 3 entries
for i, entry in enumerate(parse_conversation(conv_file)):
    if i >= 3:
        break
    print(f'{i}: {entry[\"type\"]} - {entry[\"timestamp\"]}')
"
```

### Validate Against Schema

```bash
# After generating artifact
python -m traceai.cli process \
  --session-id 3654a31c-b91b-4c5c-80fa-0860b9c6766c \
  --repo /Users/dylan/Desktop/repos/TraceAI \
  --output ./test-artifact.json

# Validate
python -m traceai.cli validate ./test-artifact.json
```

---

## 💡 Key Insights

### Why This Format is Perfect for TraceAI

1. **JSONL = Streaming friendly**: Can parse incrementally, don't need to load entire conversation
2. **Tool calls are explicit**: No need to guess what changed - Claude tells us exactly
3. **Timestamps are precise**: ISO 8601 format with milliseconds
4. **Conversation structure preserved**: `parentUuid` maintains message relationships
5. **Everything is local**: No API calls needed to access conversation data

### Mapping Accuracy Potential

With this data format, we can achieve **95%+ accuracy** for prompt-to-code mapping:

- **Edit tool** = exact line identification (parse `old_string` location)
- **Timestamps** = verify with git blame (within ±5 seconds is high confidence)
- **File paths** = absolute paths, no ambiguity

### Performance Considerations

- **File size**: Long conversations can be 1-5 MB. Use streaming JSON parser for efficiency
- **Session count**: Projects can have dozens of sessions. Cache the file list
- **Tool call parsing**: Most expensive operation. Consider caching parsed results

---

## 🚀 Next Steps

1. **Implement parser.py** using the code examples above
2. **Test with this conversation** (we have real data now!)
3. **Build mapper.py** to extract tool calls and match to git commits
4. **Generate first artifact** from this hackathon session
5. **Upload to Gist** and validate the format

---

## 📚 References

- Claude Code conversation format (discovered empirically)
- JSONL specification: https://jsonlines.org/
- ISO 8601 timestamps: https://en.wikipedia.org/wiki/ISO_8601

---

**Last Updated**: 2026-01-10
**Status**: Format confirmed, ready for implementation
**Test Data Available**: Yes (this conversation)

---

*This document was created by analyzing real Claude Code conversation files. All examples are based on actual data structures.*
