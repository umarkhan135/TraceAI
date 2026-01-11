"""
Command-line interface for TraceAI.
"""
import sys
import json
import os
from pathlib import Path
from typing import Optional
from datetime import datetime
import click
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.markdown import Markdown
from rich import print as rprint

from . import parser, mapper, github_client, markdown_gen, summarizer
from .models import (
    ConversationArtifact,
    ArtifactMetadata,
    ConversationMessage,
    CodeMapping,
    ConversationStats,
    ToolCall,
)

console = Console()


# ============================================================================
# Automatic Hook Setup Helpers
# ============================================================================

def is_ci_environment() -> bool:
    """Detect if running in a CI/CD environment."""
    ci_vars = ['CI', 'CONTINUOUS_INTEGRATION', 'GITHUB_ACTIONS', 'GITLAB_CI',
               'CIRCLECI', 'TRAVIS', 'JENKINS_HOME', 'BUILDKITE']
    return any(os.getenv(var) for var in ci_vars)


def is_git_repo(path: Path = Path('.')) -> bool:
    """Check if the current directory is a git repository."""
    try:
        import git
        git.Repo(path, search_parent_directories=True)
        return True
    except:
        return False


def get_git_repo_root(path: Path = Path('.')) -> Optional[Path]:
    """Get the root directory of the git repository."""
    try:
        import git
        repo = git.Repo(path, search_parent_directories=True)
        return Path(repo.working_dir)
    except:
        return None


def is_hook_installed(repo_root: Path) -> bool:
    """Check if the TraceAI pre-push hook is installed."""
    hook_path = repo_root / '.git' / 'hooks' / 'pre-push'
    if not hook_path.exists():
        return False

    # Check if it's our hook by looking for TraceAI signature
    try:
        content = hook_path.read_text()
        return 'TraceAI pre-push hook' in content
    except:
        return False


def should_prompt_for_hook_install(repo_root: Path) -> bool:
    """Determine if we should prompt the user to install hooks."""
    # Don't prompt in CI environments
    if is_ci_environment():
        return False

    # Don't prompt if hook is already installed
    if is_hook_installed(repo_root):
        return False

    # Check if we've already prompted (and user declined)
    config_dir = repo_root / '.traceai'
    marker_file = config_dir / '.hook-prompted'

    if marker_file.exists():
        return False

    return True


def mark_hook_prompted(repo_root: Path):
    """Mark that we've prompted the user about hook installation."""
    config_dir = repo_root / '.traceai'
    config_dir.mkdir(exist_ok=True)
    marker_file = config_dir / '.hook-prompted'
    marker_file.write_text(f"Prompted on {datetime.now().isoformat()}\n")


def auto_setup_hook_check():
    """
    Automatically check if hooks should be installed and prompt user.
    This is called before the first command runs.
    """
    # Skip if not in a git repo
    if not is_git_repo():
        return

    repo_root = get_git_repo_root()
    if not repo_root:
        return

    # Check if we should prompt
    if not should_prompt_for_hook_install(repo_root):
        return

    # Show friendly prompt
    console.print()
    console.print("[bold cyan]💡 TraceAI Git Hook Setup[/bold cyan]")
    console.print()
    console.print("TraceAI can automatically upload conversations to GitHub Gist")
    console.print("when you push code by installing a git pre-push hook.")
    console.print()
    console.print("[dim]This enables the VSCode extension to show code provenance.[/dim]")
    console.print()

    # Prompt user
    if click.confirm("Would you like to install the git hook now?", default=True):
        try:
            # Install the hook
            import shutil
            import git

            repo = git.Repo(repo_root)
            git_dir = Path(repo.git_dir)
            hooks_dir = git_dir / 'hooks'
            hooks_dir.mkdir(exist_ok=True)

            hook_path = hooks_dir / 'pre-push'

            # Check if hook already exists (non-TraceAI hook)
            if hook_path.exists():
                console.print("[yellow]Warning: pre-push hook already exists[/yellow]")
                if not click.confirm("Overwrite?", default=False):
                    mark_hook_prompted(repo_root)
                    console.print("[yellow]Hook installation cancelled.[/yellow]")
                    console.print("[dim]You can install it later with: traceai install-hook[/dim]")
                    console.print()
                    return

            # Create hook script
            hook_script = generate_hook_script('pre-push')

            with open(hook_path, 'w') as f:
                f.write(hook_script)

            # Make executable
            hook_path.chmod(0o755)

            console.print("[green]✓ Git hook installed successfully![/green]")
            console.print()
            console.print("[bold]Next steps:[/bold]")
            console.print("1. Set GITHUB_TOKEN in your environment or .env file")
            console.print("2. Push your code - the hook will run automatically")
            console.print()

            # Mark as prompted
            mark_hook_prompted(repo_root)

        except Exception as e:
            console.print(f"[red]Error installing hook: {e}[/red]")
            console.print("[dim]You can install it manually with: traceai install-hook[/dim]")
            mark_hook_prompted(repo_root)
    else:
        console.print()
        console.print("[dim]No problem! You can install it later with: traceai install-hook[/dim]")
        console.print()
        mark_hook_prompted(repo_root)


@click.group(invoke_without_command=True)
@click.version_option(version="0.1.0")
@click.pass_context
def main(ctx):
    """TraceAI - LLM-native code provenance and PR review tool."""
    # If no subcommand is provided, show help
    if ctx.invoked_subcommand is None:
        click.echo(ctx.get_help())
        return

    # Auto-check for hook installation on first command
    # Only run this check for certain commands (not for install-hook itself)
    skip_commands = ['install-hook', 'uninstall-hook']
    if ctx.invoked_subcommand not in skip_commands:
        auto_setup_hook_check()


@main.command()
@click.option(
    '--repo',
    type=click.Path(exists=True, file_okay=False, dir_okay=True),
    default='.',
    help='Path to git repository (default: current directory)'
)
@click.option(
    '--session-id',
    help='Specific session ID to process (default: most recent)'
)
def list_conversations(repo: str, session_id: Optional[str]):
    """List all Claude Code conversations for a project."""
    repo_path = Path(repo).resolve()

    try:
        conversations = parser.list_conversation_files(str(repo_path))

        if not conversations:
            console.print(f"[yellow]No conversations found for {repo_path}[/yellow]")
            return

        table = Table(title=f"Claude Code Conversations for {repo_path.name}")
        table.add_column("Session ID", style="cyan")
        table.add_column("Modified", style="green")
        table.add_column("Size", style="magenta")

        for conv in conversations:
            session_id_short = conv['session_id'][:16] + '...'
            size_kb = conv['size_bytes'] / 1024
            table.add_row(session_id_short, conv['modified_time'], f"{size_kb:.1f} KB")

        console.print(table)

    except Exception as e:
        console.print(f"[red]Error: {e}[/red]")
        sys.exit(1)


@main.command()
@click.argument('output_file', type=click.Path())
@click.option(
    '--repo',
    type=click.Path(exists=True, file_okay=False, dir_okay=True),
    default='.',
    help='Path to git repository'
)
@click.option(
    '--session-id',
    help='Specific session ID to process (default: most recent)'
)
@click.option(
    '--pr-number',
    type=int,
    help='PR number to associate with this conversation'
)
@click.option(
    '--branch',
    help='Branch name (default: auto-detect from git)'
)
@click.option(
    '--no-git-correlation',
    is_flag=True,
    help='Skip git blame correlation'
)
@click.option(
    '--no-summary',
    is_flag=True,
    help='Skip AI-powered summary generation (requires ANTHROPIC_API_KEY)'
)
def process(
    output_file: str,
    repo: str,
    session_id: Optional[str],
    pr_number: Optional[int],
    branch: Optional[str],
    no_git_correlation: bool,
    no_summary: bool
):
    """Process a Claude Code conversation and generate artifact."""
    repo_path = Path(repo).resolve()
    output_path = Path(output_file)

    console.print(f"[bold]Processing conversation for {repo_path.name}...[/bold]")

    try:
        # Find conversation file
        conv_file = parser.find_conversation_file(str(repo_path), session_id)
        console.print(f"[green]✓[/green] Found conversation: {conv_file.name}")

        # Get metadata
        metadata = parser.get_conversation_metadata(conv_file)
        console.print(f"[green]✓[/green] Parsed {metadata['total_messages']} messages")

        # Extract mappings
        with console.status("[bold green]Extracting code mappings..."):
            mappings = mapper.extract_code_mappings(conv_file, repo_path)

        console.print(f"[green]✓[/green] Extracted {len(mappings)} code mappings")

        # Git correlation (optional)
        if not no_git_correlation:
            with console.status("[bold green]Correlating with git history..."):
                mappings = mapper.correlate_with_git_blame(mappings, repo_path)
            console.print(f"[green]✓[/green] Correlated with git commits")

        # Get branch name
        if not branch:
            try:
                import git
                repo_obj = git.Repo(repo_path)
                branch = repo_obj.active_branch.name
            except:
                branch = 'unknown'

        # Build artifact
        with console.status("[bold green]Building conversation artifact..."):
            artifact = build_artifact(
                conv_file,
                repo_path,
                mappings,
                metadata,
                pr_number,
                branch
            )

        console.print(f"[green]✓[/green] Built artifact")

        # Generate AI summary (optional)
        if not no_summary:
            if summarizer.is_anthropic_available():
                with console.status("[bold green]Generating AI summary..."):
                    summary = summarizer.generate_ai_summary(artifact)
                    if summary:
                        artifact.summary = summary
                        console.print(f"[green]✓[/green] Generated AI summary")
                    else:
                        console.print(f"[yellow]⚠[/yellow] AI summary generation failed, using fallback")
                        artifact.summary = summarizer.generate_fallback_summary(artifact)
            else:
                console.print(f"[yellow]⚠[/yellow] Anthropic API not available, using fallback summary")
                console.print(f"[dim]  Set ANTHROPIC_API_KEY to enable AI-powered summaries[/dim]")
                artifact.summary = summarizer.generate_fallback_summary(artifact)

        # Write to file
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, 'w') as f:
            f.write(artifact.to_json_string())

        console.print(f"[green]✓[/green] Saved to {output_path}")

        # Show summary
        show_artifact_summary(artifact)

    except Exception as e:
        console.print(f"[red]Error: {e}[/red]")
        import traceback
        traceback.print_exc()
        sys.exit(1)


@main.command()
@click.argument('artifact_file', type=click.Path(exists=True))
@click.option(
    '--token',
    help='GitHub token (default: GITHUB_TOKEN env var)'
)
@click.option(
    '--public',
    is_flag=True,
    help='Create public Gist (default: secret)'
)
@click.option(
    '--update',
    help='Update existing Gist by ID'
)
def upload(artifact_file: str, token: Optional[str], public: bool, update: Optional[str]):
    """Upload artifact to GitHub Gist."""
    artifact_path = Path(artifact_file)

    console.print(f"[bold]Uploading {artifact_path.name} to GitHub Gist...[/bold]")

    try:
        # Load artifact
        with open(artifact_path, 'r') as f:
            artifact = ConversationArtifact.model_validate_json(f.read())

        # Create GitHub client
        client = github_client.GitHubClient(token)
        console.print(f"[green]✓[/green] Authenticated as {client.user.login}")

        # Upload
        with console.status("[bold green]Uploading to Gist..."):
            gist = client.create_or_update_gist(
                artifact,
                existing_gist_id=update,
                public=public
            )

        console.print(f"[green]✓[/green] Gist created/updated")
        console.print()

        # Show info
        panel = Panel(
            f"[bold]URL:[/bold] {gist.html_url}\n"
            f"[bold]ID:[/bold] {gist.id}\n"
            f"[bold]Public:[/bold] {gist.public}\n"
            f"[bold]Description:[/bold] {gist.description}",
            title="🎉 Gist Created Successfully",
            border_style="green"
        )
        console.print(panel)

        # Update artifact with Gist URL
        artifact.metadata.gist_url = gist.html_url
        with open(artifact_path, 'w') as f:
            f.write(artifact.to_json_string())

        console.print(f"[green]✓[/green] Updated artifact with Gist URL")

    except Exception as e:
        console.print(f"[red]Error: {e}[/red]")
        sys.exit(1)


@main.command()
@click.argument('artifact_file', type=click.Path(exists=True))
@click.option(
    '--output',
    type=click.Path(),
    help='Output file (default: print to stdout)'
)
@click.option(
    '--compact',
    is_flag=True,
    help='Generate compact summary'
)
@click.option(
    '--timeline',
    is_flag=True,
    help='Include timeline view'
)
def pr_summary(artifact_file: str, output: Optional[str], compact: bool, timeline: bool):
    """Generate PR summary markdown from artifact."""
    artifact_path = Path(artifact_file)

    try:
        # Load artifact
        with open(artifact_path, 'r') as f:
            artifact = ConversationArtifact.model_validate_json(f.read())

        # Get Gist URL
        gist_url = artifact.metadata.gist_url
        if not gist_url:
            console.print("[yellow]Warning: No Gist URL in artifact. Upload first with 'traceai upload'[/yellow]")
            gist_url = "https://gist.github.com/YOUR_GIST_ID"

        # Generate markdown
        generator = markdown_gen.MarkdownGenerator(artifact, gist_url)
        if compact:
            md = generator.generate_pr_summary(include_highlights=False)
        elif timeline:
            md = generator.generate_pr_summary(max_highlights=10)
        else:
            md = generator.generate_pr_summary()

        # Output
        if output:
            output_path = Path(output)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            with open(output_path, 'w') as f:
                f.write(md)
            console.print(f"[green]✓[/green] Saved PR summary to {output_path}")
        else:
            console.print()
            console.print(Markdown(md))

    except Exception as e:
        console.print(f"[red]Error: {e}[/red]")
        sys.exit(1)


@main.command()
@click.option(
    '--repo',
    type=click.Path(exists=True, file_okay=False, dir_okay=True),
    default='.',
    help='Path to git repository'
)
@click.option(
    '--session-id',
    help='Specific session ID to process (default: most recent)'
)
@click.option(
    '--pr-number',
    type=int,
    required=True,
    help='PR number'
)
@click.option(
    '--token',
    help='GitHub token (default: GITHUB_TOKEN env var)'
)
@click.option(
    '--public',
    is_flag=True,
    help='Create public Gist (default: secret)'
)
@click.option(
    '--output-dir',
    type=click.Path(),
    default='./traceai-output',
    help='Output directory for artifacts'
)
def pipeline(
    repo: str,
    session_id: Optional[str],
    pr_number: int,
    token: Optional[str],
    public: bool,
    output_dir: str
):
    """Run full pipeline: process → upload → generate PR summary."""
    repo_path = Path(repo).resolve()
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    console.print("[bold]Running TraceAI Pipeline[/bold]")
    console.print()

    # Step 1: Process
    console.print("[bold cyan]Step 1/3:[/bold cyan] Processing conversation...")
    artifact_file = output_path / 'artifact.json'

    try:
        from click.testing import CliRunner
        runner = CliRunner()

        # Call process command
        result = runner.invoke(
            process,
            [
                str(artifact_file),
                '--repo', str(repo_path),
                '--pr-number', str(pr_number),
            ] + (['--session-id', session_id] if session_id else []),
            catch_exceptions=False
        )

        if result.exit_code != 0:
            raise Exception("Process step failed")

        console.print()

        # Step 2: Upload
        console.print("[bold cyan]Step 2/3:[/bold cyan] Uploading to Gist...")
        result = runner.invoke(
            upload,
            [
                str(artifact_file),
            ] + (['--token', token] if token else [])
            + (['--public'] if public else []),
            catch_exceptions=False
        )

        if result.exit_code != 0:
            raise Exception("Upload step failed")

        console.print()

        # Create .traceai/config.json for VSCode extension
        with open(artifact_file, 'r') as f:
            updated_artifact = ConversationArtifact.model_validate_json(f.read())

        if updated_artifact.metadata.gist_url:
            traceai_dir = repo_path / '.traceai'
            traceai_dir.mkdir(exist_ok=True)
            config_file = traceai_dir / 'config.json'

            config_data = {
                'gist_id': updated_artifact.metadata.gist_url.split('/')[-1],
                'gist_url': updated_artifact.metadata.gist_url,
                'pr_number': pr_number,
                'session_id': updated_artifact.metadata.session_id,
                'last_updated': updated_artifact.metadata.end_time
            }

            with open(config_file, 'w') as f:
                json.dump(config_data, f, indent=2)

            console.print(f"[green]✓[/green] Created {config_file} for VSCode extension")

        console.print()

        # Step 3: Generate PR summary
        console.print("[bold cyan]Step 3/3:[/bold cyan] Generating PR summary...")
        pr_summary_file = output_path / 'pr-summary.md'

        result = runner.invoke(
            pr_summary,
            [str(artifact_file), '--output', str(pr_summary_file)],
            catch_exceptions=False
        )

        if result.exit_code != 0:
            raise Exception("PR summary step failed")

        console.print()

        # Success!
        panel = Panel(
            f"[green]✓[/green] Artifact: {artifact_file}\n"
            f"[green]✓[/green] PR Summary: {pr_summary_file}\n"
            f"\n[bold]Next steps:[/bold]\n"
            f"1. Copy contents of {pr_summary_file}\n"
            f"2. Paste into your PR description\n"
            f"3. Install VSCode extension to view code provenance",
            title="🎉 Pipeline Complete!",
            border_style="green"
        )
        console.print(panel)

    except Exception as e:
        console.print(f"[red]Pipeline failed: {e}[/red]")
        sys.exit(1)


@main.command()
@click.argument('artifact_file', type=click.Path(exists=True))
def validate(artifact_file: str):
    """Validate artifact JSON schema."""
    artifact_path = Path(artifact_file)

    try:
        with open(artifact_path, 'r') as f:
            artifact = ConversationArtifact.model_validate_json(f.read())

        console.print(f"[green]✓ Valid artifact[/green]")
        show_artifact_summary(artifact)

    except Exception as e:
        console.print(f"[red]✗ Invalid artifact: {e}[/red]")
        sys.exit(1)


@main.command()
@click.option(
    '--repo',
    type=click.Path(exists=True, file_okay=False, dir_okay=True),
    default='.',
    help='Path to git repository'
)
@click.option(
    '--token',
    help='GitHub token (default: GITHUB_TOKEN env var)'
)
@click.option(
    '--public',
    is_flag=True,
    help='Create public Gist (default: secret)'
)
@click.option(
    '--no-summary',
    is_flag=True,
    help='Skip AI summary generation'
)
def quick_upload(repo: str, token: Optional[str], public: bool, no_summary: bool):
    """
    Quick upload: Find latest session, process, and upload to Gist.

    This is designed for git hooks - finds the most recent Claude Code
    conversation, processes it, and uploads to Gist in one command.

    Automatically updates existing Gist if found for the current branch.
    """
    repo_path = Path(repo).resolve()
    config_dir = repo_path / '.traceai'
    config_file = config_dir / 'config.json'

    try:
        # Find most recent conversation
        try:
            conv_file = parser.find_conversation_file(str(repo_path))
        except ValueError as e:
            console.print(f"[yellow]⚠ No conversation found: {e}[/yellow]")
            sys.exit(0)  # Exit gracefully (not an error for git hook)

        # Get metadata
        metadata = parser.get_conversation_metadata(conv_file)

        # Extract mappings
        mappings = mapper.extract_code_mappings(conv_file, repo_path)
        mappings = mapper.correlate_with_git_blame(mappings, repo_path)

        # Get branch name
        try:
            import git
            repo_obj = git.Repo(repo_path)
            branch = repo_obj.active_branch.name
        except:
            branch = 'unknown'

        # Build artifact
        artifact = build_artifact(
            conv_file,
            repo_path,
            mappings,
            metadata,
            None,  # No PR number yet
            branch
        )

        # Generate AI summary (optional)
        if not no_summary:
            if summarizer.is_anthropic_available():
                summary = summarizer.generate_ai_summary(artifact)
                if summary:
                    artifact.summary = summary
                else:
                    artifact.summary = summarizer.generate_fallback_summary(artifact)
            else:
                artifact.summary = summarizer.generate_fallback_summary(artifact)

        # Check for existing Gist ID in config (for updates)
        existing_gist_id = None
        if config_file.exists():
            try:
                with open(config_file, 'r') as f:
                    config = json.load(f)
                    # Check if config has gist_id for current branch
                    if config.get('branch') == branch:
                        existing_gist_id = config.get('gist_id')
                        console.print(f"[dim]Found existing Gist for branch '{branch}', will update...[/dim]")
            except:
                pass

        # Upload to Gist (create or update)
        client = github_client.GitHubClient(token)

        if existing_gist_id:
            # Update existing Gist
            try:
                gist = client.update_gist(existing_gist_id, artifact)
                console.print(f"[green]✓ Gist updated[/green]")
            except:
                # If update fails (gist deleted, etc.), create new
                console.print(f"[yellow]⚠ Could not update existing Gist, creating new...[/yellow]")
                gist = client.create_gist(artifact, public=public)
                console.print(f"[green]✓ Gist created[/green]")
        else:
            # Create new Gist
            gist = client.create_gist(artifact, public=public)
            console.print(f"[green]✓ Gist created[/green]")

        # Update artifact with Gist URL
        artifact.metadata.gist_url = gist.html_url

        # Save config file
        config_dir.mkdir(exist_ok=True)
        config_data = {
            "gist_id": gist.id,
            "gist_url": gist.html_url,
            "branch": branch,
            "last_updated": datetime.now().isoformat(),
            "session_id": metadata['session_id']
        }

        with open(config_file, 'w') as f:
            json.dump(config_data, f, indent=2)

        # Output Gist URL (for hook to capture)
        console.print(f"Gist URL: {gist.html_url}")
        console.print(f"Config saved to: {config_file}")

        return gist.html_url

    except Exception as e:
        console.print(f"[red]Error: {e}[/red]")
        import traceback
        traceback.print_exc()
        sys.exit(1)


@main.command()
@click.option(
    '--type',
    type=click.Choice(['pre-push', 'post-commit']),
    default='pre-push',
    help='Hook type to install'
)
def install_hook(type: str):
    """
    Install git hook for automatic TraceAI processing.

    Installs a pre-push hook that automatically uploads conversations
    to Gist when you push your code.
    """
    import shutil

    # Find git directory
    try:
        import git
        repo = git.Repo('.', search_parent_directories=True)
        git_dir = Path(repo.git_dir)
    except:
        console.print("[red]Error: Not in a git repository[/red]")
        sys.exit(1)

    hooks_dir = git_dir / 'hooks'
    hooks_dir.mkdir(exist_ok=True)

    hook_path = hooks_dir / type

    # Check if hook already exists
    if hook_path.exists():
        console.print(f"[yellow]Warning: {type} hook already exists[/yellow]")
        if not click.confirm("Overwrite?"):
            sys.exit(0)

    # Create hook script
    hook_script = generate_hook_script(type)

    with open(hook_path, 'w') as f:
        f.write(hook_script)

    # Make executable
    hook_path.chmod(0o755)

    console.print(f"[green]✓ Installed {type} hook[/green]")
    console.print(f"[dim]Location: {hook_path}[/dim]")
    console.print()
    console.print("[bold]Next steps:[/bold]")
    console.print("1. Set GITHUB_TOKEN environment variable")
    console.print("2. Push your code - the hook will run automatically")
    console.print("3. Create a PR - GitHub Action will update the description")


@main.command()
@click.option(
    '--type',
    type=click.Choice(['pre-push', 'post-commit']),
    default='pre-push',
    help='Hook type to uninstall'
)
def uninstall_hook(type: str):
    """
    Uninstall git hook.

    Removes the TraceAI hook from your repository.
    """
    # Find git directory
    try:
        import git
        repo = git.Repo('.', search_parent_directories=True)
        git_dir = Path(repo.git_dir)
        repo_root = Path(repo.working_dir)
    except:
        console.print("[red]Error: Not in a git repository[/red]")
        sys.exit(1)

    hook_path = git_dir / 'hooks' / type

    # Check if hook exists
    if not hook_path.exists():
        console.print(f"[yellow]No {type} hook found[/yellow]")
        sys.exit(0)

    # Check if it's our hook
    try:
        content = hook_path.read_text()
        if 'TraceAI' not in content:
            console.print(f"[yellow]Warning: {type} hook exists but doesn't appear to be a TraceAI hook[/yellow]")
            if not click.confirm("Remove anyway?", default=False):
                sys.exit(0)
    except:
        pass

    # Remove the hook
    try:
        hook_path.unlink()
        console.print(f"[green]✓ Removed {type} hook[/green]")

        # Also remove the marker file so we can prompt again if needed
        marker_file = repo_root / '.traceai' / '.hook-prompted'
        if marker_file.exists():
            marker_file.unlink()
            console.print("[dim]Reset hook prompt state[/dim]")

    except Exception as e:
        console.print(f"[red]Error removing hook: {e}[/red]")
        sys.exit(1)


def generate_hook_script(hook_type: str) -> str:
    """Generate the git hook bash script."""

    if hook_type == 'pre-push':
        return '''#!/bin/bash
# TraceAI pre-push hook
# Automatically uploads conversation to Gist before pushing

# Only run if pushing to a feature branch (not main/master)
branch=$(git rev-parse --abbrev-ref HEAD)
if [[ "$branch" == "main" ]] || [[ "$branch" == "master" ]]; then
  exit 0
fi

# Only run if Claude Code directory exists
if [ ! -d "$HOME/.claude/projects" ]; then
  exit 0
fi

# Load .env file if it exists (for GITHUB_TOKEN)
REPO_PATH=$(pwd)
if [ -f "$REPO_PATH/.env" ]; then
  export $(grep -v '^#' "$REPO_PATH/.env" | xargs)
fi

# Check if GITHUB_TOKEN is set (either from env or .env file)
if [ -z "$GITHUB_TOKEN" ]; then
  echo "⚠️  TraceAI: GITHUB_TOKEN not set in environment or .env, skipping"
  exit 0
fi

# Check if config.json already exists and is staged
# If so, this means we already processed this in a previous hook run
if git diff --cached --name-only | grep -q "^.traceai/config.json$"; then
  # Config is already staged, this is the retry push - let it through
  exit 0
fi

echo "🤖 TraceAI: Processing conversation..."

# Find and upload latest session
REPO_PATH=$(pwd)

# Run quick-upload (handles creating/updating Gist and saving config)
OUTPUT=$(traceai quick-upload --repo "$REPO_PATH" 2>&1)
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
  # Extract Gist URL from output
  GIST_URL=$(echo "$OUTPUT" | grep "Gist URL:" | cut -d' ' -f3)

  if [ -n "$GIST_URL" ]; then
    # Check if config file was created/updated
    if [ -f ".traceai/config.json" ]; then
      # Check if config.json has changed
      if ! git diff --quiet .traceai/config.json 2>/dev/null; then
        echo "✅ TraceAI: Uploaded to $GIST_URL"
        echo ""
        echo "📝 Adding TraceAI config to commit..."

        # Add config to git
        git add .traceai/config.json

        # Amend the last commit to include the config
        # This works because we're in pre-push, before the push happens
        git commit --amend --no-edit --no-verify 2>/dev/null || {
          # If amend fails (maybe nothing to amend), create new commit
          git commit -m "chore: update TraceAI conversation artifact" --no-verify 2>/dev/null || true
        }

        echo "✓ Config included in commit"
      else
        echo "✅ TraceAI: Config already up to date"
      fi
    else
      echo "⚠️  TraceAI: Config file not found"
    fi
  else
    echo "⚠️  TraceAI: Could not extract Gist URL"
  fi
else
  echo "⚠️  TraceAI: Upload failed or no conversation found"
  echo "$OUTPUT" | grep -i "error" || true
fi

# Continue with push
exit 0
'''

    elif hook_type == 'post-commit':
        return '''#!/bin/bash
# TraceAI post-commit hook
# Note: pre-push is recommended instead of post-commit

# Only run if Claude Code directory exists
if [ ! -d "$HOME/.claude/projects" ]; then
  exit 0
fi

# Check if GITHUB_TOKEN is set
if [ -z "$GITHUB_TOKEN" ]; then
  exit 0
fi

echo "🤖 TraceAI: Processing conversation..."

REPO_PATH=$(pwd)
GIST_URL=$(traceai quick-upload --repo "$REPO_PATH" 2>&1 | grep "Gist URL:" | cut -d' ' -f3)

if [ -n "$GIST_URL" ]; then
  mkdir -p .traceai
  echo "$GIST_URL" > .traceai/gist-url.txt
  git add .traceai/gist-url.txt
  git commit --amend --no-edit --no-verify
  echo "✅ TraceAI: Uploaded to $GIST_URL"
fi

exit 0
'''

    return ""


def build_artifact(
    conv_file: Path,
    repo_path: Path,
    mappings: list,
    metadata: dict,
    pr_number: Optional[int],
    branch: Optional[str]
) -> ConversationArtifact:
    """Build ConversationArtifact from parsed data."""
    messages = list(parser.parse_conversation(conv_file))

    # Build conversation messages
    conversation = []
    for i, entry in enumerate(messages):
        msg_type = entry.get('type')

        if msg_type == 'user':
            conversation.append(ConversationMessage(
                index=i,
                role='user',
                content=parser.extract_text_from_message(entry['message'].get('content', '')),
                timestamp=entry['timestamp'],
                tool_calls=[],
            ))
        elif msg_type == 'assistant':
            content_data = entry['message'].get('content', [])
            text = parser.extract_text_from_message(content_data)
            tool_calls_data = parser.extract_tool_calls_from_message(content_data)

            tool_calls = [
                ToolCall(
                    name=tc['name'],
                    id=tc['id'],
                    input=tc['input']
                )
                for tc in tool_calls_data
            ]

            conversation.append(ConversationMessage(
                index=i,
                role='assistant',
                content=text,
                timestamp=entry['timestamp'],
                tool_calls=tool_calls,
                usage=entry['message'].get('usage'),
            ))

    # Build code mappings
    code_mappings = [
        CodeMapping(
            file=m['file'],
            lines=m.get('lines'),
            prompt_index=m['prompt_index'],
            prompt_preview=m['prompt_preview'],
            timestamp=m['timestamp'],
            tool=m['tool'],
            tool_input=m['tool_input'],
            confidence=m.get('confidence', 0.9),
        )
        for m in mappings
    ]

    # Calculate stats
    user_messages = [m for m in messages if m.get('type') == 'user']
    total_tokens = sum(
        m['message'].get('usage', {}).get('input_tokens', 0) +
        m['message'].get('usage', {}).get('output_tokens', 0)
        for m in messages if m.get('type') == 'assistant'
    )

    stats = ConversationStats(
        total_messages=len(messages),
        total_prompts=len(user_messages),
        files_modified=len(set(m.file for m in code_mappings)),
        total_tokens=total_tokens,
    )

    # Build metadata
    from datetime import datetime
    start_time = metadata['start_time']
    end_time = metadata['end_time']

    try:
        start_dt = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
        end_dt = datetime.fromisoformat(end_time.replace('Z', '+00:00'))
        duration = (end_dt - start_dt).total_seconds()
    except:
        duration = None

    artifact_metadata = ArtifactMetadata(
        session_id=metadata['session_id'],
        pr_number=pr_number,
        repo_path=str(repo_path),
        branch=branch,
        start_time=start_time,
        end_time=end_time,
        duration_seconds=duration,
    )

    return ConversationArtifact(
        conversation_id=f"traceai-{metadata['session_id'][:8]}",
        metadata=artifact_metadata,
        mappings=code_mappings,
        conversation=conversation,
        stats=stats,
    )


def show_artifact_summary(artifact: ConversationArtifact):
    """Display artifact summary."""
    console.print()

    table = Table(title="Artifact Summary")
    table.add_column("Metric", style="cyan")
    table.add_column("Value", style="green")

    table.add_row("Session ID", artifact.metadata.session_id[:16] + '...')
    table.add_row("Messages", str(artifact.stats.total_messages))
    table.add_row("Prompts", str(artifact.stats.total_prompts))
    table.add_row("Files Modified", str(artifact.stats.files_modified))
    table.add_row("Code Mappings", str(len(artifact.mappings)))
    table.add_row("Total Tokens", f"{artifact.stats.total_tokens:,}")

    if artifact.metadata.duration_seconds:
        table.add_row("Duration", markdown_gen.format_duration(artifact.metadata.duration_seconds))

    console.print(table)


if __name__ == '__main__':
    main()
