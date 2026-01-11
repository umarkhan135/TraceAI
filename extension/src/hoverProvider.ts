/**
 * ============================================================================
 * TRACEAI HOVER PROVIDER
 * ============================================================================
 *
 * This file creates the hover tooltip that appears when you mouse over code.
 * It shows which AI prompt generated that specific piece of code.
 *
 * HOW IT WORKS:
 * 1. User hovers over a line of code
 * 2. We figure out which file and line number they're hovering on
 * 3. We load the artifacts.json file from .traceai/ folder
 * 4. We search for a mapping that matches this file + line number
 * 5. If found, we build a nice tooltip with the prompt info
 *
 * TO CUSTOMIZE:
 * - Change tooltip content: Edit the buildHoverContent() method
 * - Change what data is shown: Modify the MarkdownString construction
 * - Change file matching: Edit normalizeFilePath() method
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { ConversationArtifact, CodeMapping } from './types';
import { unifiedLoader } from './unifiedLoader';
import { TraceAIDecorationProvider } from './decorationProvider';

/**
 * TraceAIHoverProvider implements VSCode's HoverProvider interface.
 * This tells VSCode to call our provideHover() method whenever
 * the user hovers over code.
 *
 * IMPORTANT: This provider now only shows tooltips when hovering over
 * the inline decoration (faded text), not when hovering over the code itself.
 */
export class TraceAIHoverProvider implements vscode.HoverProvider {
  private decorationProvider?: TraceAIDecorationProvider;

  /**
   * Set the decoration provider to check if hover is on a decoration
   */
  setDecorationProvider(provider: TraceAIDecorationProvider): void {
    this.decorationProvider = provider;
  }

  /**
   * -------------------------------------------------------------------------
   * MAIN HOVER METHOD - Called by VSCode when user hovers over code
   * -------------------------------------------------------------------------
   *
   * @param document - The file the user is looking at
   * @param position - The exact line and character position of the cursor
   * @param _token - Used for cancellation (we ignore it with underscore)
   * @returns A Hover object with tooltip content, or null if no tooltip
   */
  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): Promise<vscode.Hover | null> {

    // -----------------------------------------------------------------------
    // STEP 1: Check if hover feature is enabled in settings
    // -----------------------------------------------------------------------
    // Users can disable the hover in VSCode settings (traceai.enableHover)
    const config = vscode.workspace.getConfiguration('traceai');
    if (!config.get<boolean>('enableHover', true)) {
      return null;  // Hover is disabled, show nothing
    }

    // -----------------------------------------------------------------------
    // STEP 1.5: Check if hovering over a decoration (GitLens-style behavior)
    // -----------------------------------------------------------------------
    // ONLY show hover when hovering on the decoration, not on code
    if (this.decorationProvider) {
      const decorationInfo = this.decorationProvider.isPositionOnDecoration(document, position);

      if (decorationInfo) {
        // User is hovering over the decoration - show the tooltip from decoration data
        const promptIndex = decorationInfo.mapping.prompt_index;
        console.log(`TraceAI: Looking for prompt at index ${promptIndex}`);

        // Find the conversation message by its index field, not array position
        const prompt = decorationInfo.artifact.conversation.find(msg => msg.index === promptIndex);
        console.log(`TraceAI: Found prompt:`, prompt);

        if (prompt) {
          const hoverContent = this.buildHoverContent(
            decorationInfo.mapping,
            prompt,
            decorationInfo.artifact
          );
          return new vscode.Hover(hoverContent);
        } else {
          console.log(`TraceAI: No prompt found at index ${promptIndex}`);
        }
      }

      // If not hovering over decoration, don't show hover
      return null;
    }

    // -----------------------------------------------------------------------
    // STEP 2: Get the workspace folder for this file
    // -----------------------------------------------------------------------
    // We need to know which workspace folder the file is in
    // so we can find the .traceai/artifacts.json file
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!workspaceFolder) {
      return null;  // File is not in a workspace, can't find artifacts
    }

    // -----------------------------------------------------------------------
    // STEP 3: Calculate the relative file path and line number
    // -----------------------------------------------------------------------
    // Convert absolute path to relative path (e.g., "calculator.py")
    // This must match the file paths in artifacts.json
    const relativePath = path.relative(workspaceFolder.uri.fsPath, document.uri.fsPath);

    // VSCode uses 0-indexed lines, but our artifacts use 1-indexed
    // So line 0 in VSCode = line 1 in our artifacts
    const lineNumber = position.line + 1;

    // -----------------------------------------------------------------------
    // STEP 4: Load the TraceAI artifact (from config.json -> Gist or local)
    // -----------------------------------------------------------------------
    // The unified loader checks for config.json first, then fetches from Gist,
    // and falls back to local artifacts.json for backward compatibility
    const artifact = await unifiedLoader.loadArtifact(workspaceFolder.uri.fsPath);
    if (!artifact) {
      return null;  // No artifact found, nothing to show
    }

    // -----------------------------------------------------------------------
    // STEP 5: Find a mapping that matches this file and line
    // -----------------------------------------------------------------------
    // Search through all mappings to find one that covers this line
    const mapping = this.findMappingForLine(artifact, relativePath, lineNumber);
    if (!mapping) {
      return null;  // This line wasn't generated by AI, no tooltip
    }

    // -----------------------------------------------------------------------
    // STEP 6: Get the full prompt from the conversation
    // -----------------------------------------------------------------------
    // The mapping tells us which prompt (by index field) generated this code
    const prompt = artifact.conversation.find(msg => msg.index === mapping.prompt_index);
    if (!prompt) {
      return null;  // Prompt not found (shouldn't happen normally)
    }

    // -----------------------------------------------------------------------
    // STEP 7: Build and return the hover tooltip
    // -----------------------------------------------------------------------
    const hoverContent = this.buildHoverContent(mapping, prompt, artifact);
    return new vscode.Hover(hoverContent);
  }

  /**
   * -------------------------------------------------------------------------
   * FIND MAPPING FOR LINE - Searches for a mapping that covers this line
   * -------------------------------------------------------------------------
   *
   * Each mapping in artifacts.json looks like:
   * {
   *   "file": "calculator.py",
   *   "lines": [7, 10],        <-- Start and end line numbers (or null for file-level)
   *   "prompt_index": 0,       <-- Which prompt in the conversation
   *   "prompt_preview": "...",
   *   "tool": "Edit",          <-- Tool used (Edit, Write, etc.)
   *   "tool_input": {...}      <-- Full tool parameters
   *   ...
   * }
   *
   * This method finds a mapping where:
   * - The file path matches (from mapping.file or tool_input.file_path)
   * - The line number is between lines[0] and lines[1] (if lines is not null)
   * - If lines is null, it's file-level mapping (matches any line in the file)
   */
  private findMappingForLine(
    artifact: ConversationArtifact,
    filePath: string,
    lineNumber: number
  ): CodeMapping | null {
    // Normalize the path (convert backslashes, remove ./ prefix)
    const normalizedPath = this.normalizeFilePath(filePath);

    // Search through all mappings
    return artifact.mappings.find(mapping => {
      // Get the file path from mapping - try both locations
      const mappingFilePath = mapping.file || mapping.tool_input?.file_path || '';
      const mappingPath = this.normalizeFilePath(mappingFilePath);

      // Extract just the filename for comparison (in case one is absolute path)
      const normalizedFileName = normalizedPath.split('/').pop() || normalizedPath;
      const mappingFileName = mappingPath.split('/').pop() || mappingPath;

      // Check if file matches
      const fileMatches = mappingPath === normalizedPath ||
                          mappingFileName === normalizedFileName ||
                          mappingPath.endsWith(normalizedPath) ||
                          normalizedPath.endsWith(mappingPath);

      if (!fileMatches) {
        return false;
      }

      // If lines is null, it's file-level mapping (matches any line)
      if (mapping.lines === null) {
        return true;
      }

      // Check if line is within range
      return lineNumber >= mapping.lines[0] && lineNumber <= mapping.lines[1];
    }) ?? null;  // Return null if no mapping found
  }

  /**
   * -------------------------------------------------------------------------
   * NORMALIZE FILE PATH - Makes paths consistent for comparison
   * -------------------------------------------------------------------------
   *
   * Windows uses backslashes (C:\folder\file.py)
   * Mac/Linux uses forward slashes (/folder/file.py)
   *
   * This converts all paths to forward slashes and removes "./" prefix
   * so ".\calculator.py" and "calculator.py" match correctly
   */
  private normalizeFilePath(filePath: string): string {
    return filePath
      .replace(/\\/g, '/')      // Replace all \ with /
      .replace(/^\.\//, '');    // Remove leading ./
  }

  /**
   * -------------------------------------------------------------------------
   * BUILD HOVER CONTENT - Creates the tooltip that users see
   * -------------------------------------------------------------------------
   *
   * This is where you customize what appears in the tooltip!
   *
   * We use MarkdownString which supports:
   * - **bold text**
   * - *italic text*
   * - > blockquotes
   * - [links](url)
   * - ### headings
   * - And more!
   *
   * CUSTOMIZE THIS METHOD to change the tooltip appearance.
   *
   * @param mapping - The code mapping with line info and prompt preview
   * @param prompt - The full prompt from the conversation
   * @param artifact - The full artifact (for metadata like PR number)
   */
  private buildHoverContent(
    mapping: CodeMapping,
    prompt: { content: string; timestamp: string; role: string },
    artifact: ConversationArtifact
  ): vscode.MarkdownString {

    // Create a new MarkdownString for the tooltip
    const md = new vscode.MarkdownString();

    // Enable trusted mode (allows commands and some HTML)
    md.isTrusted = true;
    md.supportHtml = true;

    // =====================================================================
    // TOOLTIP HEADER
    // =====================================================================
    // The emoji and title at the top
    md.appendMarkdown('### 🤖 AI-Generated Code\n\n');

    // =====================================================================
    // FULL PROMPT (from conversation)
    // =====================================================================
    // This is the complete prompt the user typed - show it in full
    md.appendMarkdown('**Prompt:**\n');
    md.appendMarkdown(`> ${prompt.content}\n\n`);

    // =====================================================================
    // METADATA SECTION
    // =====================================================================
    // Tool used - shows which tool generated this code
    md.appendMarkdown(`**Tool:** ${mapping.tool}\n\n`);

    // Timestamp - when the code was generated
    md.appendMarkdown(`**Time:** ${this.formatTimestamp(mapping.timestamp)}\n\n`);

    // Confidence score - how sure we are about this mapping (0-100%)
    md.appendMarkdown(`**Confidence:** ${Math.round(mapping.confidence * 100)}%\n\n`);

    // Lines affected - if available
    if (mapping.lines) {
      md.appendMarkdown(`**Lines:** ${mapping.lines[0]}-${mapping.lines[1]}\n\n`);
    }

    // PR number - if this code is associated with a pull request
    if (artifact.metadata.pr_number) {
      md.appendMarkdown(`**PR:** #${artifact.metadata.pr_number}\n\n`);
    }

    // Branch - if available
    if (artifact.metadata.branch) {
      md.appendMarkdown(`**Branch:** ${artifact.metadata.branch}\n\n`);
    }

    // =====================================================================
    // LINK TO FULL CONVERSATION
    // =====================================================================
    // If there's a Gist URL, show a link to view the full conversation
    if (artifact.metadata.gist_url) {
      md.appendMarkdown(`[📖 View Full Conversation](${artifact.metadata.gist_url})\n`);
    }

    // =====================================================================
    // STATS FOOTER
    // =====================================================================
    if (artifact.stats) {
      md.appendMarkdown('\n---\n');
      md.appendMarkdown(`*${artifact.stats.total_prompts} prompts · ${artifact.stats.files_modified} files modified*\n`);
    }

    return md;
  }

  /**
   * -------------------------------------------------------------------------
   * TRUNCATE - Shortens long text with "..." at the end
   * -------------------------------------------------------------------------
   *
   * Tooltips can get too long if the prompt is very detailed.
   * This cuts off text at maxLength characters and adds "..."
   *
   * Example: truncate("Hello World", 8) => "Hello..."
   */
  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;  // Text is short enough, return as-is
    }
    // Cut at maxLength-3 to leave room for "..."
    return text.substring(0, maxLength - 3) + '...';
  }

  /**
   * -------------------------------------------------------------------------
   * FORMAT TIMESTAMP - Converts ISO timestamp to readable format
   * -------------------------------------------------------------------------
   *
   * Input:  "2026-01-10T12:01:00Z"
   * Output: "1/10/2026, 12:01:00 PM" (depends on locale)
   */
  private formatTimestamp(timestamp: string): string {
    try {
      const date = new Date(timestamp);
      return date.toLocaleString();  // Uses browser's locale settings
    } catch {
      return timestamp;  // If parsing fails, return original string
    }
  }

  /**
   * -------------------------------------------------------------------------
   * CLEAR CACHE - Resets the cached artifacts
   * -------------------------------------------------------------------------
   *
   * Called when user runs "TraceAI: Refresh Cache" command.
   * Forces the extension to reload artifacts from Gist or disk.
   */
  clearCache(): void {
    unifiedLoader.clearCache();
  }
}
