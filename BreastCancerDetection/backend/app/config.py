from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # protected_namespaces=() lets us use model_path / model_gcs_uri without pydantic warnings.
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", protected_namespaces=())

    # Weights: a local path wins; otherwise we try the GCS URI at startup (Day 6).
    model_path: str | None = None
    model_gcs_uri: str | None = None

    # Operating point. model_metadata.json (shipped with the weights) overrides decision_threshold.
    decision_threshold: float = 0.5
    uncertainty_margin: float = 0.15

    allowed_origins: str = "http://localhost:3000"
    max_upload_mb: int = 10

    gemini_api_key: str | None = None
    # flash-lite has a more generous free tier than flash; override via GEMINI_MODEL if needed.
    gemini_model: str = "gemini-2.5-flash-lite"


settings = Settings()
