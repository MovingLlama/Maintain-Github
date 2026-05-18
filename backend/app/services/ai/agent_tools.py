"""
Tool definitions for the AI Agent.
Each tool corresponds to a real operation the agent can perform.
"""
from typing import Any
from app.services.git.git_service import GitService

git_service = GitService()

# Tool schemas (OpenAI-compatible format)
AGENT_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Read the content of a file in the repository",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {"type": "string", "description": "Path to the file relative to repo root"},
                },
                "required": ["file_path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "write_file",
            "description": "Write or update content of a file in the repository",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {"type": "string", "description": "Path to the file relative to repo root"},
                    "content": {"type": "string", "description": "New content for the file"},
                },
                "required": ["file_path", "content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_files",
            "description": "List all files in the repository",
            "parameters": {
                "type": "object",
                "properties": {
                    "directory": {"type": "string", "description": "Optional subdirectory path", "default": ""},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_git_diff",
            "description": "Show the current uncommitted changes (git diff)",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_git_log",
            "description": "Show recent commit history",
            "parameters": {
                "type": "object",
                "properties": {
                    "max_count": {"type": "integer", "description": "Maximum number of commits to show", "default": 10},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_in_files",
            "description": "Search for a pattern in repository files",
            "parameters": {
                "type": "object",
                "properties": {
                    "pattern": {"type": "string", "description": "Text pattern to search for"},
                    "file_pattern": {"type": "string", "description": "File glob pattern (e.g. '*.py')", "default": "*"},
                },
                "required": ["pattern"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delegate_to_agent",
            "description": (
                "Delegate a sub-task to another specialized AI agent and return its response. "
                "Use this to get expert input from other agents like Code Writer, Bug Fixer, "
                "or Code Reviewer for specific aspects of your task."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "agent_name": {
                        "type": "string",
                        "description": "Name of the agent to delegate to (e.g. 'Code Writer', 'Bug Fixer', 'Code Reviewer', 'Software Architect', 'DevOps Helper')",
                    },
                    "task": {
                        "type": "string",
                        "description": "The specific task or question to pass to the sub-agent. Be clear and detailed.",
                    },
                },
                "required": ["agent_name", "task"],
            },
        },
    },
]


class AgentToolExecutor:
    """Executes tool calls requested by the AI agent."""

    def __init__(self, user_id: str, repo_full_name: str):
        self.user_id = user_id
        self.repo_full_name = repo_full_name

    async def execute(self, tool_name: str, arguments: dict[str, Any]) -> str:
        """Execute a tool and return result as string."""
        try:
            if tool_name == "read_file":
                return await self._read_file(arguments["file_path"])
            elif tool_name == "write_file":
                return await self._write_file(arguments["file_path"], arguments["content"])
            elif tool_name == "list_files":
                return await self._list_files(arguments.get("directory", ""))
            elif tool_name == "get_git_diff":
                return await self._get_diff()
            elif tool_name == "get_git_log":
                return await self._get_log(arguments.get("max_count", 10))
            elif tool_name == "search_in_files":
                return await self._search_files(arguments["pattern"], arguments.get("file_pattern", "*"))
            else:
                return f"Unknown tool: {tool_name}"
        except Exception as e:
            return f"Error executing {tool_name}: {str(e)}"

    async def _read_file(self, file_path: str) -> str:
        content = await git_service.read_file(self.user_id, self.repo_full_name, file_path)
        return f"File: {file_path}\n\n{content}"

    async def _write_file(self, file_path: str, content: str) -> str:
        await git_service.write_file(self.user_id, self.repo_full_name, file_path, content)
        return f"Successfully wrote {len(content)} chars to {file_path}"

    async def _list_files(self, directory: str = "") -> str:
        files = await git_service.get_file_tree(self.user_id, self.repo_full_name)
        if directory:
            files = [f for f in files if f["path"].startswith(directory)]
        lines = [f"{'[DIR] ' if f['type'] == 'directory' else '[FILE]'} {f['path']}" for f in files]
        return "\n".join(lines) if lines else "No files found."

    async def _get_diff(self) -> str:
        diff = await git_service.get_diff(self.user_id, self.repo_full_name)
        return diff if diff else "No uncommitted changes."

    async def _get_log(self, max_count: int = 10) -> str:
        commits = await git_service.get_log(self.user_id, self.repo_full_name, max_count)
        lines = [f"{c['sha']} - {c['date'][:10]} - {c['author']}: {c['message'][:80]}" for c in commits]
        return "\n".join(lines) if lines else "No commits found."

    def _search_files(self, pattern: str, file_pattern: str = "*") -> str:
        import fnmatch
        from pathlib import Path
        from app.core.config import get_settings
        settings = get_settings()
        
        repo_safe = self.repo_full_name.replace("/", "_")
        base = Path(settings.repos_storage_path) / self.user_id / repo_safe
        
        results = []
        for f in base.rglob(file_pattern):
            if ".git" in f.parts or not f.is_file():
                continue
            try:
                text = f.read_text(encoding="utf-8", errors="ignore")
                for i, line in enumerate(text.splitlines(), 1):
                    if pattern.lower() in line.lower():
                        rel = str(f.relative_to(base))
                        results.append(f"{rel}:{i}: {line.strip()}")
                        if len(results) >= 50:  # limit results
                            results.append("... (truncated)")
                            return "\n".join(results)
            except Exception:
                continue
        return "\n".join(results) if results else f"No matches for '{pattern}'."
