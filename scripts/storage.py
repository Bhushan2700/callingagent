import os
import boto3
from pathlib import Path

class B2Storage:
    def __init__(self):
        endpoint = os.getenv("B2_ENDPOINT", "https://s3.us-west-004.backblazeb2.com")
        key_id = os.getenv("B2_ACCESS_KEY", "")
        app_key = os.getenv("B2_SECRET_KEY", "")
        self.bucket = os.getenv("B2_BUCKET", "loggix-tenants")
        self._local = not (key_id and app_key)

        if not self._local:
            self.s3 = boto3.client(
                "s3",
                endpoint_url=endpoint,
                aws_access_key_id=key_id,
                aws_secret_access_key=app_key,
            )

    def _local_path(self, tenant_id, filename):
        p = Path(__file__).parent.parent / "data" / "storage" / tenant_id
        p.mkdir(parents=True, exist_ok=True)
        return p / filename

    def upload(self, tenant_id, filename, content):
        key = f"tenants/{tenant_id}/{filename}"
        if self._local:
            self._local_path(tenant_id, filename).write_bytes(content)
            return key
        self.s3.put_object(Bucket=self.bucket, Key=key, Body=content)
        return key

    def download(self, tenant_id, filename):
        key = f"tenants/{tenant_id}/{filename}"
        if self._local:
            p = self._local_path(tenant_id, filename)
            return p.read_bytes() if p.exists() else None
        obj = self.s3.get_object(Bucket=self.bucket, Key=key)
        return obj["Body"].read()

    def delete(self, tenant_id, filename):
        key = f"tenants/{tenant_id}/{filename}"
        if self._local:
            self._local_path(tenant_id, filename).unlink(missing_ok=True)
            return
        self.s3.delete_object(Bucket=self.bucket, Key=key)

    def list_files(self, tenant_id):
        if self._local:
            p = Path(__file__).parent.parent / "data" / "storage" / tenant_id
            return [f.name for f in p.iterdir()] if p.exists() else []
        prefix = f"tenants/{tenant_id}/"
        resp = self.s3.list_objects_v2(Bucket=self.bucket, Prefix=prefix)
        return [obj["Key"].replace(prefix, "") for obj in resp.get("Contents", [])]

    def exists(self, tenant_id, filename) -> bool:
        key = f"tenants/{tenant_id}/{filename}"
        if self._local:
            return self._local_path(tenant_id, filename).exists()
        try:
            self.s3.head_object(Bucket=self.bucket, Key=key)
            return True
        except:
            return False

storage = B2Storage()
