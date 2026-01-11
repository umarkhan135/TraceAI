# TraceAI Test Scenarios

This document provides systematic test scenarios for each module in the TraceAI codebase. Work through these scenarios one by one to understand functionality and identify potential errors.

## Test Prerequisites

1. **Python Environment**:
   - Python 3.11+
   - Install dependencies: `cd pipeline && pip install -e .`
   - Set `GITHUB_TOKEN` environment variable (optional, for GitHub tests)
   - Set `ANTHROPIC_API_KEY` environment variable (optional, for AI summary tests)

2. **TypeScript/VS Code Extension**:
   - Node.js installed
   - Install dependencies: `cd extension && npm install`
   - Compile: `npm run compile`
   - VS Code for testing extension

3. **Test Data**:
   - Access to `~/.claude/projects/` directory with Claude Code conversation files
   - A git repository for testing mapping functionality
   - Sample conversation JSONL files (if available)

---

## Part 1: Pipeline - Data Models (`models.py`)

### Scenario 1.1: Validate Model Structure
**Purpose**: Verify all Pydantic models can be instantiated correctly

**Steps**:
1. Open Python REPL: `python`
2. Import models: `from traceai.models import *`
3. Test each model creation:
   ```python
   # Test ToolCall
   tool_call = ToolCall(name="Edit", input={"file_path": "test.py"})
   print(f"ToolCall created: {tool_call.name}")
   
   # Test ConversationMessage
   msg = ConversationMessage(role="user", content="Test prompt", index=0)
   print(f"Message created: {msg.role}")
   
   # Test CodeMapping
   mapping = CodeMapping(file="test.py", lines=[1, 10], tool="Edit", prompt_index=0)
   print(f"Mapping created: {mapping.file}")
   
   # Test ConversationArtifact (minimal)
   artifact = ConversationArtifact(
       version="1.0",
       metadata=ArtifactMetadata(session_id="test", start_time="2024-01-01T00:00:00Z", end_time="2024-01-01T00:01:00Z"),
       conversation=[],
       mappings=[],
       stats=ConversationStats(total_messages=0, total_prompts=0, files_modified=0, total_tokens=0)
   )
   print(f"Artifact created: {artifact.version}")
   ```

**Expected Outcome**: All models instantiate without errors, print statements show correct values

**Potential Issues to Check**:
- Missing required fields
- Type mismatches
- Validation errors

---

### Scenario 1.2: JSON Serialization/Deserialization
**Purpose**: Verify models can be converted to/from JSON

**Steps**:
1. Create a minimal artifact (as in 1.1)
2. Convert to JSON: `json_str = artifact.model_dump_json()`
3. Parse JSON: `parsed = ConversationArtifact.model_validate_json(json_str)`
4. Verify equality: `assert artifact.version == parsed.version`

**Expected Outcome**: JSON conversion works bidirectionally

**Potential Issues to Check**:
- JSON encoding/decoding errors
- Data loss during conversion
- Field name mismatches

---

## Part 2: Pipeline - Parser (`parser.py`)

### Scenario 2.1: Find Claude Projects Directory
**Purpose**: Test detection of Claude Code project directories

**Steps**:
1. In Python REPL: `from traceai.parser import find_claude_projects_dir`
2. Test with a known project path:
   ```python
   import os
   test_path = os.path.expanduser("~")
   projects_dir = find_claude_projects_dir(test_path)
   print(f"Found projects dir: {projects_dir}")
   ```

**Expected Outcome**: Returns Path to `~/.claude/projects/` or similar

**Potential Issues to Check**:
- Path resolution errors
- Directory not found
- Permission errors

---

### Scenario 2.2: List Conversation Files
**Purpose**: Verify listing of conversation files from a project

**Steps**:
1. `from traceai.parser import list_conversation_files`
2. Test listing:
   ```python
   # Use a real project path if available
   conversations = list_conversation_files("/path/to/project")
   print(f"Found {len(conversations)} conversations")
   for conv in conversations[:3]:  # Show first 3
       print(f"  - {conv['session_id'][:16]}... ({conv['size_bytes']} bytes)")
   ```

**Expected Outcome**: Returns list of conversation metadata dictionaries

**Potential Issues to Check**:
- Empty list when conversations exist
- Missing metadata fields
- File access errors

---

### Scenario 2.3: Parse Conversation File
**Purpose**: Test parsing of JSONL conversation files

**Steps**:
1. `from traceai.parser import parse_conversation, get_conversation_metadata`
2. Find a real conversation file or create a minimal test file
3. Parse it:
   ```python
   from pathlib import Path
   conv_file = Path("path/to/conversation.jsonl")
   messages = list(parse_conversation(conv_file))
   print(f"Parsed {len(messages)} messages")
   for msg in messages[:3]:
       print(f"  - Type: {msg.get('type')}, Timestamp: {msg.get('timestamp')}")
   ```
4. Get metadata:
   ```python
   metadata = get_conversation_metadata(conv_file)
   print(f"Metadata: {metadata}")
   ```

**Expected Outcome**: Messages parsed correctly with proper structure

**Potential Issues to Check**:
- JSON parsing errors
- Missing required fields
- Iterator not working
- Encoding issues

---

### Scenario 2.4: Extract Tool Calls
**Purpose**: Verify extraction of tool calls from messages

**Steps**:
1. `from traceai.parser import extract_tool_calls_from_message, extract_text_from_message`
2. Test with sample message content:
   ```python
   # Sample structure based on Claude Code format
   sample_content = [
       {"type": "text", "text": "I'll help you with that"},
       {"type": "tool_use", "name": "Edit", "input": {"file_path": "test.py", "old_string": "...", "new_string": "..."}}
   ]
   tool_calls = extract_tool_calls_from_message(sample_content)
   print(f"Found {len(tool_calls)} tool calls")
   text = extract_text_from_message(sample_content)
   print(f"Extracted text: {text[:50]}...")
   ```

**Expected Outcome**: Tool calls and text extracted correctly

**Potential Issues to Check**:
- Tool calls not detected
- Wrong structure assumptions
- Missing tool input data

---

## Part 3: Pipeline - Mapper (`mapper.py`)

### Scenario 3.1: Extract Code Mappings (Basic)
**Purpose**: Test basic mapping extraction from conversation files

**Steps**:
1. `from traceai.mapper import extract_code_mappings`
2. Use a real conversation file:
   ```python
   from pathlib import Path
   conv_file = Path("path/to/conversation.jsonl")
   repo_path = Path("path/to/git/repo")  # Optional
   mappings = extract_code_mappings(conv_file, repo_path)
   print(f"Extracted {len(mappings)} mappings")
   for mapping in mappings[:3]:
       print(f"  - File: {mapping['file']}, Tool: {mapping['tool']}, Lines: {mapping.get('lines')}")
   ```

**Expected Outcome**: Mappings extracted with file paths, tool names, and line numbers

**Potential Issues to Check**:
- Empty mappings when tool calls exist
- Incorrect file paths
- Missing line numbers
- Tool call correlation failures

---

### Scenario 3.2: Extract Line Numbers from Edit Operations
**Purpose**: Test line number extraction from Edit tool calls

**Steps**:
1. `from traceai.mapper import extract_line_numbers_from_edit`
2. Test with sample Edit tool input:
   ```python
   from pathlib import Path
   tool_input = {
       "file_path": "test.py",
       "old_string": "def old_func():\n    pass",
       "new_string": "def new_func():\n    return True"
   }
   file_path = Path("test.py")  # Real file or mock
   lines, confidence = extract_line_numbers_from_edit(tool_input, file_path)
   print(f"Lines: {lines}, Confidence: {confidence}")
   ```

**Expected Outcome**: Line numbers extracted with confidence score

**Potential Issues to Check**:
- File not found errors
- Line number calculation errors
- Confidence scores out of range
- Diff parsing failures

---

### Scenario 3.3: Extract Line Numbers from Write Operations
**Purpose**: Test line number extraction from Write tool calls

**Steps**:
1. `from traceai.mapper import extract_line_numbers_from_write`
2. Test with sample Write tool input:
   ```python
   tool_input = {
       "file_path": "new_file.py",
       "contents": "def func1():\n    pass\n\ndef func2():\n    pass"
   }
   lines, confidence = extract_line_numbers_from_write(tool_input)
   print(f"Lines: {lines}, Confidence: {confidence}")
   ```

**Expected Outcome**: Line numbers [1, N] with high confidence

**Potential Issues to Check**:
- Line counting errors
- Empty file handling
- Multi-line content issues

---

### Scenario 3.4: Git Blame Correlation
**Purpose**: Test correlation with git blame data

**Steps**:
1. `from traceai.mapper import correlate_with_git_blame`
2. Use real mappings and git repo:
   ```python
   mappings = extract_code_mappings(conv_file, repo_path)
   enhanced_mappings = correlate_with_git_blame(mappings, repo_path)
   print(f"Enhanced {len(enhanced_mappings)} mappings")
   for mapping in enhanced_mappings[:3]:
       print(f"  - Git commit: {mapping.get('git_commit')}")
       print(f"    Git author: {mapping.get('git_author')}")
   ```

**Expected Outcome**: Mappings enhanced with git commit information

**Potential Issues to Check**:
- Git repo not found
- Git blame failures
- Time window mismatches
- No correlation found when expected

---

### Scenario 3.5: Aggregate Mappings by File
**Purpose**: Test grouping of mappings by file

**Steps**:
1. `from traceai.mapper import aggregate_mappings_by_file`
2. Test aggregation:
   ```python
   mappings = extract_code_mappings(conv_file, repo_path)
   file_groups = aggregate_mappings_by_file(mappings)
   print(f"Files with mappings: {list(file_groups.keys())}")
   for file_path, file_mappings in file_groups.items():
       print(f"  - {file_path}: {len(file_mappings)} mappings")
   ```

**Expected Outcome**: Mappings grouped correctly by file path

**Potential Issues to Check**:
- File path normalization issues
- Missing mappings in groups
- Duplicate file entries

---

## Part 4: Pipeline - GitHub Client (`github_client.py`)

### Scenario 4.1: GitHub Client Initialization
**Purpose**: Test GitHub client creation and authentication

**Steps**:
1. `from traceai.github_client import GitHubClient`
2. Initialize with token:
   ```python
   import os
   token = os.getenv('GITHUB_TOKEN')
   if token:
       client = GitHubClient(token)
       print(f"Authenticated as: {client.user.login}")
   else:
       print("GITHUB_TOKEN not set, skipping")
   ```

**Expected Outcome**: Client initializes and authenticates successfully

**Potential Issues to Check**:
- Missing token error
- Invalid token error
- Authentication failures
- API rate limit warnings

---

### Scenario 4.2: Upload Artifact to Gist
**Purpose**: Test uploading conversation artifacts to GitHub Gists

**Steps**:
1. Create a minimal artifact (from Scenario 1.1)
2. Upload to Gist:
   ```python
   client = GitHubClient(os.getenv('GITHUB_TOKEN'))
   response = client.upload_artifact_to_gist(
       artifact,
       description="Test TraceAI Artifact",
       public=False
   )
   print(f"Gist created: {response.gist_url}")
   print(f"Gist ID: {response.gist_id}")
   ```

**Expected Outcome**: Gist created successfully with JSON and markdown files

**Potential Issues to Check**:
- Upload failures
- Missing files in Gist
- Invalid JSON structure
- Permission errors

---

### Scenario 4.3: Fetch Existing Gist
**Purpose**: Test fetching artifacts from existing Gists

**Steps**:
1. Use a Gist ID from Scenario 4.2:
   ```python
   gist_id = "abc123..."  # From previous test
   gist = client.fetch_gist(gist_id)
   print(f"Gist files: {list(gist.files.keys())}")
   ```

**Expected Outcome**: Gist fetched with all files

**Potential Issues to Check**:
- Gist not found
- Missing files
- Permission denied
- Rate limit errors

---

### Scenario 4.4: Generate Markdown Summary
**Purpose**: Test markdown generation for Gists

**Steps**:
1. `from traceai.github_client import GitHubClient`
2. Create artifact and generate markdown:
   ```python
   client = GitHubClient(os.getenv('GITHUB_TOKEN'))
   markdown = client.generate_gist_markdown(artifact)
   print(markdown[:500])  # Print first 500 chars
   ```

**Expected Outcome**: Valid markdown generated

**Potential Issues to Check**:
- Markdown generation errors
- Missing sections
- Formatting issues

---

## Part 5: Pipeline - Markdown Generator (`markdown_gen.py`)

### Scenario 5.1: Generate PR Summary
**Purpose**: Test PR summary markdown generation

**Steps**:
1. `from traceai.markdown_gen import MarkdownGenerator`
2. Create artifact and generate summary:
   ```python
   generator = MarkdownGenerator(artifact, gist_url="https://gist.github.com/...")
   summary = generator.generate_pr_summary()
   print(summary)
   ```

**Expected Outcome**: Complete PR summary with stats, files, highlights

**Potential Issues to Check**:
- Missing sections
- Empty stats
- Formatting errors
- Missing data handling

---

### Scenario 5.2: Generate Commit Message
**Purpose**: Test commit message generation

**Steps**:
1. Use generator from 5.1:
   ```python
   commit_msg = generator.generate_commit_message(max_length=72)
   print(commit_msg)
   ```

**Expected Outcome**: Valid commit message format

**Potential Issues to Check**:
- Message too long
- Missing information
- Format issues

---

## Part 6: Pipeline - Summarizer (`summarizer.py`)

### Scenario 6.1: Check Anthropic API Availability
**Purpose**: Test API key detection

**Steps**:
1. `from traceai.summarizer import is_anthropic_available`
2. Check availability:
   ```python
   available = is_anthropic_available()
   print(f"Anthropic API available: {available}")
   ```

**Expected Outcome**: Returns True if API key set, False otherwise

**Potential Issues to Check**:
- False positives/negatives
- Environment variable not detected

---

### Scenario 6.2: Generate AI Summary (if API key available)
**Purpose**: Test AI-powered summary generation

**Steps**:
1. `from traceai.summarizer import generate_ai_summary`
2. Create artifact and generate summary:
   ```python
   if is_anthropic_available():
       summary = generate_ai_summary(artifact)
       if summary:
           print(f"Overview: {summary.overview}")
           print(f"Key decisions: {summary.key_decisions}")
       else:
           print("Summary generation failed")
   ```

**Expected Outcome**: Summary object with overview, decisions, file summaries

**Potential Issues to Check**:
- API errors
- JSON parsing failures
- Timeout issues
- Invalid response format

---

### Scenario 6.3: Generate Fallback Summary
**Purpose**: Test fallback summary when AI unavailable

**Steps**:
1. `from traceai.summarizer import generate_fallback_summary`
2. Generate fallback:
   ```python
   fallback = generate_fallback_summary(artifact)
   print(fallback.overview)
   ```

**Expected Outcome**: Valid fallback summary generated

**Potential Issues to Check**:
- Empty summaries
- Missing data
- Format issues

---

## Part 7: Pipeline - CLI (`cli.py`)

### Scenario 7.1: List Conversations Command
**Purpose**: Test CLI list command

**Steps**:
1. Terminal: `traceai list --repo /path/to/repo`
2. Or: `python -m traceai.cli list --repo /path/to/repo`

**Expected Outcome**: Table of conversations displayed

**Potential Issues to Check**:
- Command not found
- No conversations found
- Display formatting errors
- Error handling

---

### Scenario 7.2: Process Conversation Command
**Purpose**: Test processing a conversation into an artifact

**Steps**:
1. `traceai process output.json --repo /path/to/repo`
2. Check output file exists and is valid JSON
3. Validate artifact structure

**Expected Outcome**: Artifact JSON file created successfully

**Potential Issues to Check**:
- Conversation not found
- Processing errors
- Invalid output format
- Missing mappings

---

### Scenario 7.3: Upload Command
**Purpose**: Test uploading artifact to Gist

**Steps**:
1. `traceai upload output.json --token $GITHUB_TOKEN`
2. Verify Gist created
3. Check config file created

**Expected Outcome**: Gist created, config.json updated

**Potential Issues to Check**:
- Upload failures
- Token errors
- Config file not created
- Gist URL incorrect

---

### Scenario 7.4: PR Summary Command
**Purpose**: Test PR summary generation

**Steps**:
1. `traceai pr-summary output.json`
2. Verify markdown output

**Expected Outcome**: Markdown summary printed/exported

**Potential Issues to Check**:
- Missing artifact
- Generation errors
- Output formatting

---

### Scenario 7.5: Pipeline Command (Full Flow)
**Purpose**: Test end-to-end pipeline

**Steps**:
1. `traceai pipeline --repo /path/to/repo --pr-number 1 --token $GITHUB_TOKEN`
2. Verify all steps complete
3. Check outputs

**Expected Outcome**: Complete pipeline runs successfully

**Potential Issues to Check**:
- Step failures
- Intermediate errors
- Missing outputs
- Integration issues

---

### Scenario 7.6: Git Hook Installation
**Purpose**: Test git hook setup

**Steps**:
1. `traceai install-hook --type pre-push`
2. Check `.git/hooks/pre-push` exists
3. Verify hook content

**Expected Outcome**: Hook installed correctly

**Potential Issues to Check**:
- Not in git repo
- Hook not created
- Invalid hook script
- Permission errors

---

## Part 8: Extension - Cache (`cache.ts`)

### Scenario 8.1: Cache Initialization
**Purpose**: Test cache setup

**Steps**:
1. In VS Code extension debugger or test file
2. Import and initialize:
   ```typescript
   import { cache } from './cache';
   cache.initialize('/path/to/workspace');
   ```
3. Check cache directory created

**Expected Outcome**: Cache initialized, directory exists

**Potential Issues to Check**:
- Directory creation failures
- Path resolution errors
- Permission issues

---

### Scenario 8.2: Cache Set/Get Operations
**Purpose**: Test caching artifacts

**Steps**:
1. Set cache:
   ```typescript
   const artifact = { /* sample artifact */ };
   await cache.set('test-gist-id', artifact, 3600);
   ```
2. Get cache:
   ```typescript
   const cached = await cache.get('test-gist-id');
   console.log(cached ? 'Cache hit' : 'Cache miss');
   ```

**Expected Outcome**: Cache operations work correctly

**Potential Issues to Check**:
- Set/get failures
- Expiration not working
- Data corruption
- File I/O errors

---

## Part 9: Extension - GitHub Client (`githubClient.ts`)

### Scenario 9.1: Client Initialization
**Purpose**: Test GitHub client setup

**Steps**:
1. `import { githubClient } from './githubClient';`
2. Initialize:
   ```typescript
   githubClient.initialize('ghp_...');
   ```

**Expected Outcome**: Client initialized

**Potential Issues to Check**:
- Token validation
- Octokit initialization
- Error handling

---

### Scenario 9.2: Fetch Gist
**Purpose**: Test fetching artifacts from Gists

**Steps**:
1. Fetch Gist:
   ```typescript
   const artifact = await githubClient.fetchGist('gist-id');
   console.log(artifact ? 'Fetched' : 'Not found');
   ```

**Expected Outcome**: Artifact fetched and parsed correctly

**Potential Issues to Check**:
- API errors
- Parsing failures
- Missing files
- Rate limits

---

## Part 10: Extension - Unified Loader (`unifiedLoader.ts`)

### Scenario 10.1: Load from Config
**Purpose**: Test loading artifacts via config.json

**Steps**:
1. Create `.traceai/config.json` with Gist ID
2. Load artifacts:
   ```typescript
   import { unifiedLoader } from './unifiedLoader';
   const artifacts = await unifiedLoader.loadArtifacts('/workspace/path');
   ```

**Expected Outcome**: Artifacts loaded from Gist

**Potential Issues to Check**:
- Config not found
- Invalid config format
- Gist fetch failures
- Multiple Gist handling

---

### Scenario 10.2: Config File Watcher
**Purpose**: Test file watching for config changes

**Steps**:
1. Set up watcher
2. Modify config.json
3. Verify watcher triggers

**Expected Outcome**: Changes detected and artifacts reloaded

**Potential Issues to Check**:
- Watcher not created
- Changes not detected
- Multiple triggers
- Memory leaks

---

## Part 11: Extension - Decoration Provider (`decorationProvider.ts`)

### Scenario 11.1: Update Decorations
**Purpose**: Test inline decoration display

**Steps**:
1. Load artifact with mappings
2. Open file with AI-generated code
3. Call `decorationProvider.updateDecorations(editor)`
4. Verify decorations appear

**Expected Outcome**: Inline annotations visible in editor

**Potential Issues to Check**:
- Decorations not shown
- Wrong line positions
- Missing mappings
- Performance issues

---

### Scenario 11.2: Decoration Hover Detection
**Purpose**: Test hover detection on decorations

**Steps**:
1. Display decorations
2. Position cursor over decoration
3. Verify hover detection works

**Expected Outcome**: Hover correctly detected

**Potential Issues to Check**:
- Detection failures
- Position calculation errors
- Edge cases

---

## Part 12: Extension - Hover Provider (`hoverProvider.ts`)

### Scenario 12.1: Provide Hover Content
**Purpose**: Test hover tooltip display

**Steps**:
1. Hover over AI-generated code line
2. Verify tooltip appears
3. Check content structure

**Expected Outcome**: Rich tooltip with prompt, tool, timestamp displayed

**Potential Issues to Check**:
- Tooltip not shown
- Missing data
- Formatting errors
- Link issues

---

### Scenario 12.2: Cache Integration
**Purpose**: Test hover provider cache usage

**Steps**:
1. First hover (cache miss)
2. Second hover (cache hit)
3. Verify performance

**Expected Outcome**: Cache reduces API calls

**Potential Issues to Check**:
- Cache not used
- Stale data
- Memory issues

---

## Part 13: Integration Tests

### Scenario 13.1: End-to-End Pipeline to Extension
**Purpose**: Test complete flow from pipeline to extension

**Steps**:
1. Process conversation: `traceai process artifact.json --repo /path/to/repo`
2. Upload to Gist: `traceai upload artifact.json`
3. Verify `.traceai/config.json` created
4. Load extension in VS Code
5. Open file with AI-generated code
6. Verify decorations and hover work

**Expected Outcome**: Complete workflow functions correctly

**Potential Issues to Check**:
- Data format mismatches
- Path resolution issues
- Timing issues
- Missing data propagation

---

### Scenario 13.2: Multiple Conversations
**Purpose**: Test handling multiple conversations/PRs

**Steps**:
1. Process multiple conversations
2. Upload to separate Gists
3. Configure multiple Gists in config
4. Verify extension loads all
5. Check merging logic

**Expected Outcome**: Multiple artifacts handled correctly

**Potential Issues to Check**:
- Conflicts
- Merging errors
- Performance issues
- Data loss

---

## Error Scenarios

### Scenario E.1: Missing Dependencies
**Purpose**: Test error handling for missing files/data

**Steps**:
1. Process conversation from non-existent project
2. Upload artifact with missing Gist
3. Load extension with missing config
4. Verify graceful error handling

**Expected Outcome**: Clear error messages, no crashes

---

### Scenario E.2: Invalid Data
**Purpose**: Test handling of malformed data

**Steps**:
1. Parse invalid JSONL file
2. Process artifact with missing fields
3. Load invalid config.json
4. Verify validation and error messages

**Expected Outcome**: Validation errors caught, clear messages

---

### Scenario E.3: Network Failures
**Purpose**: Test offline/network error handling

**Steps**:
1. Disconnect network
2. Try Gist operations
3. Verify fallback behavior
4. Test reconnection

**Expected Outcome**: Graceful degradation, retry logic

---

## Notes

- Mark each scenario as ✅ Pass, ❌ Fail, or ⚠️ Partial
- Document any errors found with details
- Note unexpected behavior or edge cases
- Keep track of performance observations
- Update this document with findings

---

**Test Progress Tracker**

| Scenario | Status | Notes |
|----------|--------|-------|
| 1.1 | ⬜ | |
| 1.2 | ⬜ | |
| 2.1 | ⬜ | |
| ... | ⬜ | |

