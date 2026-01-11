# TraceAI Pipeline

Python pipeline for processing Claude Code conversations and generating local artifacts.

## Installation

```bash
cd pipeline/
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -e .
```

## Quick Start

### 1. Process a Conversation

```bash
# Process and save to .traceai/ (automatic)
traceai process --repo /path/to/your/repo --pr-number 42

# Quick process (auto-finds latest conversation)
traceai quick-process --repo .

# This creates:
# - .traceai/42.json (machine-readable artifact)
# - .traceai/42.md (human-readable summary)
# - .traceai/config.json (artifact tracking)
```

### 2. Generate PR Summary

```bash
# Generate markdown for PR description
traceai pr-summary --repo .

# Output to file
traceai pr-summary --repo . --output pr-summary.md
```

### 3. Full Pipeline (All-in-One)

```bash
# Run complete pipeline
traceai pipeline --repo . --pr-number 42

# This will:
# 1. Process the conversation
# 2. Save artifacts to .traceai/
# 3. Generate PR summary
```

### 4. Install Git Hooks (Recommended)

```bash
# Install automatic artifact creation on push
traceai install-hook

# Now artifacts are created automatically!
# Just code with Claude and push - no manual steps needed
```

## Commands

### `traceai list-conversations`

List all Claude Code conversations for a project.

```bash
traceai list-conversations --repo /path/to/repo
```

### `traceai process`

Process a conversation and save artifacts to `.traceai/`.

```bash
traceai process [OPTIONS]

Options:
  --repo PATH              Path to git repository (default: current directory)
  --session-id ID          Specific session to process (default: most recent)
  --pr-number NUM          PR number to associate
  --branch NAME            Branch name (default: auto-detect)
  --output-dir DIR         Output directory (default: .traceai)
  --no-git-correlation     Skip git blame correlation
```

### `traceai quick-process`

Auto-find latest conversation and process it.

```bash
traceai quick-process [OPTIONS]

Options:
  --repo PATH              Path to git repository (default: current directory)
```

### `traceai pr-summary`

Generate PR summary markdown.

```bash
traceai pr-summary [OPTIONS]

Options:
  --repo PATH          Repository path
  --output FILE        Output file (default: print to stdout)
```

### `traceai pipeline`

Run full pipeline (process + PR summary).

```bash
traceai pipeline [OPTIONS]

Options:
  --repo PATH          Repository path
  --pr-number NUM      PR number (required)
  --output-dir DIR     Output directory (default: .traceai)
```

### `traceai install-hook`

Install git hooks for automatic artifact creation.

```bash
traceai install-hook

# Installs pre-push hook that:
# - Detects Claude Code conversations
# - Processes them automatically
# - Commits artifacts to .traceai/
```

### `traceai validate`

Validate artifact JSON schema.

```bash
traceai validate ARTIFACT_FILE
```

## Example Workflow

### Manual Workflow

```bash
# 1. Work with Claude Code (as normal)
# ... make changes ...

# 2. Process conversation
traceai process --repo . --pr-number 123

# 3. Commit artifacts
git add .traceai/
git commit -m "Add TraceAI artifacts"
git push

# 4. Create PR with summary
traceai pr-summary --repo . > pr-summary.md
gh pr create --title "Add feature" --body-file pr-summary.md
```

### Automatic Workflow (with Git Hooks)

```bash
# 1. Install hooks (one-time setup)
traceai install-hook

# 2. Work with Claude Code (as normal)
# ... make changes ...

# 3. Commit and push
git add .
git commit -m "Add feature"
git push  # Artifacts automatically created and committed!

# 4. Create PR
gh pr create --title "Add feature"
# Artifacts are already in .traceai/ and committed
```

## Development

```bash
# Install with dev dependencies
pip install -e ".[dev]"

# Run tests
pytest

# Format code
black traceai/
ruff check traceai/

# Type checking
mypy traceai/
```

## Output Files

### .traceai/ Directory Structure

```
.traceai/
├── config.json           # Lists all artifacts and metadata
├── 42.json              # Machine-readable artifact (PR #42)
├── 42.md                # Human-readable summary (PR #42)
├── abc123.json          # Session-based artifact
└── abc123.md
```

### artifact.json Format

Complete conversation artifact with:
- Full conversation history
- Prompt-to-code mappings
- Metadata (session, PR, repo info)
- Statistics

### *.md Format

Markdown summary with:
- Overview and stats
- Files modified
- Conversation highlights
- Link to full conversation (local `.md` file)

## Troubleshooting

### "No conversations found"

- Ensure you're in a git repository
- Check that Claude Code has been used in this repo
- Verify path: `~/.claude/projects/<path-to-your-repo>/`

### "Artifacts not loading in VSCode"

- Check `.traceai/config.json` exists and is valid JSON
- Ensure artifacts are committed to git
- Try "TraceAI: Refresh Cache" command in VSCode

### "Failed to extract line numbers"

- This is normal if file was modified after conversation
- Line-level mapping works best immediately after conversation
- File-level mapping still works accurately

## Architecture

```
conversation.jsonl (Claude Code)
    ↓
[Parser] - Extract messages, tool calls
    ↓
[Mapper] - Map prompts to code changes
    ↓
[Local Writer] - Save to .traceai/
    ↓
.traceai/42.json + .traceai/42.md
    ↓
[Git Commit] - Committed to version control
    ↓
[VSCode Extension] - Reads local files
```

## Benefits of Local Storage

✅ **No setup required** - No GitHub token, no API configuration
✅ **Works offline** - Everything is local
✅ **Fast** - Direct file I/O, no network calls
✅ **Transparent** - Artifacts visible in repo
✅ **Version controlled** - Full history in git
✅ **Portable** - Syncs via git push/pull

## License

MIT
