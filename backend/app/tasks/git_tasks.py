from app.core.celery_app import celery_app

@celery_app.task(bind=True)
def clone_repo_task(self, repo_id: str, token: str, full_name: str, user_id: str, branch: str):
    """Background task for cloning repositories"""
    pass  # Implemented via background_tasks in routes for now
