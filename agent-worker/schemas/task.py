from enum import Enum
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from datetime import datetime, timezone

class TaskType(str, Enum):
    DRUG_ALTERNATIVE = "drug_alternative"
    INVOICE_AUDIT = "invoice_audit"
    INVENTORY_ANALYSIS = "inventory_analysis"
    CLINICAL_QUERY = "clinical_query"

class TaskStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    DEGRADED = "degraded"

class TaskCreateRequest(BaseModel):
    task_type: TaskType = Field(default=TaskType.DRUG_ALTERNATIVE)
    prompt: str = Field(..., description="Prompt or query from the pharmacist")
    context: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Metadata: tenant_id, pharmacy_code, items")
    stream: bool = Field(default=False, description="Whether to request streaming responses")

class TaskCreateResponse(BaseModel):
    task_id: str
    status: TaskStatus = TaskStatus.PENDING
    message: str = "تم إدراج المهمة في طابور المعالجة بنجاح"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class TaskStatusResponse(BaseModel):
    task_id: str
    status: TaskStatus
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    execution_time_ms: Optional[float] = None
