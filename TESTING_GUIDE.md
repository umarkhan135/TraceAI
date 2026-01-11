# TraceAI End-to-End Testing Guide

Complete workflow to test TraceAI from conversation → Gist → Extension

---

## 📋 Prerequisites

- [x] Pipeline dependencies installed
- [x] Extension compiled
- [ ] GitHub Personal Access Token (with `gist` permissions)
- [ ] Repository pushed to GitHub

---

## 🚀 Step-by-Step Testing

### **STEP 1: Create a Branch and Commit Changes** ✅ DO THIS FIRST

We need to commit the GitLens decoration work we just did:

```bash
# Navigate to repo
cd C:\Users\brixs\Desktop\Repos\TraceAI

# Create a new branch
git checkout -b feature/gitlens-decorations

# Add all the new files
git add extension/src/decorationProvider.ts
git add extension/src/gitUtils.ts
git add extension/src/extension.ts
git add extension/src/githubClient.ts
git add extension/src/hoverProvider.ts
git add extension/src/unifiedLoader.ts
git add extension/package.json

# Commit the changes
git commit -m "Add GitLens-style inline decorations for AI-generated code

- Created decorationProvider for inline annotations
- Added gitUtils to extract repository information
- Updated githubClient to fetch and merge all Gists
- Modified hoverProvider to only show on decoration hover
- Added setting to toggle inline decorations
- Implements (PR #X) 'prompt...' format at end of lines"

# Push to GitHub
git push -u origin feature/gitlens-decorations
```

**✅ VERIFY**: Run `git log -1 --stat` to see your commit

---

### **STEP 2: Create GitHub Pull Request**

```bash
# Create PR using GitHub CLI (if you have it)
gh pr create --title "Add GitLens-style inline decorations" --body "Implements GitLens-style inline decorations that show AI prompt provenance at the end of each line."

# OR create PR manually:
# 1. Go to https://github.com/YOUR_USERNAME/TraceAI
# 2. Click "Compare & pull request"
# 3. Fill in title and description
# 4. Click "Create pull request"
# 5. Note the PR number (e.g., #9)
```

**✅ VERIFY**: Note your PR number - you'll need it for the next step!

**🔢 Your PR Number**: `____` ← Write it down!

---

### **STEP 3: Process Conversation with Pipeline**

Now let's convert a Claude Code conversation into a TraceAI artifact:

```bash
# Navigate to pipeline directory
cd C:\Users\brixs\Desktop\Repos\TraceAI\pipeline

# Option A: Use our test conversation
python -m traceai.cli process ../test-artifacts/gitlens-artifact.json ^
  --repo .. ^
  --session-id test-gitlens-session ^
  --pr-number YOUR_PR_NUMBER_HERE ^
  --branch feature/gitlens-decorations ^
  --no-git-correlation

# Option B: Use a real conversation file (most recent)
python -m traceai.cli process ../test-artifacts/gitlens-artifact.json ^
  --repo .. ^
  --pr-number YOUR_PR_NUMBER_HERE ^
  --branch feature/gitlens-decorations

# The artifact will be saved to: ../test-artifacts/gitlens-artifact.json
```

**Options explained**:
- `--pr-number`: The PR number from Step 2
- `--branch`: The branch you're working on
- `--no-git-correlation`: Skip git blame (faster, less accurate)

**✅ VERIFY**: Check that `test-artifacts/gitlens-artifact.json` was created:

```bash
ls -lh ../test-artifacts/gitlens-artifact.json
```

You should see a JSON file with your conversation data!

---

### **STEP 4: Upload Artifact to GitHub Gist**

Now upload the artifact to GitHub as a Gist:

```bash
# Set your GitHub token as environment variable
$env:GITHUB_TOKEN="your_github_token_here"

# Upload to Gist
python -m traceai.cli upload ../test-artifacts/gitlens-artifact.json --token $env:GITHUB_TOKEN

# The output will show:
# - Gist URL
# - Gist ID
```

**✅ VERIFY**: Copy the Gist ID and URL from the output

**📝 Your Gist Info**:
- **Gist ID**: `________________` ← Write it down!
- **Gist URL**: `https://gist.github.com/___________`

---

### **STEP 5: Create TraceAI Configuration**

Create a config file that tells the extension where to find the Gist:

```bash
# Navigate back to repo root
cd ..

# Create .traceai directory
mkdir .traceai

# Create config.json (replace GIST_ID and PR_NUMBER with your values)
echo '{ ^
  "gist_id": "YOUR_GIST_ID_HERE", ^
  "gist_url": "https://gist.github.com/YOUR_GIST_ID_HERE", ^
  "pr_number": YOUR_PR_NUMBER_HERE, ^
  "session_id": "test-gitlens-session", ^
  "last_updated": "2026-01-10T19:00:00Z" ^
}' > .traceai/config.json
```

**✅ VERIFY**: Check the config file was created:

```bash
cat .traceai/config.json
```

---

### **STEP 6: Configure VSCode Extension**

1. Open VSCode Settings (Ctrl + ,)
2. Search for "traceai"
3. Set **TraceAI: Github Token** to your GitHub Personal Access Token
4. Ensure **TraceAI: Enable Inline Decorations** is checked ✅

**OR** edit `.vscode/settings.json` directly:

```json
{
  "traceai.githubToken": "YOUR_GITHUB_TOKEN_HERE",
  "traceai.enableInlineDecorations": true,
  "traceai.enableHover": true
}
```

---

### **STEP 7: Run Extension in Development Mode**

1. Open the **TraceAI** repository in VSCode
2. Navigate to `extension/` folder
3. Press **F5** (or Run > Start Debugging)
4. A new "Extension Development Host" window will open

**In the Extension Development Host**:

1. Open the TraceAI repository (File > Open Folder)
2. Open any file that was modified (e.g., `extension/src/decorationProvider.ts`)
3. Look for faded text at the end of lines:
   `(PR #9) 'Add GitLens-style inline...'`

---

### **STEP 8: Test the Extension**

#### ✅ Test Checklist:

**Inline Decorations**:
- [ ] Faded text appears at end of AI-generated lines
- [ ] Text format: `(PR #X) 'prompt preview...'`
- [ ] Decorations update when switching files

**Hover Behavior**:
- [ ] Hovering over CODE does nothing
- [ ] Hovering over DECORATION text shows popup
- [ ] Popup shows:
  - Full prompt text
  - Tool used (Edit, Write)
  - Timestamp
  - Confidence score
  - Link to Gist

**Commands**:
- [ ] `TraceAI: Toggle Inline Decorations` works
- [ ] `TraceAI: Refresh Cache` refreshes decorations

**Developer Console** (Help > Toggle Developer Tools):
- [ ] Check for log messages starting with "TraceAI:"
- [ ] No errors in console

---

## 🐛 Troubleshooting

### Issue: "No decorations appear"

**Check**:
1. Is `.traceai/config.json` in the workspace?
2. Is the Gist ID correct?
3. Check DevTools console for errors
4. Run `TraceAI: Refresh Cache`

### Issue: "Failed to fetch Gist"

**Check**:
1. Is your GitHub token configured?
2. Does the token have `gist` permissions?
3. Is the Gist ID correct?
4. Check network connectivity

### Issue: "Hovering doesn't show popup"

**Check**:
1. Are you hovering over the DECORATION (faded text), not the code?
2. Is `traceai.enableHover` set to true?
3. Check DevTools console for errors

### Issue: "Wrong PR number shown"

**Check**:
1. Did you upload the artifact with the correct `--pr-number`?
2. Does `.traceai/config.json` have the correct pr_number?
3. Try running `TraceAI: Refresh Cache`

---

## 📊 Expected Results

After completing all steps, you should see:

```
extension/src/decorationProvider.ts:
  15 | export class TraceAIDecorationProvider {     (PR #9) 'Create decoration provider for...'
  16 |   private decorationType: vscode...          (PR #9) 'Create decoration provider for...'
  ...
```

When you hover over the faded text, you'll see a popup with:

```
🤖 AI-Generated Code

Prompt: Create GitLens-style inline decorations

Full Request: I want to have a very detailed conceptual understanding...

Tool: Write
Time: 1/10/2026, 2:05:00 PM
Confidence: 95%
Lines: 15-150

📖 View Full Conversation
```

---

## ✅ Success Criteria

- [x] Pipeline successfully processes conversation
- [x] Artifact uploaded to GitHub Gist
- [x] Extension fetches artifact from Gist
- [x] Inline decorations appear on AI-generated lines
- [x] Hovering decorations shows full details
- [x] Multiple PRs/conversations are merged correctly

---

## 🎉 Congratulations!

You've successfully tested the complete TraceAI workflow!

**What you've done**:
1. ✅ Created a PR with AI-generated code
2. ✅ Processed the Claude Code conversation
3. ✅ Uploaded artifact to GitHub Gist
4. ✅ Configured the extension
5. ✅ Verified GitLens-style decorations work

**Next steps**:
- Test with multiple PRs to verify conflict resolution
- Try the extension in a different repository
- Explore the full conversation in the Gist
