/**
 * Git Service
 * Handles git repository operations
 */

import * as fs from 'fs';
import * as path from 'path';
import * as child_process from 'child_process';
import { GitRepoInfo, GitCommit } from '../models';

export class GitService {
  /**
   * Check if a directory is a git repository
   */
  static isGitRepository(repoPath: string): boolean {
    const gitDir = path.join(repoPath, '.git');
    return fs.existsSync(gitDir);
  }

  /**
   * Get git repository information
   */
  static async getRepoInfo(repoPath: string): Promise<GitRepoInfo | null> {
    if (!this.isGitRepository(repoPath)) {
      return null;
    }

    try {
      const branch = await this.getCurrentBranch(repoPath);
      const remote = await this.getRemoteUrl(repoPath);
      const fullName = this.extractRepoFullName(remote);

      return {
        path: repoPath,
        branch: branch || 'unknown',
        remote,
        fullName
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Get current branch name
   */
  static async getCurrentBranch(repoPath: string): Promise<string | null> {
    return new Promise((resolve) => {
      child_process.exec(
        'git rev-parse --abbrev-ref HEAD',
        { cwd: repoPath },
        (error, stdout, stderr) => {
          if (error) {
            resolve(null);
            return;
          }
          resolve(stdout.trim());
        }
      );
    });
  }

  /**
   * Get remote URL
   */
  static async getRemoteUrl(repoPath: string): Promise<string | undefined> {
    return new Promise((resolve) => {
      child_process.exec(
        'git remote get-url origin',
        { cwd: repoPath },
        (error, stdout, stderr) => {
          if (error) {
            resolve(undefined);
            return;
          }
          resolve(stdout.trim());
        }
      );
    });
  }

  /**
   * Extract owner/repo from remote URL
   */
  private static extractRepoFullName(remoteUrl?: string): string | undefined {
    if (!remoteUrl) return undefined;

    // Handle both HTTPS and SSH URLs
    // HTTPS: https://github.com/owner/repo.git
    // SSH: git@github.com:owner/repo.git
    const httpsMatch = remoteUrl.match(/github\.com[\/:]([^\/]+\/[^\/]+?)(\.git)?$/);
    if (httpsMatch) {
      return httpsMatch[1];
    }

    return undefined;
  }

  /**
   * Get unpushed commits
   */
  static async getUnpushedCommits(repoPath: string): Promise<GitCommit[]> {
    return new Promise((resolve, reject) => {
      // First check if there's an upstream branch
      child_process.exec(
        'git rev-parse --abbrev-ref @{upstream}',
        { cwd: repoPath },
        (error, stdout, stderr) => {
          if (error) {
            // No upstream branch, return empty array
            resolve([]);
            return;
          }

          const upstream = stdout.trim();

          // Get commits that are on HEAD but not on upstream
          const format = '%H%n%an%n%aI%n%s%n---FILES---%n---END---';
          const command = `git log ${upstream}..HEAD --format="${format}" --name-only`;

          child_process.exec(
            command,
            { cwd: repoPath },
            (error, stdout, stderr) => {
              if (error) {
                resolve([]);
                return;
              }

              const commits = this.parseGitLogOutput(stdout);
              resolve(commits);
            }
          );
        }
      );
    });
  }

  /**
   * Parse git log output
   */
  private static parseGitLogOutput(output: string): GitCommit[] {
    const commits: GitCommit[] = [];
    const entries = output.split('---END---').filter(e => e.trim());

    for (const entry of entries) {
      const parts = entry.split('---FILES---');
      if (parts.length !== 2) continue;

      const [headerPart, filesPart] = parts;
      const lines = headerPart.trim().split('\n');

      if (lines.length >= 4) {
        const files = filesPart
          .trim()
          .split('\n')
          .filter(f => f.trim())
          .map(f => f.trim());

        commits.push({
          sha: lines[0],
          author: lines[1],
          timestamp: lines[2],
          message: lines[3],
          files: files
        });
      }
    }

    return commits;
  }

  /**
   * Get all changed files from commits
   */
  static getAllChangedFiles(commits: GitCommit[]): string[] {
    const allFiles = new Set<string>();

    for (const commit of commits) {
      for (const file of commit.files) {
        allFiles.add(file);
      }
    }

    return Array.from(allFiles);
  }

  /**
   * Get git root directory
   */
  static async getGitRoot(startPath: string): Promise<string | null> {
    return new Promise((resolve) => {
      child_process.exec(
        'git rev-parse --show-toplevel',
        { cwd: startPath },
        (error, stdout, stderr) => {
          if (error) {
            resolve(null);
            return;
          }
          resolve(stdout.trim());
        }
      );
    });
  }

  /**
   * Check if file is tracked by git
   */
  static async isFileTracked(repoPath: string, filePath: string): Promise<boolean> {
    return new Promise((resolve) => {
      child_process.exec(
        `git ls-files --error-unmatch "${filePath}"`,
        { cwd: repoPath },
        (error, stdout, stderr) => {
          resolve(!error);
        }
      );
    });
  }

  /**
   * Stage a file
   */
  static async stageFile(repoPath: string, filePath: string): Promise<boolean> {
    return new Promise((resolve) => {
      child_process.exec(
        `git add "${filePath}"`,
        { cwd: repoPath },
        (error, stdout, stderr) => {
          resolve(!error);
        }
      );
    });
  }

  /**
   * Commit with message
   */
  static async commit(repoPath: string, message: string): Promise<boolean> {
    return new Promise((resolve) => {
      const escapedMessage = message.replace(/"/g, '\\"');
      child_process.exec(
        `git commit -m "${escapedMessage}"`,
        { cwd: repoPath },
        (error, stdout, stderr) => {
          resolve(!error);
        }
      );
    });
  }

  /**
   * Amend the last commit (no verify)
   */
  static async amendCommit(repoPath: string): Promise<boolean> {
    return new Promise((resolve) => {
      child_process.exec(
        'git commit --amend --no-edit --no-verify',
        { cwd: repoPath },
        (error, stdout, stderr) => {
          resolve(!error);
        }
      );
    });
  }

  /**
   * Get the .git directory path
   */
  static getGitDir(repoPath: string): string | null {
    const gitDir = path.join(repoPath, '.git');
    return fs.existsSync(gitDir) ? gitDir : null;
  }

  /**
   * Get hooks directory
   */
  static getHooksDir(repoPath: string): string | null {
    const gitDir = this.getGitDir(repoPath);
    if (!gitDir) return null;

    const hooksDir = path.join(gitDir, 'hooks');
    if (!fs.existsSync(hooksDir)) {
      fs.mkdirSync(hooksDir, { recursive: true });
    }

    return hooksDir;
  }

  /**
   * Check if a specific hook exists
   */
  static hookExists(repoPath: string, hookName: string): boolean {
    const hooksDir = this.getHooksDir(repoPath);
    if (!hooksDir) return false;

    const hookPath = path.join(hooksDir, hookName);
    return fs.existsSync(hookPath);
  }

  /**
   * Check if an existing hook is a TraceAI hook
   */
  static isTraceAIHook(repoPath: string, hookName: string): boolean {
    const hooksDir = this.getHooksDir(repoPath);
    if (!hooksDir) return false;

    const hookPath = path.join(hooksDir, hookName);
    if (!fs.existsSync(hookPath)) return false;

    try {
      const content = fs.readFileSync(hookPath, 'utf-8');
      return content.includes('TraceAI');
    } catch (error) {
      return false;
    }
  }

  /**
   * Get current commit SHA
   */
  static async getCurrentCommitSHA(repoPath: string): Promise<string | null> {
    return new Promise((resolve) => {
      child_process.exec(
        'git rev-parse HEAD',
        { cwd: repoPath },
        (error, stdout, stderr) => {
          if (error) {
            resolve(null);
            return;
          }
          resolve(stdout.trim());
        }
      );
    });
  }

  /**
   * Check if there are uncommitted changes
   */
  static async hasUncommittedChanges(repoPath: string): Promise<boolean> {
    return new Promise((resolve) => {
      child_process.exec(
        'git status --porcelain',
        { cwd: repoPath },
        (error, stdout, stderr) => {
          if (error) {
            resolve(false);
            return;
          }
          resolve(stdout.trim().length > 0);
        }
      );
    });
  }

  /**
   * Execute git command
   */
  static async executeGitCommand(
    repoPath: string,
    command: string
  ): Promise<{ success: boolean; output: string; error?: string }> {
    return new Promise((resolve) => {
      child_process.exec(
        command,
        { cwd: repoPath },
        (error, stdout, stderr) => {
          if (error) {
            resolve({
              success: false,
              output: stdout,
              error: stderr || error.message
            });
            return;
          }
          resolve({
            success: true,
            output: stdout
          });
        }
      );
    });
  }
}
