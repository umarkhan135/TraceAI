import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export interface GitRepoInfo {
  owner: string;
  name: string;
  fullName: string;
  remoteUrl: string;
}

export async function getRepoInfo(workspacePath: string): Promise<GitRepoInfo | null> {
  const gitExtension = vscode.extensions.getExtension('vscode.git');
  if (gitExtension) {
    const git = gitExtension.exports.getAPI(1);

    if (git) {
      const repo = git.repositories.find((r: any) =>
        r.rootUri.fsPath === workspacePath
      );

      if (repo) {
        const remotes = repo.state.remotes;
        const origin = remotes.find((r: any) => r.name === 'origin');

        if (origin && origin.fetchUrl) {
          return parseGitRemoteUrl(origin.fetchUrl);
        }
      }
    }
  }

  return getRepoInfoFromGitConfig(workspacePath);
}

function parseGitRemoteUrl(remoteUrl: string): GitRepoInfo | null {
  try {
    let url = remoteUrl.replace(/\.git$/, '');

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

function getRepoInfoFromGitConfig(workspacePath: string): GitRepoInfo | null {
  const gitConfigPath = path.join(workspacePath, '.git', 'config');

  if (!fs.existsSync(gitConfigPath)) {
    console.log('TraceAI: No .git/config found');
    return null;
  }

  try {
    const configContent = fs.readFileSync(gitConfigPath, 'utf8');

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
