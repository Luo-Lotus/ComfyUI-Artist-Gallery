"""
Migration 端点
"""
from aiohttp import web
import server
from ..storage import migrate_to_composite_key, _resolve_storage_dir


# ============ Migration API ============

@server.PromptServer.instance.routes.post("/artist_gallery/migrate")
async def migrate_data(request):
    """
    迁移数据到组合键架构
    从 UUID 架构迁移到 (categoryId, name) 组合键架构
    """
    try:
        # 获取存储目录
        storage_dir = _resolve_storage_dir()

        # 执行迁移
        result = migrate_to_composite_key(storage_dir)

        if result["success"]:
            return web.json_response({
                "success": True,
                "message": result["message"],
                "backup_dir": result["backup_dir"],
                "validation": result["validation"]
            })
        else:
            return web.json_response({
                "success": False,
                "error": result["message"],
                "backup_dir": result.get("backup_dir")
            }, status=500)

    except Exception as e:
        return web.json_response({
            "success": False,
            "error": f"迁移失败: {str(e)}"
        }, status=500)
