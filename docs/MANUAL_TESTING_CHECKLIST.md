# TraceAI Manual Testing Checklist

Use this checklist to thoroughly test TraceAI before release. Test on **Windows**, **macOS**, and **Linux** if possible.

## Test Environment Setup

### Prerequisites
- [ ] VS Code installed (latest version)
- [ ] Node.js 18+ installed
- [ ] Git installed and configured
- [ ] GitHub account available
- [ ] Test repository with Claude Code conversations

### Installation
- [ ] Clone TraceAI repository
- [ ] `cd extension && npm install` completes without errors
- [ ] `npm run compile` completes without errors
- [ ] `npm test` passes all tests
- [ ] No TypeScript compilation errors

---

## Part 1: Extension Activation

### First Launch
- [ ] Open extension folder in VS Code
- [ ] Press F5 to launch Extension Development Host
- [ ] Extension Host window opens successfully
- [ ] No errors in Debug Console
- [ ] Extension appears in Extensions sidebar

### Workspace Initialization
- [ ] Open a git repository in Extension Host
- [ ] Check Output panel → "TraceAI" channel
- [ ] See log: "TraceAI: Extension activating..."
- [ ] See log: "TraceAI: Initialized for workspace: ..."
- [ ] See log: "TraceAI: Extension activated successfully"

### Auto-Migration
- [ ] If legacy `.traceai/config.json` exists, it's auto-migrated
- [ ] Backup file created (`.traceai/config.json.backup`)
- [ ] New config has `version: "2.0.0"`
- [ ] New config has `session_ids` array

---

## Part 2: GitHub Authentication

### Sign In Flow
- [ ] Cmd/Ctrl+Shift+P → "TraceAI: Sign In to GitHub"
- [ ] Browser opens to GitHub authentication page
- [ ] Authorize VS Code application
- [ ] VS Code shows: "TraceAI: Signed in as <username>"
- [ ] No errors in console

### Auth Persistence
- [ ] Close and reopen VS Code
- [ ] Run "TraceAI: Check Authentication"
- [ ] Shows authenticated without re-prompting
- [ ] Username displayed correctly

### Sign Out
- [ ] Run "TraceAI: Sign Out"
- [ ] Shows: "TraceAI: Signed out"
- [ ] Run "TraceAI: Check Authentication"
- [ ] Shows "Not authenticated" prompt

---

## Part 3: Git Hook Installation

### Auto-Prompt on First Use
- [ ] Open fresh repository (no TraceAI hooks)
- [ ] Extension activates
- [ ] See notification: "TraceAI can automatically upload..."
- [ ] Three options: [Install Hook] [Not Now] [Never for this Repo]

### Install Hook
- [ ] Click "Install Hook"
- [ ] See: "TraceAI: Git hook installed successfully!"
- [ ] Check file exists: `.git/hooks/pre-push`
- [ ] File has execute permissions (755)
- [ ] File contains "# TraceAI Hook"
- [ ] Run "TraceAI: Check Hook Status"
- [ ] Shows "Pre-push: ✓ Installed"

### Hook Overwrite Warning
- [ ] Manually create a non-TraceAI hook at `.git/hooks/pre-push`
- [ ] Run "TraceAI: Install Git Hook"
- [ ] See warning: "A pre-push hook already exists"
- [ ] Click "Overwrite"
- [ ] Backup created: `.git/hooks/pre-push.backup`
- [ ] TraceAI hook installed

### Uninstall Hook
- [ ] Run "TraceAI: Uninstall Git Hook"
- [ ] See warning: "Uninstall TraceAI git hook?"
- [ ] Click "Uninstall"
- [ ] Hook file deleted
- [ ] Run "TraceAI: Check Hook Status"
- [ ] Shows "Pre-push: ✗ Not installed"

### "Never for this Repo" Option
- [ ] Delete `.traceai/.hook-prompted` marker if exists
- [ ] Restart extension
- [ ] See auto-prompt again
- [ ] Click "Never for this Repo"
- [ ] Marker file created: `.traceai/.hook-prompted`
- [ ] Restart extension
- [ ] No auto-prompt shown

---

## Part 4: Manual Processing Commands

### Process Latest Conversation
- [ ] Have at least one Claude Code conversation in repo
- [ ] Run "TraceAI: Process Latest Conversation"
- [ ] See progress: "Processing latest conversation..."
- [ ] On success, see: "Processed N session(s), M file(s) modified"
- [ ] Two buttons: [Open Gist] [Copy URL]

### Open Gist Button
- [ ] Click "Open Gist"
- [ ] Browser opens to gist URL
- [ ] Gist contains `conversation.json`
- [ ] Gist contains `README.md`
- [ ] README has correct metadata
- [ ] JSON is valid and complete

### Copy URL Button
- [ ] Click "Copy URL"
- [ ] Paste clipboard content
- [ ] Valid gist URL copied

### Process Unpushed Commits
- [ ] Make commits but don't push
- [ ] Run "TraceAI: Process Unpushed Commits"
- [ ] See progress notification
- [ ] Finds conversations for changed files
- [ ] Creates merged artifact
- [ ] Uploads to gist
- [ ] Shows success notification

### No Conversations Found
- [ ] Process a repo with no Claude conversations
- [ ] Run "TraceAI: Process Latest Conversation"
- [ ] See appropriate warning message
- [ ] No errors thrown
- [ ] Extension remains functional

---

## Part 5: Automatic Hook Workflow

### Successful Push with Hook
- [ ] Install hook (if not already installed)
- [ ] Ensure signed in to GitHub
- [ ] Make code changes
- [ ] `git add .`
- [ ] `git commit -m "Test TraceAI"`
- [ ] `git push`
- [ ] Watch terminal output:
  - [ ] See: "🤖 TraceAI: Processing conversations..."
  - [ ] See: "TraceAI: Found N unpushed commit(s)"
  - [ ] See: "TraceAI: M file(s) changed"
  - [ ] See: "TraceAI: ✓ Uploaded to https://gist.github.com/..."
  - [ ] See: "TraceAI: ✓ Staged config for push"
- [ ] Push completes successfully
- [ ] Config file updated: `.traceai/config.json`
- [ ] Config file included in push

### Hook on Main Branch (Should Skip)
- [ ] Switch to main/master branch
- [ ] Make a commit
- [ ] `git push`
- [ ] Hook does NOT activate
- [ ] Push completes normally
- [ ] No TraceAI output

### Push with No Conversations
- [ ] Commit files not related to Claude
- [ ] `git push`
- [ ] Hook runs but finds no conversations
- [ ] See: "TraceAI: No conversations found"
- [ ] Push continues normally

### Double-Push Prevention
- [ ] Push code (hook runs and stages config)
- [ ] Immediately push again
- [ ] Hook detects config already staged
- [ ] Skips processing
- [ ] See: "Config already staged, skipping (retry push)"
- [ ] No duplicate gist uploads

---

## Part 6: Offline Mode

### Process While Offline
- [ ] Disconnect from internet (turn off WiFi)
- [ ] Run "TraceAI: Process Latest Conversation"
- [ ] See: "Not authenticated with GitHub"
- [ ] Artifact saved locally
- [ ] Check file exists: `.traceai/artifacts/<session-id>.json`
- [ ] File contains full artifact

### Sync Queue Management
- [ ] Still offline
- [ ] Run "TraceAI: Show Storage Statistics"
- [ ] Shows "Unsynced: 1" (or more)
- [ ] Check queue file: `.traceai/sync-queue.json`
- [ ] Contains session ID

### Sync When Back Online
- [ ] Reconnect to internet
- [ ] Ensure signed in to GitHub
- [ ] Run "TraceAI: Sync Offline Artifacts"
- [ ] See progress: "Syncing offline artifacts..."
- [ ] On success: "Synced N artifact(s)"
- [ ] Run "TraceAI: Show Storage Statistics"
- [ ] Shows "Unsynced: 0"
- [ ] Check gists on GitHub - artifacts uploaded

### Hook Push While Offline
- [ ] Disconnect from internet
- [ ] Make commit
- [ ] `git push` (may fail due to no network, that's OK)
- [ ] OR use local git remote for testing
- [ ] Hook runs
- [ ] See: "⚠ TraceAI: Not authenticated with GitHub"
- [ ] Artifact saved locally
- [ ] Push completes (or fails due to network, not TraceAI)

---

## Part 7: Storage Management

### Show Storage Statistics
- [ ] Run "TraceAI: Show Storage Statistics"
- [ ] Shows meaningful data:
  - [ ] Total artifacts count
  - [ ] Synced count
  - [ ] Unsynced count
  - [ ] Total size in MB
- [ ] Numbers match actual files in `.traceai/artifacts/`

### Cleanup Old Artifacts
- [ ] Create multiple artifacts (process several times)
- [ ] Run "TraceAI: Cleanup Old Artifacts"
- [ ] See warning: "Clean up old synced artifacts? (Keeps last 50)"
- [ ] Click "Clean Up"
- [ ] See: "Deleted N old artifact(s)"
- [ ] Only recent/unsynced artifacts remain
- [ ] Run "Show Storage Statistics" - size reduced

---

## Part 8: Config Migration

### Migrate Legacy Config
- [ ] Create legacy config format:
```json
{
  "gist_id": "abc123",
  "gist_url": "https://gist.github.com/user/abc123",
  "session_id": "single-session",
  "last_updated": "2024-01-01T00:00:00Z"
}
```
- [ ] Run "TraceAI: Migrate Config to v2.0"
- [ ] See: "Config migrated to v2.0.0 successfully"
- [ ] Backup created: `.traceai/config.json.backup`
- [ ] New config has:
  - [ ] `"version": "2.0.0"`
  - [ ] `"session_ids": ["single-session"]` (array)
  - [ ] `"artifact_version": "2.0.0"`
  - [ ] `"metadata": {...}`

### Already Migrated Config
- [ ] Run "TraceAI: Migrate Config to v2.0" again
- [ ] See: "Config is already up to date"
- [ ] No changes made

---

## Part 9: Error Handling

### Network Errors
- [ ] Disconnect internet mid-upload
- [ ] Extension handles gracefully
- [ ] Falls back to offline mode
- [ ] Shows appropriate error message
- [ ] Extension remains functional

### Invalid Gist ID
- [ ] Manually edit config with invalid gist_id
- [ ] Run "TraceAI: Process Unpushed"
- [ ] Error handled gracefully
- [ ] Creates new gist instead
- [ ] Shows appropriate warning

### Permission Errors
- [ ] Revoke GitHub permissions in GitHub settings
- [ ] Run "TraceAI: Process Latest"
- [ ] Auth error detected
- [ ] Prompted to sign in again
- [ ] Extension doesn't crash

### Corrupted Config
- [ ] Create invalid JSON in config.json
- [ ] Extension handles error
- [ ] Logs warning
- [ ] Extension remains functional
- [ ] Can recreate config

---

## Part 10: Cross-Platform Testing

### Windows
- [ ] All above tests pass on Windows
- [ ] Hook script runs in Git Bash
- [ ] Hook script runs in PowerShell (if using git from PowerShell)
- [ ] Paths handled correctly (backslashes vs forward slashes)
- [ ] No permission issues

### macOS
- [ ] All above tests pass on macOS
- [ ] Hook script executable permissions work
- [ ] Bash hook runs correctly
- [ ] No path issues

### Linux
- [ ] All above tests pass on Linux
- [ ] Hook permissions correct
- [ ] All paths work correctly
- [ ] No shell compatibility issues

---

## Part 11: Multi-Workspace

### Multiple Folders
- [ ] Open workspace with multiple folders
- [ ] Extension initializes for all folders
- [ ] Each folder can have own hook
- [ ] Each folder has own config
- [ ] Commands prompt for folder selection when needed

---

## Part 12: Performance

### Large Conversations
- [ ] Test with conversation >100 messages
- [ ] Processing completes in reasonable time (<30s)
- [ ] No memory issues
- [ ] Gist uploads successfully

### Many Artifacts
- [ ] Create 50+ local artifacts
- [ ] Storage stats load quickly (<1s)
- [ ] Cleanup works efficiently
- [ ] No performance degradation

### Large Files in Commits
- [ ] Commit large files (>10MB)
- [ ] Hook processing doesn't timeout
- [ ] Only conversations processed, not files
- [ ] Push completes successfully

---

## Part 13: Integration with VS Code Features

### Output Channel
- [ ] View → Output
- [ ] Select "TraceAI" from dropdown
- [ ] Logs appear
- [ ] Logs are helpful for debugging
- [ ] No spam/excessive logging

### Command Palette
- [ ] Cmd/Ctrl+Shift+P
- [ ] Type "TraceAI"
- [ ] All 15 commands appear
- [ ] Commands have clear names
- [ ] Commands execute correctly

### Notifications
- [ ] Progress notifications appear
- [ ] Success notifications appear
- [ ] Error notifications are clear
- [ ] Notifications not too intrusive
- [ ] Notifications dismissible

---

## Part 14: Backward Compatibility

### Legacy Features Still Work
- [ ] Hover provider still functions
- [ ] Inline decorations still work
- [ ] Cache refresh works
- [ ] Toggle decorations works
- [ ] Old settings respected

### Migration from Old Extension
- [ ] If user has old Python-based setup
- [ ] Extension can read old gists
- [ ] Old config migrates cleanly
- [ ] No data loss
- [ ] Old gists still accessible

---

## Final Checks

### Documentation
- [ ] All commands documented
- [ ] README up to date
- [ ] Changelog created
- [ ] Quick Start guide tested
- [ ] Error messages helpful

### Code Quality
- [ ] `npm run lint` passes
- [ ] `npm test` passes
- [ ] `npm run compile` produces no errors
- [ ] No console errors in normal operation
- [ ] No console warnings

### Packaging
- [ ] `vsce package` completes successfully
- [ ] VSIX file created
- [ ] Install VSIX manually: `code --install-extension traceai-*.vsix`
- [ ] Extension works from VSIX
- [ ] All features functional after VSIX install

---

## Bug Tracking

Use this section to track any issues found during testing:

| Test | Issue | Severity | Status |
|------|-------|----------|--------|
|      |       |          |        |

**Severity Levels:**
- **Critical:** Blocks release, data loss, crashes
- **High:** Major feature broken, workaround exists
- **Medium:** Minor feature issue, cosmetic problems
- **Low:** Nice-to-have, future enhancement

---

## Sign-Off

Testing completed by: _______________
Date: _______________
Platform: _______________
All critical and high-severity issues resolved: [ ] Yes [ ] No

**Ready for release:** [ ] Yes [ ] No

**Notes:**
