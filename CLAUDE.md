# CLAUDE.md

Development notes for Prompt Gallery, a ComfyUI custom node extension for organizing reusable prompts, selecting them in workflows, saving generated images, and browsing image history.

## Architecture

The active domain model has three primary entities:

- Category: hierarchical organization.
- Prompt: identified by `(categoryId, value)`.
- Image mapping: image path plus `promptString` and generation metadata.

There is no persisted Image-to-Prompt ID relation. Prompt images are derived at query time with a case-insensitive substring check:

```python
prompt.value.lower() in image.promptString.lower()
```

`coverImageId` is a persisted display optimization. It does not establish image ownership.

## Backend

### Nodes

`nodes.py` defines:

- `PromptGallery`: legacy utility node; the gallery is normally opened with the floating button.
- `PromptSelector`: selects direct Prompt entries or categories, applies partition formatting, random/cycle modes, and weights.
- `SaveToGallery`: writes PNG files synchronously, then registers image mappings and fills empty Prompt covers in a daemon thread.
- `SavePrompt`: creates Prompt entries from workflow text.
- `ReadPromptFromCategory`: reads Prompt values from a category.

`SaveToGallery.prompt_string` is required. The node does not consume `PromptSelector.metadata_json`.

### Storage

`storage.get_storage()` returns:

```python
(PromptStorage, ImageMappingStorage, CategoryStorage)
```

| Module | Main file | Shards | Responsibility |
| --- | --- | --- | --- |
| `storage/prompt.py` | `prompts.json` | `*.prompts.json` | Prompt CRUD, indexes, cover updates |
| `storage/image_mapping.py` | `images.json` | `*.images.json` | Image index and promptString matching |
| `storage/category.py` | `categories.json` | `*.categories.json` | Category tree and CRUD |

`SplitJsonStorage` merges the main file and enabled shards, caches parsed data, and preserves `_source_file` only in memory to route writes back to the source shard.

`comfy_output*.images.json` is intentionally excluded from normal image mapping reads. History view loads it explicitly when requested.

### Routes

| Module | Main responsibility |
| --- | --- |
| `routes/gallery.py` | Category-scoped Prompt and child-category listing |
| `routes/prompts.py` | Prompt CRUD, copy, search, batch resolve, detail image lookup |
| `routes/categories.py` | Category CRUD and movement |
| `routes/images.py` | Image registration, deletion, restore, metadata |
| `routes/history.py` | Grouped history image query |
| `routes/import_export.py` | ZIP and local image import/export |
| `routes/import_output.py` | SSE-based ComfyUI output indexing |
| `routes/batch.py` | Batch delete, move, and copy |
| `routes/settings.py` | Storage shards, backups, cleanup, cover backfill, FAQ |
| `routes/custom_filters.py` | User-defined image filters |
| `routes/image_fields.py` | Extracted image fields and grouping |

Shared SSE helpers are in `routes/_sse.py`; the frontend client is `web/services/sseClient.js`.

### Startup migrations

`storage/_resolve.py` runs versioned migrations once before storage singletons are created. Migrations must be idempotent and must not perform full image scans during normal startup.

The current legacy data migration converts old grouped Prompt records into normal Prompt records, preserves category/name/cover/createdAt/metadata, merges duplicate `(categoryId, value)` records by only filling an empty cover, and removes the legacy files after Prompt writes succeed.

Cover backfill is manual from Settings because it scans normal image mappings. It uses `pyahocorasick` and does not overwrite existing covers.

## Frontend

The frontend uses Preact-compatible modules from `web/lib/`.

### Gallery

- `GalleryContext.js`: shared state and operations.
- `GalleryModal.js`: view routing and dialog composition.
- `GalleryGrid.js`: mixed Category and Prompt card list.
- `GalleryCard.js`: Prompt card.
- `CategoryCard.js`: Category card.
- `PromptDetailView.js`: lazy grouped image detail.
- `ImageGroupView.js`: grouped image list shared with history.
- `Lightbox.js`: image details, workflow copy, API prompt copy, and preview editing.

Gallery list responses contain persisted cover paths but not full image arrays. Prompt images load only when entering detail view.

### Prompt selector

`web/nodes/components/PromptSelectorWidget.js` renders the custom node UI.

Partition state is stored in the hidden `metadata` widget:

```javascript
{
  version: 1,
  partitions: [{
    id: 'partition-default',
    enabled: true,
    config: {
      format: '{content}',
      randomMode: false,
      randomCount: 3,
      cycleMode: false,
    },
    orderItems: [
      { type: 'prompt', key: 'categoryId:value' },
      { type: 'category', key: 'categoryId' },
    ],
  }],
  promptWeights: {},
  globalConfig: {},
}
```

Key modules:

- `usePromptSelector.js`: browsing, search, selection, hydration, cover cache.
- `usePartitionState.js`: partition/member state and ordering.
- `useNodeSync.js`: writes state back to ComfyUI widgets.
- `usePartitionPreview.js`: on-demand cover preview.

## Import formats

- v1: Prompt and images imported into the selected category.
- v2: Category tree, Prompt, and images.

See `IMPORT_FORMAT.md`. Legacy v2 fields outside the current schema are ignored. Imported images use `promptString`; old `prompts` or `promptNames` arrays are only a fallback source for constructing that string.

## Performance rules

- Never scan all images in gallery list APIs.
- Keep `promptString` matching out of synchronous PNG save latency.
- Prefer one storage lock and one write for batch operations.
- Preserve lazy parsing of `comfy_output` shards.
- Use structured JSON handling rather than string rewriting.
- Do not restore `imageCount` as a maintained field.
- Do not introduce persisted Prompt IDs into image mappings.

## Validation

Run focused tests with:

```bash
python3 -m pytest -q
```

For Python syntax without writing project `__pycache__` files:

```bash
PYTHONPYCACHEPREFIX=/tmp/prompt-gallery-pycache python3 -m compileall -q nodes.py routes storage tests
```

JavaScript files are browser ES modules. Syntax checking must use module mode.
