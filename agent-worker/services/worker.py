import asyncio
import time
import uuid
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from schemas.task import TaskStatus, TaskStatusResponse
from services.agent_service import agent_service

task_store: Dict[str, Dict[str, Any]] = {}

class BackgroundTaskManager:
    def __init__(self):
        self._running = False
        self._queue: asyncio.Queue = asyncio.Queue()

    async def enqueue_task(self, prompt: str, context: Dict[str, Any], task_type: str) -> str:
        task_id = f"ai_task_{uuid.uuid4().hex[:12]}"
        now = datetime.now(timezone.utc)
        task_store[task_id] = {
            "task_id": task_id,
            "status": TaskStatus.PENDING,
            "task_type": task_type,
            "prompt": prompt,
            "context": context,
            "result": None,
            "error": None,
            "created_at": now,
            "updated_at": now,
            "start_time": time.time(),
            "execution_time_ms": None,
        }
        await self._queue.put(task_id)
        return task_id

    def get_task(self, task_id: str) -> Optional[TaskStatusResponse]:
        raw = task_store.get(task_id)
        if not raw:
            return None
        return TaskStatusResponse(
            task_id=raw["task_id"],
            status=raw["status"],
            result=raw["result"],
            error=raw["error"],
            created_at=raw["created_at"],
            updated_at=raw["updated_at"],
            execution_time_ms=raw["execution_time_ms"],
        )

    async def worker_loop(self):
        self._running = True
        while self._running:
            task_id = await self._queue.get()
            if not task_id or task_id not in task_store:
                self._queue.task_done()
                continue

            entry = task_store[task_id]
            entry["status"] = TaskStatus.PROCESSING
            entry["updated_at"] = datetime.now(timezone.utc)

            try:
                result = await agent_service.execute_task(entry["prompt"], entry["context"])
                entry["status"] = TaskStatus.DEGRADED if result.get("degraded") else TaskStatus.COMPLETED
                entry["result"] = result
            except Exception as e:
                entry["status"] = TaskStatus.FAILED
                entry["error"] = str(e)
            finally:
                entry["updated_at"] = datetime.now(timezone.utc)
                entry["execution_time_ms"] = round((time.time() - entry["start_time"]) * 1000, 2)
                self._queue.task_done()

    def stop(self):
        self._running = False

task_manager = BackgroundTaskManager()
