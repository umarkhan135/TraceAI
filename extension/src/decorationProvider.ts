import * as vscode from 'vscode';
import * as path from 'path';
import { ConversationArtifact, CodeMapping } from './types';
import { unifiedLoader } from './unifiedLoader';

export class TraceAIDecorationProvider {
  private decorationType: vscode.TextEditorDecorationType;

  private fileDecorations: Map<string, DecorationInfo[]> = new Map();

  constructor() {
    this.decorationType = vscode.window.createTextEditorDecorationType({
      after: {
        margin: '0 0 0 3em',
        color: new vscode.ThemeColor('editorCodeLens.foreground'),
        fontStyle: 'italic',
      },
      isWholeLine: false,
    });
  }

  async updateDecorations(editor: vscode.TextEditor): Promise<void> {
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

    const relativePath = path.relative(workspaceFolder.uri.fsPath, document.uri.fsPath);

    const artifact = await unifiedLoader.loadArtifact(workspaceFolder.uri.fsPath);
    if (!artifact) {
      editor.setDecorations(this.decorationType, []);
      return;
    }

    const currentLine = editor.selection.active.line + 1;

    const decorations: vscode.DecorationOptions[] = [];
    const decorationInfos: DecorationInfo[] = [];

    const lineToMapping = this.groupMappingsByLine(artifact, relativePath);

    const mapping = lineToMapping.get(currentLine);
    if (mapping) {
      const line = currentLine - 1;

      if (line >= 0 && line < document.lineCount) {
        const lineText = document.lineAt(line);
        const endPosition = new vscode.Position(line, lineText.text.length);

        const decorationText = this.buildDecorationText(mapping, artifact);

        const decoration: vscode.DecorationOptions = {
          range: new vscode.Range(endPosition, endPosition),
          renderOptions: {
            after: {
              contentText: decorationText,
            },
          },
        };

        decorations.push(decoration);

        decorationInfos.push({
          line: currentLine,
          range: new vscode.Range(endPosition, endPosition),
          mapping: mapping,
          artifact: artifact,
        });
      }
    }

    editor.setDecorations(this.decorationType, decorations);

    const allDecorationInfos: DecorationInfo[] = [];
    for (const [lineNumber, mapping] of lineToMapping) {
      const line = lineNumber - 1;
      if (line >= 0 && line < document.lineCount) {
        const lineText = document.lineAt(line);
        const endPosition = new vscode.Position(line, lineText.text.length);
        allDecorationInfos.push({
          line: lineNumber,
          range: new vscode.Range(endPosition, endPosition),
          mapping: mapping,
          artifact: artifact,
        });
      }
    }
    this.fileDecorations.set(document.uri.toString(), allDecorationInfos);

    console.log(`TraceAI: Applied ${decorations.length} decorations to ${path.basename(document.fileName)}`);
  }

  private groupMappingsByLine(
    artifact: ConversationArtifact,
    filePath: string
  ): Map<number, CodeMapping> {
    const lineToMapping = new Map<number, CodeMapping>();
    const normalizedPath = this.normalizeFilePath(filePath);

    for (const mapping of artifact.mappings) {
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

      if (mapping.lines === null) {
        continue;
      }

      for (let line = mapping.lines[0]; line <= mapping.lines[1]; line++) {
        const existing = lineToMapping.get(line);

        if (!existing || new Date(mapping.timestamp) > new Date(existing.timestamp)) {
          lineToMapping.set(line, mapping);
        }
      }
    }

    return lineToMapping;
  }

  private buildDecorationText(mapping: CodeMapping, artifact: ConversationArtifact): string {
    const prNumber = artifact.metadata.pr_number;
    const promptPreview = this.truncate(mapping.prompt_preview, 40);

    if (prNumber) {
      return `(PR #${prNumber}) '${promptPreview}'`;
    } else {
      return `(Prompt #${mapping.prompt_index}) '${promptPreview}'`;
    }
  }

  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength - 3) + '...';
  }

  private normalizeFilePath(filePath: string): string {
    return filePath
      .replace(/\\/g, '/')
      .replace(/^\.\//, '');
  }

  isPositionOnDecoration(document: vscode.TextDocument, position: vscode.Position): DecorationInfo | null {
    const decorations = this.fileDecorations.get(document.uri.toString());
    if (!decorations) {
      return null;
    }

    for (const decoration of decorations) {
      if (position.line + 1 === decoration.line) {
        const lineText = document.lineAt(position.line);
        const codeEndPos = lineText.text.trimEnd().length;

        if (position.character >= codeEndPos) {
          return decoration;
        }
      }
    }

    return null;
  }

  clear(): void {
    this.fileDecorations.clear();
  }

  dispose(): void {
    this.decorationType.dispose();
  }
}

export interface DecorationInfo {
  line: number;
  range: vscode.Range;
  mapping: CodeMapping;
  artifact: ConversationArtifact;
}
