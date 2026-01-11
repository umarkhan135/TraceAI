# TraceAI: Local Artifact Storage Implementation Plan

## Overview

This document outlines the migration of TraceAI from GitHub Gist-based storage to a local file-based approach. Since the project is only 10 hours old, we're doing a clean break without backward compatibility concerns.

## Architecture

### Before (Gist-Based)
```
Claude Code → Pipeline → Upload to Gist → VSCode fetches from GitHub API
                              ↓
                        config.json (gist_id)
```

### After (Local-First)
```
Claude Code → Pipeline → Write .traceai/{id}.json + .md → Git commit
                              ↓
                        VSCode reads local files
```

## Design Decisions

1. **Storage Path**: `.traceai/{pr-number}.json` or `.traceai/{session-id}.json`
2. **File Formats**: Both JSON (machine-readable) + Markdown (human-readable)
3. **PR Links**: Point to `.traceai/xyz.md` in the repository
4. **Git Strategy**: Commit artifacts to version control
5. **No Backward Compatibility**: Clean break from Gist-based approach

## Benefits

- **No external dependencies** - No GitHub API, no rate limits
- **Simpler architecture** - Direct file I/O
- **Works offline** - Extension doesn't need internet
- **No GitHub token required** - Major UX improvement
- **Better provenance** - Artifacts live in git history
- **Faster** - No network latency

## Implementation Phases

### Phase 1: Update Data Models

**File**: `pipeline/traceai/models.py`

#### 1.1 Update Config Schema

Replace:
```python
class TraceAIConfig:
    gist_id: str
    gist_url: str
    ...
```

With:
```python
class TraceAIConfig(BaseModel):
    artifact_files: List[str]  # e.g., ["42.json", "abc123.json"]
    pr_number: Optional[int]
    branch: Optional[str]
    last_updated: str
```

#### 1.2 Remove Gist-Related Models

Delete:
- `GistUploadRequest`
- `GistUploadResponse`

Keep:
- `ConversationArtifact` (unchanged)
- `ArtifactMetadata` (remove `gist_url` field)

#### 1.3 Add Helper Functions

```python
def get_artifact_filename(session_id: str, pr_number: Optional[int] = None) -> str:
    """
    Generate artifact filename based on PR number or session ID.

    Returns:
        "{pr_number}.json" if PR known, else "{session_id}.json"
    """
    if pr_number:
        return f"{pr_number}.json"
    return f"{session_id}.json"

def get_artifact_markdown_filename(session_id: str, pr_number: Optional[int] = None) -> str:
    """Generate markdown filename."""
    if pr_number:
        return f"{pr_number}.md"
    return f"{session_id}.md"
```

---

### Phase 2: Update Pipeline CLI

**File**: `pipeline/traceai/cli.py`

#### 2.1 Modify `process` Command

**Current**:
```python
@main.command()
def process(output_file: str, ...):
    # Saves to arbitrary location
    with open(output_path, 'w') as f:
        f.write(artifact.to_json_string())
```

**New**:
```python
@main.command()
@click.option('--repo', default='.', help='Path to repository')
@click.option('--pr-number', type=int, help='PR number')
@click.option('--output-dir', default='.traceai', help='Output directory')
def process(repo: str, pr_number: Optional[int], output_dir: str):
    """Process conversation and save artifacts locally."""

    repo_path = Path(repo).resolve()
    traceai_dir = repo_path / output_dir
    traceai_dir.mkdir(exist_ok=True)

    # ... process conversation, build artifact ...

    # Determine filenames
    filename = get_artifact_filename(metadata['session_id'], pr_number)
    json_path = traceai_dir / filename
    md_path = traceai_dir / filename.replace('.json', '.md')

    # Save JSON artifact
    with open(json_path, 'w') as f:
        f.write(artifact.to_json_string())

    # Generate and save Markdown
    md_generator = markdown_gen.MarkdownGenerator(artifact)
    md_content = md_generator.generate_full_summary()

    with open(md_path, 'w') as f:
        f.write(md_content)

    # Update config.json
    update_config(traceai_dir, filename, pr_number, branch)

    console.print(f"[green]✓ Saved artifacts to {traceai_dir}[/green]")
    console.print(f"  - {json_path.name}")
    console.print(f"  - {md_path.name}")
```

#### 2.2 Add `update_config()` Helper

```python
def update_config(
    traceai_dir: Path,
    artifact_filename: str,
    pr_number: Optional[int],
    branch: Optional[str]
):
    """Update or create .traceai/config.json."""
    config_file = traceai_dir / 'config.json'

    # Load existing or create new
    if config_file.exists():
        with open(config_file, 'r') as f:
            config = json.load(f)
    else:
        config = {'artifact_files': []}

    # Add artifact if not already tracked
    if artifact_filename not in config['artifact_files']:
        config['artifact_files'].append(artifact_filename)

    # Update metadata
    config['pr_number'] = pr_number
    config['branch'] = branch
    config['last_updated'] = datetime.now().isoformat()

    # Save
    with open(config_file, 'w') as f:
        json.dump(config, f, indent=2)
```

#### 2.3 Remove `upload` Command

Delete the entire `upload()` function (lines 362-424).

Remove from help text and documentation.

#### 2.4 Update `pipeline` Command

**Current flow**: process → upload → pr-summary

**New flow**: process → pr-summary

```python
@main.command()
def pipeline(repo: str, pr_number: int, ...):
    """Run full pipeline: process → generate PR summary."""

    # Step 1: Process (now saves locally automatically)
    process(repo=repo, pr_number=pr_number)

    # Step 2: Generate PR summary
    artifact_file = Path(repo) / '.traceai' / f'{pr_number}.json'
    pr_summary(artifact_file=str(artifact_file))
```

Remove:
- Upload step and all related code
- Gist URL handling
- GitHub token checks

#### 2.5 Rename `quick_upload` → `quick_process`

```python
@main.command()
@click.option('--repo', default='.', help='Path to repository')
def quick_process(repo: str):
    """
    Quick process: Find latest session, process, and save locally.

    Designed for git hooks - processes most recent conversation
    and saves to .traceai/ in one command.
    """
    repo_path = Path(repo).resolve()
    traceai_dir = repo_path / '.traceai'
    traceai_dir.mkdir(exist_ok=True)

    try:
        # Find latest conversation
        conv_file = parser.find_conversation_file(str(repo_path))
        console.print(f"[dim]Found conversation: {conv_file.name}[/dim]")

        # Process it
        metadata = parser.get_conversation_metadata(conv_file)
        mappings = mapper.extract_code_mappings(conv_file, repo_path)
        mappings = mapper.correlate_with_git_blame(mappings, repo_path)

        # Get branch
        try:
            import git
            repo_obj = git.Repo(repo_path)
            branch = repo_obj.active_branch.name
        except:
            branch = 'unknown'

        # Build artifact
        artifact = build_artifact(conv_file, repo_path, mappings, metadata, None, branch)

        # Save JSON
        filename = get_artifact_filename(metadata['session_id'])
        json_path = traceai_dir / filename
        md_path = traceai_dir / filename.replace('.json', '.md')

        with open(json_path, 'w') as f:
            f.write(artifact.to_json_string())

        # Generate markdown
        md_generator = markdown_gen.MarkdownGenerator(artifact)
        with open(md_path, 'w') as f:
            f.write(md_generator.generate_full_summary())

        # Update config
        update_config(traceai_dir, filename, None, branch)

        console.print(f"[green]✓ Artifacts saved[/green]")
        console.print(f"  - {json_path.name}")
        console.print(f"  - {md_path.name}")

        return str(json_path)

    except ValueError as e:
        console.print(f"[yellow]⚠ No conversation found: {e}[/yellow]")
        sys.exit(0)  # Not an error for git hooks
    except Exception as e:
        console.print(f"[red]Error: {e}[/red]")
        sys.exit(1)
```

---

### Phase 3: Update Markdown Generation

**File**: `pipeline/traceai/markdown_gen.py`

#### 3.1 Remove Gist URL Dependencies

Remove `gist_url` parameter from constructor and all methods.

#### 3.2 Update Link Generation

**Current**:
```python
f"[View full conversation]({self.gist_url})"
```

**New**:
```python
def _get_conversation_link(self) -> str:
    """Generate link to local artifact markdown."""
    filename = get_artifact_markdown_filename(
        self.artifact.metadata.session_id,
        self.artifact.metadata.pr_number
    )
    return f".traceai/{filename}"

# In templates:
f"[View full conversation]({self._get_conversation_link()})"
```

For GitHub PR descriptions, optionally generate full URL:
```python
def _get_github_link(self, repo_owner: str, repo_name: str, branch: str) -> str:
    """Generate GitHub blob URL."""
    filename = get_artifact_markdown_filename(
        self.artifact.metadata.session_id,
        self.artifact.metadata.pr_number
    )
    return f"https://github.com/{repo_owner}/{repo_name}/blob/{branch}/.traceai/{filename}"
```

#### 3.3 Update All Templates

Search and replace:
- `{self.gist_url}` → `{self._get_conversation_link()}`
- Remove any Gist-specific language

---

### Phase 4: Update Git Hooks

**File**: `pipeline/traceai/cli.py` → `generate_hook_script()`

#### 4.1 Update Pre-Push Hook

```bash
#!/bin/bash
# TraceAI pre-push hook
# Automatically processes conversation and saves artifacts locally

# Only run on feature branches
branch=$(git rev-parse --abbrev-ref HEAD)
if [[ "$branch" == "main" ]] || [[ "$branch" == "master" ]]; then
  exit 0
fi

# Check if Claude Code exists
if [ ! -d "$HOME/.claude/projects" ]; then
  exit 0
fi

# Skip if artifacts already staged
if git diff --cached --name-only | grep -q "^.traceai/.*\.json$"; then
  exit 0
fi

echo "🤖 TraceAI: Processing conversation..."

REPO_PATH=$(pwd)

# Run quick-process (NO GITHUB TOKEN NEEDED!)
OUTPUT=$(traceai quick-process --repo "$REPO_PATH" 2>&1)
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
  # Check if artifacts exist
  if ls .traceai/*.json 1> /dev/null 2>&1; then
    echo "✅ TraceAI: Artifacts saved to .traceai/"
    echo ""
    echo "📝 Staging artifacts..."

    # Stage ALL artifact files
    git add .traceai/*.json .traceai/*.md .traceai/config.json

    # Amend commit to include artifacts
    git commit --amend --no-edit --no-verify 2>/dev/null || {
      git commit -m "chore: add TraceAI conversation artifacts" --no-verify 2>/dev/null || true
    }

    echo "✓ Artifacts included in commit"
  fi
else
  echo "⚠️  TraceAI: Processing failed or no conversation found"
fi

exit 0
```

**Key Changes**:
- ✅ **Removed** `GITHUB_TOKEN` check
- ✅ **Removed** `.env` loading
- ✅ Changed command: `quick-upload` → `quick-process`
- ✅ Stage both `.json` and `.md` files
- ✅ Simpler, cleaner logic

#### 4.2 Update Hook Installation

Update `install_hook()` command to reflect new behavior:
```python
console.print("[green]✓ Installed pre-push hook[/green]")
console.print()
console.print("[bold]How it works:[/bold]")
console.print("• Hook runs automatically on git push")
console.print("• Processes latest Claude Code conversation")
console.print("• Saves artifacts to .traceai/ directory")
console.print("• Commits artifacts alongside your code")
console.print()
console.print("[bold]No GitHub token needed![/bold]")
```

---

### Phase 5: Update VSCode Extension

#### 5.1 Update Types

**File**: `extension/src/types.ts`

```typescript
interface TraceAIConfig {
  artifact_files: string[];  // List of artifact JSON filenames
  pr_number?: number;
  branch?: string;
  last_updated: string;
}
```

Remove all references to `gist_id` and `gist_url`.

#### 5.2 Simplify UnifiedLoader

**File**: `extension/src/unifiedLoader.ts`

Complete rewrite to remove GitHub API dependency:

```typescript
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ConversationArtifact } from './types';

interface TraceAIConfig {
  artifact_files: string[];
  pr_number?: number;
  branch?: string;
  last_updated: string;
}

export class UnifiedLoader {
  private artifactCache: Map<string, ConversationArtifact> = new Map();

  /**
   * Load artifacts from .traceai/ directory
   */
  async loadArtifact(workspacePath: string): Promise<ConversationArtifact | null> {
    // Check cache
    const cached = this.artifactCache.get(workspacePath);
    if (cached) {
      console.log('TraceAI: Using cached artifact');
      return cached;
    }

    // Load from local files
    const artifact = await this.loadFromLocal(workspacePath);

    if (artifact) {
      this.artifactCache.set(workspacePath, artifact);
    }

    return artifact;
  }

  /**
   * Load artifacts from .traceai/ directory
   */
  private async loadFromLocal(workspacePath: string): Promise<ConversationArtifact | null> {
    const configPath = path.join(workspacePath, '.traceai', 'config.json');

    // Check if config exists
    if (!fs.existsSync(configPath)) {
      console.log('TraceAI: No config.json found');
      return null;
    }

    try {
      // Read config
      const configContent = fs.readFileSync(configPath, 'utf8');
      const config: TraceAIConfig = JSON.parse(configContent);

      // Load all artifact files
      const artifacts: ConversationArtifact[] = [];

      for (const filename of config.artifact_files) {
        const artifactPath = path.join(workspacePath, '.traceai', filename);

        if (fs.existsSync(artifactPath)) {
          const content = fs.readFileSync(artifactPath, 'utf8');
          const artifact = JSON.parse(content) as ConversationArtifact;
          artifacts.push(artifact);
        } else {
          console.warn(`TraceAI: Artifact not found: ${filename}`);
        }
      }

      if (artifacts.length === 0) {
        console.log('TraceAI: No artifacts loaded');
        return null;
      }

      // Single artifact - return directly
      if (artifacts.length === 1) {
        console.log(`TraceAI: Loaded 1 artifact with ${artifacts[0].mappings.length} mappings`);
        return artifacts[0];
      }

      // Multiple artifacts - merge
      const merged = this.mergeArtifacts(artifacts);
      console.log(`TraceAI: Merged ${artifacts.length} artifacts with ${merged.mappings.length} total mappings`);
      return merged;

    } catch (error) {
      console.error('TraceAI: Failed to load artifacts:', error);
      return null;
    }
  }

  /**
   * Merge multiple artifacts into one
   */
  private mergeArtifacts(artifacts: ConversationArtifact[]): ConversationArtifact {
    // Sort by end_time (most recent first)
    const sorted = artifacts.sort((a, b) => {
      const timeA = new Date(a.metadata.end_time).getTime();
      const timeB = new Date(b.metadata.end_time).getTime();
      return timeB - timeA;
    });

    const base = sorted[0];
    const merged: ConversationArtifact = {
      ...base,
      conversation_id: `merged-${artifacts.length}-conversations`,
      mappings: [],
      conversation: [],
      stats: {
        total_messages: 0,
        total_prompts: 0,
        files_modified: 0,
        total_tokens: 0,
      }
    };

    // Merge all mappings and conversations
    for (const artifact of sorted) {
      // Add mappings with PR prefix if available
      const prefix = artifact.metadata.pr_number ? `[PR #${artifact.metadata.pr_number}] ` : '';

      for (const mapping of artifact.mappings) {
        merged.mappings.push({
          ...mapping,
          prompt_preview: prefix + mapping.prompt_preview
        });
      }

      // Merge conversations (offset indices)
      const indexOffset = merged.conversation.length;
      for (const msg of artifact.conversation) {
        merged.conversation.push({
          ...msg,
          index: msg.index + indexOffset
        });
      }

      // Aggregate stats
      merged.stats.total_messages += artifact.stats.total_messages;
      merged.stats.total_prompts += artifact.stats.total_prompts;
      merged.stats.total_tokens += artifact.stats.total_tokens || 0;
    }

    // Count unique files
    const uniqueFiles = new Set(merged.mappings.map(m => m.file));
    merged.stats.files_modified = uniqueFiles.size;

    return merged;
  }

  /**
   * Create file watcher for config.json changes
   */
  createConfigWatcher(workspacePath: string): vscode.FileSystemWatcher {
    const pattern = new vscode.RelativePattern(workspacePath, '.traceai/config.json');
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);

    watcher.onDidChange(() => {
      console.log('TraceAI: config.json changed, clearing cache');
      this.clearCache();
    });

    watcher.onDidCreate(() => {
      console.log('TraceAI: config.json created, clearing cache');
      this.clearCache();
    });

    watcher.onDidDelete(() => {
      console.log('TraceAI: config.json deleted, clearing cache');
      this.clearCache();
    });

    return watcher;
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.artifactCache.clear();
    console.log('TraceAI: Cache cleared');
  }
}

export const unifiedLoader = new UnifiedLoader();
```

**Key Changes**:
- ✅ Removed GitHub API calls entirely
- ✅ Removed `githubClient` dependency
- ✅ Removed caching to `.traceai/artifacts.json` (source files are local)
- ✅ Simplified from ~220 lines to ~150 lines
- ✅ No network dependency
- ✅ Faster loading

#### 5.3 Remove GitHub Client

**File**: `extension/src/githubClient.ts`

Delete this entire file.

Update imports in other files:
- `extension/src/extension.ts` - Remove `import { githubClient }`
- Remove GitHub client initialization code

#### 5.4 Remove Local Loader

**File**: `extension/src/localLoader.ts`

Delete this file - its functionality is now in `unifiedLoader.ts`.

#### 5.5 Update Extension Activation

**File**: `extension/src/extension.ts`

Remove:
```typescript
// Initialize GitHub client
const token = config.get<string>('githubToken');
if (token) {
  githubClient.initialize(token);
}
```

Keep:
```typescript
// Initialize cache and watchers
for (const folder of workspaceFolders) {
  const watcher = unifiedLoader.createConfigWatcher(folder.uri.fsPath);
  context.subscriptions.push(watcher);
}
```

---

### Phase 6: Update Documentation

#### 6.1 Update CLAUDE.md

**Section to Update**: "Gist as Primary Storage"

Replace with:
```markdown
### Local Artifact Storage

**Why**:
- Zero external dependencies
- Works offline
- Fast (direct file access)
- Version controlled alongside code
- No setup required

**Structure**:
```
.traceai/
├── config.json           # Lists all artifacts
├── 42.json              # Machine-readable artifact (PR #42)
├── 42.md                # Human-readable summary (PR #42)
├── abc123.json          # Another artifact (session ID)
└── abc123.md
```

**Tradeoffs**:
- Artifacts committed to repo (adds 50-500KB per conversation)
- Can use `.gitignore` if desired

**Future**: Option to compress artifacts or archive to separate branch
```

#### 6.2 Update Workflow Diagrams

```markdown
## Data Flow

```
Claude Code Session
    ↓ (conversation.jsonl)
Python Pipeline (parse → map → save locally)
    ↓
.traceai/{id}.json + .md (committed to repo)
    ↓
VSCode Extension (read local files)
```

No GitHub API involved!
```

#### 6.3 Update CLI Documentation

**Before**:
```bash
# 1. Process conversation
traceai process output.json --repo . --pr-number 42

# 2. Upload to Gist
traceai upload output.json --token $GITHUB_TOKEN

# 3. Generate PR summary
traceai pr-summary output.json
```

**After**:
```bash
# Process conversation (saves to .traceai/ automatically)
traceai process --repo . --pr-number 42

# Generate PR summary
traceai pr-summary --repo .
```

#### 6.4 Update Setup Instructions

Remove:
- GitHub token setup
- Gist permissions
- Rate limit warnings

Add:
- Artifacts are committed to version control
- `.gitignore` option if desired
- Artifact size considerations

---

## Files to Delete

**Complete removal** (no backward compatibility):

1. `pipeline/traceai/github_client.py` - All Gist operations
2. `extension/src/githubClient.ts` - GitHub API client
3. `extension/src/localLoader.ts` - Merged into unifiedLoader
4. `extension/src/cache.ts` - No longer needed (files are local)

---

## Files to Modify

### Pipeline (Python)
1. ✅ `pipeline/traceai/models.py` - Update config schema, remove Gist models
2. ✅ `pipeline/traceai/cli.py` - Update all commands, remove upload
3. ✅ `pipeline/traceai/markdown_gen.py` - Update links

### Extension (TypeScript)
4. ✅ `extension/src/types.ts` - Update TraceAIConfig interface
5. ✅ `extension/src/unifiedLoader.ts` - Rewrite for local-only
6. ✅ `extension/src/extension.ts` - Remove GitHub client init

### Documentation
7. ✅ `CLAUDE.md` - Update architecture, workflow, setup
8. ✅ `README.md` - Update getting started, remove token setup

---

## Files Unchanged

**No changes needed**:
- `pipeline/traceai/parser.py` - Parsing logic unchanged
- `pipeline/traceai/mapper.py` - Mapping logic unchanged
- `pipeline/traceai/summarizer.py` - Summarization unchanged
- `extension/src/hoverProvider.ts` - Uses unifiedLoader (no API awareness)
- `extension/src/decorationProvider.ts` - No changes
- Core data models (`ConversationArtifact`, etc.)

---

## Testing Checklist

### Pipeline Tests

```bash
# 1. Process creates local files
traceai process --repo . --pr-number 42
ls -la .traceai/
# Should see: 42.json, 42.md, config.json

# 2. Config has correct structure
cat .traceai/config.json | jq .
# Should have: artifact_files: ["42.json"]

# 3. Markdown has local links (not Gist)
cat .traceai/42.md | grep -o "\.traceai/.*\.md"
# Should output: .traceai/42.md

# 4. Quick process works
traceai quick-process --repo .
# Should create session-id based files
```

### Extension Tests

```bash
# 1. Install extension in dev mode
cd extension
npm run compile
# Press F5 to launch Extension Development Host

# 2. Open repo with artifacts
# 3. Hover over AI-generated code
# 4. Verify tooltip shows prompt
# 5. Click link → should open .traceai/{file}.md
```

### Git Hook Tests

```bash
# 1. Install hook
traceai install-hook

# 2. Make code change with Claude Code
# 3. Commit and push
git add .
git commit -m "test"
git push

# 4. Check commit includes artifacts
git log --name-only -1 | grep ".traceai"
# Should show .traceai/*.json and .traceai/*.md
```

---

## Success Criteria

### Must Have ✅
- [ ] Pipeline saves both JSON and MD to `.traceai/`
- [ ] Config.json tracks all artifacts
- [ ] VSCode extension loads from local files
- [ ] Hovering shows prompts correctly
- [ ] Links point to local `.md` files
- [ ] Git hooks work without GitHub token
- [ ] Documentation updated
- [ ] No Gist dependencies remain

### Stretch Goals 🎯
- [ ] Beautiful markdown with syntax highlighting
- [ ] Secret detection/redaction
- [ ] Artifact compression option
- [ ] Archive command for old artifacts

---

## Implementation Timeline

**Estimated: 4-6 hours**

- **Phase 1** (Models): 30 min
- **Phase 2** (CLI): 1.5 hours
- **Phase 3** (Markdown): 30 min
- **Phase 4** (Hooks): 30 min
- **Phase 5** (Extension): 1.5 hours
- **Phase 6** (Docs): 30 min
- **Testing**: 1 hour

---

## Verification Commands

After implementation, run:

```bash
# Full workflow test
cd /path/to/test-repo

# 1. Process conversation
traceai process --repo . --pr-number 42

# 2. Check outputs
ls -la .traceai/
cat .traceai/config.json
cat .traceai/42.md | head -n 20

# 3. Test extension
code .  # Opens in VSCode
# Hover over code, verify tooltip

# 4. Test git hook
traceai install-hook
git add .
git commit -m "test"
git push
git log --name-only -1
```

---

## Notes

- **Clean break**: No backward compatibility needed (project is 10 hours old)
- **Simpler**: Removed ~1000 lines of Gist-related code
- **Faster**: No network calls in extension
- **Better UX**: No GitHub token required
- **Full provenance**: Artifacts in git history

---

**Ready to implement!** 🚀
