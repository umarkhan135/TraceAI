#!/usr/bin/env node
/**
 * Hook Processor
 * Standalone script executed by git hooks
 * Can be called from shell hooks without requiring VS Code to be running
 */

import { ProcessingOrchestrator } from './services/processingOrchestrator';
import { AuthService } from './services/authService';
import { GitService } from './services/gitService';
import { StorageService } from './services/storageService';

interface ProcessorOptions {
  repoPath: string;
  hookType: 'pre-push' | 'post-commit';
  public?: boolean;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: hookProcessor <repo-path> [--post-commit] [--public]');
    process.exit(1);
  }

  const options: ProcessorOptions = {
    repoPath: args[0],
    hookType: args.includes('--post-commit') ? 'post-commit' : 'pre-push',
    public: args.includes('--public')
  };

  try {
    await processHook(options);
    process.exit(0);
  } catch (error: any) {
    console.error('TraceAI Error:', error.message);
    // Don't fail the git operation
    process.exit(0);
  }
}

async function processHook(options: ProcessorOptions): Promise<void> {
  const { repoPath, hookType, public: isPublic } = options;

  console.log(`TraceAI: Running ${hookType} hook for ${repoPath}`);

  // Check if git repo
  if (!GitService.isGitRepository(repoPath)) {
    console.log('TraceAI: Not a git repository, skipping');
    return;
  }

  // Get repo info
  const repoInfo = await GitService.getRepoInfo(repoPath);
  if (!repoInfo) {
    console.log('TraceAI: Could not get repo info, skipping');
    return;
  }

  // Skip if on main/master branch
  if (repoInfo.branch === 'main' || repoInfo.branch === 'master') {
    console.log('TraceAI: On main/master branch, skipping');
    return;
  }

  // Check if config.json already staged (prevents double-processing)
  const configStaged = await GitService.isFileTracked(repoPath, '.traceai/config.json');
  if (configStaged) {
    const hasChanges = await GitService.hasUncommittedChanges(repoPath);
    if (!hasChanges) {
      console.log('TraceAI: Config already staged, skipping (retry push)');
      return;
    }
  }

  try {
    // Process based on hook type
    let result;

    if (hookType === 'pre-push') {
      // Process unpushed commits
      result = await ProcessingOrchestrator.processUnpushedCommits(repoPath, {
        public: isPublic,
        timeWindowHours: 24
      });
    } else {
      // Process latest conversation
      result = await ProcessingOrchestrator.processLatestConversation(repoPath, {
        public: isPublic
      });
    }

    if (!result.success) {
      if (result.error) {
        console.error(`TraceAI: Processing failed: ${result.error}`);
      }
      return;
    }

    // Show results
    if (result.sessions_processed === 0) {
      console.log('TraceAI: No conversations found');
      return;
    }

    console.log(`TraceAI: Processed ${result.sessions_processed} conversation(s)`);
    console.log(`TraceAI: Modified ${result.files_modified} file(s)`);

    if (result.gist_url) {
      console.log(`TraceAI: ✓ Uploaded to ${result.gist_url}`);

      // If config was updated, add it to the commit
      const configPath = '.traceai/config.json';
      const configExists = await GitService.isFileTracked(repoPath, configPath);

      if (configExists || StorageService.loadConfig(repoPath)) {
        // Stage the config file
        await GitService.stageFile(repoPath, configPath);

        // Amend the last commit (if in post-commit)
        // Or just stage for the push (if in pre-push)
        if (hookType === 'post-commit') {
          await GitService.amendCommit(repoPath);
          console.log('TraceAI: ✓ Updated commit with config');
        } else {
          console.log('TraceAI: ✓ Staged config for push');
        }
      }
    } else if (result.warnings && result.warnings.length > 0) {
      console.log('TraceAI: ⚠ ' + result.warnings.join(', '));
      console.log('TraceAI: Artifact saved locally, will sync when online');
    }
  } catch (error: any) {
    console.error('TraceAI: Unexpected error:', error.message);
    // Don't fail the git operation
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { processHook };
