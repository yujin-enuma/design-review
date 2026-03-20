import httpx
import os


class DriveClient:
    def __init__(self):
        self.base_url = os.environ.get("DJANGO_BASE_URL", "https://enumalabs.com")
        self.app_id = os.environ.get("APP_ID", "")

    async def list_folder(self, folder_id: str) -> dict:
        url = f"{self.base_url}/__internal/app/{self.app_id}/drive/"
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(url, params={"folderId": folder_id})
            resp.raise_for_status()
            return resp.json()

    async def get_file_content(self, file_id: str) -> str:
        url = f"{self.base_url}/__internal/app/{self.app_id}/drive/{file_id}/content/"
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            return resp.text

    async def export_file(self, file_id: str) -> bytes:
        url = f"{self.base_url}/__internal/app/{self.app_id}/drive/{file_id}/export/"
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            return resp.content
