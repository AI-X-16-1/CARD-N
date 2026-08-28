import asyncio
import uuid
from pathlib import Path

import httpx

from cardcreate.config import ComfyUISettings


class ComfyUIGenerationError(Exception):
    pass


class ComfyUIClient:
    def __init__(self, settings: ComfyUISettings):
        self.settings = settings
        self.client_id = uuid.uuid4().hex

    async def upload_image(self, image_bytes: bytes, filename: str) -> str:
        # Always upload under a unique name (never overwrite=true on the
        # caller's filename) - ComfyUI's input/ dir is shared, real files
        # (e.g. a team member's sample cards) live there, and overwriting one
        # in place previously clobbered it with our preprocessed version.
        suffix = Path(filename).suffix or ".png"
        unique_filename = f"cardn_{uuid.uuid4().hex}{suffix}"

        async with httpx.AsyncClient(
            base_url=self.settings.base_url, timeout=self.settings.request_timeout_seconds
        ) as http:
            response = await http.post(
                "/upload/image",
                files={"image": (unique_filename, image_bytes)},
                data={"type": "input", "overwrite": "false"},
            )
            response.raise_for_status()
            return response.json()["name"]

    async def queue_prompt(self, workflow: dict) -> str:
        async with httpx.AsyncClient(
            base_url=self.settings.base_url, timeout=self.settings.request_timeout_seconds
        ) as http:
            response = await http.post(
                "/prompt", json={"prompt": workflow, "client_id": self.client_id}
            )
            response.raise_for_status()
            return response.json()["prompt_id"]

    async def wait_for_image(self, prompt_id: str, output_node_id: str = "output") -> bytes:
        async with httpx.AsyncClient(
            base_url=self.settings.base_url, timeout=self.settings.request_timeout_seconds
        ) as http:
            elapsed = 0.0
            while elapsed < self.settings.request_timeout_seconds:
                history_response = await http.get(f"/history/{prompt_id}")
                history_response.raise_for_status()
                history = history_response.json()

                entry = history.get(prompt_id)
                if entry:
                    status = entry.get("status", {})
                    if status.get("status_str") == "error":
                        # ComfyUI reports a failed run (bad model name, OOM, a
                        # missing custom node, ...) here - `outputs` just stays
                        # empty, so without this check the loop polls until the
                        # timeout and then raises a misleading "timed out".
                        raise ComfyUIGenerationError(
                            f"ComfyUI failed to run prompt {prompt_id}: "
                            f"{status.get('messages', status)}"
                        )
                    if entry.get("outputs", {}).get(output_node_id):
                        image_info = entry["outputs"][output_node_id]["images"][0]
                        view_response = await http.get(
                            "/view",
                            params={
                                "filename": image_info["filename"],
                                "subfolder": image_info.get("subfolder", ""),
                                "type": image_info.get("type", "output"),
                            },
                        )
                        view_response.raise_for_status()
                        return view_response.content

                await asyncio.sleep(self.settings.poll_interval_seconds)
                elapsed += self.settings.poll_interval_seconds

        raise ComfyUIGenerationError(f"Timed out waiting for ComfyUI prompt {prompt_id}")
