import json
import logging
import re
from typing import Optional, List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timezone

from app.models.repository import Repository
from app.models.issue import RepoSummary
from app.models.interview import InterviewPrepQuestion
from app.models.user import User
from app.services.ai.ai_service import AIService, AIMessage

logger = logging.getLogger(__name__)


class InterviewService:
    """Service to handle AI interview question generation and response review."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.ai_service = AIService()

    async def _resolve_ai_model(self, user_id: str) -> tuple[str, str]:
        """
        Determine which AI provider and model to use for interview actions.
        Checks user settings for override, otherwise falls back to defaults.
        """
        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        
        provider = "ollama"
        model_name = "llama3:8b"  # Default fallback

        if user and user.settings:
            # Check user override
            interview_model = user.settings.get("interview_model")
            if interview_model:
                colon_idx = interview_model.find(":")
                if colon_idx > 0:
                    return interview_model[:colon_idx], interview_model[colon_idx + 1:]
                return "ollama", interview_model

            # Check default chat model
            default_chat = user.settings.get("default_chat_model")
            if default_chat:
                colon_idx = default_chat.find(":")
                if colon_idx > 0:
                    return default_chat[:colon_idx], default_chat[colon_idx + 1:]
                return "ollama", default_chat

        return provider, model_name

    def _clean_json_text(self, text: str) -> str:
        """Remove markdown code blocks or wrapping texts around JSON."""
        text = text.strip()
        # Find JSON array start and end
        match = re.search(r"(\[.*\])", text, re.DOTALL)
        if match:
            return match.group(1)
        
        # Fallback manual trimming
        if text.startswith("```json"):
            text = text[7:]
        elif text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        return text.strip()

    async def generate_questions(
        self,
        repo_id: str,
        user_id: str,
        count: int = 5,
        category: Optional[str] = None,
        difficulty: str = "Medium",
    ) -> List[InterviewPrepQuestion]:
        """
        Analyze the repository and generate interview questions for a specified category and difficulty.
        If category is None, automatically generate a mixed set.
        """
        # Fetch Repository
        repo_result = await self.db.execute(select(Repository).where(Repository.id == repo_id))
        repo = repo_result.scalar_one_or_none()
        if not repo:
            raise ValueError(f"Repository not found: {repo_id}")

        # Fetch Repository Summary
        summary_result = await self.db.execute(
            select(RepoSummary).where(RepoSummary.repository_id == repo_id)
        )
        summary = summary_result.scalar_one_or_none()
        if not summary:
            raise ValueError(f"Repository summary/indexing is not ready: {repo_id}")

        # Resolve Model Configuration
        provider, model_name = await self._resolve_ai_model(user_id)
        logger.info(
            f"Generating {count} interview questions for {repo.full_name} using {provider}/{model_name}"
        )

        # Build repository context
        repo_context = f"""Repository full name: {repo.full_name}
Summary: {summary.summary_text or 'AI indexed repository'}
Total files: {summary.total_files}
Languages: {json.dumps(summary.languages_json)}

Here are key files and code snippets/previews from the repository to ground your questions in its actual codebase, design patterns, APIs, and business logic:
"""

        for kf in summary.key_files_json[:12]:  # Limit to top 12 key files to fit context window safely
            repo_context += f"\n---\nFile: {kf['path']}\nLanguage: {kf['language']}\nPreview:\n{kf.get('preview', '')}\n"

        # Determine target categories
        categories = [
            "Architecture & Design",
            "Codebase Logic & APIs",
            "Security & Vulnerabilities",
            "Performance & Scalability",
            "Testing & Quality",
        ]
        
        target_category = category if category else "General Mix"

        system_prompt = f"""You are a Principal Software Engineer interviewing candidates.
Your task is to generate precisely {count} software engineering interview preparation questions and their respective detailed model answers/rubrics based ON THE PROVIDED REPOSITORY.

The questions MUST be highly specific to this actual repository's code, APIs, structure, logic, security aspects, or performance, rather than generic textbook questions. Reference actual file structures or code blocks from the repository previews in both your questions and answers.

Category to focus on: '{target_category}'
Difficulty level: '{difficulty}'

If the category is 'General Mix', distribute the generated questions evenly among the following areas:
- 'Architecture & Design': Questions about high-level module organization, state management, components structure, or overall design patterns.
- 'Codebase Logic & APIs': Questions about specific functions, endpoints, routes, data flow, or core business logic in this repo.
- 'Security & Vulnerabilities': Questions about potential security pitfalls, authentication, access control, or input validation in this repo.
- 'Performance & Scalability': Questions about db query efficiency, caching, memory usage, algorithm bottlenecks, or code speed.
- 'Testing & Quality': Questions about testing strategies, edge cases, error handling, or code reliability in this repo.

You MUST respond ONLY with a valid JSON array of objects, containing no other conversational text or markdown explanation.
Each object in the array MUST have EXACTLY these fields:
1. "category": The category name (must be one of: 'Architecture & Design', 'Codebase Logic & APIs', 'Security & Vulnerabilities', 'Performance & Scalability', 'Testing & Quality')
2. "difficulty": The difficulty level (must be '{difficulty}')
3. "question": A clear, educational, and challenging interview question focused on this repository.
4. "answer": A comprehensive, detailed model answer/rubric explaining the correct answer, referencing actual code files or structural patterns from the repo.

Example output:
[
  {{
    "category": "Codebase Logic & APIs",
    "difficulty": "{difficulty}",
    "question": "How does the backend authenticate requests and what middleware is used in app/api/routes?",
    "answer": "The backend uses the 'get_current_user' dependency in app/api/deps.py, which extracts and decrypts the JWT token..."
  }}
]
"""

        # Query AI Service
        messages = [
            AIMessage(role="system", content=system_prompt),
            AIMessage(role="user", content=repo_context),
        ]

        try:
            response = await self.ai_service.chat(provider, model_name, messages)
            response_text = response.get("message", {}).get("content", "")
            if not response_text:
                choices = response.get("choices", [])
                if choices:
                    response_text = choices[0].get("message", {}).get("content", "")
            
            cleaned_text = self._clean_json_text(response_text)
            logger.debug(f"AI response received. Cleaned text length: {len(cleaned_text)}")
            questions_data = json.loads(cleaned_text)
            
            if not isinstance(questions_data, list):
                if isinstance(questions_data, dict) and "questions" in questions_data:
                    questions_data = questions_data["questions"]
                else:
                    raise ValueError("AI response did not return a list structure")

            created_questions = []
            for item in questions_data:
                # Fallback to category if missing
                q_cat = item.get("category")
                if q_cat not in categories:
                    q_cat = category if category else "Codebase Logic & APIs"

                db_q = InterviewPrepQuestion(
                    repository_id=repo.id,
                    user_id=User.id if isinstance(user_id, bytes) else user_id,  # safeguard
                    question=item["question"],
                    answer=item["answer"],
                    category=q_cat,
                    difficulty=item.get("difficulty", difficulty),
                    is_completed=False,
                )
                self.db.add(db_q)
                created_questions.append(db_q)

            await self.db.commit()
            logger.info(f"Successfully generated and saved {len(created_questions)} questions in database.")
            return created_questions

        except Exception as e:
            logger.error(f"Failed to generate questions: {e}", exc_info=True)
            await self.db.rollback()
            raise ValueError(f"AI Generation failed: {str(e)}")

    async def check_answer(
        self,
        question_id: str,
        user_answer: str,
        user_id: str,
    ) -> InterviewPrepQuestion:
        """
        Compare the user's answer with the model answer/rubric, generate natural language feedback,
        and update the question record in the database.
        """
        # Fetch question
        result = await self.db.execute(
            select(InterviewPrepQuestion).where(
                InterviewPrepQuestion.id == question_id,
                InterviewPrepQuestion.user_id == user_id,
            )
        )
        question = result.scalar_one_or_none()
        if not question:
            raise ValueError(f"Interview question not found: {question_id}")

        # Fetch Repository
        repo_result = await self.db.execute(
            select(Repository).where(Repository.id == question.repository_id)
        )
        repo = repo_result.scalar_one_or_none()
        repo_name = repo.full_name if repo else "this repository"

        # Resolve Model Configuration
        provider, model_name = await self._resolve_ai_model(user_id)
        logger.info(
            f"Checking answer for question {question_id} using {provider}/{model_name}"
        )

        # Build prompt context
        evaluation_context = f"""You are a Principal Software Engineer conducting a technical interview.
You are evaluating a candidate's answer to this interview question about the repository '{repo_name}'.

Question Category: {question.category}
Difficulty: {question.difficulty}

Question:
{question.question}

Model Answer / Rubric:
{question.answer}

Candidate's Answer:
{user_answer}

Provide a constructive, natural language review explaining how well the candidate answered the question.
Guidelines:
1. Be direct, professional, and encouraging.
2. Point out specifically what they got right and where they matched the rubric.
3. Highlight any key details, file paths, or core concepts they missed or got wrong.
4. Offer constructive tips for how they could improve their response in a real interview.
5. Keep the review entirely in natural language. DO NOT include any numerical scores, grades, or percentages. Just provide the textual feedback and review.
"""

        messages = [
            AIMessage(role="system", content="You are a helpful and technical software engineering interviewer."),
            AIMessage(role="user", content=evaluation_context),
        ]

        try:
            response = await self.ai_service.chat(provider, model_name, messages)
            feedback_text = response.get("message", {}).get("content", "").strip()
            if not feedback_text:
                choices = response.get("choices", [])
                if choices:
                    feedback_text = choices[0].get("message", {}).get("content", "").strip()

            if not feedback_text:
                feedback_text = "AI was unable to generate feedback. Please review your answer against the rubric."

            # Update DB
            question.user_answer = user_answer
            question.feedback = feedback_text
            question.is_completed = True
            
            await self.db.commit()
            logger.info(f"Checked answer successfully for question {question_id}")
            return question

        except Exception as e:
            logger.error(f"Failed to check answer: {e}", exc_info=True)
            await self.db.rollback()
            raise ValueError(f"AI answer review failed: {str(e)}")
