from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # App
    app_name: str = "CUVR Reality API"
    environment: str = "development"
    frontend_url: str = "http://localhost:3000"

    # Database
    database_url: str

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # JWT
    secret_key: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 30

    # AWS S3
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    aws_region: str = "us-east-1"
    s3_bucket_name: str = "cuvr-reality-assets"
    use_local_storage: bool = False

    # Social Auth
    google_client_id: str = ""
    apple_client_id: str = ""

    # Luma AI (Gaussian Splatting)
    luma_api_key: str = ""

    # Replicate (optional — paid)
    replicate_api_token: str = ""

    # HuggingFace (free alternative to Replicate)
    huggingface_token: str = ""

    # Remote worker support (Colab / RunPod / AWS)
    # Set this on the remote worker so it fetches/stores files via the Mac backend
    remote_backend_url: str = ""  # e.g. https://xxxx.ngrok-free.app

    # Email (SMTP)
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "noreply@cuvr.ae"

    # Stripe
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_starter_price_id: str = ""
    stripe_pro_price_id: str = ""
    stripe_enterprise_price_id: str = ""

    class Config:
        env_file = ".env"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
