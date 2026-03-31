"""
Cycle State 端点
"""
from aiohttp import web
import server


# ============ Cycle State API ============

# 全局循环状态存储
_cycle_states = {}  # node_id -> cycle_index


@server.PromptServer.instance.routes.post("/artist_gallery/cycle-state")
async def save_cycle_state(request):
    """保存循环状态"""
    try:
        data = await request.json()
        node_id = data.get("node_id")
        cycle_index = data.get("cycle_index", 0)

        if not node_id:
            return web.json_response({"error": "缺少node_id参数"}, status=400)

        _cycle_states[node_id] = cycle_index

        return web.json_response({
            "success": True,
            "cycle_index": cycle_index
        })
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.get("/artist_gallery/cycle-state")
async def get_cycle_state(request):
    """获取循环状态"""
    try:
        node_id = request.query.get("node_id")

        if not node_id:
            return web.json_response({"error": "缺少node_id参数"}, status=400)

        cycle_index = _cycle_states.get(node_id, 0)

        return web.json_response({
            "cycle_index": cycle_index
        })
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.post("/artist_gallery/cycle-state/reset")
async def reset_cycle_state(request):
    """重置循环状态"""
    try:
        data = await request.json()
        node_id = data.get("node_id")

        if not node_id:
            return web.json_response({"error": "缺少node_id参数"}, status=400)

        if node_id in _cycle_states:
            del _cycle_states[node_id]

        return web.json_response({
            "success": True
        })
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)
