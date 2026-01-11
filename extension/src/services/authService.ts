/**
 * Authentication Service
 * Uses VS Code's built-in GitHub authentication API
 */

import * as vscode from 'vscode';

export class AuthService {
  private static session: vscode.AuthenticationSession | null = null;

  /**
   * Get GitHub authentication session
   * This uses VS Code's built-in GitHub authentication
   */
  static async getGitHubSession(): Promise<vscode.AuthenticationSession | null> {
    try {
      // Try to get existing session silently first
      const existingSession = await vscode.authentication.getSession(
        'github',
        ['gist', 'repo'],
        { silent: true }
      );

      if (existingSession) {
        this.session = existingSession;
        return existingSession;
      }

      // If no existing session, prompt user to sign in
      const session = await vscode.authentication.getSession(
        'github',
        ['gist', 'repo'],
        { createIfNone: true }
      );

      this.session = session;
      return session;
    } catch (error) {
      console.error('TraceAI: Failed to get GitHub session:', error);
      return null;
    }
  }

  /**
   * Get GitHub access token
   */
  static async getAccessToken(): Promise<string | null> {
    const session = await this.getGitHubSession();
    return session?.accessToken || null;
  }

  /**
   * Get authenticated user information
   */
  static async getUser(): Promise<{ id: string; label: string } | null> {
    const session = await this.getGitHubSession();
    if (!session) return null;

    return {
      id: session.account.id,
      label: session.account.label
    };
  }

  /**
   * Sign out (clear session)
   */
  static async signOut(): Promise<void> {
    this.session = null;
    // Note: VS Code manages the actual sign-out
  }

  /**
   * Check if user is authenticated
   */
  static async isAuthenticated(): Promise<boolean> {
    try {
      const session = await vscode.authentication.getSession(
        'github',
        ['gist', 'repo'],
        { silent: true }
      );
      return session !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * Prompt user to authenticate if not already authenticated
   */
  static async ensureAuthenticated(): Promise<boolean> {
    const isAuth = await this.isAuthenticated();
    if (isAuth) return true;

    const choice = await vscode.window.showInformationMessage(
      'TraceAI needs GitHub authentication to create gists. Sign in with GitHub?',
      'Sign In',
      'Cancel'
    );

    if (choice !== 'Sign In') {
      return false;
    }

    const session = await this.getGitHubSession();
    return session !== null;
  }

  /**
   * Register authentication change listener
   */
  static registerAuthenticationListener(
    callback: (session: vscode.AuthenticationSession | undefined) => void
  ): vscode.Disposable {
    return vscode.authentication.onDidChangeSessions(async (e) => {
      if (e.provider.id === 'github') {
        const session = await vscode.authentication.getSession(
          'github',
          ['gist', 'repo'],
          { silent: true }
        );
        callback(session || undefined);
      }
    });
  }
}
