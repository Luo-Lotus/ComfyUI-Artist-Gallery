# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Artist Gallery is a ComfyUI custom node plugin that provides:
- **Floating gallery UI**: Draggable button (🎨) with modal interface for browsing artist reference images
- **Storage system**: JSON-based persistence for artists and image-artist mappings
- **Custom nodes**: ArtistGallery (UI), ArtistSelector (workflow integration), SaveToGallery (saving images)
- **Toast notification system**: Modern, non-blocking user feedback
- **Dialog components**: Reusable modal dialog system
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
  - `GET /artist_gallery/artists`: List all artists
  - `DELETE /artist_gallery/artists/{id}`: Delete artist
  - `PUT /artist_gallery/artists/{id}`: Update artist
  - `POST /artist_gallery/artists/batch`: Batch add artists
  - `GET /artist_gallery/artist/{id}/images`: Get artist images

**`storage.py`**: Data persistence layer
- **ArtistStorage**: Manages artist data in `artists.json`
  - CRUD operations: `add_artist()`, `get_artist_by_id/name()`, `update_artist()`, `delete_artist()`
  - Batch operations: `add_artists_batch()`
  - Thread-safe with locking mechanism
- **ImageMappingStorage**: Manages image-artist relationships in `image_artists.json`
  - Links images to multiple artists
  - Tracks metadata (dimensions, save timestamp)
  - Cleanup operations when artists are deleted

### Frontend (JavaScript/Preact)

**Modern Architecture** (2026 refactor):
- **Standard ES6 modules**: Uses `import/export` instead of global objects
- **Component-based**: Modular, reusable components
- **Custom Hooks**: Business logic extracted into hooks
- **Service Layer**: API calls centralized in services
- **Toast Notifications**: Replaces native `alert()`
- **Dialog Components**: Reusable modal system

#### File Structure

```
web/
├── artist_gallery.js           # Main entry point
├── components/                 # Preact components
│   ├── GalleryModal.js         # Main gallery container
│   ├── GalleryHeader.js        # Search and sort controls
│   ├── GalleryGrid.js          # Artist grid layout
│   ├── GalleryCard.js          # Individual artist card
│   ├── Lightbox.js             # Full-screen image viewer
│   ├── AddArtistDialog.js      # Add/Edit artist dialog
│   ├── DeleteConfirmDialog.js  # Delete confirmation dialog
│   ├── Toast.js                # Toast notification system
│   ├── Dialog.js               # Reusable dialog component
│   └── hooks/                  # Custom hooks
│       ├── useGalleryData.js    # Data fetching
│       └── useFilteredArtists.js # Filtering & sorting
├── nodes/                      # Node-specific components
│   ├── ArtistSelector.js       # Node extension entry
│   └── components/
│       ├── ArtistSelectorWidget.js  # Preact widget
│       └── hooks/
│           └── useArtistSelector.js  # Widget logic
├── services/                   # API service layer
│   └── artistApi.js           # Artist API calls
├── utils.js                    # Shared utilities
├── Draggable.js               # Drag-and-drop
├── lib/                       # Preact library files
│   ├── preact.mjs             # Preact core
│   └── hooks.mjs              # Preact hooks
└── styles/
    └── gallery.css            # Component styles
```

#### Key Components

**Dialog System**:
- `Dialog.js`: Reusable modal component with props for title, content, footer
- `DialogButton`: Styled button component (default/primary/danger variants)
- Used by all dialogs for consistent UI/UX

**Toast Notifications**:
- Replaces blocking `alert()` calls
- Four types: success, error, warning, info
- Auto-dismiss after 3 seconds
- Smooth slide-in animations

**Custom Hooks**:
- `useGalleryData`: Fetches and caches gallery data
- `useFilteredArtists`: Filters and sorts artist list
- `useArtistSelector`: Manages artist selection state

**API Services**:
- `artistApi.js`: Centralized API calls for artist CRUD operations
- Returns parsed JSON responses
- Used by dialog components

## Development Workflow

### Testing Changes
1. **Python files**: Requires **ComfyUI restart**
2. **JavaScript/Preact files**: Requires **browser refresh** (hard refresh: Ctrl+Shift+R)
3. **CSS files**: Requires **browser refresh**

### Code Style
- Use standard ES6 `import/export` for modules
- Import Preact from `'../lib/preact.mjs'` and hooks from `'../lib/hooks.mjs'`
- Components should be small (<200 lines) and focused
- Extract business logic into custom hooks
- Use render functions within components for complex JSX
- Use Toast instead of `alert()` for user feedback

### Debugging
- **Backend errors**: Check ComfyUI console/terminal output
- **Frontend errors**: Open browser DevTools (F12) → Console tab
- **Network issues**: DevTools → Network tab, filter by `/artist_gallery/`

## Common Tasks

### Adding a New Dialog

Use the reusable Dialog component:

```javascript
import { Dialog, DialogButton } from './components/Dialog.js';

export function MyDialog({ isOpen, onClose, onConfirm }) {
    return h(Dialog, {
        isOpen,
        onClose,
        title: 'Dialog Title',
        titleIcon: '📝',
        maxWidth: '500px',
        footer: [
            h(DialogButton, { onClick: onClose }, '取消'),
            h(DialogButton, {
                variant: 'primary',
                onClick: onConfirm
            }, '确定'),
        ],
    }, 'Dialog content here');
}
```

### Adding a New Hook

Create hooks in `components/hooks/`:

```javascript
import { useState, useEffect } from '../../lib/hooks.mjs';

export function useMyHook() {
    const [data, setData] = useState(null);

    useEffect(() => {
        // Your logic here
    }, []);

    return { data, setData };
}
```

### Adding API Endpoints

**Backend** (`nodes.py`):
```python
@server.PromptServer.instance.routes.get("/artist_gallery/your-endpoint")
async def your_handler(request):
    data = await request.json()
    return web.json_response({"status": "success"})
```

**Frontend** (`services/`):
```javascript
export async function yourApiCall(data) {
    const response = await fetch('/artist_gallery/your-endpoint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    return await response.json();
}
```

### Creating a New Component

1. Create component file in `web/components/`
2. Import dependencies:

```javascript
import { h } from '../lib/preact.mjs';
import { useState, useEffect } from '../lib/hooks.mjs';
```

3. Use render functions for complex JSX:

```javascript
export function MyComponent({ prop1, prop2 }) {
    const [state, setState] = useState(null);

    const renderSection = () => {
        return h('div', { class: 'my-section' }, 'Content');
    };

    return h('div', { class: 'my-component' }, [
        renderSection(),
    ]);
}
```

### Showing Toast Notifications

```javascript
import { showToast } from './components/Toast.js';

// Success
showToast('操作成功', 'success');

// Error
showToast('操作失败: ' + error.message, 'error');

// Warning
showToast('请填写必填项', 'warning');

// Info
showToast('数据已更新', 'info');
```

## Key Integration Points

- **ComfyUI Server**: Uses `server.PromptServer.instance.routes` decorator for HTTP endpoints
- **Output Directory**: Uses `folder_paths.get_output_directory()` to locate ComfyUI's output folder
- **Frontend Loading**: ComfyUI auto-loads ES modules from `WEB_DIRECTORY` path
- **Preact Integration**: Loads from `./lib/` directory with standard ES6 imports
- **Node Widgets**: Uses `app.registerExtension()` with `beforeRegisterNodeDef()` hook for custom widgets

## Data Persistence

The plugin maintains two JSON files in the plugin root directory:

**`artists.json`**: Artist metadata managed by `ArtistStorage`
- Contains artist IDs, names, display names, creation timestamps, image counts

**`image_artists.json`**: Image-to-artist mappings managed by `ImageMappingStorage`
- Links image paths to artist IDs
- Tracks metadata (dimensions, save timestamps)

## Image Filename Pattern

Images are automatically detected by filename pattern:
```
@artist_name,_number.extension
```

Examples: `@mike,_1.png`, `@sarah,_2.jpg`, `@artist_name,_1.webp`

Supported formats: `.png`, `.jpg`, `.jpeg`, `.webp`

The regex pattern (`ARTIST_REGEX` in `nodes.py`): `r'^@([^,]+?)(?:,+\s*)?(?:_\d+)?\.(png|jpg|jpeg|webp)$'`

## Component Guidelines

### When to Create Files

**New Component** (`components/MyComponent.js`):
- Reusable UI with its own state
- Complex rendering logic
- Used in multiple places

**New Hook** (`components/hooks/useMyHook.js`):
- Reusable stateful logic
- Data fetching or synchronization
- Used by multiple components

**New Service** (`services/myApi.js`):
- API calls to backend
- External service integrations
- Data transformation logic

**New Dialog** (using `Dialog.js`):
- Simple modal with confirm/cancel
- Form input dialogs
- Confirmation messages

### File Size Guidelines

- **Components**: Aim for <200 lines, split if larger
- **Hooks**: Keep focused on single responsibility
- **Services**: Group related API calls together

## Performance Optimizations

### Implemented

- **Pre-computed maxTime**: Calculated during data fetch for faster sorting
- **Memoized filtering**: `useFilteredArtists` with `useMemo`
- **Image lazy loading**: `loading="lazy"` attribute on images
- **Event listener cleanup**: Proper cleanup in `useEffect` return functions

### Best Practices

- Use `useCallback` for event handlers passed to child components
- Use `useMemo` for expensive computations
- Avoid inline object/array creation in JSX
- Debounce rapid API calls (search, hover previews)

## API Reference

### Toast Notifications

```javascript
showToast(message, type, duration)
// message: string
// type: 'success' | 'error' | 'warning' | 'info'
// duration: number (ms), default 3000
```

### Dialog Component

```javascript
Dialog({
  isOpen: boolean,
  onClose: function,
  title: string,
  titleIcon: string,
  children: node,
  footer: node,
  maxWidth: string,
  showCloseButton: boolean,
  closeOnOverlayClick: boolean,
  className: string
})
```

### DialogButton

```javascript
DialogButton({
  children: node,
  onClick: function,
  variant: 'default' | 'primary' | 'danger',
  className: string
})
```
