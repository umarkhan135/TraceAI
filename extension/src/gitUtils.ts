/**
 * ============================================================================
 * GIT UTILITIES
 * ============================================================================
 *
 * Helper functions for extracting Git repository information
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export interface GitRepoInfo {
  owner: string;
  name: string;
  fullName: string; // "owner/name"
  remoteUrl: string;
}

/**
 * Get Git repository information from workspace
 */
export async function getRepoInfo(workspacePath: string): Promise<GitRepoInfo | null> {
  // First, try to use VSCode's built-in Git extension
  const gitExtension = vscode.extensions.getExtension('vscode.git');
  if (gitExtension) {
    const git = gitExtension.exports.getAPI(1);

    if (git) {
      // Find the repository for this workspace
      const repo = git.repositories.find((r: any) =>
        r.rootUri.fsPath === workspacePath
      );

      if (repo) {
        // Get the remote URL (usually 'origin')
        const remotes = repo.state.remotes;
        const origin = remotes.find((r: any) => r.name === 'origin');

        if (origin && origin.fetchUrl) {
          return parseGitRemoteUrl(origin.fetchUrl);
        }
      }
    }
  }

  // Fallback: manually read .git/config
  return getRepoInfoFromGitConfig(workspacePath);
}

/**
 * Parse a Git remote URL to extract owner/repo
 *
 * Handles various formats:
 * - https://github.com/owner/repo.git
 * - git@github.com:owner/repo.git
 * - https://github.com/owner/repo
 */
function parseGitRemoteUrl(remoteUrl: string): GitRepoInfo | null {
  try {
    // Remove .git suffix if present
    let url = remoteUrl.replace(/\.git$/, '');

    // Handle SSH format: git@github.com:owner/repo
    if (url.startsWith('git@')) {
      const match = url.match(/git@[^:]+:(.+)/);
      if (match) {
        const parts = match[1].split('/');
        if (parts.length >= 2) {
          const owner = parts[parts.length - 2];
          const name = parts[parts.length - 1];
          return {
            owner,
            name,
            fullName: `${owner}/${name}`,
            remoteUrl,
          };
        }
      }
    }

    // Handle HTTPS format: https://github.com/owner/repo
    if (url.startsWith('http://') || url.startsWith('https://')) {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(p => p.length > 0);

      if (pathParts.length >= 2) {
        const owner = pathParts[pathParts.length - 2];
        const name = pathParts[pathParts.length - 1];
        return {
          owner,
          name,
          fullName: `${owner}/${name}`,
          remoteUrl,
        };
      }
    }

    console.warn(`TraceAI: Unable to parse Git remote URL: ${remoteUrl}`);
    return null;
  } catch (error) {
    console.error('TraceAI: Error parsing Git remote URL:', error);
    return null;
  }
}

/**
 * Read Git config file directly as a fallback
 */
function getRepoInfoFromGitConfig(workspacePath: string): GitRepoInfo | null {
  const gitConfigPath = path.join(workspacePath, '.git', 'config');

  if (!fs.existsSync(gitConfigPath)) {
    console.log('TraceAI: No .git/config found');
    return null;
  }

  try {
    const configContent = fs.readFileSync(gitConfigPath, 'utf8');

    // Look for [remote "origin"] section and extract URL
    const remoteMatch = configContent.match(/\[remote "origin"\][^[]*url\s*=\s*(.+)/m);

    if (remoteMatch && remoteMatch[1]) {
      const remoteUrl = remoteMatch[1].trim();
      return parseGitRemoteUrl(remoteUrl);
    }

    console.log('TraceAI: No origin remote found in .git/config');
    return null;
  } catch (error) {
    console.error('TraceAI: Error reading .git/config:', error);
    return null;
  }
}
