# TraceAI Pipeline

Python pipeline for processing Claude Code conversations and generating PR artifacts.

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
# Process the most recent conversation
traceai process artifact.json --repo /path/to/your/repo

# Process specific session
traceai process artifact.json --repo . --session-id abc123... --pr-number 42
```

### 2. Upload to GitHub Gist

```bash
# Set GitHub token
export GITHUB_TOKEN=ghp_your_token_here

# Upload (creates secret Gist by default)
traceai upload artifact.json

# Create public Gist
traceai upload artifact.json --public
```

### 3. Generate PR Summary

```bash
# Generate markdown for PR
traceai pr-summary artifact.json --output pr-summary.md

# Compact version
traceai pr-summary artifact.json --compact

# Full report with timeline
traceai pr-summary artifact.json --timeline
```

### Full Pipeline (All-in-One)

```bash
# Run complete pipeline
traceai pipeline --repo . --pr-number 42 --output-dir ./output

# This will:
# 1. Process the conversation
# 2. Upload to Gist
# 3. Generate PR summary
```

## Commands

### `traceai list-conversations`

List all Claude Code conversations for a project.

```bash
traceai list-conversations --repo /path/to/repo
```

### `traceai process`

Process a conversation and generate artifact JSON.

```bash
traceai process OUTPUT_FILE [OPTIONS]

Options:
  --repo PATH              Path to git repository (default: current directory)
  --session-id ID          Specific session to process (default: most recent)
  --pr-number NUM          PR number to associate
  --branch NAME            Branch name (default: auto-detect)
  --no-git-correlation     Skip git blame correlation
```

### `traceai upload`

Upload artifact to GitHub Gist.

```bash
traceai upload ARTIFACT_FILE [OPTIONS]

Options:
  --token TOKEN    GitHub token (default: GITHUB_TOKEN env var)
  --public         Create public Gist (default: secret)
  --update ID      Update existing Gist
```

### `traceai pr-summary`

Generate PR summary markdown.

```bash
traceai pr-summary ARTIFACT_FILE [OPTIONS]

Options:
  --output FILE    Output file (default: print to stdout)
  --compact        Generate compact one-paragraph summary
  --timeline       Include full timeline view
```

### `traceai pipeline`

Run full pipeline (process + upload + PR summary).

```bash
traceai pipeline [OPTIONS]

Options:
  --repo PATH          Repository path
  --session-id ID      Session to process
  --pr-number NUM      PR number (required)
  --token TOKEN        GitHub token
  --public             Create public Gist
  --output-dir DIR     Output directory (default: ./traceai-output)
```

### `traceai validate`

Validate artifact JSON schema.

```bash
traceai validate ARTIFACT_FILE
```

## GitHub Token Setup

Create a GitHub personal access token:

1. Go to https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Select scope: `gist`
4. Copy token and set environment variable:

```bash
export GITHUB_TOKEN=ghp_your_token_here
```

Or pass directly to commands:

```bash
traceai upload artifact.json --token ghp_your_token_here
```

## Example Workflow

```bash
# 1. Work with Claude Code (as normal)
# ... make changes ...

# 2. Create PR
gh pr create --title "Add feature"

# 3. Run TraceAI pipeline
traceai pipeline --pr-number 123 --repo .

# 4. Copy PR summary
cat traceai-output/pr-summary.md | pbcopy  # macOS
# or
cat traceai-output/pr-summary.md | xclip   # Linux

# 5. Update PR description
gh pr edit 123 --body-file traceai-output/pr-summary.md
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

### artifact.json

Complete conversation artifact with:
- Full conversation history
- Prompt-to-code mappings
- Metadata (session, PR, repo info)
- Statistics

### pr-summary.md

Markdown summary for PR description with:
- Overview and stats
- Files modified
- Conversation highlights
- Link to full conversation (Gist)

## Troubleshooting

### "No conversations found"

- Ensure you're in a git repository
- Check that Claude Code has been used in this repo
- Verify path: `~/.claude/projects/-path-to-your-repo/`

### "GitHub token required"

- Set `GITHUB_TOKEN` environment variable
- Or pass `--token` to upload command
- Token needs `gist` scope

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
artifact.json
    ↓
[GitHub Client] - Upload to Gist
    ↓
[Markdown Generator] - Create PR summary
    ↓
pr-summary.md
```

## License

MIT
