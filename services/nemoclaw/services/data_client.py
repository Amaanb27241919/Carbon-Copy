import logging
import httpx
from config import settings

logger = logging.getLogger("nemoclaw")


async def save_output(
    input_data: dict,
    output_data: dict,
    metadata: dict | None = None,
) -> str:
    """
    Persist a model output record to the data-server under the 'nemoclaw' project.

    Returns:
        str — the UUID of the created record, or "not-persisted" on failure.
    """
    payload = {
        "projectName": "nemoclaw",
        "inputData": input_data,
        "outputData": output_data,
        "metadata": metadata or {},
    }

    headers = {
        "Authorization": f"Bearer {settings.internal_service_token}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(
            f"{settings.data_server_url}/outputs",
            json=payload,
            headers=headers,
        )
        response.raise_for_status()
        data = response.json()
        return str(data.get("id", "unknown"))
