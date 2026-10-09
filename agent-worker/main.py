import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from core.config import settings
from api.routes import router as api_router
from api.ws import ws_router
from services.worker import task_manager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Launch background worker loop
    worker_task = asyncio.create_task(task_manager.worker_loop())
    print(f"[{settings.PROJECT_NAME}] Background worker loop started.")
    yield
    # Shutdown: Stop worker loop
    task_manager.stop()
    worker_task.cancel()
    print(f"[{settings.PROJECT_NAME}] Shutdown completed.")

app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    description="Microservice AI Agent Worker for XPharma - Pharmacist assistant & ERP intelligence",
    lifespan=lifespan,
)

# Global CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)
app.include_router(ws_router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=settings.HOST, port=settings.PORT, reload=True)
