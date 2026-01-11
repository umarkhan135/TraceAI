# TraceAI Extension Testing Guide

## Quick Start Testing (5 minutes)

### Step 1: Sign In to GitHub
1. Press `Ctrl+Shift+P` → "TraceAI: Sign In to GitHub"
2. Browser opens → Authorize VS Code
3. Return to VS Code → Should see: "TraceAI: Signed in as <username>"

### Step 2: Check Authentication
1. `Ctrl+Shift+P` → "TraceAI: Check Authentication"
2. Should show: "Authenticated as <username>"

### Step 3: Install Git Hook (on a test repo)
1. Open a git repository in VS Code
2. `Ctrl+Shift+P` → "TraceAI: Install Git Hook"
3. Choose a hook type (pre-push recommended)
4. Should see: "TraceAI: Git hook installed successfully!"

### Step 4: Check Hook Status
1. `Ctrl+Shift+P` → "TraceAI: Check Hook Status"
2. Should show: "Pre-push: ✓ Installed"

### Step 5: Process a Conversation (if you have Claude Code conversations)
1. `Ctrl+Shift+P` → "TraceAI: Process Latest Conversation"
2. If conversations exist:
   - Should process and upload to gist
   - Shows: "Processed N session(s), M file(s) modified"
   - Buttons: [Open Gist] [Copy URL]
3. If no conversations:
   - Shows warning: "No conversations found"

### Step 6: Check Storage
1. `Ctrl+Shift+P` → "TraceAI: Show Storage Statistics"
2. Should display:
   - Total artifacts
   - Synced/Unsynced counts
   - Storage size

## Full Testing (30 minutes)

Use the comprehensive checklist: `docs/MANUAL_TESTING_CHECKLIST.md`

## Test Without Claude Code Conversations

If you don't have existing Claude Code conversations, you can test:

### 1. Test Authentication Flow
- Sign in/out multiple times
- Check persistence (close/reopen VS Code)

### 2. Test Hook Installation
```bash
# In your test repo
git init test-repo
cd test-repo
git add .
git commit -m "test"
# Hook will run on push (create a remote first)
```

### 3. Test Offline Mode
- Disconnect WiFi
- Try processing → Should save locally
- Run "Show Storage Statistics" → Should show unsynced
- Reconnect WiFi
- Run "Sync Offline Artifacts" → Should upload

### 4. Test Storage Management
- Run "Cleanup Old Artifacts"
- Verify old artifacts are removed

### 5. Test Config Migration (if you have legacy config)
```bash
# Create legacy config at .traceai/config.json
{
  "gist_id": "abc123",
  "session_id": "test-session"
}
```
- Run "TraceAI: Migrate Config to v2.0"
- Should convert to v2.0 format

## Expected Behavior

### ✅ Good Signs
- No errors in Output → TraceAI channel
- All commands execute without crashing
- Authentication persists across restarts
- Hooks install without errors
- Config files created in `.traceai/` directory

### ❌ Red Flags
- Errors in Output panel
- Commands fail silently
- Extension doesn't activate
- VS Code crashes

## Testing on TraceAI Repository (This Repo!)

Since you're in the TraceAI repository:

1. **Test Hook Installation Here**
   ```bash
   # In this repo
   Ctrl+Shift+P → "TraceAI: Install Git Hook"
   ```

2. **Check for Claude Conversations**
   - TraceAI looks in `~/.claude/projects/`
   - If you used Claude Code to build TraceAI, you'll have conversations!
   - Run "Process Latest Conversation" to test

3. **Test Unpushed Commits**
   - Make a test commit:
     ```bash
     echo "test" >> test-file.txt
     git add test-file.txt
     git commit -m "test commit"
     ```
   - Run "TraceAI: Process Unpushed Commits"
   - Should analyze the commit and related conversations

## Uninstall for Clean Testing

To uninstall and reinstall:
```bash
# Uninstall
code --uninstall-extension traceai.traceai

# Reinstall
cd extension
code --install-extension traceai-0.0.1.vsix
```

## Development Testing (Method 2)

For active development with hot reload:

1. Open `extension/` folder in VS Code
2. Press `F5` → Opens Extension Development Host
3. Make changes to code
4. Reload Extension Development Host window
5. Test changes immediately

## Debugging

If something goes wrong:

1. **Check Output Logs**
   - View → Output → "TraceAI"
   - Look for error messages

2. **Check Developer Console**
   - Help → Toggle Developer Tools
   - Look in Console tab

3. **Check Extension Status**
   - Ctrl+Shift+X → TraceAI → Details
   - Should show "Enabled"

4. **Verify Files Created**
   ```bash
   # Check TraceAI directory
   ls -la .traceai/

   # Should contain:
   # - config.json
   # - artifacts/
   # - sync-queue.json (if offline mode used)
   ```

## Performance Testing

Test with large repositories:
- Open repo with 1000+ files
- Extension should activate quickly (<2s)
- Commands should respond promptly

## Cross-Platform Testing

If possible, test on:
- ✓ Windows (you're on Windows)
- ⚪ macOS (if available)
- ⚪ Linux (if available)

## Automated Test Runs

Run the test suite to verify everything:
```bash
cd extension
npm test
```

Should show: **61 tests passing**

## Next Steps After Testing

1. **Found bugs?** → Note them in `docs/MANUAL_TESTING_CHECKLIST.md` Bug Tracking section
2. **Everything works?** → Ready for Phase 6 (Documentation & Marketplace)
3. **Need changes?** → Use F5 development mode for quick iteration

## Quick Health Check (30 seconds)

Run these 3 commands to verify basic functionality:
1. `TraceAI: Check Authentication` → Should prompt or show auth status
2. `TraceAI: Check Hook Status` → Should show status (installed/not installed)
3. `TraceAI: Show Storage Statistics` → Should show stats (even if zero)

If all 3 work, the extension is functioning correctly! ✅
