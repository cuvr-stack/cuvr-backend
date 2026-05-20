import io
import boto3
from pathlib import Path
from app.core.config import settings

_s3_client = None

# Local uploads directory — used when AWS credentials are not configured
UPLOADS_DIR = Path(__file__).parent.parent.parent / "uploads"


def _use_local() -> bool:
    return settings.use_local_storage or not settings.aws_access_key_id


def get_s3_client():
    global _s3_client
    if _s3_client is None:
        _s3_client = boto3.client(
            "s3",
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
            region_name=settings.aws_region,
        )
    return _s3_client


def _local_url(key: str) -> str:
    base = (settings.public_api_url or "http://localhost:8000").rstrip("/")
    return f"{base}/uploads/{key}"


def _s3_url(key: str) -> str:
    return f"https://{settings.s3_bucket_name}.s3.{settings.aws_region}.amazonaws.com/{key}"


async def upload_file_to_s3(content: bytes, key: str, content_type: str) -> str:
    if _use_local():
        path = UPLOADS_DIR / key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        return _local_url(key)
    client = get_s3_client()
    client.put_object(Bucket=settings.s3_bucket_name, Key=key, Body=content, ContentType=content_type)
    return _s3_url(key)


def upload_bytes_to_s3(content: bytes, key: str, content_type: str = "application/octet-stream") -> str:
    if _use_local():
        # Remote worker (Colab): POST file to Mac backend, which saves it locally
        if settings.remote_backend_url:
            import httpx
            resp = httpx.post(
                f"{settings.remote_backend_url}/api/internal/store-file",
                content=content,
                params={"key": key},
                headers={"Content-Type": content_type},
                timeout=60,
            )
            resp.raise_for_status()
            return _local_url(key)
        path = UPLOADS_DIR / key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        return _local_url(key)
    client = get_s3_client()
    client.put_object(Bucket=settings.s3_bucket_name, Key=key, Body=content, ContentType=content_type)
    return _s3_url(key)


def download_bytes(url: str) -> bytes:
    """Download a file from local storage, S3, or remote backend (Colab mode)."""
    # Determine if this is a local-storage URL (localhost OR our public API URL)
    public_base = (settings.public_api_url or "").rstrip("/")
    is_local_url = (
        url.startswith("http://localhost")
        or url.startswith("http://127.0.0.1")
        or (public_base and url.startswith(public_base))
    )
    if is_local_url:
        # Remote worker: fetch via the exposed backend URL instead of local filesystem
        if settings.remote_backend_url:
            import httpx
            fetch_url = url
            if url.startswith("http://localhost:8000"):
                fetch_url = url.replace("http://localhost:8000", settings.remote_backend_url)
            elif public_base and url.startswith(public_base):
                fetch_url = url.replace(public_base, settings.remote_backend_url)
            return httpx.get(fetch_url, timeout=60).content
        key = url.split("/uploads/", 1)[1]
        return (UPLOADS_DIR / key).read_bytes()
    # S3 URL
    key = url.split(".amazonaws.com/", 1)[1]
    client = get_s3_client()
    response = client.get_object(Bucket=settings.s3_bucket_name, Key=key)
    return response["Body"].read()


def generate_presigned_url(key: str, expiry: int = 3600) -> str:
    if _use_local():
        return _local_url(key)
    client = get_s3_client()
    return client.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.s3_bucket_name, "Key": key},
        ExpiresIn=expiry,
    )
