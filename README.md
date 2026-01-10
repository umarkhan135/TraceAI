# TraceAI

> **LLM-Native Code Provenance and PR Review Tool**

TraceAI makes AI-generated code transparent and reviewable by tracking the conversation that created it. Built for the future where code review includes not just diffs, but the full context of human-AI collaboration.

## 🎯 The Problem

When AI generates code:
- The conversation context (prompts, iterations, decisions) is lost
- Code reviewers see diffs without understanding the "why"
- No way to trace specific code back to the prompt that generated it
- AI's role in development is invisible

## 💡 The Solution

TraceAI provides two core features:

### 1. 🔍 VSCode Extension (Planned)
Hover over any line of code to see:
- The prompt that generated it
- Link to full conversation
- Timestamp and context
- PR information

### 2. 📊 Conversation Artifacts for PRs
Automatically generate:
- Structured conversation data (JSON)
- Beautiful PR summaries (Markdown)
- Prompt-to-code mappings
- Stored as GitHub Gists

## 🚀 Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/yourteam/traceai.git
cd traceai

# Install the pipeline
cd pipeline/
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -e .
```

### Usage

```bash
# 1. Work with Claude Code (as normal)
# ... make changes ...

# 2. Process the conversation
traceai process artifact.json --repo /path/to/your/repo --pr-number 42

# 3. Upload to GitHub Gist
export GITHUB_TOKEN=ghp_your_token_here
traceai upload artifact.json

# 4. Generate PR summary
traceai pr-summary artifact.json --output pr-summary.md

# 5. Add to your PR description
cat pr-summary.md  # Copy this into your PR
```

### One-Command Pipeline

```bash
traceai pipeline --repo . --pr-number 42
# This runs: process → upload → generate PR summary
```

## 📦 What's Inside

```
traceai/
├── pipeline/              # Python pipeline (READY ✅)
│   ├── traceai/
│   │   ├── parser.py      # Parse Claude Code conversations
│   │   ├── mapper.py      # Map prompts to code
│   │   ├── github_client.py  # Upload to Gist
│   │   ├── markdown_gen.py   # Generate PR summaries
│   │   └── cli.py         # Command-line interface
│   └── tests/
│
├── extension/             # VSCode extension (TODO)
│   └── src/
│
├── demo/                  # Demo materials
│   ├── artifact.json      # Example artifact (REAL DATA!)
│   └── pr-summary.md      # Example PR summary
│
└── docs/
    ├── HACKATHON_PLAN.md  # 24-hour execution plan
    ├── CLAUDE.md          # Context for AI assistants
    └── CLAUDE_CODE_CONVERSATION_FORMAT.md  # Format docs
```

## 🎨 Example Output

### PR Summary

```markdown
## 🤖 AI-Generated Code Summary

This PR was developed in collaboration with Claude Code.

### 📊 Stats
- AI-Generated Changes: 15 edits across 13 files
- Conversation Length: 45 prompts, 143 total messages
- Total Tokens: 46,439

### 📝 Files Modified by AI
- `src/auth.ts` - Added logout functionality
- `src/theme.css` - Updated button styles

### 💡 Conversation Highlights
**Prompt 1**: "Add logout button to the navigation bar"
**Prompt 5**: "Make it red and add confirmation dialog"
```

### Artifact Structure

```json
{
  "version": "1.0",
  "conversation_id": "traceai-86c84f17",
  "metadata": {
    "session_id": "86c84f17-852d-4e9d-9ff3-69c6aaaec62e",
    "pr_number": 42,
    "repo_path": "/Users/you/project",
    "files_modified": 13
  },
  "mappings": [
    {
      "file": "src/auth.ts",
      "lines": [45, 67],
      "prompt": "Add logout button",
      "tool": "Edit",
      "confidence": 0.95
    }
  ],
  "conversation": [...],
  "stats": {...}
}
```

## 🏗️ Architecture

```
Claude Code Session
    ↓ (conversation.jsonl)
Python Pipeline
    ↓ (process + map + upload)
GitHub Gist (JSON artifact) + PR (Markdown summary)
    ↓ (GitHub API)
VSCode Extension (hover to view provenance)
```

### How It Works

1. **Capture**: Find Claude Code conversation in `~/.claude/projects/`
2. **Parse**: Extract messages, tool calls, timestamps
3. **Map**: Match prompts to code using tool calls + git blame
4. **Artifact**: Generate structured JSON with full context
5. **Upload**: Store in GitHub Gist (permanent, versioned)
6. **Display**: Markdown summary for PR, hover UI in VSCode

## 📋 Commands

| Command | Description |
|---------|-------------|
| `traceai list-conversations` | List all Claude Code sessions |
| `traceai process` | Process conversation → artifact.json |
| `traceai upload` | Upload artifact → GitHub Gist |
| `traceai pr-summary` | Generate PR markdown |
| `traceai pipeline` | Run full workflow |
| `traceai validate` | Validate artifact schema |

See [pipeline/README.md](pipeline/README.md) for detailed command docs.

## 🔑 Setup

### GitHub Token

Create a token at https://github.com/settings/tokens with `gist` scope:

```bash
export GITHUB_TOKEN=ghp_your_token_here
```

### Claude Code

TraceAI works with Claude Code out of the box. No configuration needed - it automatically finds conversations in `~/.claude/`.

## 🎯 Current Status

| Component | Status | Notes |
|-----------|--------|-------|
| **Python Pipeline** | ✅ Complete | All features working |
| **Conversation Parser** | ✅ Complete | Supports Claude Code JSONL format |
| **Prompt-to-Code Mapping** | ✅ Complete | Tool call parsing + git blame |
| **GitHub Gist Upload** | ✅ Complete | Creates/updates Gists |
| **PR Markdown Generator** | ✅ Complete | Beautiful summaries |
| **CLI Interface** | ✅ Complete | Full-featured commands |
| **VSCode Extension** | 📋 Planned | Next priority |
| **AI Summarization** | 📋 Stretch | Optional enhancement |

## 🧪 Testing

The pipeline has been tested with real Claude Code conversations!

```bash
# Run on this project's own conversation
cd pipeline
source venv/bin/activate
traceai pipeline --repo .. --pr-number 1 --output-dir ../demo
```

See `demo/artifact.json` and `demo/pr-summary.md` for real examples generated from this project's development!

## 📚 Documentation

- **[HACKATHON_PLAN.md](HACKATHON_PLAN.md)** - Complete 24-hour implementation plan
- **[CLAUDE.md](CLAUDE.md)** - Project context for AI assistants
- **[CLAUDE_CODE_CONVERSATION_FORMAT.md](docs/CLAUDE_CODE_CONVERSATION_FORMAT.md)** - Conversation format spec
- **[pipeline/README.md](pipeline/README.md)** - Pipeline usage guide

## 🛠️ Development

```bash
# Install with dev dependencies
cd pipeline
pip install -e ".[dev]"

# Run tests
pytest

# Format code
black traceai/
ruff check traceai/

# Type checking
mypy traceai/
```

## 🎯 Roadmap

### Phase 1: MVP (Current - Hackathon)
- [x] Python pipeline
- [x] Conversation parsing
- [x] Prompt-to-code mapping
- [x] GitHub Gist storage
- [x] PR markdown generation
- [ ] VSCode extension (basic hover)

### Phase 2: Enhanced (Post-Hackathon)
- [ ] VSCode extension (full features)
- [ ] Line-level mapping refinement
- [ ] AI-powered summarization
- [ ] GitHub Actions automation
- [ ] Gutter icons showing AI-generated code

### Phase 3: Production (Future)
- [ ] Standalone conversation registry
- [ ] Multi-tool support (Cursor, Copilot, etc.)
- [ ] Team analytics dashboard
- [ ] Conversation search and replay
- [ ] Integration with code review platforms

## 🤝 Contributing

This project was built during a 24-hour hackathon. Contributions welcome!

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request (with TraceAI summary! 😉)

## 📄 License

MIT

## 🙏 Acknowledgments

- **Claude Code** - For being an amazing AI coding partner
- **Anthropic** - For building Claude
- **The hackathon team** - For believing in AI-native tooling

## 🔮 Vision

In 2-3 years, 50%+ of code will be AI-generated. Code review processes need to evolve to include conversation context, not just diffs. **TraceAI is infrastructure for that future.**

---

**Built with ❤️ by the TraceAI team** | [GitHub](https://github.com/yourteam/traceai) | [Report Issues](https://github.com/yourteam/traceai/issues)
