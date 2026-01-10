/**
 * ============================================================================
 * TRACEAI EXTENSION - Entry Point
 * ============================================================================
 *
 * This is the main entry point for the TraceAI VSCode extension.
 * It registers the hover provider and initializes all components.
 *
 * MODES OF OPERATION:
 * 1. Local Mode (for testing): Reads from .traceai/artifacts.json in workspace
 * 2. GitHub Mode (production): Fetches artifacts from GitHub Gists
 *
 * The mode is determined by:
 * - If .traceai/artifacts.json exists -> Local Mode
 * - If githubToken is configured -> GitHub Mode (when local not available)
 */

import * as vscode from 'vscode';
import { TraceAIHoverProvider } from './hoverProvider';
import { localLoader } from './localLoader';
import { cache } from './cache';
import { githubClient } from './githubClient';

let hoverProvider: TraceAIHoverProvider;

export function activate(context: vscode.ExtensionContext) {
  console.log('TraceAI: Extension activating...');

  // Get configuration
  const config = vscode.workspace.getConfiguration('traceai');
  const githubToken = config.get<string>('githubToken', '');

  // Initialize components for each workspace folder
  if (vscode.workspace.workspaceFolders) {
    for (const folder of vscode.workspace.workspaceFolders) {
      // Initialize cache with workspace path (for .vscode/ storage)
      cache.initialize(folder.uri.fsPath);

      // Set up file watcher for local artifacts
      const watcher = localLoader.createFileWatcher(folder.uri.fsPath);
      context.subscriptions.push(watcher);

      console.log(`TraceAI: Initialized for workspace: ${folder.name}`);
    }
  }

  // Initialize GitHub client if token is configured
  if (githubToken) {
    githubClient.initialize(githubToken);
    console.log('TraceAI: GitHub client initialized with token');
  } else {
    console.log('TraceAI: No GitHub token configured, running in local-only mode');
  }

  // Create hover provider
  hoverProvider = new TraceAIHoverProvider();

  // Register hover provider for all file types
  const hoverDisposable = vscode.languages.registerHoverProvider(
    { scheme: 'file' },
    hoverProvider
  );
  context.subscriptions.push(hoverDisposable);

  // -------------------------------------------------------------------------
  // COMMANDS
  // -------------------------------------------------------------------------

  // Refresh cache command - clears both local and GitHub caches
  const refreshCommand = vscode.commands.registerCommand('traceai.refreshCache', async () => {
    hoverProvider.clearCache();
    await cache.clear();
    vscode.window.showInformationMessage('TraceAI: Cache cleared');
  });
  context.subscriptions.push(refreshCommand);

  // Show conversation command (placeholder for future implementation)
  const showConversationCommand = vscode.commands.registerCommand('traceai.showConversation', async () => {
    // TODO: Open a webview or panel showing the full conversation
    vscode.window.showInformationMessage('TraceAI: Show conversation - coming soon');
  });
  context.subscriptions.push(showConversationCommand);

  // Show cache stats command (useful for debugging)
  const showCacheStatsCommand = vscode.commands.registerCommand('traceai.showCacheStats', async () => {
    const stats = cache.getStats();
    vscode.window.showInformationMessage(
      `TraceAI Cache: ${stats.entries} entries cached`
    );
  });
  context.subscriptions.push(showCacheStatsCommand);

  // -------------------------------------------------------------------------
  // CONFIGURATION CHANGE LISTENER
  // -------------------------------------------------------------------------

  const configDisposable = vscode.workspace.onDidChangeConfiguration(e => {
    // Re-initialize GitHub client if token changes
    if (e.affectsConfiguration('traceai.githubToken')) {
      const newConfig = vscode.workspace.getConfiguration('traceai');
      const newToken = newConfig.get<string>('githubToken', '');
      githubClient.initialize(newToken);
      hoverProvider.clearCache();
      console.log('TraceAI: GitHub token updated');
    }

    // Clear cache if expiration setting changes
    if (e.affectsConfiguration('traceai.cacheExpiration')) {
      cache.clear();
      console.log('TraceAI: Cache expiration changed, cache cleared');
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
