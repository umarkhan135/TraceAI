/**
 * ============================================================================
 * TRACEAI DECORATION PROVIDER
 * ============================================================================
 *
 * This file creates inline decorations (faded text at the end of lines)
 * similar to GitLens blame annotations. Shows which AI prompt generated each line.
 *
 * HOW IT WORKS:
 * 1. When a file is opened/changed, we scan all lines
 * 2. For each line, we check if it has an AI mapping
 * 3. If yes, we add a faded inline decoration at the end of the line
 * 4. User can hover over the decoration to see full details
 *
 * DECORATION FORMAT: "(PR #42) 'Add logout button...'"
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { ConversationArtifact, CodeMapping } from './types';
import { unifiedLoader } from './unifiedLoader';

/**
 * TraceAIDecorationProvider manages inline decorations for AI-generated code
 */
export class TraceAIDecorationProvider {
  // Decoration type for inline annotations
  private decorationType: vscode.TextEditorDecorationType;

  // Cache of decorations per file (to track decoration ranges for hover)
  private fileDecorations: Map<string, DecorationInfo[]> = new Map();

  constructor() {
    // Create the decoration type with GitLens-style appearance
    this.decorationType = vscode.window.createTextEditorDecorationType({
      after: {
        margin: '0 0 0 3em',  // Space before the decoration
        color: new vscode.ThemeColor('editorCodeLens.foreground'),  // Faded color
        fontStyle: 'italic',
      },
      isWholeLine: false,  // Only decorate after the line content
    });
  }

  /**
   * Update decorations for a specific editor
   */
  async updateDecorations(editor: vscode.TextEditor): Promise<void> {
    // Check if decorations are enabled
    const config = vscode.workspace.getConfiguration('traceai');
    if (!config.get<boolean>('enableInlineDecorations', true)) {
      editor.setDecorations(this.decorationType, []);
      return;
    }

    const document = editor.document;
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!workspaceFolder) {
      return;
    }

    // Get the relative file path
    const relativePath = path.relative(workspaceFolder.uri.fsPath, document.uri.fsPath);

    // Load artifact (will fetch all Gists for repo)
    const artifact = await unifiedLoader.loadArtifact(workspaceFolder.uri.fsPath);
    if (!artifact) {
      editor.setDecorations(this.decorationType, []);
      return;
    }

    // Build decorations for this file
    const decorations: vscode.DecorationOptions[] = [];
    const decorationInfos: DecorationInfo[] = [];

    // Group mappings by line to handle conflicts (multiple mappings for same line)
    const lineToMapping = this.groupMappingsByLine(artifact, relativePath);

    // Create decorations for each line
    for (const [lineNumber, mapping] of lineToMapping) {
      const line = lineNumber - 1; // Convert to 0-indexed

      if (line < 0 || line >= document.lineCount) {
        continue; // Skip invalid lines
      }

      // Get the line content to position the decoration at the end
      const lineText = document.lineAt(line);
      const endPosition = new vscode.Position(line, lineText.text.length);

      // Build the decoration text
      const decorationText = this.buildDecorationText(mapping, artifact);

      // Create the decoration
      const decoration: vscode.DecorationOptions = {
        range: new vscode.Range(endPosition, endPosition),
        renderOptions: {
          after: {
            contentText: decorationText,
          },
        },
      };

      decorations.push(decoration);

      // Store decoration info for hover detection
      decorationInfos.push({
        line: lineNumber,
        range: new vscode.Range(endPosition, endPosition),
        mapping: mapping,
        artifact: artifact,
      });
    }

    // Apply decorations to editor
    editor.setDecorations(this.decorationType, decorations);

    // Cache decoration info for hover
    this.fileDecorations.set(document.uri.toString(), decorationInfos);

    console.log(`TraceAI: Applied ${decorations.length} decorations to ${path.basename(document.fileName)}`);
  }

  /**
   * Group mappings by line number, resolving conflicts by choosing most recent
   */
  private groupMappingsByLine(
    artifact: ConversationArtifact,
    filePath: string
  ): Map<number, CodeMapping> {
    const lineToMapping = new Map<number, CodeMapping>();
    const normalizedPath = this.normalizeFilePath(filePath);

    for (const mapping of artifact.mappings) {
      // Check if this mapping is for the current file
      const mappingFilePath = mapping.file || mapping.tool_input?.file_path || '';
      const mappingPath = this.normalizeFilePath(mappingFilePath);

      const normalizedFileName = normalizedPath.split('/').pop() || normalizedPath;
      const mappingFileName = mappingPath.split('/').pop() || mappingPath;

      const fileMatches = mappingPath === normalizedPath ||
                          mappingFileName === normalizedFileName ||
                          mappingPath.endsWith(normalizedPath) ||
                          normalizedPath.endsWith(mappingPath);

      if (!fileMatches) {
        continue;
      }

      // If lines is null, it's file-level mapping - skip for decorations
      if (mapping.lines === null) {
        continue;
      }

      // Add decoration for each line in the range
      for (let line = mapping.lines[0]; line <= mapping.lines[1]; line++) {
        const existing = lineToMapping.get(line);

        // If no existing mapping, or this one is more recent, use this mapping
        if (!existing || new Date(mapping.timestamp) > new Date(existing.timestamp)) {
          lineToMapping.set(line, mapping);
        }
      }
    }

    return lineToMapping;
  }

  /**
   * Build the decoration text to display
   * Format: "(PR #42) 'Add logout button...'"
   */
  private buildDecorationText(mapping: CodeMapping, artifact: ConversationArtifact): string {
    const prNumber = artifact.metadata.pr_number;
    const promptPreview = this.truncate(mapping.prompt_preview, 40);

    if (prNumber) {
      return `(PR #${prNumber}) '${promptPreview}'`;
    } else {
      return `(AI) '${promptPreview}'`;
    }
  }

  /**
   * Truncate text to max length with ellipsis
   */
  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength - 3) + '...';
  }

  /**
   * Normalize file paths for comparison
   */
  private normalizeFilePath(filePath: string): string {
    return filePath
      .replace(/\\/g, '/')
      .replace(/^\.\//, '');
  }

  /**
   * Check if a position is on a decoration (for hover detection)
   */
  isPositionOnDecoration(document: vscode.TextDocument, position: vscode.Position): DecorationInfo | null {
    const decorations = this.fileDecorations.get(document.uri.toString());
    if (!decorations) {
      return null;
    }

    // Check if position is on the same line as any decoration
    // We'll be lenient and consider the entire line after the code as hoverable
    for (const decoration of decorations) {
      if (position.line + 1 === decoration.line) {
        // Check if cursor is at or after the end of the code line
        const lineText = document.lineAt(position.line);
        if (position.character >= lineText.text.trimEnd().length) {
          return decoration;
        }
      }
    }

    return null;
  }

  /**
   * Clear all decorations
   */
  clear(): void {
    this.fileDecorations.clear();
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.decorationType.dispose();
  }
}

/**
 * Decoration information stored for hover detection
 */
export interface DecorationInfo {
  line: number;
  range: vscode.Range;
  mapping: CodeMapping;
  artifact: ConversationArtifact;
}
