/**
 * ============================================================================
 * TRACEAI EXTENSION - Entry Point
 * ============================================================================
 *
 * This is the main entry point for the TraceAI VSCode extension.
 * It registers the hover provider and initializes all components.
 *
 * ARCHITECTURE:
 * - Reads conversation artifacts from .traceai/ directory in workspace
 * - Loads config.json to discover artifact files
 * - Supports multiple artifacts with automatic merging
 * - File watcher automatically invalidates cache when artifacts change
 */

import * as vscode from 'vscode';
import { TraceAIHoverProvider } from './hoverProvider';
import { TraceAIDecorationProvider } from './decorationProvider';
import { unifiedLoader } from './unifiedLoader';

let hoverProvider: TraceAIHoverProvider;
let decorationProvider: TraceAIDecorationProvider;

export function activate(context: vscode.ExtensionContext) {
  console.log('TraceAI: Extension activating...');

  // Initialize components for each workspace folder
  if (vscode.workspace.workspaceFolders) {
    for (const folder of vscode.workspace.workspaceFolders) {
      // Set up file watcher for config.json (triggers cache invalidation)
      const configWatcher = unifiedLoader.createConfigWatcher(folder.uri.fsPath);
      context.subscriptions.push(configWatcher);

      console.log(`TraceAI: Initialized for workspace: ${folder.name}`);
    }
  }

  // -------------------------------------------------------------------------
  // DECORATION PROVIDER (GitLens-style inline annotations)
  // -------------------------------------------------------------------------

  // Create decoration provider FIRST (needed by hover provider)
  decorationProvider = new TraceAIDecorationProvider();
  context.subscriptions.push(decorationProvider);

  // -------------------------------------------------------------------------
  // HOVER PROVIDER (shows tooltips on decoration hover)
  // -------------------------------------------------------------------------

  // Create hover provider and connect it to decoration provider
  hoverProvider = new TraceAIHoverProvider();
  hoverProvider.setDecorationProvider(decorationProvider);

  // Register hover provider for all file types
  const hoverDisposable = vscode.languages.registerHoverProvider(
    { scheme: 'file' },
    hoverProvider
  );
  context.subscriptions.push(hoverDisposable);

  // Update decorations for visible editors on activation
  vscode.window.visibleTextEditors.forEach(editor => {
    decorationProvider.updateDecorations(editor);
  });

  // Update decorations when active editor changes
  const onDidChangeActiveEditor = vscode.window.onDidChangeActiveTextEditor(editor => {
    if (editor) {
      decorationProvider.updateDecorations(editor);
    }
  });
  context.subscriptions.push(onDidChangeActiveEditor);

  // Update decorations when document is opened
  const onDidOpenTextDocument = vscode.workspace.onDidOpenTextDocument(() => {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      decorationProvider.updateDecorations(editor);
    }
  });
  context.subscriptions.push(onDidOpenTextDocument);

  // Update decorations when document is saved (in case new mappings were added)
  const onDidSaveTextDocument = vscode.workspace.onDidSaveTextDocument(() => {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      decorationProvider.updateDecorations(editor);
    }
  });
  context.subscriptions.push(onDidSaveTextDocument);

  // Update decorations when cursor position changes (to show only on current line)
  const onDidChangeTextEditorSelection = vscode.window.onDidChangeTextEditorSelection(e => {
    decorationProvider.updateDecorations(e.textEditor);
  });
  context.subscriptions.push(onDidChangeTextEditorSelection);

  // Update decorations when config changes
  const onDidChangeConfiguration = vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('traceai')) {
      // Refresh all visible editors
      vscode.window.visibleTextEditors.forEach(editor => {
        decorationProvider.updateDecorations(editor);
      });
    }
  });
  context.subscriptions.push(onDidChangeConfiguration);

  // -------------------------------------------------------------------------
  // COMMANDS
  // -------------------------------------------------------------------------

  // Refresh cache command - clears cache and reloads artifacts
  const refreshCommand = vscode.commands.registerCommand('traceai.refreshCache', async () => {
    hoverProvider.clearCache();
    decorationProvider.clear();
    unifiedLoader.clearCache();

    // Refresh all visible editors
    vscode.window.visibleTextEditors.forEach(editor => {
      decorationProvider.updateDecorations(editor);
    });

    vscode.window.showInformationMessage('TraceAI: Cache cleared and decorations refreshed');
  });
  context.subscriptions.push(refreshCommand);

  // Show conversation command (placeholder for future implementation)
  const showConversationCommand = vscode.commands.registerCommand('traceai.showConversation', async () => {
    // TODO: Open a webview or panel showing the full conversation
    vscode.window.showInformationMessage('TraceAI: Show conversation - coming soon');
  });
  context.subscriptions.push(showConversationCommand);

  // Show cache stats command removed (no longer needed with local-only mode)

  // Toggle inline decorations command
  const toggleDecorationsCommand = vscode.commands.registerCommand('traceai.toggleInlineDecorations', async () => {
    const config = vscode.workspace.getConfiguration('traceai');
    const current = config.get<boolean>('enableInlineDecorations', true);
    await config.update('enableInlineDecorations', !current, vscode.ConfigurationTarget.Global);

    // Refresh decorations
    vscode.window.visibleTextEditors.forEach(editor => {
      decorationProvider.updateDecorations(editor);
    });

    vscode.window.showInformationMessage(
      `TraceAI: Inline decorations ${!current ? 'enabled' : 'disabled'}`
    );
  });
  context.subscriptions.push(toggleDecorationsCommand);

  // -------------------------------------------------------------------------
  // CONFIGURATION CHANGE LISTENER
  // -------------------------------------------------------------------------

  const configDisposable = vscode.workspace.onDidChangeConfiguration(e => {
    // Clear cache if configuration changes
    if (e.affectsConfiguration('traceai')) {
      unifiedLoader.clearCache();
      hoverProvider.clearCache();
      console.log('TraceAI: Configuration changed, cache cleared');
    }
  });
  context.subscriptions.push(configDisposable);

  // Show activation message
  console.log('TraceAI: Extension activated successfully');
  vscode.window.showInformationMessage(
    'TraceAI: Extension activated. Hover over code to see AI prompt provenance.'
  );
}

export function deactivate() {
  console.log('TraceAI: Extension deactivated');
}
