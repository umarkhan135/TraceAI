/**
 * VS Code Commands
 * User-facing commands for manual operations
 */

import * as vscode from 'vscode';
import { ProcessingOrchestrator } from '../services/processingOrchestrator';
import { HookInstaller } from '../services/hookInstaller';
import { StorageService } from '../services/storageService';
import { AuthService } from '../services/authService';
import { ConfigMigration } from '../services/configMigration';
import { githubService } from '../services/githubService';

export class TraceAICommands {
  /**
   * Register all commands
   */
  static register(context: vscode.ExtensionContext): void {
    // Process commands
    context.subscriptions.push(
      vscode.commands.registerCommand('traceai.processLatest', this.processLatest.bind(this))
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('traceai.processUnpushed', this.processUnpushed.bind(this))
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('traceai.syncOffline', this.syncOffline.bind(this))
    );

    // Hook commands
    context.subscriptions.push(
      vscode.commands.registerCommand('traceai.installHook', this.installHook.bind(this))
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('traceai.uninstallHook', this.uninstallHook.bind(this))
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('traceai.checkHookStatus', this.checkHookStatus.bind(this))
    );

    // Config commands
    context.subscriptions.push(
      vscode.commands.registerCommand('traceai.migrateConfig', this.migrateConfig.bind(this))
    );

    // Storage commands
    context.subscriptions.push(
      vscode.commands.registerCommand('traceai.showStorageStats', this.showStorageStats.bind(this))
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('traceai.cleanupStorage', this.cleanupStorage.bind(this))
    );

    // Auth commands
    context.subscriptions.push(
      vscode.commands.registerCommand('traceai.signIn', this.signIn.bind(this))
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('traceai.signOut', this.signOut.bind(this))
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('traceai.checkAuth', this.checkAuth.bind(this))
    );

    // Info commands (already existing, keep for compatibility)
    context.subscriptions.push(
      vscode.commands.registerCommand('traceai.refreshCache', this.refreshCache.bind(this))
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('traceai.showConversation', this.showConversation.bind(this))
    );
  }

  /**
   * Process latest conversation
   */
  private static async processLatest(): Promise<void> {
    const workspaceFolder = await this.getWorkspaceFolder();
    if (!workspaceFolder) return;

    const repoPath = workspaceFolder.uri.fsPath;

    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'TraceAI: Processing latest conversation...',
      cancellable: false
    }, async (progress) => {
      try {
        const result = await ProcessingOrchestrator.processLatestConversation(repoPath);

        if (result.success) {
          if (result.gist_url) {
            const choice = await vscode.window.showInformationMessage(
              `TraceAI: Processed ${result.sessions_processed} session(s), ${result.files_modified} file(s) modified`,
              'Open Gist',
              'Copy URL'
            );

            if (choice === 'Open Gist') {
              vscode.env.openExternal(vscode.Uri.parse(result.gist_url));
            } else if (choice === 'Copy URL') {
              vscode.env.clipboard.writeText(result.gist_url);
            }
          } else {
            vscode.window.showInformationMessage(
              `TraceAI: Processed and saved locally. ${result.warnings?.join(', ') || ''}`
            );
          }
        } else {
          vscode.window.showErrorMessage(
            `TraceAI: Processing failed: ${result.error}`
          );
        }
      } catch (error: any) {
        vscode.window.showErrorMessage(
          `TraceAI: Error: ${error.message}`
        );
      }
    });
  }

  /**
   * Process unpushed commits
   */
  private static async processUnpushed(): Promise<void> {
    const workspaceFolder = await this.getWorkspaceFolder();
    if (!workspaceFolder) return;

    const repoPath = workspaceFolder.uri.fsPath;

    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'TraceAI: Processing unpushed commits...',
      cancellable: false
    }, async (progress) => {
      try {
        const result = await ProcessingOrchestrator.processUnpushedCommits(repoPath);

        if (result.success) {
          if (result.gist_url) {
            const choice = await vscode.window.showInformationMessage(
              `TraceAI: Processed ${result.sessions_processed} session(s), ${result.files_modified} file(s)`,
              'Open Gist',
              'Copy URL'
            );

            if (choice === 'Open Gist') {
              vscode.env.openExternal(vscode.Uri.parse(result.gist_url));
            } else if (choice === 'Copy URL') {
              vscode.env.clipboard.writeText(result.gist_url);
            }
          } else {
            vscode.window.showInformationMessage(
              `TraceAI: ${result.warnings?.join(', ') || 'No conversations found'}`
            );
          }
        } else {
          vscode.window.showErrorMessage(
            `TraceAI: Processing failed: ${result.error}`
          );
        }
      } catch (error: any) {
        vscode.window.showErrorMessage(
          `TraceAI: Error: ${error.message}`
        );
      }
    });
  }

  /**
   * Sync offline artifacts
   */
  private static async syncOffline(): Promise<void> {
    const workspaceFolder = await this.getWorkspaceFolder();
    if (!workspaceFolder) return;

    const repoPath = workspaceFolder.uri.fsPath;

    // Check auth first
    const isAuth = await AuthService.isAuthenticated();
    if (!isAuth) {
      const signIn = await vscode.window.showInformationMessage(
        'You must sign in to sync offline artifacts',
        'Sign In',
        'Cancel'
      );

      if (signIn === 'Sign In') {
        await this.signIn();
        return;
      }
      return;
    }

    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'TraceAI: Syncing offline artifacts...',
      cancellable: false
    }, async (progress) => {
      try {
        const { synced, failed } = await ProcessingOrchestrator.syncQueuedArtifacts(repoPath);

        if (synced > 0) {
          vscode.window.showInformationMessage(
            `TraceAI: Synced ${synced} artifact(s)${failed > 0 ? `, ${failed} failed` : ''}`
          );
        } else if (failed > 0) {
          vscode.window.showWarningMessage(
            `TraceAI: Failed to sync ${failed} artifact(s)`
          );
        } else {
          vscode.window.showInformationMessage(
            'TraceAI: No offline artifacts to sync'
          );
        }
      } catch (error: any) {
        vscode.window.showErrorMessage(
          `TraceAI: Sync error: ${error.message}`
        );
      }
    });
  }

  /**
   * Install git hook
   */
  private static async installHook(): Promise<void> {
    const workspaceFolder = await this.getWorkspaceFolder();
    if (!workspaceFolder) return;

    const repoPath = workspaceFolder.uri.fsPath;

    const result = await HookInstaller.installHook(repoPath, 'pre-push');

    if (result.success) {
      if (result.already_installed) {
        vscode.window.showInformationMessage(
          'TraceAI: Git hook is already installed'
        );
      } else {
        vscode.window.showInformationMessage(
          'TraceAI: Git hook installed successfully! Conversations will be uploaded automatically on push.'
        );
      }
    } else {
      vscode.window.showErrorMessage(
        `TraceAI: Hook installation failed: ${result.error}`
      );
    }
  }

  /**
   * Uninstall git hook
   */
  private static async uninstallHook(): Promise<void> {
    const workspaceFolder = await this.getWorkspaceFolder();
    if (!workspaceFolder) return;

    const repoPath = workspaceFolder.uri.fsPath;

    const confirm = await vscode.window.showWarningMessage(
      'Uninstall TraceAI git hook? You will need to manually upload conversations.',
      'Uninstall',
      'Cancel'
    );

    if (confirm !== 'Uninstall') return;

    const success = await HookInstaller.uninstallHook(repoPath, 'pre-push');

    if (success) {
      vscode.window.showInformationMessage(
        'TraceAI: Git hook uninstalled'
      );
    } else {
      vscode.window.showErrorMessage(
        'TraceAI: Failed to uninstall hook'
      );
    }
  }

  /**
   * Check hook status
   */
  private static async checkHookStatus(): Promise<void> {
    const workspaceFolder = await this.getWorkspaceFolder();
    if (!workspaceFolder) return;

    const repoPath = workspaceFolder.uri.fsPath;

    const status = HookInstaller.getHookStatus(repoPath);

    const message = [
      'TraceAI Hook Status:',
      `Pre-push: ${status.pre_push_installed ? '✓ Installed' : '✗ Not installed'}`,
      `Post-commit: ${status.post_commit_installed ? '✓ Installed' : '✗ Not installed'}`
    ].join('\n');

    vscode.window.showInformationMessage(message);
  }

  /**
   * Migrate config
   */
  private static async migrateConfig(): Promise<void> {
    const workspaceFolder = await this.getWorkspaceFolder();
    if (!workspaceFolder) return;

    const repoPath = workspaceFolder.uri.fsPath;

    const success = ConfigMigration.autoMigrateRepo(repoPath);

    if (success) {
      vscode.window.showInformationMessage(
        'TraceAI: Config migrated to v2.0.0 successfully'
      );
    } else {
      vscode.window.showErrorMessage(
        'TraceAI: Config migration failed'
      );
    }
  }

  /**
   * Show storage statistics
   */
  private static async showStorageStats(): Promise<void> {
    const workspaceFolder = await this.getWorkspaceFolder();
    if (!workspaceFolder) return;

    const repoPath = workspaceFolder.uri.fsPath;

    const stats = StorageService.getStorageStats(repoPath);

    const sizeMB = (stats.total_size_bytes / 1024 / 1024).toFixed(2);

    const message = [
      'TraceAI Storage Statistics:',
      `Total artifacts: ${stats.total_artifacts}`,
      `Synced: ${stats.synced}`,
      `Unsynced: ${stats.unsynced}`,
      `Total size: ${sizeMB} MB`
    ].join('\n');

    vscode.window.showInformationMessage(message);
  }

  /**
   * Cleanup old artifacts
   */
  private static async cleanupStorage(): Promise<void> {
    const workspaceFolder = await this.getWorkspaceFolder();
    if (!workspaceFolder) return;

    const repoPath = workspaceFolder.uri.fsPath;

    const confirm = await vscode.window.showWarningMessage(
      'Clean up old synced artifacts? (Keeps last 50)',
      'Clean Up',
      'Cancel'
    );

    if (confirm !== 'Clean Up') return;

    const deleted = StorageService.cleanupOldArtifacts(repoPath, 50);

    vscode.window.showInformationMessage(
      `TraceAI: Deleted ${deleted} old artifact(s)`
    );
  }

  /**
   * Sign in to GitHub
   */
  private static async signIn(): Promise<void> {
    const session = await AuthService.getGitHubSession();

    if (session) {
      vscode.window.showInformationMessage(
        `TraceAI: Signed in as ${session.account.label}`
      );
    } else {
      vscode.window.showErrorMessage(
        'TraceAI: Sign-in failed or was cancelled'
      );
    }
  }

  /**
   * Sign out
   */
  private static async signOut(): Promise<void> {
    await AuthService.signOut();
    vscode.window.showInformationMessage(
      'TraceAI: Signed out'
    );
  }

  /**
   * Check authentication status
   */
  private static async checkAuth(): Promise<void> {
    const isAuth = await AuthService.isAuthenticated();

    if (isAuth) {
      const user = await AuthService.getUser();
      vscode.window.showInformationMessage(
        `TraceAI: Authenticated as ${user?.label || 'unknown'}`
      );
    } else {
      const signIn = await vscode.window.showInformationMessage(
        'TraceAI: Not authenticated',
        'Sign In'
      );

      if (signIn === 'Sign In') {
        await this.signIn();
      }
    }
  }

  /**
   * Refresh cache (legacy command)
   */
  private static async refreshCache(): Promise<void> {
    vscode.window.showInformationMessage(
      'TraceAI: Cache refreshed'
    );
  }

  /**
   * Show conversation (placeholder)
   */
  private static async showConversation(): Promise<void> {
    vscode.window.showInformationMessage(
      'TraceAI: Conversation viewer coming soon'
    );
  }

  /**
   * Get workspace folder
   */
  private static async getWorkspaceFolder(): Promise<vscode.WorkspaceFolder | undefined> {
    const folders = vscode.workspace.workspaceFolders;

    if (!folders || folders.length === 0) {
      vscode.window.showErrorMessage(
        'TraceAI: No workspace folder open'
      );
      return undefined;
    }

    if (folders.length === 1) {
      return folders[0];
    }

    // Multiple folders, let user pick
    const choice = await vscode.window.showWorkspaceFolderPick({
      placeHolder: 'Select workspace folder'
    });

    return choice;
  }
}
