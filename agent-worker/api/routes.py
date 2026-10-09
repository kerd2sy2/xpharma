from fastapi import APIRouter, HTTPException, status
from schemas.task import TaskCreateRequest, TaskCreateResponse, TaskStatusResponse
from services.worker import task_manager
from core.circuit_breaker import llm_circuit_breaker

router = APIRouter(prefix="/api/v1", tags=["AI Agent"])

@router.post("/tasks", response_model=TaskCreateResponse, status_code=status.HTTP_202_ACCEPTED)
async def create_agent_task(req: TaskCreateRequest):
    """
    Accepts task from main API or mobile client, dispatches to worker queue,
    and returns 202 Accepted immediately without blocking HTTP threads.
    """
    task_id = await task_manager.enqueue_task(
        prompt=req.prompt,
        context=req.context or {},
        task_type=req.task_type.value,
    )
    return TaskCreateResponse(
        task_id=task_id,
        message="تم إدراج المهمة في طابور المعالجة بنجاح. يمكن متابعة النتيجة عبر الاستطلاع أو الـ WebSocket."
    )

@router.get("/tasks/{task_id}", response_model=TaskStatusResponse)
async def get_agent_task(task_id: str):
    """
    Polling endpoint for task progress and final result.
    """
    task = task_manager.get_task(task_id)
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"المهمة '{task_id}' غير موجودة."
        )
    return task

@router.get("/health")
async def health_check():
    """
    Health check with circuit breaker telemetry.
    """
    return {
        "status": "healthy",
        "service": "xpharma-ai-agent-worker",
        "circuit_breaker": {
            "name": llm_circuit_breaker.name,
            "state": llm_circuit_breaker.state.value,
            "failure_count": llm_circuit_breaker.failure_count,
        }
    }
