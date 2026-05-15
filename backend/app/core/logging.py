"""
Centralized structured logging configuration for the Maintain@Github backend.

Supports two modes:
- JSON format (LOG_FORMAT=json): machine-parseable for production/log aggregation
- Console format (LOG_FORMAT=console): colored, human-readable for development

Inject request_id, user_id, and client_ip into all log records via contextvars.
"""

import logging
import json
import sys
import time
from datetime import datetime, timezone
from contextvars import ContextVar
from typing import Optional

# Context variables for per-request log enrichment
request_id_var: ContextVar[Optional[str]] = ContextVar("request_id", default=None)
user_id_var: ContextVar[Optional[str]] = ContextVar("user_id", default=None)
client_ip_var: ContextVar[Optional[str]] = ContextVar("client_ip", default=None)


class ContextFilter(logging.Filter):
    """Injects context variables (request_id, user_id, client_ip) into log records."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get(None) or "-"
        record.user_id = user_id_var.get(None) or "-"
        record.client_ip = client_ip_var.get(None) or "-"
        return True


class JSONFormatter(logging.Formatter):
    """Formats log records as JSON objects for machine parsing."""

    def format(self, record: logging.LogRecord) -> str:
        log_entry = {
            "timestamp": datetime.fromtimestamp(
                record.created, tz=timezone.utc
            ).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": getattr(record, "request_id", "-"),
            "user_id": getattr(record, "user_id", "-"),
            "client_ip": getattr(record, "client_ip", "-"),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }

        # Include exception info if present
        if record.exc_info and record.exc_info[1]:
            log_entry["exception"] = {
                "type": type(record.exc_info[1]).__name__,
                "message": str(record.exc_info[1]),
            }
            if record.exc_text:
                log_entry["exception"]["traceback"] = record.exc_text
            elif record.exc_info[2]:
                import traceback
                log_entry["exception"]["traceback"] = "".join(
                    traceback.format_tb(record.exc_info[2])
                )

        # Include any extra fields passed via the 'extra' dict
        for key in ("duration_ms", "status_code", "method", "path"):
            if hasattr(record, key):
                log_entry[key] = getattr(record, key)

        return json.dumps(log_entry, default=str, ensure_ascii=False)


class ColoredConsoleFormatter(logging.Formatter):
    """Colored formatter for development console output."""

    COLORS = {
        "DEBUG": "\033[36m",      # Cyan
        "INFO": "\033[32m",       # Green
        "WARNING": "\033[33m",    # Yellow
        "ERROR": "\033[31m",      # Red
        "CRITICAL": "\033[1;31m", # Bold Red
    }
    RESET = "\033[0m"
    DIM = "\033[2m"

    def format(self, record: logging.LogRecord) -> str:
        color = self.COLORS.get(record.levelname, self.RESET)
        timestamp = datetime.fromtimestamp(record.created).strftime("%H:%M:%S")
        request_id = getattr(record, "request_id", "-")
        rid_short = request_id[:8] if request_id and request_id != "-" else "-"

        base = (
            f"{self.DIM}{timestamp}{self.RESET} "
            f"{color}{record.levelname:<8}{self.RESET} "
            f"[{rid_short}] "
            f"{self.DIM}{record.name}{self.RESET} "
            f"| {record.getMessage()}"
        )

        # Add duration if present
        if hasattr(record, "duration_ms"):
            base += f" {self.DIM}({record.duration_ms:.1f}ms){self.RESET}"

        # Add exception info on new line
        if record.exc_info and record.exc_info[1]:
            base += f"\n  {color}↳ {type(record.exc_info[1]).__name__}: {record.exc_info[1]}{self.RESET}"

        return base


def setup_logging(
    log_level: str = "INFO",
    log_format: str = "console",
) -> None:
    """
    Configure the root logger with the specified level and format.

    Args:
        log_level: One of DEBUG, INFO, WARNING, ERROR, CRITICAL.
        log_format: 'json' for structured JSON output, 'console' for colored output.
    """
    level = getattr(logging, log_level.upper(), logging.INFO)

    root_logger = logging.getLogger()
    root_logger.setLevel(level)

    # Remove any existing handlers to avoid duplicates
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)

    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(level)

    if log_format == "json":
        formatter = JSONFormatter()
    else:
        formatter = ColoredConsoleFormatter()

    handler.setFormatter(formatter)

    # Add context filter so all logs get request_id, user_id, client_ip
    context_filter = ContextFilter()
    handler.addFilter(context_filter)
    root_logger.addHandler(handler)

    # Suppress noisy loggers
    _quiet_loggers = [
        "httpx",
        "httpcore",
        "urllib3",
        "asyncio",
        "aiosqlite",
    ]
    for name in _quiet_loggers:
        logging.getLogger(name).setLevel(logging.WARNING)

    # GitPython can be verbose
    logging.getLogger("git").setLevel(logging.WARNING)

    # Log the logging configuration itself
    root_logger.info(
        "Logging configured: level=%s format=%s",
        log_level.upper(),
        log_format,
    )


def get_logger(name: str) -> logging.Logger:
    """
    Get a logger for the given module name.
    Use this instead of logging.getLogger() to ensure all loggers
    inherit the root configuration.
    """
    return logging.getLogger(name)
