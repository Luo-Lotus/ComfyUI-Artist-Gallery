# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Artist Gallery is a ComfyUI custom node plugin that provides:
- **Floating gallery UI**: Draggable button (🎨) with modal interface for browsing artist reference images
- **Storage system**: JSON-based persistence for artists and image-artist mappings
- **Custom nodes**: ArtistGallery (UI), ArtistSelector (workflow integration), SaveToGallery (saving images)
- **Automatic detection**: Scans ComfyUI output directory for images matching `@artist_name,_number.ext` pattern

## Architecture

### Backend (Python)

**`__init__.py`**: Plugin entry point
- Registers three node classes via `NODE_CLASS_MAPPINGS` and `NODE_DISPLAY_NAME_MAPPINGS`
- Sets `WEB_DIRECTORY = "./web"` for frontend assets

**`nodes.py`**: Node classes and HTTP API endpoints
- **ArtistGallery**: Output node for UI (no workflow output)
- **ArtistSelector**: Workflow node that provides artist selection widget
- **SaveToGallery**: Saves generated images to the gallery system
- **HTTP Endpoints**:
  - `GET /artist_gallery/data`: Scans output directory, returns artist images JSON
  - `POST /artist_gallery/artists`: CRUD operations for artists (add, update, delete)
  - `POST /artist_gallery/mappings`: Image-artist mapping operations
- **Key functions**:
  - `scan_output_directory()`: Uses `folder_paths.get_output_directory()` to scan for matching images
  - `parse_artist_name()`: Extracts artist name using `ARTIST_REGEX` pattern
  - `decode_filename()`: Handles URL-encoded filenames

**`storage.py`**: Data persistence layer
- **ArtistStorage**: Manages artist data in `artists.json`
  - CRUD operations: `add_artist()`, `get_artist_by_id/name()`, `update_artist()`, `delete_artist()`
  - Batch operations: `add_artists_batch()`
  - Thread-safe with locking mechanism
- **ImageMappingStorage**: Manages image-artist relationships in `image_artists.json`
  - Links images to multiple artists
  - Tracks metadata (dimensions, save timestamp)
  - Cleanup operations when artists are deleted
- Storage directory: Plugin root (`artists.json`, `image_artists.json`)

### Frontend (JavaScript/Preact)

**`web/artist_gallery.js`**: Main entry point
- Loads Preact library and hooks from `./lib/` directory
- Injects draggable floating button (🎨) into ComfyUI page
- Manages button position persistence via `localStorage`
- Orchestrates modal rendering with GalleryModal component

**Component Architecture** (modular Preact components):
- **`components/GalleryModal.js`**: Main container with state management
  - Manages data fetching, search, sorting, favorites
  - Handles artist CRUD operations
- **`components/GalleryHeader.js`**: Search bar, sort controls, action buttons
- **`components/GalleryGrid.js`**: Virtualized artist grid rendering
- **`components/GalleryCard.js`**: Individual artist card with image preview
- **`components/Lightbox.js`**: Full-screen image viewing with navigation
- **`nodes/ArtistSelector.js`**: Custom widget for ArtistSelector node
  - Multi-select artist picker with search
  - Displays selected artists as tags

**`web/utils.js`**: Shared utilities
- `Storage`: LocalStorage wrapper for favorites and settings
- `fetchGalleryData()`: API client for backend endpoints
- Image path resolution helpers

**`web/Draggable.js`**: Reusable drag-and-drop functionality

## Image Filename Pattern

Images are automatically detected by filename pattern:
```
@artist_name,_number.extension
```

Examples: `@mike,_1.png`, `@sarah,_2.jpg`, `@artist_name,_1.webp`

Supported formats: `.png`, `.jpg`, `.jpeg`, `.webp`

The regex pattern (`ARTIST_REGEX` in `nodes.py`): `r'^@([^,]+?)(?:,+\s*)?(?:_\d+)?\.(png|jpg|jpeg|webp)$'`

## Data Persistence

The plugin maintains two JSON files in the plugin root directory:

**`artists.json`**: Artist metadata managed by `ArtistStorage`
```json
{
  "artists": [
    {
      "id": "uuid",
      "name": "artist_name",
      "displayName": "Display Name",
      "createdAt": 1234567890000,
      "imageCount": 5
    }
  ]
}
```

**`image_artists.json`**: Image-to-artist mappings managed by `ImageMappingStorage`
```json
{
  "mappings": [
    {
      "imagePath": "relative/path/to/image.png",
      "artistIds": ["uuid1", "uuid2"],
      "savedAt": 1234567890000,
      "metadata": {"width": 1024, "height": 1024}
    }
  ]
}
```

## Development Workflow

### Testing Changes
1. **Python files** (`nodes.py`, `storage.py`, `__init__.py`): Requires **ComfyUI restart**
2. **JavaScript/Preact files** (`web/**/*.js`): Requires **browser refresh** (hard refresh: Ctrl+Shift+R)
3. **CSS files** (`web/styles/*.css`): Requires **browser refresh**

### Debugging
- **Backend errors**: Check ComfyUI console/terminal output
- **Frontend errors**: Open browser DevTools (F12) → Console tab
- **Network issues**: DevTools → Network tab, filter by `/artist_gallery/`

### API Testing
- Base URL: `http://localhost:8188` (ComfyUI default port)
- Endpoints:
  - `GET /artist_gallery/data` - List all artist images
  - `POST /artist_gallery/artists` - Artist CRUD operations
  - `POST /artist_gallery/mappings` - Image-artist mapping operations

## Key Integration Points

- **ComfyUI Server**: Uses `server.PromptServer.instance.routes` decorator for HTTP endpoints
- **Output Directory**: Uses `folder_paths.get_output_directory()` to locate ComfyUI's output folder
- **Frontend Loading**: ComfyUI auto-loads ES modules from `WEB_DIRECTORY` path
- **Preact Integration**: Loads `preact.mjs` and `hooks.mjs` from `./lib/` directory
- **Node Widgets**: Uses `app.registerExtension()` with `beforeRegisterNodeDef()` hook for custom widgets

## Common Tasks

### Adding New API Endpoints
```python
@server.PromptServer.instance.routes.post("/artist_gallery/your-endpoint")
async def your_handler(request):
    data = await request.json()
    # Process data...
    return web.json_response({"status": "success"})
```

### Modifying Filename Pattern
Update `ARTIST_REGEX` in [nodes.py:13](nodes.py#L13). Current pattern handles:
- Optional commas after artist name
- Optional number suffix
- Case-insensitive extension matching

### Adding Preact Components
1. Create component file in `web/components/` (e.g., `MyComponent.js`)
2. Import and use in parent component:
```javascript
import { MyComponent } from './components/MyComponent.js';
```
3. Use Preact hooks from global `self.preactHooks` object

### Working with Storage
```python
# Get storage instances
from .storage import get_storage
artist_storage, mapping_storage = get_storage()

# Add artist
artist = artist_storage.add_artist("name", "Display Name")

# Add image mapping
mapping_storage.add_mapping("path/to/image.png", [artist_id], metadata)
```

### Frontend State Management
Components use Preact hooks from `self.preactHooks`:
- `useState`, `useEffect`, `useCallback`, `useMemo`, `useRef`
- Access via: `const { useState, useEffect } = self.preactHooks;`
