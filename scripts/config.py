import os
import yaml
from pathlib import Path
from typing import Any
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

class Config:
    _instance = None
    _config = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._load()
        return cls._instance

    def _load(self):
        config_path = Path(__file__).parent.parent / "config" / "rag_config.yaml"
        with open(config_path, "r") as f:
            self._config = yaml.safe_load(f)
        
        self._config = self._substitute_env_vars(self._config)

    def _substitute_env_vars(self, obj):
        if isinstance(obj, dict):
            return {k: self._substitute_env_vars(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [self._substitute_env_vars(item) for item in obj]
        elif isinstance(obj, str) and obj.startswith("${") and obj.endswith("}"):
            env_var = obj[2:-1]
            return os.getenv(env_var, obj)
        return obj

    def get(self, *keys, default=None):
        val = self._config
        for key in keys:
            if isinstance(val, dict):
                val = val.get(key)
            else:
                return default
            if val is None:
                return default
        return val

    @property
    def openai(self):
        return self._config.get("openai", {})

    @property
    def chunking(self):
        return self._config.get("chunking", {})

    @property
    def retrieval(self):
        return self._config.get("retrieval", {})

    @property
    def redis(self):
        return self._config.get("redis", {})

    @property
    def chromadb(self):
        return self._config.get("chromadb", {})

    @property
    def postgresql(self):
        return self._config.get("postgresql", {})

    @property
    def watcher(self):
        return self._config.get("watcher", {})


def get_config():
    return Config()
