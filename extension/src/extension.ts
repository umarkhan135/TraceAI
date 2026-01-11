import * as vscode from 'vscode';
import { TraceAIHoverProvider } from './hoverProvider';
import { TraceAIDecorationProvider } from './decorationProvider';
import { localLoader } from './localLoader';
import { unifiedLoader } from './unifiedLoader';
import { cache } from './cache';
import { TraceAICommands } from './commands';
import { HookInstaller } from './services/hookInstaller';
import { githubService } from './services/githubService';
import { ConfigMigration } from './services/configMigration';

let hoverProvider: TraceAIHoverProvider;
let decorationProvider: TraceAIDecorationProvider;

export function activate(context: vscode.ExtensionContext) {
  console.log('TraceAI: Extension activating...');

  // Register all commands
  TraceAICommands.register(context);

  if (vscode.workspace.workspaceFolders) {
    for (const folder of vscode.workspace.workspaceFolders) {
      const repoPath = folder.uri.fsPath;

      cache.initialize(repoPath);

      const configWatcher = unifiedLoader.createConfigWatcher(repoPath);
      context.subscriptions.push(configWatcher);

      const artifactsWatcher = localLoader.createFileWatcher(repoPath);
      context.subscriptions.push(artifactsWatcher);

      // Auto-migrate config if needed
      ConfigMigration.autoMigrateRepo(repoPath);

      // Check and prompt for hook installation
      HookInstaller.shouldAutoInstall(repoPath).then(should => {
        if (should) {
          HookInstaller.promptInstallation(repoPath);
        }
      });

      console.log(`TraceAI: Initialized for workspace: ${folder.name}`);
    }
  }

  // Initialize GitHub service (uses VS Code auth)
  githubService.initialize().then(success => {
    if (success) {
      console.log('TraceAI: GitHub service initialized with VS Code auth');
    } else {
      console.log('TraceAI: GitHub service not authenticated (will work in offline mode)');
    }
  });

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
    if (e.affectsConfiguration('traceai.cacheExpiration')) {
      cache.clear();
      console.log('TraceAI: Cache expiration changed, cache cleared');
    }
  });
  context.subscriptions.push(configDisposable);

  console.log('TraceAI: Extension activated successfully');
  // Don't show popup - too intrusive for background extension
}

export function deactivate() {
  console.log('TraceAI: Extension deactivated');
}
