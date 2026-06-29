from ..storage._config import get_enable_cover_fallback
from ..storage._resolve import _resolve_storage_dir


def cover_fallback_enabled() -> bool:
    return get_enable_cover_fallback(_resolve_storage_dir())
