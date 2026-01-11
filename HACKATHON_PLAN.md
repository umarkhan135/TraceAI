# TraceAI: LLM-Native PR Review & Code Provenance Tracking
## 24-Hour Hackathon Plan

---

## 🎯 Vision

Build the future of code review for the AI-native era. Every line of code should trace back to the conversation that created it. PR reviews should include not just the diff, but the full context of the AI collaboration that produced it. (testing)

---

## 🏗️ Architecture Overview

```
┌─────────────────┐
│  Claude Code    │
│   Session       │
└────────┬────────┘
         │ conversation.json
         ↓
┌─────────────────────────────────────┐
│  Python Processing Pipeline         │
│  --------------------------------   │
│  1. Parse conversation              │
│  2. Git blame + timestamp mapping   │
│  3. Generate JSON artifact          │
│  4. Upload to GitHub Gist           │
│  5. Generate PR markdown summary    │
└────────┬────────────────────────────┘
         │
         ↓
┌─────────────────┐      ┌──────────────────────┐
│  GitHub Gist    │◄─────│  Pull Request        │
│  (Full Convo)   │      │  (Summary + Link)    │
└────────┬────────┘      └──────────────────────┘
         │
         │ GitHub API
         ↓
┌─────────────────────────────────────┐
│  VSCode Extension                   │
│  --------------------------------   │
│  Hover over code → Show:            │
│  • Prompt that generated it         │
│  • Link to full PR conversation     │
│  • Timestamp & context              │
└─────────────────────────────────────┘
```

---

## 📦 Tech Stack

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| **VSCode Extension** | TypeScript + VSCode API | Industry standard, type safety, excellent docs |
| **Processing Pipeline** | Python 3.11+ | Best for text processing, git ops, API calls |
| **Conversation Storage** | GitHub Gist (JSON) | Permanent, versioned, accessible via API |
| **PR Display** | Markdown + Gist embed | Native GitHub rendering, human-readable |
| **Code Mapping** | Git blame + timestamps | Automatic, no manual annotation required |
| **Stretch: AI Analysis** | Claude API (Sonnet 4.5) | Summarize conversations, extract key decisions |

### Key Dependencies
- **Python**: `gitpython`, `PyGithub`, `anthropic` (stretch)
- **TypeScript**: `@octokit/rest`, `vscode` API
- **Tools**: VSCode Extension Generator (`yo code`)

---

## 🎯 Core Features

### 1. **Claude Code Conversation Capture** (Python Pipeline)
**Input**: Claude Code conversation history (JSON/text export)
**Output**: Structured artifact with prompt-to-code mappings

**Process**:
1. Locate Claude Code conversation file (likely in `~/.claude/` or similar)
2. Parse conversation structure:
   - User messages (prompts)
   - Assistant messages (responses)
   - Tool calls (Edit, Write, Bash, etc.)
3. Extract metadata:
   - Timestamps for each message
   - File operations (which files were edited)
   - Tool use blocks (Edit tool shows exact line changes)

### 2. **Prompt-to-Code Mapping** (Python Pipeline)
**Challenge**: Connect abstract prompts to specific lines of code

**Approach** (Hybrid Strategy):
1. **Primary**: Parse tool use blocks
   - When Claude uses `Edit` tool, it specifies exact file + old/new strings
   - Extract file paths and approximate line ranges from tool calls
   - This is MUCH more accurate than just timestamps
2. **Fallback**: Git blame + timestamp correlation
   - For each line of code, get `git blame` to find when it was committed
   - Match git timestamps to conversation timestamps
   - Assign prompt to code if timestamps are within reasonable window (±5 min)
3. **Aggregate to file level first**
   - For MVP: map prompts to entire files
   - Refine to line-level if time permits

**Output Format** (JSON):
```json
{
  "conversation_id": "2026-01-10-pr-42",
  "pr_number": 42,
  "repo": "username/repo",
  "timestamp": "2026-01-10T15:30:00Z",
  "gist_url": "https://gist.github.com/...",
  "mappings": [
    {
      "file": "src/components/Auth.tsx",
      "lines": [45, 67],
      "prompt": "Add logout button to the navigation bar",
      "prompt_index": 12,
      "timestamp": "2026-01-10T15:25:00Z",
      "context": "User requested logout functionality...",
      "tool_calls": ["Edit:src/components/Auth.tsx"]
    }
  ],
  "full_conversation": [
    {
      "role": "user",
      "content": "Add logout button to the navigation bar",
      "timestamp": "2026-01-10T15:25:00Z",
      "index": 12
    },
    {
      "role": "assistant",
      "content": "I'll add a logout button...",
      "tool_calls": ["Edit"],
      "timestamp": "2026-01-10T15:25:30Z"
    }
  ]
}
```

### 3. **GitHub Gist Upload** (Python Pipeline)
- Create authenticated GitHub Gist with conversation JSON
- Make it public or secret (user choice)
- Store Gist URL for reference
- Optionally: Generate HTML visualization of conversation as second Gist file

### 4. **PR Markdown Generation** (Python Pipeline)
Generate beautiful markdown summary for PR description/comment:

```markdown
## 🤖 AI-Generated Code Summary

This PR was developed in collaboration with Claude Code. [View full conversation →](https://gist.github.com/...)

### Files Modified by AI
- `src/components/Auth.tsx` - Added logout functionality
- `src/styles/theme.css` - Updated button styles

### Key Decisions
- Chose to use React hooks instead of class components
- Implemented JWT token management in localStorage
- Added error handling for network failures

### Conversation Highlights
**Prompt 1**: "Add logout button to the navigation bar"
**Prompt 5**: "Make the logout button red and add confirmation dialog"
**Prompt 8**: "Fix the bug where logout doesn't clear the token"

---
*Generated by [TraceAI](https://github.com/yourteam/traceai) - View code provenance in VSCode*
```

### 5. **VSCode Extension** (TypeScript)

**Core Functionality**:
1. **Hover Provider**:
   - Listen for hover events on code
   - Get file path + line number
   - Query GitHub API for associated Gist
   - Parse JSON to find matching prompt
   - Display hover UI

2. **UI Elements**:
   ```
   ┌─────────────────────────────────────────┐
   │ 🤖 AI-Generated Code                    │
   ├─────────────────────────────────────────┤
   │ Prompt: "Add logout button to nav bar"  │
   │ Timestamp: 2026-01-10 15:25             │
   │ PR #42: Add authentication feature      │
   │                                         │
   │ [View Full Conversation] [View PR]      │
   └─────────────────────────────────────────┘
   ```

3. **Configuration**:
   - GitHub token for API access
   - Repository mapping (local path → GitHub repo)
   - Cache Gist data locally to reduce API calls

**Extension APIs Used**:
- `vscode.languages.registerHoverProvider` - Show hover UI
- `vscode.workspace.workspaceFolders` - Get current repo
- Git extension API - Get current branch, commit info
- Octokit - GitHub API client

---

## 🚧 Critical Challenges & Solutions

### Challenge 1: Finding Claude Code Conversation Data
**Problem**: Claude Code conversation format may not be documented
**Solutions**:
1. **Investigate**: Use this Claude Code session to understand where conversations are saved
2. **Fallback**: Hook into terminal output, parse from there
3. **Manual export**: For hackathon, just copy-paste conversation to a file
4. **Check**: `~/.config/claude-code/`, `~/.claude/`, or local `.claude/` directory

### Challenge 2: Accurate Line-Level Mapping
**Problem**: Git blame + timestamps can be imprecise, especially with batch commits
**Solutions**:
1. **Parse tool calls**: Claude's `Edit` tool explicitly states what changed
2. **Start file-level**: MVP maps prompts to files, not lines
3. **Diff analysis**: Compare git diff with Edit tool old_string/new_string
4. **Accept imperfection**: 80% accuracy is fine for a hackathon demo

### Challenge 3: GitHub API Rate Limits
**Problem**: Extension fetching Gists on every hover could hit rate limits
**Solutions**:
1. **Cache**: Store Gist data in workspace `.vscode/` directory
2. **Lazy load**: Only fetch on first hover, cache for session
3. **Batch**: Fetch all Gists for a PR at once
4. **Auth**: Use authenticated requests (5000/hr vs 60/hr)

### Challenge 4: Privacy & Sensitive Data
**Problem**: Conversations may contain API keys, secrets, or private context
**Solutions**:
1. **Warning**: Show clear warning before uploading to Gist
2. **Redaction**: Simple regex to detect/redact common secrets
3. **Private Gists**: Default to secret Gists
4. **Review step**: Show preview of what will be uploaded, require confirmation

### Challenge 5: Multi-Session Conversations
**Problem**: A file might be edited across multiple Claude sessions
**Solutions**:
1. **MVP**: One conversation per PR (start fresh for each PR)
2. **Future**: Merge conversation artifacts, show timeline
3. **Hackathon**: Just document this limitation

---

## 📊 Critiques & Future Improvements

### Architecture Critiques

1. **Gist Storage is Hacky**
   - **Issue**: Gists aren't designed for this, won't scale to 1000s of PRs
   - **Better**: Dedicated backend service (Supabase, Firebase, custom DB)
   - **Why for hackathon**: Zero infrastructure, works immediately, looks cool

2. **GitHub API Dependency**
   - **Issue**: Extension needs internet + auth, won't work offline
   - **Better**: Hybrid approach - store `.trace/` files in repo, sync to Gist
   - **Why for hackathon**: Simpler, fewer components to build

3. **Timestamp Mapping is Approximate**
   - **Issue**: Can map wrong prompt to code if multiple edits happen quickly
   - **Better**: Parse tool use blocks for exact Edit operations
   - **Mitigation**: DO parse tool blocks - this is actually feasible!

4. **Single Source (Claude Code)**
   - **Issue**: Only works with Claude Code, not Cursor/Copilot/etc.
   - **Better**: Generic schema, adapters for each tool
   - **Why for hackathon**: Focus on one tool, nail the UX, expand later

### UI/UX Critiques

1. **Hover-only Discovery**
   - **Issue**: Users have to stumble upon AI-generated code by hovering
   - **Better**: Visual indicators (gutter icons, highlights) showing AI-touched code
   - **Addition**: File explorer icons showing % AI-generated

2. **Linear Conversation View**
   - **Issue**: Conversations are messy, branching, with dead-ends
   - **Better**: Tree view showing conversation branches, highlights of what made it to final code
   - **Stretch goal**: Great candidate for the AI summarization feature!

3. **No Iteration History**
   - **Issue**: Can't see "Claude suggested X, but I asked for Y instead"
   - **Better**: Show edit history, refinements, alternatives that were rejected
   - **Future**: This is where a standalone registry becomes valuable

### Technical Improvements

1. **Add Webhook for Automation**
   - On PR creation, automatically run the pipeline via GitHub Actions
   - No manual step, conversation uploaded automatically

2. **Better Mapping Algorithm**
   - Use AST parsing to map prompts to functions/classes, not just lines
   - "This prompt generated the `logout()` function"

3. **Conversation Diffing**
   - During PR review, highlight which parts of conversation are relevant to specific review comments
   - Link reviewer questions to original prompts

4. **Bidirectional Linking**
   - From PR comment → relevant conversation section
   - From conversation → code changes it produced

---

## ⏱️ 24-Hour Execution Plan

### Team Structure (3 People)

**Person A**: Extension Lead
**Person B**: Pipeline Lead
**Person C**: Integration & Demo Lead

---

### Hour-by-Hour Breakdown

#### **Hours 0-4: Foundation**

**Person A - Extension Setup** (4 hours)
- [ ] Run `yo code` to generate VSCode extension boilerplate (30 min)
- [ ] Set up TypeScript project structure (30 min)
- [ ] Implement basic hover provider (1 hour)
  - Register for TypeScript/JavaScript files
  - Get file path + line number from hover position
  - Display static "Hello World" hover for testing
- [ ] Integrate Octokit for GitHub API (1 hour)
  - Set up authentication (token from settings)
  - Test fetching a Gist by ID
- [ ] Build hover UI component (1 hour)
  - Markdown rendering in hover
  - Clickable links to PR and Gist

**Person B - Pipeline Core** (4 hours)
- [ ] Research Claude Code conversation format (1 hour)
  - Find where conversations are stored
  - Understand JSON/text structure
  - Document findings for team
- [ ] Build conversation parser (1.5 hours)
  - Parse messages, timestamps, tool calls
  - Extract file operations
  - Handle different conversation formats (if multiple exist)
- [ ] Implement git blame integration (1.5 hours)
  - Use `gitpython` to get blame for each line
  - Extract timestamps and authors
  - Build mapping between timestamps and conversation indices

**Person C - Infrastructure** (4 hours)
- [ ] Set up GitHub API access (1 hour)
  - Create GitHub token with Gist permissions
  - Test creating/reading Gists via PyGithub
- [ ] Design JSON schema for conversation artifact (1 hour)
  - Define structure (see example above)
  - Create Python dataclasses or Pydantic models
  - Write validation logic
- [ ] Build Gist uploader (1 hour)
  - Function to create Gist from JSON
  - Handle errors, rate limits
  - Return Gist URL
- [ ] Start markdown generator (1 hour)
  - Template for PR description
  - Basic summary (files changed, prompt count)
  - Link to Gist

---

#### **Hours 4-8: Integration**

**Person A - Extension Logic** (4 hours)
- [ ] Implement Gist data fetching (2 hours)
  - Get current file's git info (repo, commit)
  - Search for relevant Gist (by PR number or commit hash)
  - Parse Gist JSON
  - Find matching mapping for current file + line
- [ ] Add caching layer (1 hour)
  - Cache Gist data in workspace storage
  - Invalidate on git pull/checkout
- [ ] Error handling and loading states (1 hour)
  - Show "Loading..." while fetching
  - Handle "No AI conversation found" gracefully
  - Handle network errors

**Person B - Advanced Mapping** (4 hours)
- [ ] Parse tool use blocks (2 hours)
  - Extract Edit/Write tool calls from conversation
  - Parse file paths from tool calls
  - Map tool calls to conversation message indices
- [ ] Improve line-level mapping (1.5 hours)
  - For Edit tools: extract old_string/new_string
  - Run git diff to find which lines changed in each commit
  - Match tool edits to actual git diff hunks
  - Assign line ranges to prompts
- [ ] Build complete artifact generator (30 min)
  - Combine all mappings into JSON format
  - Validate output against schema

**Person C - End-to-End Script** (4 hours)
- [ ] Build CLI tool (2 hours)
  - `traceai process` - Process conversation and create artifacts
  - `traceai upload` - Upload to Gist
  - `traceai pr-summary` - Generate PR markdown
  - Argparse for options (repo path, conversation file, PR number)
- [ ] Create sample test data (1 hour)
  - Real Claude Code conversation (use this hackathon session!)
  - Sample git repo with commits
  - Test end-to-end pipeline
- [ ] Documentation (1 hour)
  - README with installation instructions
  - Usage examples
  - Screenshots (mock for now)

---

#### **Hours 8-12: Testing & Polish**

**Person A - Extension Polish** (4 hours)
- [ ] UI improvements (2 hours)
  - Better styling for hover
  - Add icons (🤖 for AI-generated)
  - Syntax highlighting for prompt in hover
- [ ] Add configuration settings (1 hour)
  - GitHub token setting
  - Enable/disable extension
  - Cache size limits
- [ ] Test with real data (1 hour)
  - Use Person C's test pipeline output
  - Fix bugs
  - Handle edge cases

**Person B - Pipeline Refinement** (4 hours)
- [ ] Handle edge cases (2 hours)
  - Files with no AI changes
  - Very long conversations
  - Binary files
  - Multiple edits to same file
- [ ] Add conversation metadata (1 hour)
  - Count total prompts
  - Identify major vs minor edits
  - Tag prompts by type (feature, bugfix, refactor)
- [ ] Optimize performance (1 hour)
  - Speed up git blame (batch operations)
  - Cache parsed conversations

**Person C - Demo Preparation** (4 hours)
- [ ] Create demo repository (2 hours)
  - Build small sample project (todo app or similar)
  - Develop it using Claude Code with clear conversation
  - Create PR with full workflow
  - Document the process
- [ ] Record demo video (1 hour)
  - Show: coding with Claude → processing → PR → extension hover
  - Screen capture with narration
  - Keep it under 3 minutes
- [ ] Start presentation deck (1 hour)
  - Problem statement
  - Solution overview
  - Architecture diagram
  - Demo clips

---

#### **Hours 12-16: Stretch Goals & Integration**

**Person A - Extension Features** (4 hours)
- [ ] Add file-level indicators (2 hours)
  - Gutter icons showing AI-generated code
  - Status bar showing "% of file AI-generated"
- [ ] Create webview panel (2 hours)
  - Sidebar showing full conversation
  - Highlight current file's prompts
  - Link to PR

**Person B - AI Summarization** (STRETCH - 4 hours)
- [ ] Set up Claude API (30 min)
  - Install `anthropic` Python package
  - Test basic API call
- [ ] Build summarization prompts (1 hour)
  - Extract key decisions from conversation
  - Identify important changes
  - Tag bug fixes vs features vs refactoring
- [ ] Generate enhanced PR summary (1.5 hours)
  - Call Claude API with full conversation
  - Parse structured output (JSON mode?)
  - Insert summary into markdown
- [ ] Test and refine prompts (1 hour)
  - Try with multiple conversations
  - Improve prompt for better summaries

**Person C - GitHub Actions Integration** (STRETCH - 4 hours)
- [ ] Create GitHub Action workflow (2 hours)
  - Trigger on PR creation
  - Run traceai pipeline
  - Upload Gist
  - Comment on PR with summary
- [ ] Test in demo repo (1 hour)
- [ ] Documentation (1 hour)

---

#### **Hours 16-20: Final Polish & Dry Run**

**All Team - Bug Bash** (2 hours)
- [ ] Test entire workflow together
- [ ] Find and fix critical bugs
- [ ] Verify demo works end-to-end

**Person A - Extension Publishing** (2 hours)
- [ ] Package extension as VSIX
- [ ] Test installation from VSIX
- [ ] Create extension marketplace listing (optional)
- [ ] Write installation docs

**Person B - Code Cleanup** (2 hours)
- [ ] Add comments and docstrings
- [ ] Remove debug code
- [ ] Add error messages and logging
- [ ] Type hints and validation

**Person C - Demo Polish** (2 hours)
- [ ] Finalize presentation
- [ ] Rehearse demo
- [ ] Prepare backup plan (if live demo fails)
- [ ] Create FAQ doc

---

#### **Hours 20-24: Demo Prep & Buffer**

**All Team - Presentation Prep** (2 hours)
- [ ] Rehearse full presentation
- [ ] Time it (ensure under time limit)
- [ ] Prepare Q&A responses
- [ ] Polish slide deck

**Buffer & Sleep** (2 hours)
- [ ] Handle last-minute issues
- [ ] Get rest before demo
- [ ] Final system check

**Demo Time!** (🎉)

---

## 🎨 Future Vision (Post-Hackathon)

### Standalone Conversation Registry

**Concept**: A dedicated service for storing and exploring all AI coding conversations

**Features**:
1. **Organization-wide conversation search**
   - "Show me all conversations about authentication"
   - "What AI-generated code is in production?"

2. **Analytics Dashboard**
   - % of codebase that's AI-generated
   - Most common prompts
   - AI productivity metrics

3. **Conversation Library**
   - Reusable prompt templates
   - "Best practices" conversations
   - Team knowledge base

4. **Advanced Querying**
   - "Find conversations that modified this function"
   - "Show me all iterations of this feature"

**Tech Stack** (for future):
- Backend: FastAPI + PostgreSQL
- Frontend: React + TanStack Query
- Storage: S3 for conversation artifacts
- Search: Elasticsearch or Typesense
- Auth: GitHub OAuth

---

## 🚀 Success Metrics

### Must-Have (Demo Success)
- [ ] VSCode extension installs and runs
- [ ] Hovering over AI-generated code shows correct prompt
- [ ] Link from hover to PR works
- [ ] PR includes conversation summary with Gist link
- [ ] Full end-to-end demo works (live or pre-recorded)

### Nice-to-Have
- [ ] AI summarization of conversations
- [ ] GitHub Actions automation
- [ ] File-level indicators (gutter icons)
- [ ] Accurate line-level mapping (vs just file-level)

### Wow Factor
- [ ] Extension available on VSCode Marketplace
- [ ] Live demo with real-time coding + PR creation
- [ ] Beautiful UI that doesn't look like a hackathon project
- [ ] Useful conversation insights (AI-extracted key decisions)

---

## 📚 Resources & References

### Documentation
- [VSCode Extension API](https://code.visualstudio.com/api)
- [GitHub Gist API](https://docs.github.com/en/rest/gists)
- [GitPython Docs](https://gitpython.readthedocs.io/)
- [Octokit.js](https://octokit.github.io/rest.js/)

### Similar Projects (for inspiration)
- GitLens - VSCode git annotations
- GitHub Copilot - AI code generation
- Sourcegraph - Code intelligence platform

### Key Files to Create
```
traceai/
├── extension/
│   ├── src/
│   │   ├── extension.ts          # Main extension entry
│   │   ├── hoverProvider.ts      # Hover logic
│   │   ├── githubClient.ts       # API calls
│   │   └── types.ts              # TypeScript types
│   ├── package.json
│   └── README.md
├── pipeline/
│   ├── traceai/
│   │   ├── parser.py             # Conversation parser
│   │   ├── mapper.py             # Prompt-to-code mapping
│   │   ├── github_client.py      # Gist upload
│   │   ├── markdown_gen.py       # PR summary
│   │   └── cli.py                # CLI interface
│   ├── requirements.txt
│   └── README.md
├── demo/
│   ├── sample-repo/              # Demo project
│   ├── sample-conversation.json  # Test data
│   └── demo-video.mp4
└── README.md                      # Project overview
```

---

## 🎯 Hackathon Pitch (30 seconds)

> "Every line of code has a story. In the age of AI, that story is a conversation. **TraceAI** makes those conversations visible—hover over any code in VSCode to see the prompt that generated it, and review PRs with full AI context. We're building the future of code provenance, where reviewing code means understanding not just *what* changed, but *why*—through the lens of human-AI collaboration."

---

## ⚠️ Risk Mitigation

### Risk 1: Claude Code format changes or is undocumented
**Mitigation**: Have manual export fallback, spend first 2 hours on research

### Risk 2: Mapping is too inaccurate to be useful
**Mitigation**: Start with file-level, accept "approximately correct" for demo

### Risk 3: GitHub API rate limits during demo
**Mitigation**: Cache all data beforehand, use pre-loaded demo environment

### Risk 4: Extension doesn't install/work on demo machine
**Mitigation**: Test on multiple machines, have video backup

### Risk 5: Scope is too ambitious for 24 hours
**Mitigation**: Clear MVP definition (hover works + PR link), all else is stretch

---

## 💡 Key Insights & Philosophy

### Why This Matters

1. **Code Review is Changing**: Reviewers need to understand AI collaboration, not just diffs
2. **Provenance is Critical**: In regulated industries, knowing code origins is compliance
3. **Knowledge Preservation**: Conversations contain valuable context that's lost without tracking
4. **Trust & Transparency**: Seeing the prompt builds confidence in AI-generated code

### Design Principles

1. **Minimal Friction**: Don't disrupt existing workflow, add value where developers already look
2. **Human-Readable First**: PR summaries must be readable without special tools
3. **Progressive Enhancement**: Works without extension, better with it
4. **Privacy-Aware**: Clear about what's shared, give control to developers

---

## 🎉 Let's Build the Future!

This plan is aggressive but achievable with 3 skilled people and good use of AI agents. Focus on the core loop (capture → map → display) and add polish where time allows.

**Most Important**: Make the demo tell a compelling story. Show the problem (opaque AI-generated code), show the solution (hover to see provenance), show the future (better code review).

Good luck! 🚀
