"""Configuration management via pydantic-settings."""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_prefix="PRAMANA_",
    )

    # LLM configuration
    llm_base_url: str = "https://api.ai.it.ufl.edu"
    llm_api_key: str = ""
    llm_model: str = "gpt-4o"
    llm_temperature: float = 0.1
    llm_max_tokens: int = 4096

    # Database paths
    data_dir: Path = Path("data")
    db_path: Path = Path("data/pramana.db")
    chroma_path: Path = Path("data/chroma")
    pdf_dir: Path = Path("data/pdfs")

    # API keys for paper sources
    semantic_scholar_api_key: str = ""
    pubmed_api_key: str = ""

    # API server
    api_host: str = "0.0.0.0"
    api_port: int = 8000

    def ensure_dirs(self) -> None:
        """Create data directories if they don't exist."""
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.chroma_path.mkdir(parents=True, exist_ok=True)
        self.pdf_dir.mkdir(parents=True, exist_ok=True)


def get_settings() -> Settings:
    """Get application settings (cached)."""
    return Settings()
