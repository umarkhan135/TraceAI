/**
 * Hook Installer Service
 * Handles automatic installation of git hooks
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { GitService } from './gitService';
import { HookInstallResult } from '../models';

export type HookType = 'pre-push' | 'post-commit';

export class HookInstaller {
  private static readonly HOOK_MARKER = '# TraceAI Hook';
  private static readonly EXTENSION_PATH = vscode.extensions.getExtension('traceai.traceai')?.extensionPath || '';

  /**
   * Check if hook should be auto-installed
   */
  static async shouldAutoInstall(repoPath: string): Promise<boolean> {
    // Check if in CI environment
    if (this.isCIEnvironment()) {
      return false;
    }

    // Check if already installed
    if (this.isHookInstalled(repoPath, 'pre-push')) {
      return false;
    }

    // Check if user previously declined
    const markerFile = path.join(repoPath, '.traceai', '.hook-prompted');
    if (fs.existsSync(markerFile)) {
      return false;
    }

    return true;
  }

  /**
   * Prompt user to install hook
   */
  static async promptInstallation(repoPath: string): Promise<boolean> {
    const choice = await vscode.window.showInformationMessage(
      'TraceAI can automatically upload AI conversation provenance to GitHub Gist when you push code. Install git hook?',
      'Install Hook',
      'Not Now',
      'Never for this Repo'
    );

    if (choice === 'Install Hook') {
      const result = await this.installHook(repoPath, 'pre-push');
      if (result.success) {
        vscode.window.showInformationMessage(
          'TraceAI: Git hook installed! Conversations will be automatically uploaded on push.'
        );
        return true;
      } else {
        vscode.window.showErrorMessage(
          `TraceAI: Failed to install hook: ${result.error}`
        );
        return false;
      }
    } else if (choice === 'Never for this Repo') {
      // Create marker file
      this.markHookPrompted(repoPath);
    }

    return false;
  }

  /**
   * Install a git hook
   */
  static async installHook(
    repoPath: string,
    hookType: HookType
  ): Promise<HookInstallResult> {
    try {
      const hooksDir = GitService.getHooksDir(repoPath);
      if (!hooksDir) {
        return {
          success: false,
          error: 'Not a git repository'
        };
      }

      const hookPath = path.join(hooksDir, hookType);

      // Check if hook already exists and is ours
      if (fs.existsSync(hookPath)) {
        if (GitService.isTraceAIHook(repoPath, hookType)) {
          return {
            success: true,
            hook_path: hookPath,
            already_installed: true
          };
        }

        // Hook exists but not ours - ask to overwrite
        const choice = await vscode.window.showWarningMessage(
          `A ${hookType} hook already exists. Overwrite it with TraceAI hook?`,
          'Overwrite',
          'Cancel'
        );

        if (choice !== 'Overwrite') {
          return {
            success: false,
            error: 'User cancelled overwrite'
          };
        }

        // Backup existing hook
        const backupPath = hookPath + '.backup';
        fs.copyFileSync(hookPath, backupPath);
        console.log(`TraceAI: Backed up existing hook to ${backupPath}`);
      }

      // Generate hook script
      const hookScript = this.generateHookScript(hookType, repoPath);

      // Write hook file
      fs.writeFileSync(hookPath, hookScript, { encoding: 'utf-8', mode: 0o755 });

      console.log(`TraceAI: Installed ${hookType} hook at ${hookPath}`);

      // Mark as prompted
      this.markHookPrompted(repoPath);

      return {
        success: true,
        hook_path: hookPath,
        already_installed: false
      };
    } catch (error: any) {
      console.error('TraceAI: Hook installation failed:', error);
      return {
        success: false,
        error: error.message || 'Unknown error'
      };
    }
  }

  /**
   * Uninstall a git hook
   */
  static async uninstallHook(
    repoPath: string,
    hookType: HookType
  ): Promise<boolean> {
    try {
      const hooksDir = GitService.getHooksDir(repoPath);
      if (!hooksDir) {
        return false;
      }

      const hookPath = path.join(hooksDir, hookType);

      if (!fs.existsSync(hookPath)) {
        return true; // Already uninstalled
      }

      // Check if it's our hook
      if (!GitService.isTraceAIHook(repoPath, hookType)) {
        vscode.window.showWarningMessage(
          `${hookType} hook exists but is not a TraceAI hook. Skipping uninstall.`
        );
        return false;
      }

      // Remove hook
      fs.unlinkSync(hookPath);

      // Remove marker file
      const markerFile = path.join(repoPath, '.traceai', '.hook-prompted');
      if (fs.existsSync(markerFile)) {
        fs.unlinkSync(markerFile);
      }

      console.log(`TraceAI: Uninstalled ${hookType} hook`);
      return true;
    } catch (error) {
      console.error('TraceAI: Hook uninstallation failed:', error);
      return false;
    }
  }

  /**
   * Check if a hook is installed
   */
  static isHookInstalled(repoPath: string, hookType: HookType): boolean {
    return GitService.isTraceAIHook(repoPath, hookType);
  }

  /**
   * Generate hook script
   */
  private static generateHookScript(hookType: HookType, repoPath: string): string {
    if (hookType === 'pre-push') {
      return this.generatePrePushHook(repoPath);
    } else if (hookType === 'post-commit') {
      return this.generatePostCommitHook(repoPath);
    }

    throw new Error(`Unknown hook type: ${hookType}`);
  }

  /**
   * Generate pre-push hook script
   */
  private static generatePrePushHook(repoPath: string): string {
    // Note: The hook will call Node.js to run the TypeScript code
    // We'll create a CLI script that the hook can execute

    return `#!/bin/bash
${this.HOOK_MARKER}
# This hook automatically uploads Claude Code conversations to GitHub Gist before push

# Only run if pushing to a feature branch (not main/master)
branch=$(git rev-parse --abbrev-ref HEAD)
if [[ "$branch" == "main" ]] || [[ "$branch" == "master" ]]; then
  exit 0
fi

# Check if Claude Code directory exists
if [ ! -d "$HOME/.claude/projects" ]; then
  exit 0
fi

# Check if extension's hook processor exists
HOOK_PROCESSOR="${this.getHookProcessorPath()}"

if [ ! -f "$HOOK_PROCESSOR" ]; then
  echo "⚠️  TraceAI: Hook processor not found, skipping"
  exit 0
fi

# Run the hook processor
echo "🤖 TraceAI: Processing conversations..."
node "$HOOK_PROCESSOR" "${repoPath.replace(/\\/g, '/')}" 2>&1

# Continue with push regardless of processor result
exit 0
`;
  }

  /**
   * Generate post-commit hook script
   */
  private static generatePostCommitHook(repoPath: string): string {
    return `#!/bin/bash
${this.HOOK_MARKER}
# This hook processes Claude Code conversations after each commit

# Check if Claude Code directory exists
if [ ! -d "$HOME/.claude/projects" ]; then
  exit 0
fi

# Check if extension's hook processor exists
HOOK_PROCESSOR="${this.getHookProcessorPath()}"

if [ ! -f "$HOOK_PROCESSOR" ]; then
  exit 0
fi

echo "🤖 TraceAI: Processing conversation..."
node "$HOOK_PROCESSOR" "${repoPath.replace(/\\/g, '/')}" --post-commit 2>&1

exit 0
`;
  }

  /**
   * Get path to hook processor script
   */
  private static getHookProcessorPath(): string {
    // This will be a Node.js script in the extension
    return path.join(this.EXTENSION_PATH, 'out', 'hookProcessor.js').replace(/\\/g, '/');
  }

  /**
   * Mark that user was prompted about hooks
   */
  private static markHookPrompted(repoPath: string): void {
    const traceaiDir = path.join(repoPath, '.traceai');
    if (!fs.existsSync(traceaiDir)) {
      fs.mkdirSync(traceaiDir, { recursive: true });
    }

    const markerFile = path.join(traceaiDir, '.hook-prompted');
    fs.writeFileSync(markerFile, `Prompted on ${new Date().toISOString()}\n`, 'utf-8');
  }

  /**
   * Check if running in CI environment
   */
  private static isCIEnvironment(): boolean {
    const ciVars = [
      'CI',
      'CONTINUOUS_INTEGRATION',
      'GITHUB_ACTIONS',
      'GITLAB_CI',
      'CIRCLECI',
      'TRAVIS',
      'JENKINS_HOME',
      'BUILDKITE'
    ];

    return ciVars.some(varName => process.env[varName]);
  }

  /**
   * Install hooks for all workspace folders
   */
  static async installForWorkspace(): Promise<{
    installed: number;
    failed: number;
    skipped: number;
  }> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return { installed: 0, failed: 0, skipped: 0 };
    }

    let installed = 0;
    let failed = 0;
    let skipped = 0;

    for (const folder of workspaceFolders) {
      const repoPath = folder.uri.fsPath;

      // Check if it's a git repo
      if (!GitService.isGitRepository(repoPath)) {
        skipped++;
        continue;
      }

      // Check if should auto-install
      if (!await this.shouldAutoInstall(repoPath)) {
        skipped++;
        continue;
      }

      // Prompt user
      const success = await this.promptInstallation(repoPath);
      if (success) {
        installed++;
      } else {
        failed++;
      }
    }

    return { installed, failed, skipped };
  }

  /**
   * Get hook installation status for a repo
   */
  static getHookStatus(repoPath: string): {
    pre_push_installed: boolean;
    post_commit_installed: boolean;
    prompted: boolean;
  } {
    const markerFile = path.join(repoPath, '.traceai', '.hook-prompted');

    return {
      pre_push_installed: this.isHookInstalled(repoPath, 'pre-push'),
      post_commit_installed: this.isHookInstalled(repoPath, 'post-commit'),
      prompted: fs.existsSync(markerFile)
    };
  }
}
