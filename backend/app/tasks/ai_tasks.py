from app.core.celery_app import celery_app

@celery_app.task(bind=True)
def run_agent_task(self, chat_id: str, user_id: str, message: str):
    """Background task for long-running AI agent operations"""
    pass  # Implemented in AI service
