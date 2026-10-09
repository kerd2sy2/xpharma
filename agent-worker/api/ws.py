from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from services.agent_service import agent_service
import json

ws_router = APIRouter(prefix="/ws", tags=["WebSockets"])

@ws_router.websocket("/tasks/stream")
async def websocket_stream_task(websocket: WebSocket):
    """
    Real-time bidirectional WebSocket stream for progressive AI token generation.
    """
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_text()
            payload = json.loads(data)
            prompt = payload.get("prompt", "")
            context = payload.get("context", {})

            await websocket.send_json({"type": "start", "message": "بدء توليد الاستجابة..."})

            async for token in agent_service.stream_task_tokens(prompt, context):
                await websocket.send_json({"type": "token", "chunk": token})

            await websocket.send_json({"type": "done", "message": "اكتملت الاستجابة."})
    except WebSocketDisconnect:
        pass
    except Exception as e:
        await websocket.send_json({"type": "error", "message": str(e)})
