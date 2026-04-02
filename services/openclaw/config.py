from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    # Data service
    data_server_url: str = Field(default="http://data-server:3002", env="DATA_SERVER_URL")
    internal_service_token: str = Field(default="", env="INTERNAL_SERVICE_TOKEN")

    # LLM configuration
    llm_api_base_url: str = Field(default="https://api.openai.com/v1", env="LLM_API_BASE_URL")
    llm_api_key: str = Field(default="", env="LLM_API_KEY")
    llm_model: str = Field(default="gpt-4o", env="LLM_MODEL")

    # Limits
    max_code_length_chars: int = Field(default=100000, env="MAX_CODE_LENGTH_CHARS")

    # Runtime
    env: str = Field(default="production", env="ENV")
    port: int = Field(default=8001, env="PORT")

    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()
