import logging
import json
import urllib.request
import urllib.error
from config import settings

logger = logging.getLogger("openclaw")

MODEL_ROUTER_URL = "http://model-router:3004"


def _call_model_router(messages: list, max_tokens: int = 2000) -> dict:
    """Call the Carbon-Copy model-router via OpenAI-compatible endpoint."""
    payload = json.dumps({
        "model": settings.llm_model,
        "messages": messages,
        "max_tokens": max_tokens,
    }).encode()
    req = urllib.request.Request(
        f"{MODEL_ROUTER_URL}/v1/chat/completions",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            result = json.loads(resp.read())
        content = result.get("choices", [{}])[0].get("message", {}).get("content", "")
        tokens = result.get("usage", {}).get("total_tokens", 0)
        return {"content": content, "tokens_used": tokens}
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        logger.error(f"Model router error {e.code}: {body}")
        raise RuntimeError(f"LLM service error: {body}")
    except Exception as e:
        logger.error(f"Model router call failed: {e}")
        raise RuntimeError(f"LLM service error: {e}")


async def analyze_code(code: str, language: str) -> dict:
    """Analyze code for bugs, complexity issues, and improvement suggestions."""
    system_prompt = (
        "You are an expert code reviewer and software architect. "
        "Analyze the provided code thoroughly and return a structured report covering:\n"
        "1. **Bugs & errors** — identify any logic bugs, off-by-one errors, null-pointer risks, etc.\n"
        "2. **Security issues** — highlight any security vulnerabilities.\n"
        "3. **Performance** — note any inefficiencies.\n"
        "4. **Code quality** — comment on readability, naming, complexity.\n"
        "5. **Recommendations** — provide concrete, actionable improvement suggestions.\n"
        "Be specific and reference line numbers or patterns where possible."
    )
    user_prompt = f"Language: {language}\n\nCode to analyze:\n```{language}\n{code}\n```"
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]
    result = _call_model_router(messages, max_tokens=2000)
    return {"analysis": result["content"], "tokens_used": result["tokens_used"]}


async def generate_code(prompt: str, language: str) -> dict:
    """Generate code from a natural language description."""
    system_prompt = (
        f"You are an expert {language} developer. "
        "Generate clean, well-documented, production-ready code based on the user's request. "
        "Include inline comments explaining key logic. "
        "Return only the code and brief inline documentation — no lengthy explanations outside the code."
    )
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": prompt},
    ]
    result = _call_model_router(messages, max_tokens=2000)
    return {"code": result["content"], "tokens_used": result["tokens_used"]}
