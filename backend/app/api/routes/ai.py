import logging
from fastapi import APIRouter, Depends, HTTPException
from app.api.deps import get_current_user
from app.models.user import User
from app.services.ai.ai_service import AIService
from app.services.ai.agent_tools import AGENT_TOOLS

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/ai", tags=["AI"])
ai_service = AIService()


@router.get("/models")
async def list_models(current_user: User = Depends(get_current_user)):
    """List all available AI models from Ollama and OpenRouter."""
    ollama_models = await ai_service.list_ollama_models()
    openrouter_models = await ai_service.list_openrouter_models()
    return {
        "ollama": ollama_models,
        "openrouter": openrouter_models,
    }


from pydantic import BaseModel

class PullModelBody(BaseModel):
    model_name: str


@router.post("/ollama/pull")
async def pull_ollama_model(
    payload: PullModelBody,
    current_user: User = Depends(get_current_user),
):
    """Pull a model into the local Ollama instance."""
    try:
        result = await ai_service.pull_ollama_model(payload.model_name)
        return {"status": "ok", "detail": result}
    except Exception as e:
        logger.error(f"Failed to pull model {payload.model_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tools")
async def list_agent_tools(current_user: User = Depends(get_current_user)):
    """List available agent tools."""
    return {
        "tools": [
            {
                "name": t["function"]["name"],
                "description": t["function"]["description"],
            }
            for t in AGENT_TOOLS
        ]
    }
