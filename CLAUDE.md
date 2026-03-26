# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Artist Gallery is a ComfyUI custom node plugin that provides a draggable floating button and modal interface for browsing artist reference images stored in the ComfyUI output directory. Images are automatically detected by filename pattern (`@artist_name,_number.ext`).

## Architecture

### Backend (Python)
- **`__init__.py`**: Plugin entry point - registers node classes with ComfyUI via `NODE_CLASS_MAPPINGS` and `NODE_DISPLAY_NAME_MAPPINGS`. Sets `WEB_DIRECTORY = "./web"` for frontend assets.
- **`nodes.py`**: Contains `ArtistGallery` node class and HTTP route handlers:
  - `ArtistGallery` class: ComfyUI output node (no actual workflow output, exists for UI)
  - `GET /artist_gallery/data`: Scans output directory and returns JSON of artist images
  - `scan_output_directory()`: Uses `folder_paths.get_output_directory()` to get ComfyUI's output path, then recursively scans for images matching the artist filename pattern
  - `parse_artist_name()`: Uses regex `ARTIST_REGEX` to extract artist name from filenames like `@artist_name,_1.png`

### Frontend (JavaScript)
- **`web/artist_gallery.js`**: Vanilla JavaScript extension that:
  - Injects a draggable floating button (🎨) into the ComfyUI page
  - Opens an in-page modal (not new window) when clicked
  - Fetches data from `/artist_gallery/data` API endpoint
  - Stores button position and favorite artists in `localStorage`
  - Implements search, sort, and image preview features

## Image Filename Pattern

Images must be named following this pattern to be detected:
```
@artist_name,_number.extension
```

Examples: `@mike,_1.png`, `@sarah,_2.jpg`

Supported formats: `.png`, `.jpg`, `.jpeg`, `.webp`

## Development Workflow

### Testing Changes
1. Modify Python files (`nodes.py`, `__init__.py`) - requires **ComfyUI restart**
2. Modify JavaScript (`web/artist_gallery.js`) - requires **browser refresh** (hard refresh: Ctrl+Shift+R)

### Viewing Errors
- **Backend**: Check ComfyUI console/terminal output
- **Frontend**: Open browser DevTools (F12) - Console tab shows JavaScript errors

### API Testing
- Access `http://localhost:8188/artist_gallery/data` directly in browser or use curl
- ComfyUI default port is 8188

## Key Integration Points

- **ComfyUI Server**: Uses `server.PromptServer.instance.routes` decorator to register HTTP endpoints
- **Output Directory**: Uses `folder_paths.get_output_directory()` to locate ComfyUI's output folder
- **Frontend Loading**: ComfyUI automatically loads JavaScript files from the `WEB_DIRECTORY` path

## Common Tasks

### Adding New API Endpoints
```python
@server.PromptServer.instance.routes.get("/artist_gallery/your-endpoint")
async def your_handler(request):
    return web.json_response({"data": "value"})
```

### Modifying Filename Pattern
Update `ARTIST_REGEX` in `nodes.py`. Current pattern:
```python
r'^@([^,]+?)(?:,+\s*)?(?:_\d+)?\.(png|jpg|jpeg|webp)$'
```

### Adding Frontend Features
Edit `web/artist_gallery.js`. The file is plain JavaScript - no build step required. Changes take effect on browser refresh.
