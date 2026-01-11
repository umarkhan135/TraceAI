# TraceAI - Quick Start Guide

## 🚀 Get Started in 5 Minutes

This guide helps you test the newly migrated TypeScript implementation of TraceAI.

## Prerequisites

- Node.js 20+ installed
- VS Code installed
- A git repository with Claude Code conversations
- GitHub account (for gist uploads)

## Step 1: Install Dependencies

```bash
cd extension
npm install
```

Expected output:
```
added 347 packages in 12s
```

## Step 2: Compile TypeScript

```bash
npm run compile
```

Expected output:
```
> traceai@0.0.1 compile
> tsc -p ./
```

No errors = success! ✅

## Step 3: Run Tests (Optional)

```bash
npm test
```

Expected output:
```
PASS  src/services/__tests__/conversationParser.test.ts
PASS  src/services/__tests__/mappingExtractor.test.ts

Tests: 14 passed, 14 total
```

## Step 4: Launch Extension Development Host

### In VS Code:

1. Open the `extension/` folder in VS Code
   ```bash
   code extension/
   ```

2. Press **F5** (or Run > Start Debugging)

3. A new VS Code window opens with `[Extension Development Host]` in the title

## Step 5: Test in Development Host

### Setup
1. In the Extension Development Host window, open a git repository that has Claude Code conversations
2. The repository should be in `~/.claude/projects/`

### Test Auto Hook Installation

1. Extension should activate automatically
2. Look for notification (bottom right):
   ```
   TraceAI can automatically upload AI conversation provenance
   to GitHub Gist when you push code. Install git hook?
   [Install Hook] [Not Now] [Never for this Repo]
   ```
3. Click **Install Hook**
4. Should see: `TraceAI: Git hook installed!`

### Test Command Palette

1. Press **Cmd+Shift+P** (Mac) or **Ctrl+Shift+P** (Windows/Linux)
2. Type `TraceAI`
3. You should see 15 commands:
   - TraceAI: Process Latest Conversation
   - TraceAI: Process Unpushed Commits
   - TraceAI: Sync Offline Artifacts
   - TraceAI: Install Git Hook
   - TraceAI: Uninstall Git Hook
   - TraceAI: Check Hook Status
   - TraceAI: Sign In to GitHub
   - TraceAI: Sign Out
   - TraceAI: Check Authentication
   - TraceAI: Show Storage Statistics
   - TraceAI: Cleanup Old Artifacts
   - TraceAI: Migrate Config to v2.0
   - ... and more

### Test GitHub Authentication

1. **Cmd+Shift+P** → `TraceAI: Sign In to GitHub`
2. VS Code opens GitHub sign-in page
3. Authorize the application
4. Should see: `TraceAI: Signed in as <your-username>`

### Test Manual Processing

1. **Cmd+Shift+P** → `TraceAI: Process Latest Conversation`
2. Should see progress notification:
   ```
   TraceAI: Processing latest conversation...
   ```
3. On success:
   ```
   TraceAI: Processed 1 session(s), 3 file(s) modified
   [Open Gist] [Copy URL]
   ```
4. Click **Open Gist** to view in browser

### Test Hook Workflow

1. Make a code change in the test repo
2. Commit the change:
   ```bash
   git add .
   git commit -m "Test TraceAI hook"
   ```
3. Push to remote:
   ```bash
   git push
   ```
4. Watch the terminal output:
   ```
   🤖 TraceAI: Processing conversations...
   TraceAI: Running pre-push hook for /path/to/repo
   TraceAI: Found 1 unpushed commit(s)
   TraceAI: 2 file(s) changed
   TraceAI: Found 1 related conversation(s)
   TraceAI: Processed 1 conversation(s)
   TraceAI: Modified 2 file(s)
   TraceAI: ✓ Uploaded to https://gist.github.com/...
   TraceAI: ✓ Staged config for push
   ```

5. Check that `.traceai/config.json` was created and committed

### Test Offline Mode

1. Disconnect from internet (turn off WiFi)
2. **Cmd+Shift+P** → `TraceAI: Process Latest Conversation`
3. Should see:
   ```
   TraceAI: Processed and saved locally. Not authenticated with GitHub
   ```
4. Reconnect to internet
5. **Cmd+Shift+P** → `TraceAI: Sync Offline Artifacts`
6. Should see:
   ```
   TraceAI: Synced 1 artifact(s)
   ```

### Test Storage Commands

1. **Cmd+Shift+P** → `TraceAI: Show Storage Statistics`
2. Should see:
   ```
   TraceAI Storage Statistics:
   Total artifacts: 3
   Synced: 2
   Unsynced: 1
   Total size: 1.23 MB
   ```

## Step 6: Check Debug Output

In the Extension Development Host:

1. **View** → **Output**
2. Select **TraceAI** from dropdown (or **Log (Extension Host)**)
3. You should see detailed logs:
   ```
   TraceAI: Extension activating...
   TraceAI: Initialized for workspace: your-repo
   TraceAI: GitHub service initialized with VS Code auth
   TraceAI: Extension activated successfully
   ```

## Troubleshooting

### Hook Not Running?

Check if hook is installed:
```bash
ls -la .git/hooks/pre-push
```

Should see a file with execute permissions (755).

View hook content:
```bash
cat .git/hooks/pre-push
```

Should start with:
```bash
#!/bin/bash
# TraceAI Hook
```

### Authentication Failing?

1. Sign out: **Cmd+Shift+P** → `TraceAI: Sign Out`
2. Sign in again: **Cmd+Shift+P** → `TraceAI: Sign In to GitHub`
3. Check authentication: **Cmd+Shift+P** → `TraceAI: Check Authentication`

### No Conversations Found?

Check that Claude Code directory exists:
```bash
ls ~/.claude/projects/
```

Should show directories for your projects.

Check conversation files:
```bash
ls ~/.claude/projects/-path-to-your-repo/
```

Should show `.jsonl` files.

### Compilation Errors?

Clean and rebuild:
```bash
rm -rf out/
npm run compile
```

### Extension Not Loading?

1. Close Extension Development Host
2. In main VS Code: **Developer** → **Reload Window**
3. Press **F5** again

## Verification Checklist

Use this checklist to verify everything works:

- [ ] Extension compiles without errors
- [ ] Tests pass
- [ ] Extension loads in Development Host
- [ ] Hook installation prompt appears
- [ ] Hook installs successfully
- [ ] Commands appear in Command Palette
- [ ] GitHub sign-in works
- [ ] Manual processing creates gist
- [ ] Hook runs on `git push`
- [ ] Config file is created
- [ ] Offline mode saves locally
- [ ] Sync uploads offline artifacts
- [ ] Storage stats show data
- [ ] No error messages in console

## Next Steps

Once you verify everything works:

1. ✅ Test with real Claude Code sessions
2. ✅ Test on different repos
3. ✅ Test offline scenarios
4. ✅ Test error cases (no auth, no internet, etc.)
5. ✅ Check gist content on GitHub
6. ✅ Verify team can see provenance

Then proceed to:
- **Phase 5:** Add more tests
- **Phase 6:** Write documentation
- **Release:** Publish to marketplace

## Need Help?

Check the detailed documentation:
- `docs/PHASE1_CHECKPOINT.md` - Core services
- `docs/PHASE2_CHECKPOINT.md` - GitHub integration
- `docs/PHASE3_AND_4_CHECKPOINT.md` - Hooks and commands
- `docs/IMPLEMENTATION_SUMMARY.md` - Complete overview

## Common Commands

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch mode (auto-compile on changes)
npm run watch

# Run tests
npm test

# Test with coverage
npm run test:coverage

# Lint code
npm run lint

# Package extension
vsce package

# Clean build
rm -rf out/ && npm run compile
```

## Success! 🎉

If you can run through all the tests above, the extension is working correctly and ready for more comprehensive testing!
