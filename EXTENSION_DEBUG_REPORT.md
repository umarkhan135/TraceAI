# TraceAI Extension Debug Report

## Issue
After migrating to local file storage (`.traceai/` directory), the VSCode extension's inline preview and hover tooltips were not working correctly.

## Root Cause
**Critical Bug in Artifact Merging** (extension/src/unifiedLoader.ts:116-139)

When merging multiple artifacts, the code was:
1. ✅ Offsetting conversation message indices correctly
2. ❌ **NOT** offsetting the corresponding `prompt_index` values in mappings

### Example of the Bug
```
Artifact 1 conversation: [index: 1, 2, 4]
Artifact 1 mappings: [prompt_index: 4]

Artifact 2 conversation: [index: 1, 2, 3]
Artifact 2 mappings: [prompt_index: 3]

After merging:
  Merged conversation: [
    index: 1, 2, 4,        // From artifact 1 (offset by 0)
    index: 1+3, 2+3, 3+3   // From artifact 2 (offset by 3) = [4, 5, 6]
  ]

  Merged mappings: [
    prompt_index: 4,       // From artifact 1 - ✅ CORRECT
    prompt_index: 3        // From artifact 2 - ❌ WRONG! Should be 3+3=6
  ]
```

Result: Hover provider can't find the conversation message because prompt_index=3 doesn't exist in merged conversation (there are TWO messages with index=4 - a collision!).

## The Fix
Updated `extension/src/unifiedLoader.ts` line 125-130:

**Before:**
```typescript
for (const mapping of artifact.mappings) {
  merged.mappings.push({
    ...mapping,
    prompt_preview: prefix + mapping.prompt_preview
  });
}
```

**After:**
```typescript
// Calculate index offset for this artifact (based on current merged conversation length)
const indexOffset = merged.conversation.length;

// Add mappings with updated prompt_index to match offset conversations
for (const mapping of artifact.mappings) {
  merged.mappings.push({
    ...mapping,
    prompt_index: mapping.prompt_index + indexOffset,  // ✅ Update prompt_index!
    prompt_preview: prefix + mapping.prompt_preview
  });
}
```

## Testing Instructions

### Prerequisites
1. Install the extension in VSCode (F5 to launch Extension Development Host)
2. Open the TraceAI workspace
3. Ensure `.traceai/config.json` and artifact files exist

### Test 1: Verify Artifacts Load
1. Open VSCode Developer Tools (Help → Toggle Developer Tools)
2. Check Console for log messages:
   ```
   TraceAI: Extension activating...
   TraceAI: Initialized for workspace: TraceAI
   TraceAI: Extension activated successfully
   ```
3. Open any file listed in the artifacts (e.g., `CLAUDE.md`)
4. Look for log:
   ```
   TraceAI: Loaded N artifacts with M mappings
   ```

### Test 2: Verify Inline Decorations
1. Open a file with AI-generated code (e.g., `CLAUDE.md`)
2. Move your cursor to a line that has an AI mapping
3. Look for a faded decoration at the end of the line:
   ```
   Some code here...    (PR #999) 'lets start with phase 6'
                        ↑ This should appear in faded text
   ```
4. Check Console for:
   ```
   TraceAI: Applied 1 decorations to CLAUDE.md
   ```

### Test 3: Verify Hover Tooltip
1. With cursor on a line with AI-generated code
2. Move mouse to the END of the line (after the code, where decoration appears)
3. Hover over the decoration area
4. You should see a tooltip with:
   - 🤖 AI-Generated Code header
   - **Prompt:** (full user prompt)
   - **Tool:** Edit
   - **Time:** timestamp
   - **Confidence:** percentage
   - **Lines:** line range
   - **PR:** #999 (if applicable)

### Test 4: Verify Prompt Index Fix
1. Open Developer Tools Console
2. Run the `TraceAI: Refresh Cache` command
3. Hover over a decoration
4. Check Console - should see:
   ```
   TraceAI: Looking for prompt at index 4
   TraceAI: Found prompt: {...}
   ```
5. Should NOT see:
   ```
   TraceAI: No prompt found at index X
   ```

### Common Issues

#### Issue: No decorations appear
**Check:**
- Is `traceai.enableInlineDecorations` set to `true` in settings?
- Are you on a line that has a mapping in the artifact?
- Check Console for errors

#### Issue: Hover doesn't work
**Check:**
- Are you hovering at the END of the line (where decoration appears)?
- GitLens-style behavior only shows hover when hovering over decoration, not code
- Try moving cursor to line first, then hovering at end of line

#### Issue: "No prompt found at index X"
**This was the bug we fixed!** If you still see this:
- Clear cache: `TraceAI: Refresh Cache` command
- Rebuild extension: `cd extension && npm run compile`
- Restart Extension Development Host (Ctrl+Shift+F5)

## Files Changed
- `extension/src/unifiedLoader.ts` - Fixed prompt_index offset bug

## Compilation
```bash
cd extension
npm run compile
```

## UX Notes

The current implementation uses **GitLens-style decorations**:
1. Decorations ONLY appear on the line where your cursor is
2. Hover ONLY works when hovering over the decoration (end of line)
3. This is intentional to avoid clutter, but may be non-obvious to users

**Alternative UX** (for future consideration):
- Show decorations on ALL AI-generated lines (not just cursor line)
- OR allow hover anywhere on AI-generated lines (not just decoration area)
- Add gutter icons to indicate AI-generated code
- Add a setting to control decoration display mode

## Summary

✅ **Fixed:** Critical bug in artifact merging where prompt_index values weren't offset when merging multiple artifacts

✅ **Verified:** Extension compiles without errors

⏳ **Next:** Manual testing in VSCode to verify decorations and hover work correctly

---
**Date:** 2026-01-11
**Status:** Fix implemented, pending testing
