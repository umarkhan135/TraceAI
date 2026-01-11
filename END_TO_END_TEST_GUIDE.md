# TraceAI End-to-End Testing Guide

This guide walks you through testing the complete TraceAI workflow: pipeline processing, GitHub Gist upload, and VSCode extension.

## Prerequisites

- Python 3.11+
- Node.js 18+
- VSCode
- GitHub personal access token with `gist` scope

## Part 1: Python Pipeline Testing

### Step 1: Set Up Pipeline Environment

```bash
cd /Users/umarkhan/repos/personal/TraceAI/pipeline

# Create virtual environment (if not exists)
python3 -m venv venv

# Activate virtual environment
source venv/bin/activate

# Install dependencies
pip install -e .
```

**Expected Output**: Should install all dependencies without errors.

**Troubleshooting**: If you get an import error for `anthropic`, that's OK - it's optional for summarization.

### Step 2: List Available Conversations

```bash
# List all Claude Code conversations for this project
traceai list-conversations --repo /Users/umarkhan/repos/personal/TraceAI
```

**Expected Output**: Should show a list of conversation sessions with timestamps and message counts.

**What to check**: You should see at least one conversation listed (the most recent one should be ~105KB based on the file size).

### Step 3: Process a Conversation

```bash
# Create output directory
mkdir -p /Users/umarkhan/repos/personal/TraceAI/test-output

# Process the most recent conversation
traceai process /Users/umarkhan/repos/personal/TraceAI/test-output/artifact.json \
  --repo /Users/umarkhan/repos/personal/TraceAI \
  --pr-number 999
```

**Expected Output**:
- Should show progress parsing conversation
- Display statistics (number of messages, prompts, files modified)
- Create `artifact.json` file

**What to check**:
```bash
# Check the artifact was created
ls -lh /Users/umarkhan/repos/personal/TraceAI/test-output/artifact.json

# View artifact structure
cat /Users/umarkhan/repos/personal/TraceAI/test-output/artifact.json | python -m json.tool | head -50
```

### Step 4: Validate the Artifact

```bash
# Validate the artifact schema
traceai validate /Users/umarkhan/repos/personal/TraceAI/test-output/artifact.json
```

**Expected Output**: "Artifact is valid" or similar success message.

### Step 5: Generate PR Summary

```bash
# Generate PR markdown summary
traceai pr-summary /Users/umarkhan/repos/personal/TraceAI/test-output/artifact.json \
  --output /Users/umarkhan/repos/personal/TraceAI/test-output/pr-summary.md
```

**Expected Output**:
- Creates `pr-summary.md` file
- May print summary to console

**What to check**:
```bash
# View the generated PR summary
cat /Users/umarkhan/repos/personal/TraceAI/test-output/pr-summary.md
```

Should include:
- AI-Generated Code Summary section
- Stats (files modified, conversation length)
- Files modified list
- Conversation highlights
- Link to conversation (will be added after Gist upload)

### Step 6: Upload to GitHub Gist

**IMPORTANT**: You need a GitHub token with `gist` scope.

Create token at: https://github.com/settings/tokens

```bash
# Set your GitHub token
export GITHUB_TOKEN=ghp_your_token_here

# Upload artifact to Gist (creates secret Gist)
traceai upload /Users/umarkhan/repos/personal/TraceAI/test-output/artifact.json
```

**Expected Output**:
- "Uploading to GitHub Gist..."
- Gist URL (e.g., `https://gist.github.com/username/abc123...`)
- The artifact.json will be updated with the Gist URL

**What to check**:
1. Copy the Gist URL and open it in your browser
2. Verify the JSON content is there
3. Check that the artifact.json now has the `gist_url` field:
   ```bash
   cat /Users/umarkhan/repos/personal/TraceAI/test-output/artifact.json | grep -i gist_url
   ```

### Step 7: Test Full Pipeline (Optional)

Instead of running steps 3-6 separately, you can run the full pipeline:

```bash
# Clean output directory
rm -rf /Users/umarkhan/repos/personal/TraceAI/test-output
mkdir -p /Users/umarkhan/repos/personal/TraceAI/test-output

# Run complete pipeline
traceai pipeline \
  --repo /Users/umarkhan/repos/personal/TraceAI \
  --pr-number 999 \
  --output-dir /Users/umarkhan/repos/personal/TraceAI/test-output

# Check all outputs were created
ls -lh /Users/umarkhan/repos/personal/TraceAI/test-output/
```

**Expected Output**: Should create:
- `artifact.json` - Full conversation artifact
- `pr-summary.md` - PR markdown summary
- Gist URL printed to console

---

## Part 2: VSCode Extension Testing

### Step 1: Verify Extension is Compiled

```bash
cd /Users/umarkhan/repos/personal/TraceAI/extension

# Check compiled output exists
ls -l out/
```

**Expected Output**: Should see `.js` and `.js.map` files for:
- extension.js
- hoverProvider.js
- githubClient.js
- cache.js
- types.js
- etc.

**If not compiled**, run:
```bash
npm run compile
```

### Step 2: Install Extension in VSCode

**Option A: Test in Development Mode (Recommended for testing)**

1. Open VSCode
2. Open the TraceAI extension folder:
   ```bash
   code /Users/umarkhan/repos/personal/TraceAI/extension
   ```
3. Press `F5` to launch "Extension Development Host"
4. A new VSCode window will open with the extension loaded

**Option B: Install as VSIX Package**

```bash
cd /Users/umarkhan/repos/personal/TraceAI/extension

# Install vsce if not already installed
npm install -g @vscode/vsce

# Package the extension
vsce package

# This creates traceai-0.0.1.vsix
# Install it via: Code > Install from VSIX...
```

### Step 3: Configure Extension

In the VSCode window with extension loaded:

1. Open Settings (`Cmd+,` on Mac, `Ctrl+,` on Windows/Linux)
2. Search for "TraceAI"
3. Set your GitHub token:
   - **TraceAI: Github Token**: `ghp_your_token_here`
4. Verify other settings:
   - **TraceAI: Enable Hover**: ✅ (checked)
   - **TraceAI: Cache Expiration**: 3600
   - **TraceAI: Show File Stats**: ✅ (checked)

### Step 4: Test Extension Activation

1. Open the TraceAI project in the Extension Development Host window:
   ```
   File > Open Folder... > /Users/umarkhan/repos/personal/TraceAI
   ```

2. Open the Output panel:
   ```
   View > Output
   ```

3. Select "TraceAI" from the dropdown

4. Check for activation messages like:
   ```
   TraceAI extension activated
   Registering hover provider...
   ```

### Step 5: Test Hover Provider

This is where you'll see if the extension can fetch and display prompts!

1. **Open a file that was modified in your conversation**
   - For example, open a file from the pipeline or extension that you worked on

2. **Hover over a line of code**
   - Move your mouse over lines of code
   - Wait 1-2 seconds for the hover to appear

3. **What to expect**:

   **Success Case**: You should see a hover tooltip showing:
   ```
   🤖 AI-Generated Code

   Prompt: "Add logout button to the navigation bar"
   Time: 2026-01-10 15:25:00
   PR: #999

   [View Full Conversation](https://gist.github.com/...)
   ```

   **No Data Case**: If no artifact exists for this file, no hover appears (normal)

   **Error Case**: Check the Output panel for error messages

4. **Debug Issues**:
   ```bash
   # In the Extension Development Host, open Developer Tools
   Help > Toggle Developer Tools

   # Check console for errors
   # Look for messages about:
   # - Failed to fetch Gist
   # - Invalid token
   # - No mappings found
   ```

### Step 6: Test Extension Commands

1. Open Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)

2. Try these commands:
   - `TraceAI: Refresh Cache` - Should clear and refresh artifact cache
   - `TraceAI: Show Cache Stats` - Should show cache statistics
   - `TraceAI: Show Full Conversation` - Should open conversation in browser

### Step 7: Test with Real Artifact

To properly test the hover provider, you need:

1. **A file in this repo that has mappings in artifact.json**
2. **The artifact uploaded to Gist**
3. **The Gist URL accessible**

**Create a test case**:

```bash
# 1. Process current conversation with specific file tracking
cd /Users/umarkhan/repos/personal/TraceAI

# 2. Check what files have mappings
cat test-output/artifact.json | python -c "
import json, sys
data = json.load(sys.stdin)
print('Files with mappings:')
for mapping in data.get('mappings', []):
    print(f\"  - {mapping['file']}\")
"

# 3. Open one of those files in VSCode
# 4. Hover over the lines mentioned in the mapping
```

### Step 8: Verify Cache Behavior

```bash
# Cache is stored in workspace .vscode directory
ls -la /Users/umarkhan/repos/personal/TraceAI/.vscode/traceai-cache/

# You should see cached artifact files
```

---

## Part 3: Full End-to-End Flow

### Complete Workflow Test

1. **Make a code change using Claude Code** (or use existing conversation)

2. **Run the pipeline**:
   ```bash
   cd /Users/umarkhan/repos/personal/TraceAI/pipeline
   source venv/bin/activate

   export GITHUB_TOKEN=ghp_your_token_here

   traceai pipeline \
     --repo /Users/umarkhan/repos/personal/TraceAI \
     --pr-number 1001 \
     --output-dir ../test-output
   ```

3. **Verify Gist was created**:
   - Copy Gist URL from output
   - Open in browser
   - Verify JSON is valid

4. **Test extension in VSCode**:
   - Open TraceAI project in Extension Development Host
   - Navigate to a file mentioned in artifact mappings
   - Hover over code
   - Click "View Full Conversation" link
   - Should open the Gist in browser

5. **Test PR workflow**:
   ```bash
   # Copy PR summary
   cat test-output/pr-summary.md

   # Use in actual PR (if testing with real PR)
   # Or just verify the markdown looks good
   ```

---

## Troubleshooting

### Pipeline Issues

**"No conversations found"**
- Check: `ls ~/.claude/projects/-Users-umarkhan-repos-personal-TraceAI/*.jsonl`
- Make sure you've used Claude Code in this repo

**"Module 'anthropic' not found"**
- This is OK - it's optional for summarization
- If you want summarization: `pip install anthropic`

**"Failed to parse conversation"**
- Check the conversation file format
- Try with a different conversation: `--session-id <id>`

### Extension Issues

**Hover not showing**
- Check Output panel for errors
- Verify GitHub token is set in settings
- Check that artifact has mappings for the file you're hovering over
- Clear cache: "TraceAI: Refresh Cache" command

**"Failed to fetch Gist"**
- Verify GitHub token has `gist` scope
- Check internet connection
- Verify Gist URL is accessible in browser

**Extension not activating**
- Check Extensions view - is TraceAI enabled?
- Look for errors in Developer Tools console
- Try reloading window: "Developer: Reload Window" command

### Git Integration Issues

**"Not a git repository"**
- Ensure you're in a git repo
- Run `git status` to verify

**"Failed to correlate with git blame"**
- This is OK - file-level mapping still works
- Line-level mapping requires recent commits

---

## Success Criteria

You know the system is working end-to-end when:

- ✅ Pipeline processes conversation without errors
- ✅ Artifact.json is created with valid structure
- ✅ PR summary markdown is generated and readable
- ✅ Gist is created and accessible via URL
- ✅ Extension loads in VSCode without errors
- ✅ Hover shows prompt provenance for AI-generated code
- ✅ Clicking Gist link opens conversation in browser
- ✅ Cache is working (subsequent hovers are faster)

---

## Next Steps After Testing

Once you've verified everything works:

1. **Document any issues found** in GitHub issues
2. **Take screenshots** of the hover UI for documentation
3. **Record a demo video** showing the full workflow
4. **Test with different types of conversations** (large, small, multi-file)
5. **Test edge cases**:
   - Files with no mappings
   - Very large conversations
   - Private vs public Gists
   - Multiple PRs in same repo

---

## Quick Reference

### Pipeline Commands
```bash
# List conversations
traceai list-conversations --repo .

# Process conversation
traceai process output.json --repo . --pr-number 123

# Upload to Gist
traceai upload output.json

# Generate PR summary
traceai pr-summary output.json --output pr.md

# Full pipeline
traceai pipeline --repo . --pr-number 123 --output-dir ./output
```

### Extension Testing
```bash
# Compile extension
cd extension && npm run compile

# Run in development mode
# Press F5 in VSCode with extension folder open

# Package extension
vsce package
```

### File Locations
- **Conversations**: `~/.claude/projects/-Users-umarkhan-repos-personal-TraceAI/*.jsonl`
- **Pipeline**: `/Users/umarkhan/repos/personal/TraceAI/pipeline/`
- **Extension**: `/Users/umarkhan/repos/personal/TraceAI/extension/`
- **Cache**: `/Users/umarkhan/repos/personal/TraceAI/.vscode/traceai-cache/`

---

**Happy Testing! 🚀**
