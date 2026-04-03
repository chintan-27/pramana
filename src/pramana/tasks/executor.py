"""Sandboxed task execution — runs code in a subprocess with auto-retry."""
from __future__ import annotations

import logging
import os
import subprocess
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

from pramana.config import Settings
from pramana.models.database import get_session
from pramana.models.schema import ResearchTask

logger = logging.getLogger(__name__)

MAX_RETRIES = 3

FIX_PROMPT = """\
The following Python script failed. Fix the code so it runs successfully.

Original code:
```python
{code}
```

Error output:
```
{error}
```

Rules:
- Fix ONLY the bug — do not change the overall logic or goal
- If a library is unavailable, use a standard library alternative
- If data is missing, add graceful handling (try/except, default values)
- Output ONLY the fixed Python code, no markdown fences, no explanation"""


def execute_task(task_id: int, settings: Settings) -> dict:
    """Execute a research task with iterative auto-retry on failure.

    On failure, asks the LLM to fix the code and retries up to MAX_RETRIES.
    Returns: {status, output, error, duration_s, retries}
    """
    with get_session(settings) as session:
        task = session.get(ResearchTask, task_id)
        if not task:
            return {"status": "failed", "error": "Task not found"}
        if task.status not in ("approved", "proposed"):
            msg = f"Task status is '{task.status}', must be 'approved'"
            return {"status": "failed", "error": msg}

        task.status = "running"
        session.flush()

        code = task.code
        language = task.language

    if language != "python":
        _update_task_status(
            task_id, "failed",
            f"Unsupported language: {language}", settings,
        )
        return {"status": "failed", "error": f"Unsupported: {language}"}

    start = time.monotonic()
    current_code = code
    last_error = ""

    for attempt in range(1, MAX_RETRIES + 1):
        logger.info(
            "Task %d: attempt %d/%d", task_id, attempt, MAX_RETRIES,
        )
        result = _run_script(current_code)

        if result["status"] == "ok":
            duration = time.monotonic() - start
            # Save the (possibly fixed) code back to the task
            if current_code != code:
                _save_fixed_code(task_id, current_code, settings)
            output = result["stdout"]
            _update_task_status(task_id, "completed", output, settings)
            return {
                "status": "completed", "output": output,
                "duration_s": round(duration, 1), "retries": attempt - 1,
            }

        last_error = result["stderr"]
        logger.info(
            "Task %d attempt %d failed: %s",
            task_id, attempt, last_error[:200],
        )

        # Don't retry on timeout
        if result.get("timeout"):
            break

        # Ask LLM to fix the code (except on last attempt)
        if attempt < MAX_RETRIES:
            fixed = _ask_llm_to_fix(current_code, last_error, settings)
            if fixed and fixed.strip() != current_code.strip():
                current_code = fixed
            else:
                break  # LLM couldn't fix it

    duration = time.monotonic() - start
    full_output = f"STDOUT:\n{result.get('stdout', '')}\n\nSTDERR:\n{last_error}"
    _update_task_status(task_id, "failed", full_output, settings)
    return {
        "status": "failed", "error": last_error,
        "duration_s": round(duration, 1), "retries": MAX_RETRIES - 1,
    }


def _run_script(code: str) -> dict:
    """Run a Python script in a temp directory. Returns status/stdout/stderr."""
    try:
        with tempfile.TemporaryDirectory(prefix="pramana_task_") as tmpdir:
            script_path = Path(tmpdir) / "task.py"
            script_path.write_text(code)

            # Inherit minimal env + VIRTUAL_ENV packages
            env = dict(os.environ)
            env["HOME"] = tmpdir

            proc = subprocess.run(
                ["python", str(script_path)],
                capture_output=True,
                text=True,
                timeout=120,
                cwd=tmpdir,
                env=env,
            )

            stdout = proc.stdout[-10000:] if proc.stdout else ""
            stderr = proc.stderr[-5000:] if proc.stderr else ""

            if proc.returncode == 0:
                return {"status": "ok", "stdout": stdout, "stderr": ""}
            return {"status": "error", "stdout": stdout, "stderr": stderr}

    except subprocess.TimeoutExpired:
        return {
            "status": "error", "stdout": "",
            "stderr": "Execution timed out (120s limit)", "timeout": True,
        }
    except Exception as e:
        return {"status": "error", "stdout": "", "stderr": str(e)}


def _ask_llm_to_fix(code: str, error: str, settings: Settings) -> str | None:
    """Ask the LLM to fix a broken script. Returns fixed code or None."""
    try:
        from pramana.llm.client import chat_json

        prompt = FIX_PROMPT.format(
            code=code[:6000], error=error[:3000],
        )
        result = chat_json(
            [{"role": "user", "content": prompt}],
            settings,
            max_tokens=4096,
        )
        # Result might be JSON string or raw code
        if isinstance(result, str):
            text = result.strip()
        else:
            text = str(result)

        # Strip markdown fences if present
        if text.startswith("```"):
            lines = text.split("\n")
            lines = [ln for ln in lines if not ln.startswith("```")]
            text = "\n".join(lines).strip()

        return text if text else None
    except Exception as e:
        logger.debug("LLM fix failed: %s", e)
        return None


def _save_fixed_code(
    task_id: int, fixed_code: str, settings: Settings,
) -> None:
    """Persist the auto-fixed code back to the task record."""
    with get_session(settings) as session:
        task = session.get(ResearchTask, task_id)
        if task:
            task.code = fixed_code


def _update_task_status(task_id: int, status: str, output: str, settings: Settings) -> None:
    with get_session(settings) as session:
        task = session.get(ResearchTask, task_id)
        if task:
            task.status = status
            task.output = output
            if status in ("completed", "failed"):
                task.completed_at = datetime.now(timezone.utc)

            # If task completed and linked to a section, trigger rewrite
            if status == "completed" and task.linked_section_id and output:
                _rewrite_linked_section(
                    task.run_id, task.linked_section_id,
                    task.title, output, settings, session,
                )


def _rewrite_linked_section(
    run_id: str, section_id: str,
    task_title: str, task_output: str,
    settings: Settings, session,  # noqa: ANN001
) -> None:
    """Rewrite the linked section in the stored report with task results."""
    import json as _json

    from pramana.models.schema import AnalysisRun

    try:
        # Find the analysis run and its stored report
        run = (
            session.query(AnalysisRun)
            .filter(AnalysisRun.id == int(run_id))
            .first()
        )
        if not run or not run.results:
            return

        report = _json.loads(run.results)
        report_data = report.get("report", report)
        sections = report_data.get("sections", [])

        # Find the target section
        target = None
        for sec in sections:
            if sec.get("id") == section_id:
                target = sec
                break
        if not target:
            return

        from pramana.agents.report_designer import rewrite_section_with_results
        updated = rewrite_section_with_results(
            section=target,
            task_title=task_title,
            task_output=task_output,
            settings=settings,
        )
        if updated:
            target["content"] = updated
            run.results = _json.dumps(report)
            logger.info(
                "Rewrote section %s with task output for run %s",
                section_id, run_id,
            )
    except Exception:
        logger.debug("Section rewrite failed", exc_info=True)
