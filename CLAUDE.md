# Claude Context & Project Memory

> **Purpose**: This file contains all essential context for Claude (or any AI assistant) to effectively contribute to the TraceAI project. Check this into version control and reference it when starting new AI sessions.

---

## 🎯 Project Overview

**TraceAI** is an LLM-native code provenance and PR review tool built during a 24-hour hackathon.

**Core Problem**: When AI generates code, the conversation context (prompts, iterations, decisions) is lost. Code reviewers see diffs without understanding the "why" behind AI-generated changes.

**Solution**:
1. **Capture** Claude Code conversations and map prompts to specific code changes
2. **Store** conversations as local artifacts (`.traceai/` directory) committed to git
3. **Display** prompt provenance via VSCode extension (hover over code → see the prompt that generated it)

---

## 🏗️ Architecture

```
Claude Code Session
    ↓ (conversation.jsonl)
Python Pipeline (parse → map → save locally)
    ↓
.traceai/{id}.json + .md (committed to git)
    ↓ (local file system)
VSCode Extension (hover UI showing prompt + link)
```

### Tech Stack
- **VSCode Extension**: TypeScript, VSCode API, local file system
- **Processing Pipeline**: Python 3.11+, gitpython, anthropic (optional)
- **Storage**: Local file system (`.traceai/` directory - JSON for machines, Markdown for humans)
- **Mapping Strategy**: Parse Claude Code tool calls (Edit/Write) + git blame timestamps

---

## 📁 Repository Structure

```
traceai/
├── extension/                    # VSCode extension
│   ├── src/
│   │   ├── extension.ts         # Entry point, registers providers
│   │   ├── hoverProvider.ts     # Core hover logic
│   │   ├── githubClient.ts      # GitHub API + Gist fetching
│   │   ├── types.ts             # TypeScript interfaces
│   │   └── cache.ts             # Local caching for Gist data
│   ├── package.json             # Extension manifest
│   ├── tsconfig.json
│   └── README.md
│
├── pipeline/                     # Python processing pipeline
│   ├── traceai/
│   │   ├── __init__.py
│   │   ├── cli.py               # Main CLI entry (traceai command)
│   │   ├── parser.py            # Parse Claude Code conversations
│   │   ├── mapper.py            # Map prompts → code (tool calls + git blame)
│   │   ├── markdown_gen.py      # Generate beautiful PR markdown
│   │   ├── summarizer.py        # (Stretch) Claude API for summarization
│   │   └── models.py            # Data models (Pydantic)
│   ├── tests/
│   ├── requirements.txt
│   ├── setup.py
│   └── README.md
│
├── demo/                         # Demo materials
│   ├── sample-repo/             # Example repo with AI-generated code
│   ├── sample-conversation.json # Test conversation data
│   ├── demo-script.md           # Demo walkthrough
│   └── screenshots/
│
├── docs/                         # Documentation
│   ├── ARCHITECTURE.md          # Detailed technical design
│   ├── API.md                   # Pipeline API/CLI docs
│   └── EXTENSION.md             # Extension usage guide
│
├── HACKATHON_PLAN.md            # Full 24-hour execution plan
├── CLAUDE.md                    # This file
├── README.md                    # Project overview
└── LICENSE
```

---

## 🔑 Key Technical Decisions

### 1. **Conversation Storage: Local File System**
**Why**:
- Zero external dependencies
- Works offline
- Fast (direct file access)
- Version controlled alongside code
- No setup required (no GitHub token)
- Full provenance in git history

**Tradeoffs**:
- Artifacts committed to repo (adds 50-500KB per conversation)
- Can use `.gitignore` if desired
- Requires git push/pull for syncing across machines

**Future**: Option to compress artifacts or archive to separate branch

**Storage Structure**:
```
.traceai/
├── config.json           # Lists all artifacts
├── 42.json              # Machine-readable artifact (PR #42)
├── 42.md                # Human-readable summary (PR #42)
├── abc123.json          # Another artifact (session ID)
└── abc123.md
```

### 2. **Prompt-to-Code Mapping: Tool Call Parsing**
**Primary Strategy**: Parse Claude Code's tool use blocks
- `Edit` tool explicitly shows file path, old_string, new_string
- `Write` tool shows file path and full content
- Extract these from conversation JSON to know exactly what changed

**Fallback Strategy**: Git blame + timestamp correlation
- Match git commit timestamps to conversation message timestamps
- Assign prompts to code within ±5 min window
- Less accurate but works when tool calls are ambiguous

**MVP Scope**: File-level mapping (which prompts touched which files)
**Stretch**: Line-level mapping (which prompt generated which specific lines)

### 3. **VSCode Extension Data Access: Local File System**
**Why**:
- No internet connection required
- No GitHub token needed
- Fast (direct file access)
- Works offline
- Simpler architecture

**How it works**:
- Extension reads `.traceai/config.json` to discover artifacts
- Loads artifact JSON files directly from disk
- Watches `config.json` for changes (auto-reloads)
- Supports multiple artifacts with automatic merging

**Caching**: In-memory cache with file watcher invalidation

---

## 📋 Data Formats

### Conversation Artifact (JSON in Gist)

```json
{
  "version": "1.0",
  "conversation_id": "traceai-2026-01-10-pr-42",
  "metadata": {
    "pr_number": 42,
    "repo": "username/repo-name",
    "branch": "feature/auth",
    "created_at": "2026-01-10T15:30:00Z",
    "claude_code_version": "1.0.0"
  },
  "mappings": [
    {
      "file": "src/components/Auth.tsx",
      "lines": [45, 67],
      "prompt_index": 12,
      "prompt_preview": "Add logout button to the navigation bar",
      "timestamp": "2026-01-10T15:25:00Z",
      "tool_calls": ["Edit:src/components/Auth.tsx:45-67"],
      "confidence": 0.95
    }
  ],
  "conversation": [
    {
      "index": 0,
      "role": "user",
      "content": "Add logout button to the navigation bar",
      "timestamp": "2026-01-10T15:25:00Z"
    },
    {
      "index": 1,
      "role": "assistant",
      "content": "I'll add a logout button to the navigation bar...",
      "timestamp": "2026-01-10T15:25:15Z",
      "tool_calls": [
        {
          "tool": "Edit",
          "parameters": {
            "file_path": "src/components/Auth.tsx",
            "old_string": "...",
            "new_string": "..."
          }
        }
      ]
    }
  ],
  "summary": {
    "total_prompts": 15,
    "files_modified": 3,
    "ai_generated_lines": 127,
    "key_decisions": [
      "Used React hooks instead of class components",
      "Implemented JWT token management in localStorage"
    ]
  }
}
```

### PR Markdown Template

```markdown
## 🤖 AI-Generated Code Summary

This PR was developed in collaboration with Claude Code. [View full conversation →](.traceai/42.md)

### 📊 Stats
- **AI-Generated Lines**: 127
- **Files Modified**: 3
- **Conversation Length**: 15 prompts

### 📝 Files Modified by AI
- `src/components/Auth.tsx` - Added logout functionality
- `src/styles/theme.css` - Updated button styles
- `tests/auth.test.ts` - Added logout tests

### 💡 Key Decisions
- Chose React hooks over class components for modern patterns
- Implemented JWT token management in localStorage for persistence
- Added confirmation dialog to prevent accidental logouts

### 🔍 Conversation Highlights
**Initial Request**: "Add logout button to the navigation bar"
**Refinement**: "Make the logout button red and add confirmation dialog"
**Bug Fix**: "Fix the bug where logout doesn't clear the token"

### 🧪 Testing
All changes include unit tests. Run `npm test` to verify.

---
*Generated by [TraceAI](https://github.com/yourteam/traceai) • [View in VSCode](vscode://extension/traceai) • [Full Conversation](.traceai/42.md)*
```

---

## 🚀 Workflow & Commands

### Developer Workflow

1. **Code with Claude Code** (normal development)
   ```bash
   # Just use Claude Code as usual
   claude-code
   ```

2. **Process conversation** (after session, before PR)
   ```bash
   # Parse conversation and save artifacts locally to .traceai/
   traceai process --repo . --pr-number 42

   # Creates:
   # - .traceai/42.json (machine-readable artifact)
   # - .traceai/42.md (human-readable summary)
   # - .traceai/config.json (updated with artifact reference)
   ```

3. **Generate PR summary** (optional - for PR description)
   ```bash
   # Generate PR markdown summary
   traceai pr-summary --repo .

   # Outputs PR summary to stdout (can redirect to file)
   ```

4. **Commit artifacts** (commit to version control)
   ```bash
   # Artifacts are automatically staged by git hooks, or manually:
   git add .traceai/
   git commit -m "Add conversation artifacts"
   ```

5. **Create PR** (paste generated markdown)
   ```bash
   # Create PR with generated summary
   gh pr create --body-file pr-summary.md
   ```

6. **Review in VSCode** (extension auto-activates)
   - Hover over code → see prompt
   - Click link → opens `.traceai/42.md` in editor

### CLI Commands

```bash
# Process conversation and save to .traceai/
traceai process --repo PATH [--pr-number NUM] [--output-dir .traceai]

# Quick process (auto-find latest conversation)
traceai quick-process --repo PATH

# Generate PR summary
traceai pr-summary --repo PATH [--output FILE]

# Full pipeline (process → PR summary)
traceai pipeline --repo PATH --pr-number NUM

# Validate artifact schema
traceai validate <artifact-file>

# Install git hooks for automatic artifact creation
traceai install-hook

# List available conversations
traceai list-conversations
```

---

## 🔍 Finding Claude Code Conversations

### Potential Locations
1. `~/.config/claude-code/conversations/`
2. `~/.claude/sessions/`
3. `~/.local/share/claude-code/`
4. `.claude/` in project directory

### Conversation Format (Hypothetical)
```json
{
  "session_id": "...",
  "messages": [
    {
      "role": "user",
      "content": "...",
      "timestamp": "..."
    },
    {
      "role": "assistant",
      "content": "...",
      "tool_calls": [...]
    }
  ]
}
```

**Important**: The exact format needs to be discovered empirically. First task is to locate and understand Claude Code's conversation storage.

---

## 🎨 VSCode Extension Behavior

### Hover Provider Logic

```typescript
// Pseudocode for hover provider
async provideHover(document, position) {
  // 1. Get file path and line number
  const file = document.fileName;
  const line = position.line;

  // 2. Get workspace path
  const workspacePath = workspace.getWorkspaceFolder(document.uri)?.uri.fsPath;
  if (!workspacePath) return null;

  // 3. Load artifact from .traceai/ (uses cache + file watcher)
  const artifact = await unifiedLoader.loadArtifact(workspacePath);
  if (!artifact) return null;

  // 4. Find mapping for this file/line
  const mapping = artifact.mappings.find(m =>
    m.file === file &&
    line >= m.lines[0] &&
    line <= m.lines[1]
  );

  if (!mapping) return null;

  // 5. Get full prompt from conversation
  const prompt = artifact.conversation[mapping.prompt_index];

  // 6. Build hover markdown with local link
  const mdFile = `.traceai/${artifact.metadata.pr_number || 'session'}.md`;

  return new Hover(`
    🤖 **AI-Generated Code**

    **Prompt**: ${mapping.prompt_preview}
    **Time**: ${formatTime(mapping.timestamp)}
    **PR**: #${artifact.metadata.pr_number || 'N/A'}

    [View Full Conversation](${mdFile})
  `);
}
```

### Configuration Settings

```json
{
  "traceai.enableHover": true,
  "traceai.showGutterIcons": false,
  "traceai.showFileStats": true,
  "traceai.artifactDirectory": ".traceai"
}
```

---

## 🧪 Testing Strategy

### Pipeline Tests
- **Unit**: Test parser, mapper, markdown generator independently
- **Integration**: Full pipeline with sample conversation data
- **Fixtures**: Include sample conversations, git repos, expected outputs

### Extension Tests
- **Unit**: Test GitHub client, caching, parsing logic
- **Integration**: Mock GitHub API, test hover provider end-to-end
- **Manual**: Test in real VSCode with demo repository

### Test Data
Create realistic test data:
- `tests/fixtures/conversation-simple.json` - Basic conversation (3-4 prompts)
- `tests/fixtures/conversation-complex.json` - Long conversation with iterations
- `tests/fixtures/sample-repo/` - Git repo with known commits

---

## ⚠️ Known Limitations & Gotchas

### Limitations
1. **Single session per PR**: Doesn't handle multi-session development well
2. **Git-dependent**: Requires git history to work (won't work on raw files)
3. **GitHub-only**: Tightly coupled to GitHub (no GitLab, Bitbucket)
4. **Privacy**: Conversations may contain sensitive info (needs redaction)
5. **Mapping accuracy**: Timestamp-based mapping is approximate

### Edge Cases to Handle
- Files edited in multiple prompts (which prompt to show?)
- Code later modified by human (how to indicate?)
- Very long conversations (truncation/summarization)
- Binary files, generated files (should be excluded)
- Deleted or moved files (mapping breaks)

### Security Considerations
- **Secrets in conversations**: Regex-based detection and redaction (future enhancement)
- **Private repos**: Artifacts committed to repo - ensure `.traceai/` respects repo permissions
- **Sensitive data**: Consider adding `.traceai/` to `.gitignore` for sensitive projects
- **Token security**: No GitHub token required (removed dependency)

---

## 📊 Success Metrics

### MVP (Must Have)
- [x] Pipeline successfully parses Claude Code conversation
- [x] Generates valid JSON artifact with at least file-level mappings
- [x] Saves artifacts to `.traceai/` directory (both JSON and MD)
- [x] Extension installs and activates in VSCode
- [x] Extension loads artifacts from local file system
- [ ] Hovering over AI-generated code shows prompt + link (in testing)
- [ ] End-to-end demo works (code → process → PR → hover)

### Stretch Goals
- [ ] Line-level mapping (not just file-level)
- [ ] AI-powered conversation summarization
- [ ] Git hooks for automatic artifact creation (pre-push)
- [ ] Gutter icons showing AI-generated code
- [ ] Sidebar panel with full conversation view
- [ ] Artifact compression (gzip can reduce by 70-80%)
- [ ] Secret detection and redaction

---

## 🔧 Development Setup

### Prerequisites
```bash
# Node.js 18+ for extension
node --version

# Python 3.11+ for pipeline
python --version

# VSCode for testing extension
code --version

# Git (obviously)
git --version
```

### Pipeline Setup
```bash
cd pipeline/
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
pip install -e .  # Install in editable mode

# Test
python -m traceai.cli --help
```

### Extension Setup
```bash
cd extension/
npm install

# Compile TypeScript
npm run compile

# Run extension in development
# Press F5 in VSCode to launch Extension Development Host
```

---

## 🐛 Debugging Tips

### Pipeline Debugging
```bash
# Enable verbose logging
export TRACEAI_LOG_LEVEL=DEBUG
python -m traceai.cli process conversation.json --verbose

# Test individual modules
python -c "from traceai.parser import parse_conversation; print(parse_conversation('test.json'))"

# Validate JSON schema
python -m traceai.cli validate artifact.json
```

### Extension Debugging
- **Developer Tools**: Help → Toggle Developer Tools (shows console logs)
- **Extension Host**: F5 launches debug instance with breakpoints
- **Output Panel**: View → Output → Select "TraceAI" from dropdown
- **Hover inspection**: Hover over code, check DevTools console for errors

### Common Issues
1. **"No conversation found"**: Check conversation file path, format, ensure Claude Code session exists
2. **"Artifact not loading in extension"**: Check `.traceai/config.json` exists and is valid JSON
3. **"Hover not showing"**: Verify file is in git repo, artifact exists in `.traceai/`, extension is activated
4. **"Config.json not updating"**: Clear extension cache using "TraceAI: Refresh Cache" command

---

## 🎯 Hackathon Priorities

### Hours 0-8: Core Functionality
- **Critical**: Find and parse Claude Code conversations
- **Critical**: Build basic prompt-to-code mapping
- **Critical**: Upload to Gist
- **Critical**: Extension hover shows *something*

### Hours 8-16: Integration
- **Important**: Improve mapping accuracy (parse tool calls)
- **Important**: Generate beautiful PR markdown
- **Important**: Extension fetches real data from Gist
- **Nice**: Caching layer

### Hours 16-24: Polish & Demo
- **Important**: End-to-end test with real data
- **Important**: Demo video/presentation
- **Nice**: AI summarization (stretch goal)
- **Nice**: Gutter icons, file stats (stretch)

---

## 💡 AI Assistant Instructions

When working on this project:

1. **Read this file first**: Everything you need to know is here
2. **Check HACKATHON_PLAN.md**: For detailed hour-by-hour breakdown
3. **Follow the architecture**: Don't reinvent, use the agreed-upon design
4. **Test incrementally**: Don't build everything then test - validate as you go
5. **Keep it simple**: This is a hackathon - MVPs over perfection
6. **Document decisions**: Update this file if you make significant changes

### Common Tasks

**"Set up the project structure"**
- Create all directories from repository structure
- Generate package.json, requirements.txt with dependencies
- Create placeholder files with TODOs

**"Parse Claude Code conversation"**
- First, help locate where conversations are stored
- Write parser that handles the actual format discovered
- Extract messages, timestamps, tool calls

**"Build the VSCode hover provider"**
- Use VSCode extension generator (`yo code`)
- Implement hover provider in TypeScript
- Fetch and display prompt from Gist

**"Create the processing pipeline"**
- CLI tool with subcommands (process, upload, pr-summary)
- Use gitpython for git operations
- Use PyGithub for Gist creation

**"Generate demo materials"**
- Create small sample project
- Add realistic conversation data
- Script the demo walkthrough

---

## 📚 Useful Links

### Documentation
- [VSCode Extension API](https://code.visualstudio.com/api)
- [GitHub Gist API](https://docs.github.com/en/rest/gists)
- [GitPython](https://gitpython.readthedocs.io/)
- [PyGithub](https://pygithub.readthedocs.io/)
- [Anthropic Python SDK](https://github.com/anthropics/anthropic-sdk-python)

### Inspiration
- [GitLens](https://github.com/gitkraken/vscode-gitlens) - Git annotations in VSCode
- [GitHub Copilot](https://github.com/features/copilot) - AI code generation
- [Sourcegraph](https://about.sourcegraph.com/) - Code intelligence

---

## 🔄 Version History

**v1.0** (2026-01-10) - Initial hackathon version
- Core pipeline: parse → map → save locally
- VSCode extension: hover provider
- Local file system storage (`.traceai/` directory)
- File-level mapping
- Git hooks for automatic artifact creation

**v1.1** (2026-01-10) - Local-first migration
- Migrated from GitHub Gist to local file storage
- Removed all GitHub API dependencies
- Removed GitHub token requirement
- Simplified architecture (~850 lines of code removed)
- Added `.traceai/config.json` for artifact tracking
- Extension now reads from local files

**Future versions**:
- v1.2: Line-level mapping, AI summarization
- v1.3: Artifact compression, secret detection
- v2.0: Multi-repository artifact registry
- v3.0: Multi-tool support (Cursor, Copilot, etc.)

---

## 📝 Notes & Context

### Why This Project Matters
In 2-3 years, 50%+ of code will be AI-generated. Code review processes need to evolve to include conversation context, not just diffs. TraceAI is infrastructure for that future.

### Design Philosophy
- **Transparency**: Make AI's role visible, not hidden
- **Simplicity**: Integrate with existing tools (GitHub, VSCode)
- **Permanence**: Conversations are artifacts, not ephemeral logs
- **Developer-first**: Minimize friction, add value where devs already look

### Team Notes
- **Person A**: Extension lead - focus on TypeScript, VSCode API, UI polish
- **Person B**: Pipeline lead - focus on parsing, mapping accuracy, git operations
- **Person C**: Integration lead - focus on GitHub API, demo prep, documentation

---

**Last Updated**: 2026-01-10
**Status**: Pre-hackathon (planning complete, ready to build)
**Next Steps**: Set up project structure, locate Claude Code conversations, begin development

---

*This file should be updated as the project evolves. Keep it as the single source of truth for AI assistants working on TraceAI.*
