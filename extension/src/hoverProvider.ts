import * as vscode from 'vscode';
import * as path from 'path';
import { ConversationArtifact, CodeMapping } from './types';
import { unifiedLoader } from './unifiedLoader';
import { TraceAIDecorationProvider } from './decorationProvider';

export class TraceAIHoverProvider implements vscode.HoverProvider {
  private decorationProvider?: TraceAIDecorationProvider;

  setDecorationProvider(provider: TraceAIDecorationProvider): void {
    this.decorationProvider = provider;
  }

  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): Promise<vscode.Hover | null> {

    const config = vscode.workspace.getConfiguration('traceai');
    if (!config.get<boolean>('enableHover', true)) {
      return null;
    }

    if (this.decorationProvider) {
      const decorationInfo = this.decorationProvider.isPositionOnDecoration(document, position);

      if (decorationInfo) {
        const promptIndex = decorationInfo.mapping.prompt_index;
        console.log(`TraceAI: Looking for prompt at index ${promptIndex}`);

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

      return null;
    }

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!workspaceFolder) {
      return null;
    }

    const relativePath = path.relative(workspaceFolder.uri.fsPath, document.uri.fsPath);

    const lineNumber = position.line + 1;

    const artifact = await unifiedLoader.loadArtifact(workspaceFolder.uri.fsPath);
    if (!artifact) {
      return null;
    }

    const mapping = this.findMappingForLine(artifact, relativePath, lineNumber);
    if (!mapping) {
      return null;
    }

    const prompt = artifact.conversation.find(msg => msg.index === mapping.prompt_index);
    if (!prompt) {
      return null;
    }

    const hoverContent = this.buildHoverContent(mapping, prompt, artifact);
    return new vscode.Hover(hoverContent);
  }

  private findMappingForLine(
    artifact: ConversationArtifact,
    filePath: string,
    lineNumber: number
  ): CodeMapping | null {
    const normalizedPath = this.normalizeFilePath(filePath);

    return artifact.mappings.find(mapping => {
      const mappingFilePath = mapping.file || mapping.tool_input?.file_path || '';
      const mappingPath = this.normalizeFilePath(mappingFilePath);

      const normalizedFileName = normalizedPath.split('/').pop() || normalizedPath;
      const mappingFileName = mappingPath.split('/').pop() || mappingPath;

      const fileMatches = mappingPath === normalizedPath ||
                          mappingFileName === normalizedFileName ||
                          mappingPath.endsWith(normalizedPath) ||
                          normalizedPath.endsWith(mappingPath);

      if (!fileMatches) {
        return false;
      }

      if (mapping.lines === null) {
        return true;
      }

      return lineNumber >= mapping.lines[0] && lineNumber <= mapping.lines[1];
    }) ?? null;
  }

  private normalizeFilePath(filePath: string): string {
    return filePath
      .replace(/\\/g, '/')
      .replace(/^\.\//, '');
  }

  private buildHoverContent(
    mapping: CodeMapping,
    prompt: { content: string; timestamp: string; role: string },
    artifact: ConversationArtifact
  ): vscode.MarkdownString {

    const md = new vscode.MarkdownString();

    md.isTrusted = true;
    md.supportHtml = true;

    md.appendMarkdown('### 🤖 AI-Generated Code\n\n');

    md.appendMarkdown('**Prompt:**\n');
    md.appendMarkdown(`> ${prompt.content}\n\n`);

    md.appendMarkdown(`**Tool:** ${mapping.tool}\n\n`);

    md.appendMarkdown(`**Time:** ${this.formatTimestamp(mapping.timestamp)}\n\n`);

    md.appendMarkdown(`**Confidence:** ${Math.round(mapping.confidence * 100)}%\n\n`);

    if (mapping.lines) {
      md.appendMarkdown(`**Lines:** ${mapping.lines[0]}-${mapping.lines[1]}\n\n`);
    }

    if (artifact.metadata.pr_number) {
      md.appendMarkdown(`**PR:** #${artifact.metadata.pr_number}\n\n`);
    }

    if (artifact.metadata.branch) {
      md.appendMarkdown(`**Branch:** ${artifact.metadata.branch}\n\n`);
    }

    if (artifact.metadata.gist_url) {
      md.appendMarkdown(`[📖 View Full Conversation](${artifact.metadata.gist_url})\n`);
    }

    if (artifact.stats) {
      md.appendMarkdown('\n---\n');
      md.appendMarkdown(`*${artifact.stats.total_prompts} prompts · ${artifact.stats.files_modified} files modified*\n`);
    }

    return md;
  }

  private formatTimestamp(timestamp: string): string {
    try {
      const date = new Date(timestamp);
      return date.toLocaleString();
    } catch {
      return timestamp;
    }
  }

  clearCache(): void {
    unifiedLoader.clearCache();
  }
}
