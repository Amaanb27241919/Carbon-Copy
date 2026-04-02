import logging
from openai import AsyncOpenAI
from config import settings

logger = logging.getLogger("openclaw")

_client: AsyncOpenAI | None = None


def get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(
            base_url=settings.llm_api_base_url,
            api_key=settings.llm_api_key,
        )
    return _client


async def analyze_code(code: str, language: str) -> dict:
    """
    Analyze code for bugs, complexity issues, and improvement suggestions.

    Returns:
        dict with keys: analysis (str), tokens_used (int)
    """
    system_prompt = (
        "You are an expert code reviewer and software architect. "
        "Analyze the provided code thoroughly and return a structured report covering:\n"
        "1. **Bugs & errors** — identify any logic bugs, off-by-one errors, null-pointer risks, etc.\n"
        "2. **Security issues** — highlight any security vulnerabilities (injections, exposed secrets, etc.)\n"
        "3. **Performance** — note any inefficiencies, N+1 queries, unnecessary allocations, etc.\n"
        "4. **Code quality** — comment on readability, naming, complexity, and adherence to idioms.\n"
        "5. **Recommendations** — provide concrete, actionable improvement suggestions.\n"
        "Be specific and reference line numbers or patterns where possible."
    )

    user_prompt = f"Language: {language}\n\nCode to analyze:\n```{language}\n{code}\n```"

    client = get_client()
    response = await client.chat.completions.create(
        model=settings.llm_model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.2,
        max_tokens=4096,
    )

    analysis = response.choices[0].message.content or ""
    tokens_used = response.usage.total_tokens if response.usage else 0

    return {"analysis": analysis, "tokens_used": tokens_used}


async def generate_code(prompt: str, language: str, context: str | None = None) -> dict:
    """
    Generate code based on a natural-language prompt.

    Returns:
        dict with keys: code (str), explanation (str), tokens_used (int)
    """
    system_prompt = (
        f"You are an expert {language} developer. Generate clean, production-ready {language} code "
        "based on the user's description. Follow language best practices and idioms.\n\n"
        "Respond with a JSON object containing exactly two keys:\n"
        '  "code": the complete code implementation\n'
        '  "explanation": a brief explanation of what the code does and key design decisions\n\n'
        "Return only the JSON — no markdown fences, no extra text."
    )

    user_content = f"Task: {prompt}"
    if context:
        user_content += f"\n\nExisting context / codebase:\n```{language}\n{context}\n```"

    client = get_client()
    response = await client.chat.completions.create(
        model=settings.llm_model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
        temperature=0.3,
        max_tokens=4096,
        response_format={"type": "json_object"},
    )

    import json
    raw = response.choices[0].message.content or "{}"
    tokens_used = response.usage.total_tokens if response.usage else 0

    try:
        parsed = json.loads(raw)
        code = parsed.get("code", "")
        explanation = parsed.get("explanation", "")
    except json.JSONDecodeError:
        logger.warning("LLM returned non-JSON response for generate_code, using raw content")
        code = raw
        explanation = ""

    return {"code": code, "explanation": explanation, "tokens_used": tokens_used}
