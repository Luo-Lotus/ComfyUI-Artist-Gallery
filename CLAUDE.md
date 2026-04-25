# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Artist Gallery is a ComfyUI custom node plugin that provides:
- **Floating gallery UI**: Draggable button (🎨) with modal interface for browsing artist reference images
- **Storage system**: JSON-based persistence for artists, categories, combinations, and image-artist mappings
- **Custom nodes**: ArtistGallery (UI), ArtistSelector (workflow integration), SaveToGallery (saving images)
- **Combination system**: Group multiple artists into selectable units, auto-create on save
- **Category system**: Hierarchical artist categorization with tree navigation
- **Toast notification system**: Modern, non-blocking user feedback
- **Dialog components**: Reusable modal dialog system
- **Automatic detection**: Scans ComfyUI output directory for images matching `@artist_name,_number.ext` pattern

## Architecture

### Backend (Python)

**`__init__.py`**: Plugin entry point
- Registers three node classes via `NODE_CLASS_MAPPINGS` and `NODE_DISPLAY_NAME_MAPPINGS`
- Sets `WEB_DIRECTORY = "./web"` for frontend assets

**`nodes.py`**: Node classes and output processing logic
- **ArtistGallery**: Output node for UI (no workflow output)
- **ArtistSelector**: Workflow node that provides artist selection widget
  - Processes partitions, resolves artists from `artistKeys` and `categoryIds`
  - Handles random/cycle mode, format templates, auto-create combination
  - Tracks `partition_used_artists` (actual artists after random/cycle filtering)
  - Tracks `partition_formats` (per-partition format string)
- **SaveToGallery**: Saves generated images to the gallery system
  - Supports two input sources (priority: `metadata_json` > `prompt_string`):
    - `metadata_json`: from `ArtistSelector`, contains explicit artist selections
    - `prompt_string`: auto-matches known artist names via regex substring matching
  - Validates at least one input source is provided
  - `_match_artists_from_prompt()`: Regex alternation-based matching with module-level cache
  - Uses `collect_artist()` to register artist associations for saved images
- **`_apply_format()`**: Applies format template (e.g., `@{content}`) to artist names

**`storage/`**: Data persistence layer (split into modules)

| Module | Class | Storage File | Purpose |
|--------|-------|-------------|---------|
| `artist.py` | `ArtistStorage` | `artists.json` | Artist CRUD, batch operations |
| `category.py` | `CategoryStorage` | `categories.json` | Hierarchical category tree |
| `combination.py` | `CombinationStorage` | `combinations.json` | Combination CRUD, duplicate, move |
| `image_mapping.py` | `ImageMappingStorage` | `image_artists.json` | Image-artist relationships, cover image lookup |
| `migration.py` | — | — | Data migration utilities |
| `_resolve.py` | — | — | Storage directory resolution |

All storage classes are thread-safe with locking mechanism. Access via `get_storage()` from `storage/__init__.py`.

**`routes/`**: HTTP API endpoints (split into modules)

| Module | Endpoints |
|--------|-----------|
| `gallery.py` | `GET /data` — returns artists + combinations with `coverImagePath` (no full `images` array) |
| `artists.py` | Artist CRUD, batch operations, `GET /artist_images` (lazy-load artist images), `PUT /{id}/cover` |
| `categories.py` | Category CRUD, move |
| `combinations.py` | Combination CRUD, duplicate, move, images (intersection of member artists), batch delete |
| `images.py` | Image file serving, import |
| `batch.py` | Batch delete operations |
| `import_export.py` | Artist/category data import/export |
| `cycle_state.py` | Cycle mode state persistence |
| `migration.py` | Data migration endpoints |

**Key design decisions**:
- Gallery list API (`/data`) returns `coverImagePath` only (no `images` array) for performance
- Artist images are lazy-loaded via `/artist_images?name=` when entering detail view
- `coverImageId` is the internal storage field; API responses compute and expose only `coverImagePath`
- Combination images endpoint returns intersection of all member artists' images

### Frontend (JavaScript/Preact)

**Architecture**:
- **Standard ES6 modules**: Uses `import/export`
- **Component-based**: Modular, reusable components
- **Custom Hooks**: Business logic extracted into hooks
- **Service Layer**: API calls centralized in services
- **Toast Notifications**: Replaces native `alert()`
- **Dialog Components**: Reusable modal system

#### File Structure

```
web/
├── artist_gallery.js              # Main entry point
├── utils.js                       # Shared utilities (buildImageUrl, fetchArtistImages, setArtistCover)
├── Draggable.js                   # Drag-and-drop
├── lib/                           # Third-party libraries
│   ├── preact.mjs                 # Preact core
│   ├── hooks.mjs                  # Preact hooks
│   └── icons.mjs                  # SVG icon system (Icon component + iconToSvg helper)
├── components/                    # Preact components
│   ├── GalleryModal.js            # Main gallery container (lazy-loads artist images, "set as cover" menu)
│   ├── GalleryGrid.js             # Artist grid layout
│   ├── GalleryCard.js             # Individual artist card (uses coverImagePath)
│   ├── CombinationCard.js         # Combination card (uses coverImagePath)
│   ├── CombinationDialog.js       # Create/edit combination dialog
│   ├── Lightbox.js                # Full-screen image viewer (shows artistNames tags)
│   ├── BaseCard.js                # Card base component (selection, context menu)
│   ├── ContextMenu.js             # Right-click context menu
│   ├── LazyList.js                # Virtual scroll list
│   ├── Toast.js                   # Toast notification system
│   ├── AddArtistDialog.js         # Add/Edit artist dialog
│   ├── DeleteConfirmDialog.js     # Delete confirmation dialog
│   ├── CopyDialog.js              # Copy to category dialog
│   ├── MoveDialog.js              # Move to category dialog
│   ├── CategoryDialog.js          # Category CRUD dialog
│   ├── ImportImagesDialog.js      # Image import dialog
│   └── hooks/
│       ├── useGalleryData.js      # Data fetching & caching
│       ├── useFilteredArtists.js  # Filtering & sorting
│       └── useFormatProcessor.js  # Format template processing
├── nodes/                         # Node-specific components
│   ├── ArtistSelector.js          # Node extension entry (beforeRegisterNodeDef)
│   └── components/
│       ├── ArtistSelectorWidget.js    # Preact widget (hover preview for artists & combinations)
│       ├── PartitionList.js           # Partition list with drag-drop
│       ├── PartitionItem.js           # Individual partition item
│       ├── PartitionHeader.js         # Partition header (shows 🔗 badge for auto-create)
│       ├── PartitionConfigPanel.js    # Per-partition config (format, random, cycle, saveToGallery, autoCreateCombination)
│       └── hooks/
│           ├── useArtistSelector.js   # Core selection logic (loads artists + combinations from /data)
│           ├── useImagePreview.js     # Cover image hover preview (direct DOM, no fetch)
│           ├── useNodeSync.js         # Node value synchronization
│           └── usePartitionState.js   # Partition state management & persistence
├── services/
│   └── artistApi.js               # API call functions
└── styles/                        # Component styles
    ├── gallery.css                # Gallery modal styles
    ├── gallery-card.css           # Card styles
    ├── gallery-grid.css           # Grid layout styles
    ├── lightbox.css               # Lightbox styles (flex column, artist tags)
    ├── artist-selector.css        # Selector styles
    ├── combination.css            # Combination styles
    ├── toast.css                  # Notification styles
    ├── dialogs.css                # Dialog styles
    ├── context-menu.css           # Context menu styles
    ├── variables.css              # CSS variables
    └── ...                        # Other style files
```

#### Key Components

**Dialog System**:
- `Dialog.js`: Reusable modal with title, content, footer
- `DialogButton`: Styled button (default/primary/danger variants)

**Toast Notifications**:
- Replaces `alert()` calls
- Types: success, error, warning, info
- Auto-dismiss after 3 seconds

**Custom Hooks**:
- `useGalleryData`: Fetches and caches gallery data
- `useFilteredArtists`: Filters and sorts artist list with `useMemo`
- `useArtistSelector`: Core selection state, loads data from `/data` endpoint (artists + combinations in one call)
- `useImagePreview`: Direct DOM preview popup using `coverImagePath` (no API fetch)
- `usePartitionState`: Partition CRUD, artist/category/combination mapping, persistence

**Cover Image System**:
- Storage field: `coverImageId` (path stored in JSON)
- API response field: `coverImagePath` (computed: `coverImageId || first_mapping_image`)
- Frontend uses only `coverImagePath` — `coverImageId` is not exposed in API responses
- Set via right-click menu → "设为封面", calls `setArtistCover()` or `updateCombinationApi()`

**Combination System**:
- `CombinationStorage`: CRUD in `combinations.json`
- Fields: `id`, `name`, `categoryId`, `artistKeys[]`, `outputContent`, `coverImageId`
- Auto-create: When partition has `autoCreateCombination` enabled, `SaveToGallery` creates a combination with:
  - `name` = comma-joined artist names
  - `outputContent` = formatted content (e.g., `@artist_one,@artist_two` if format is `@{content}`)
  - `artistKeys` = actually used artists (after random/cycle filtering)
- Auto-create requires `saveToGallery` enabled on the partition

**Partition System**:
- Each partition has independent config: `format`, `randomMode`, `randomCount`, `cycleMode`, `saveToGallery`, `autoCreateCombination`
- `autoCreateCombination` is disabled when `saveToGallery` is off
- Partition header shows link icon badge when auto-create is enabled

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

### Styling
- **Style Guide**: See [`STYLE_GUIDE.md`](STYLE_GUIDE.md) for the complete design system (colors, typography, spacing, component patterns)
- **Gallery UI**: Uses pink/light theme (`#ff6b9d` / `#ffb6c1` / `#fff5f8`)
- **Node Widgets**: Uses dark theme (`#1e1e1e` / `#6c5ce7`) matching ComfyUI editor
- **Always check `STYLE_GUIDE.md` before writing new CSS or creating new components**
- Each component has its own CSS file under `web/styles/`, imported via `gallery.css`
- CSS class naming: `gallery-` prefix for gallery UI, `artist-selector-` for node widgets

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

Create hooks in `components/hooks/` or `nodes/components/hooks/`:

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

**Backend** (`routes/`):
```python
@server.PromptServer.instance.routes.get("/artist_gallery/your-endpoint")
async def your_handler(request):
    # For query params:
    param = request.query.get("param", "")
    # For body:
    data = await request.json()
    return web.json_response({"status": "success"})
```

**Frontend** (`utils.js` or `services/`):
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
import { Icon } from '../lib/icons.mjs';  // For SVG icons — see Icon System section
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

showToast('操作成功', 'success');
showToast('操作失败: ' + error.message, 'error');
showToast('请填写必填项', 'warning');
showToast('数据已更新', 'info');
```

## Key Integration Points

- **ComfyUI Server**: Uses `server.PromptServer.instance.routes` decorator for HTTP endpoints
- **Output Directory**: Uses `folder_paths.get_output_directory()` to locate ComfyUI's output folder
- **Frontend Loading**: ComfyUI auto-loads ES modules from `WEB_DIRECTORY` path
- **Preact Integration**: Loads from `./lib/` directory with standard ES6 imports
- **Node Widgets**: Uses `app.registerExtension()` with `beforeRegisterNodeDef()` hook for custom widgets
- **collect_artist()**: Registers artist associations for SaveToGallery images, handles combination artist expansion

## Data Persistence

The plugin maintains JSON files in the plugin storage directory:

**`artists.json`**: Artist metadata (ArtistStorage)
- Fields: id, name, displayName, categoryId, coverImageId, createdAt

**`categories.json`**: Category tree (CategoryStorage)
- Fields: id, name, parentId, children[]

**`combinations.json`**: Combination data (CombinationStorage)
- Fields: id, name, categoryId, artistKeys[], outputContent, coverImageId, createdAt

**`image_artists.json`**: Image-to-artist mappings (ImageMappingStorage)
- Fields: imagePath, artistNames[], dimensions, saveTimestamp

## Image Filename Pattern

Images are automatically detected by filename pattern:
```
@artist_name,_number.extension
```

Examples: `@mike,_1.png`, `@sarah,_2.jpg`, `@artist_name,_1.webp`

Supported formats: `.png`, `.jpg`, `.jpeg`, `.webp`

The regex pattern (`ARTIST_REGEX` in `nodes.py`): `r'^@([^,]+?)(?:,+\s*)?(?:_\d+)?\.(png|jpg|jpeg|webp)$'`

## Icon System

All UI icons use SVG via the self-built icon library at `web/lib/icons.mjs`. **Never use emoji or Unicode symbols as icons.**

### Architecture

- **`Icon` Preact component** — For use in Preact JSX (`h(Icon, { name: 'search', size: 16 })`)
- **`iconToSvg(name, size)` function** — Returns SVG HTML string for non-Preact contexts (e.g., native DOM in `ContextMenu.js`)

### Usage

```javascript
// Preact component context
import { Icon } from '../lib/icons.mjs';
h(Icon, { name: 'search', size: 16 })              // basic usage
h(Icon, { name: 'trash-2', size: 14, color: '#f44' })  // with color
h(Icon, { name: 'loader', size: 14, class: 'spin' })   // with CSS class (spinning animation)

// Native DOM context (ContextMenu, vanilla JS)
import { iconToSvg } from '../lib/icons.mjs';
element.innerHTML = iconToSvg('trash-2', 16);
```

### Available Icons

| Icon Name | Use Case |
|-----------|----------|
| `search` | Search input |
| `x` | Close / dismiss buttons |
| `plus` | Add actions |
| `minus` | Remove actions |
| `star` | Favorites |
| `image` | Image-related actions |
| `trash-2` | Delete actions |
| `copy` | Copy / duplicate actions |
| `edit` | Edit actions |
| `move` | Move actions |
| `link` | Combinations / link-related |
| `folder` | Category / folder display |
| `folder-plus` | Create new category |
| `settings` | Configuration / settings |
| `power` | Enable / disable toggle |
| `ban` | Disabled / prohibited state |
| `repeat` | Cycle mode indicator |
| `shuffle` | Random mode indicator |
| `download` | Import / download actions |
| `upload` | Export / upload actions |
| `refresh-cw` | Refresh / reload |
| `loader` | Loading spinner (use with `class: 'spin'`) |
| `check-circle` | Success state |
| `x-circle` | Error state |
| `alert-triangle` | Warning / orphaned items |
| `info-circle` | Info / help |
| `lightbulb` | Hints / tips |
| `package` | Move / batch operations |
| `clipboard-list` | Batch / selection mode |
| `palette` | Empty gallery placeholder |
| `arrow-left` | Back / navigation |
| `arrow-up` / `arrow-down` | Sort order |
| `chevron-left` / `chevron-right` | Navigation arrows |
| `minus` | Collapse / reduce |

### Adding New Icons

1. Find the Lucide icon SVG path data (MIT license): https://lucide.dev/icons/
2. Add to the `ICONS` object in `web/lib/icons.mjs`:
   - Single path: `'icon-name': ['M...path data...']`
   - Multiple paths: `'icon-name': ['M...path1...', 'M...path2...']`
3. Use immediately via `h(Icon, { name: 'icon-name' })` or `iconToSvg('icon-name')`

### CSS Alignment for SVG Icons

Buttons and containers with SVG icons must use flex alignment:

```css
/* Buttons with icons */
.my-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    line-height: 1;
}
.my-btn svg {
    display: block;
    flex-shrink: 0;
}

/* Inline icon badges */
.my-badge {
    display: inline-flex;
    align-items: center;
    line-height: 1;
}
.my-badge svg {
    display: block;
}

/* Spinning animation for loading */
@keyframes icon-spin {
    to { transform: rotate(360deg); }
}
svg.spin {
    animation: icon-spin 1s linear infinite;
}
```

### Exceptions (Emoji Allowed)

- **Floating button label**: `'🎨'` in `artist_gallery.js` entry point
- **Modal title**: `'🎨 画师图库'` in `GalleryModal.js` header

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

- **Gallery list API**: Returns only `coverImagePath` + `imageCount` (no full images array)
- **Lazy image loading**: Artist images fetched on-demand when entering detail view
- **Cover image preview**: Hover preview uses `coverImagePath` directly (no API call)
- **Single data endpoint**: `/artist_gallery/data` returns both artists and combinations in one call
- **Pre-computed maxTime**: Calculated during data fetch for faster sorting
- **Memoized filtering**: `useFilteredArtists` with `useMemo`
- **Image lazy loading**: `loading="lazy"` attribute on images
- **Event listener cleanup**: Proper cleanup in `useEffect` return functions
- **Virtual scroll**: `LazyList` component for large lists
- **Prompt string artist matching**: SaveToGallery matches artist names via compiled regex alternation pattern (longest-first, case-insensitive), cached at module level with frozenset fingerprint invalidation

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
  titleIcon: vnode,  // Preact vnode from h(Icon, { name: 'settings', size: 18 })
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
