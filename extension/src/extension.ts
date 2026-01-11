import * as vscode from 'vscode';
import { TraceAIHoverProvider } from './hoverProvider';
import { TraceAIDecorationProvider } from './decorationProvider';
import { localLoader } from './localLoader';
import { unifiedLoader } from './unifiedLoader';
import { cache } from './cache';
import { githubClient } from './githubClient';

let hoverProvider: TraceAIHoverProvider;
let decorationProvider: TraceAIDecorationProvider;

export function activate(context: vscode.ExtensionContext) {
  console.log('TraceAI: Extension activating...');

  const config = vscode.workspace.getConfiguration('traceai');
  const githubToken = config.get<string>('githubToken', '');

  if (vscode.workspace.workspaceFolders) {
    for (const folder of vscode.workspace.workspaceFolders) {
      cache.initialize(folder.uri.fsPath);

      const configWatcher = unifiedLoader.createConfigWatcher(folder.uri.fsPath);
      context.subscriptions.push(configWatcher);

      const artifactsWatcher = localLoader.createFileWatcher(folder.uri.fsPath);
      context.subscriptions.push(artifactsWatcher);

      console.log(`TraceAI: Initialized for workspace: ${folder.name}`);
    }
  }

  if (githubToken) {
    githubClient.initialize(githubToken);
    console.log('TraceAI: GitHub client initialized with token');
  } else {
    console.log('TraceAI: No GitHub token configured, running in local-only mode');
  }

  decorationProvider = new TraceAIDecorationProvider();
  context.subscriptions.push(decorationProvider);

  hoverProvider = new TraceAIHoverProvider();
  hoverProvider.setDecorationProvider(decorationProvider);

  const hoverDisposable = vscode.languages.registerHoverProvider(
    { scheme: 'file' },
    hoverProvider
  );
  context.subscriptions.push(hoverDisposable);

  vscode.window.visibleTextEditors.forEach(editor => {
    decorationProvider.updateDecorations(editor);
  });

  const onDidChangeActiveEditor = vscode.window.onDidChangeActiveTextEditor(editor => {
    if (editor) {
      decorationProvider.updateDecorations(editor);
    }
  });
  context.subscriptions.push(onDidChangeActiveEditor);

  const onDidOpenTextDocument = vscode.workspace.onDidOpenTextDocument(() => {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      decorationProvider.updateDecorations(editor);
    }
  });
  context.subscriptions.push(onDidOpenTextDocument);

  const onDidSaveTextDocument = vscode.workspace.onDidSaveTextDocument(() => {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      decorationProvider.updateDecorations(editor);
    }
  });
  context.subscriptions.push(onDidSaveTextDocument);

  const onDidChangeTextEditorSelection = vscode.window.onDidChangeTextEditorSelection(e => {
    decorationProvider.updateDecorations(e.textEditor);
  });
  context.subscriptions.push(onDidChangeTextEditorSelection);

  const onDidChangeConfiguration = vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('traceai')) {
      vscode.window.visibleTextEditors.forEach(editor => {
        decorationProvider.updateDecorations(editor);
      });
    }
  });
  context.subscriptions.push(onDidChangeConfiguration);

  const refreshCommand = vscode.commands.registerCommand('traceai.refreshCache', async () => {
    hoverProvider.clearCache();
    decorationProvider.clear();
    await cache.clear();

    vscode.window.visibleTextEditors.forEach(editor => {
      decorationProvider.updateDecorations(editor);
    });

    vscode.window.showInformationMessage('TraceAI: Cache cleared and decorations refreshed');
  });
  context.subscriptions.push(refreshCommand);

  const showConversationCommand = vscode.commands.registerCommand('traceai.showConversation', async () => {
    vscode.window.showInformationMessage('TraceAI: Show conversation - coming soon');
  });
  context.subscriptions.push(showConversationCommand);

  const showCacheStatsCommand = vscode.commands.registerCommand('traceai.showCacheStats', async () => {
    const stats = cache.getStats();
    vscode.window.showInformationMessage(
      `TraceAI Cache: ${stats.entries} entries cached`
    );
  });
  context.subscriptions.push(showCacheStatsCommand);

  const toggleDecorationsCommand = vscode.commands.registerCommand('traceai.toggleInlineDecorations', async () => {
    const config = vscode.workspace.getConfiguration('traceai');
    const current = config.get<boolean>('enableInlineDecorations', true);
    await config.update('enableInlineDecorations', !current, vscode.ConfigurationTarget.Global);

    vscode.window.visibleTextEditors.forEach(editor => {
      decorationProvider.updateDecorations(editor);
    });

    vscode.window.showInformationMessage(
      `TraceAI: Inline decorations ${!current ? 'enabled' : 'disabled'}`
    );
  });
  context.subscriptions.push(toggleDecorationsCommand);

  const configDisposable = vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('traceai.githubToken')) {
      const newConfig = vscode.workspace.getConfiguration('traceai');
      const newToken = newConfig.get<string>('githubToken', '');
      githubClient.initialize(newToken);
      hoverProvider.clearCache();
      console.log('TraceAI: GitHub token updated');
    }

    if (e.affectsConfiguration('traceai.cacheExpiration')) {
      cache.clear();
      console.log('TraceAI: Cache expiration changed, cache cleared');
    }
  });
  context.subscriptions.push(configDisposable);

  console.log('TraceAI: Extension activated successfully');
  vscode.window.showInformationMessage(
    'TraceAI: Extension activated. Hover over code to see AI prompt provenance.'
  );
}

export function deactivate() {
  console.log('TraceAI: Extension deactivated');
}
