"""
备份管理模块
在删除操作前自动备份存储数据，最多保留指定份数。
"""
import shutil
from datetime import datetime
from pathlib import Path
from typing import List, Optional


class BackupManager:
    def __init__(self, storage_dir: Path, max_backups: int = 3):
        self.storage_dir = storage_dir
        self.max_backups = max_backups

    # 存储文件模式
    BACKUP_PATTERNS = [
        "prompts.json", "images.json", "categories.json",
        "*.prompts.json", "*.images.json", "*.categories.json",
    ]

    def create_backup(self) -> Optional[Path]:
        """创建备份，返回备份目录路径。无文件可备份时返回 None。"""
        files_to_backup = self._collect_files()
        if not files_to_backup:
            return None

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_dir = self.storage_dir / f"backup_{timestamp}"
        backup_dir.mkdir(exist_ok=True)

        for f in files_to_backup:
            shutil.copy2(f, backup_dir / f.name)

        self._cleanup_old_backups()
        return backup_dir

    def list_backups(self) -> List[dict]:
        """列出所有备份（时间戳、大小、文件数）。"""
        backups = []
        for d in sorted(self.storage_dir.glob("backup_*")):
            if not d.is_dir():
                continue
            files = list(d.iterdir())
            total_size = sum(f.stat().st_size for f in files if f.is_file())
            backups.append({
                "name": d.name,
                "path": str(d),
                "file_count": len(files),
                "total_size": total_size,
            })
        return backups

    def _collect_files(self) -> List[Path]:
        """收集所有需要备份的存储文件。"""
        files = []
        for pattern in self.BACKUP_PATTERNS:
            files.extend(self.storage_dir.glob(pattern))
        return files

    def _cleanup_old_backups(self):
        """保留最新的 max_backups 份，删除其余。"""
        backup_dirs = sorted(
            [d for d in self.storage_dir.glob("backup_*") if d.is_dir()],
            key=lambda d: d.name,
        )
        while len(backup_dirs) > self.max_backups:
            oldest = backup_dirs.pop(0)
            shutil.rmtree(oldest, ignore_errors=True)
