# XPharma AI Agent Worker Microservice

> **Microservice Name:** `agent-worker`  
> **Framework:** Python 3.11 / FastAPI / Pydantic v2 / Uvicorn  
> **Role:** Decoupled AI Agent reasoning engine, RAG formulary search, and clinical assistance.

---

## Architecture & Integration Model

```
┌────────────────────────┐                   ┌────────────────────────┐
│ Expo Mobile / Main API │                   │  agent-worker (FastAPI)│
└───────────┬────────────┘                   └───────────┬────────────┘
            │                                            │
            │ 1. POST /api/v1/tasks (Prompt + Context)   │
            ├───────────────────────────────────────────►│
            │                                            │ (Enqueue to Task Store)
            │ 2. 202 Accepted { "task_id": "ai_..." }    │
            │◄───────────────────────────────────────────┤
            │                                            │
            │ 3a. Poll GET /api/v1/tasks/{task_id}       │ ◄─── (Worker processes)
            │     OR                                     │      [Circuit Breaker]
            │ 3b. WebSocket /ws/tasks/stream (Tokens)    │      [RAG Engine]
            │◄═══════════════════════════════════════════┤
```

### Key Technical Pillars

1. **Non-Blocking Architecture:**
   - Tasks are dispatched asynchronously and return immediately with HTTP status `202 Accepted`.
   - Main API or mobile client can poll `/api/v1/tasks/{task_id}` or subscribe to `/ws/tasks/stream` for progressive token generation.

2. **Ultimate Fault Tolerance (Circuit Breaker):**
   - External LLM provider calls are isolated behind `CircuitBreaker`.
   - If an external AI provider fails or experiences rate limits 3 consecutive times, the circuit trips to `OPEN`, fast-failing and triggering the local fallback clinical guidance without hanging client threads.

3. **Grounded Clinical Knowledge (RAG Engine):**
   - Retrieves pharmaceutical alternatives and equivalent Egyptian trade names from the formulary catalog matching active ingredients and strengths.

---

## Local Development & Running

### Requirements
- Python 3.10+
- (Optional) Redis running on `localhost:6379`

### Installation
```bash
cd agent-worker
pip install -r requirements.txt
```

### Run Service
```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

---

## API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/v1/tasks` | Create AI agent task (`202 Accepted`). |
| `GET` | `/api/v1/tasks/{task_id}` | Poll task status and result. |
| `GET` | `/api/v1/health` | Liveness & Circuit Breaker status. |
| `WS` | `/ws/tasks/stream` | Real-time progressive token streaming. |
