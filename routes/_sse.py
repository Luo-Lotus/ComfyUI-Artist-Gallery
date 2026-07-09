"""SSE response helpers."""
import json
from aiohttp import web


async def write_sse(response, event: str, data: dict):
    payload = json.dumps(data or {}, ensure_ascii=False)
    message = f"event: {event}\ndata: {payload}\n\n"
    await response.write(message.encode("utf-8"))


async def sse_response(request, event_iter):
    response = web.StreamResponse(
        status=200,
        reason="OK",
        headers={
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
    await response.prepare(request)

    try:
        async for item in event_iter:
            await write_sse(
                response,
                item.get("event", "message"),
                item.get("data", {}),
            )
    except (ConnectionResetError, BrokenPipeError):
        pass
    except Exception as e:
        try:
            await write_sse(response, "error", {"error": str(e)})
        except Exception:
            pass
    finally:
        try:
            await response.write_eof()
        except Exception:
            pass

    return response
