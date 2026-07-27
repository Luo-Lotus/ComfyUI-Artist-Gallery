import { h } from '../lib/preact.mjs';
import { useState, useEffect, useCallback } from '../lib/hooks.mjs';
import { Dialog } from './Dialog.js';
import { Icon } from '../lib/icons.mjs';
import { showToast } from './Toast.js';
import { useGallery } from './GalleryContext.js';
import { Storage } from '../utils.js';
import { ImageFieldPanel } from './ImageFieldPanel.js';

const MENU_ITEMS = [
  { key: 'gallery', label: '图库设置', icon: 'image' },
  { key: 'node', label: '节点', icon: 'settings' },
  { key: 'imageFields', label: '图片字段', icon: 'image' },
  { key: 'storage', label: '存储管理', icon: 'folder' },
  { key: 'faq', label: '常见问题', icon: 'info-circle' },
];

// ───────── 图库设置面板 ─────────

function GallerySettings() {
  const ctx = useGallery();
  const mode = ctx.cardLayoutMode;
  const [cleaningGhostImages, setCleaningGhostImages] = useState(false);
  const [backfillingCovers, setBackfillingCovers] = useState(false);

  const handleModeChange = useCallback((newMode) => {
    ctx.setCardLayoutMode(newMode);
    Storage.saveCardLayoutMode(newMode);
  }, [ctx.setCardLayoutMode]);

  const handleThemeChange = useCallback((newTheme) => {
    ctx.setTheme(newTheme);
  }, [ctx.setTheme]);

  const handleResetButtonPosition = useCallback(() => {
    const reset = Storage.resetButtonPosition();
    showToast(reset ? '悬浮球位置已重置' : '未找到悬浮球按钮', reset ? 'success' : 'warning');
  }, []);

  const handleCleanupGhostImages = useCallback(async () => {
    if (cleaningGhostImages) return;
    if (!confirm('确定要清理幽灵图片映射吗？\n会移除图片文件已不存在的本地映射记录，不会删除任何真实图片文件。')) return;

    setCleaningGhostImages(true);
    try {
      const res = await fetch('/prompt_gallery/settings/cleanup_ghost_images', {
        method: 'POST',
      }).then(r => r.json());

      if (res.success) {
        const removed = res.removed || 0;
        showToast(removed > 0 ? `已清理 ${removed} 条幽灵图片映射` : '没有发现幽灵图片映射', removed > 0 ? 'success' : 'info');
        await ctx.loadData?.();
      } else {
        showToast(res.error || '清理失败', 'error');
      }
    } catch (e) {
      showToast('清理失败', 'error');
    } finally {
      setCleaningGhostImages(false);
    }
  }, [cleaningGhostImages, ctx.loadData]);

  const handleBackfillCovers = useCallback(async () => {
    if (backfillingCovers) return;
    if (!confirm('确定要自动匹配封面吗？\n会扫描图片索引，为没有封面的 Prompt 补齐封面，不会覆盖已有封面。')) return;

    setBackfillingCovers(true);
    try {
      const res = await fetch('/prompt_gallery/settings/backfill_covers', {
        method: 'POST',
      }).then(r => r.json());

      if (res.success) {
        if (res.skipped) {
          showToast(res.message || '缺少依赖，已跳过', 'warning');
        } else {
          const message = res.message || `已补齐 ${res.prompts || 0} 个 Prompt 封面`;
          showToast(message, res.migrated ? 'success' : 'info');
          await ctx.loadData?.();
        }
      } else {
        showToast(res.error || '自动匹配封面失败', 'error');
      }
    } catch (e) {
      showToast('自动匹配封面失败', 'error');
    } finally {
      setBackfillingCovers(false);
    }
  }, [backfillingCovers, ctx.loadData]);

  return h('div', { class: 'settings-panel' }, [
    h('div', { class: 'settings-section-title' }, '图库设置'),
    h('div', { class: 'settings-option-row' }, [
      h('div', { class: 'settings-option-label' }, '主题模式'),
      h('div', { class: 'settings-option-desc' }, '选择图库的外观主题'),
    ]),
    h('div', { class: 'settings-radio-group' }, [
      h('button', {
        class: 'settings-radio-btn' + (ctx.theme === 'dark' ? ' active' : ''),
        onClick: () => handleThemeChange('dark'),
      }, [
        h(Icon, { name: 'power', size: 14 }),
        '深色模式',
      ]),
      h('button', {
        class: 'settings-radio-btn' + (ctx.theme === 'light' ? ' active' : ''),
        onClick: () => handleThemeChange('light'),
      }, [
        h(Icon, { name: 'star', size: 14 }),
        '浅色模式',
      ]),
    ]),
    h('div', { class: 'settings-divider' }),
    h('div', { class: 'settings-option-row' }, [
      h('div', { class: 'settings-option-label' }, '卡片展示方式'),
      h('div', { class: 'settings-option-desc' }, '选择图库中卡片的展示方式'),
    ]),
    h('div', { class: 'settings-radio-group' }, [
      h('button', {
        class: 'settings-radio-btn' + (mode === 'fixed' ? ' active' : ''),
        onClick: () => handleModeChange('fixed'),
      }, [
        h(Icon, { name: 'grid', size: 14 }),
        '固定大小',
      ]),
      h('button', {
        class: 'settings-radio-btn' + (mode === 'adaptive' ? ' active' : ''),
        onClick: () => handleModeChange('adaptive'),
      }, [
        h(Icon, { name: 'image', size: 14 }),
        '自适应',
      ]),
    ]),
    h('div', { class: 'settings-divider' }),
    h('div', { class: 'settings-option-row' }, [
      h('div', { class: 'settings-option-label' }, '悬浮球位置'),
      h('div', { class: 'settings-option-desc' }, '将画廊悬浮球恢复到右侧默认位置'),
    ]),
    h('button', {
      class: 'settings-radio-btn',
      onClick: handleResetButtonPosition,
    }, [
      h(Icon, { name: 'refresh-cw', size: 14 }),
      '重置悬浮球位置',
    ]),
    h('div', { class: 'settings-divider' }),
    h('div', { class: 'settings-option-row' }, [
      h('div', { class: 'settings-option-label' }, '自动匹配封面'),
      h('div', { class: 'settings-option-desc' }, '扫描图片索引，为没有封面的 Prompt 补齐封面'),
    ]),
    h('button', {
      class: 'settings-radio-btn',
      onClick: handleBackfillCovers,
      disabled: backfillingCovers,
    }, [
      h(Icon, {
        name: backfillingCovers ? 'loader' : 'image',
        size: 14,
        class: backfillingCovers ? 'spin' : '',
      }),
      backfillingCovers ? '匹配中...' : '自动匹配封面',
    ]),
    h('div', { class: 'settings-divider' }),
    h('div', { class: 'settings-option-row' }, [
      h('div', { class: 'settings-option-label' }, '图片索引维护'),
      h('div', { class: 'settings-option-desc' }, '移除索引中存在但本地文件已不存在的图片映射'),
    ]),
    h('button', {
      class: 'settings-radio-btn settings-danger-btn',
      onClick: handleCleanupGhostImages,
      disabled: cleaningGhostImages,
    }, [
      h(Icon, {
        name: cleaningGhostImages ? 'loader' : 'unlink',
        size: 14,
        class: cleaningGhostImages ? 'spin' : '',
      }),
      cleaningGhostImages ? '清理中...' : '清理幽灵图片映射',
    ]),
  ]);
}

// ───────── 节点设置面板 ─────────

function NodeSettings() {
  const [showSearchPath, setShowSearchPath] = useState(() => Storage.getNodeSearchShowPath());

  const handleShowSearchPathChange = useCallback((enabled) => {
    setShowSearchPath(enabled);
    Storage.saveNodeSearchShowPath(enabled);
    window.dispatchEvent(new CustomEvent('prompt-gallery-node-settings-change', {
      detail: { showSearchPath: enabled },
    }));
  }, []);

  return h('div', { class: 'settings-panel' }, [
    h('div', { class: 'settings-section-title' }, '节点设置'),
    h('div', { class: 'settings-option-row' }, [
      h('div', { class: 'settings-option-label' }, '搜索结果路径'),
      h('div', { class: 'settings-option-desc' }, '控制 Prompt 选择节点搜索结果下方是否显示分类路径'),
    ]),
    h('div', { class: 'settings-radio-group' }, [
      h('button', {
        class: 'settings-radio-btn' + (showSearchPath ? ' active' : ''),
        onClick: () => handleShowSearchPathChange(true),
      }, [
        h(Icon, { name: 'check-circle', size: 14 }),
        '显示路径',
      ]),
      h('button', {
        class: 'settings-radio-btn' + (!showSearchPath ? ' active' : ''),
        onClick: () => handleShowSearchPathChange(false),
      }, [
        h(Icon, { name: 'x-circle', size: 14 }),
        '隐藏路径',
      ]),
    ]),
  ]);
}

// ───────── 存储管理面板 ─────────

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatBackupName(name) {
  const m = name.match(/backup_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/);
  if (!m) return name;
  return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}`;
}

function StorageSettings() {
  const [groups, setGroups] = useState([]);
  const [backups, setBackups] = useState([]);
  const [maxBackups, setMaxBackups] = useState(3);
  const [loading, setLoading] = useState(true);
  const [expandedPrefix, setExpandedPrefix] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [filesRes, backupsRes] = await Promise.all([
        fetch('/prompt_gallery/settings/storage_files').then(r => r.json()),
        fetch('/prompt_gallery/settings/backups').then(r => r.json()),
      ]);
      if (filesRes.success) setGroups(filesRes.groups);
      if (backupsRes.success) {
        setBackups(backupsRes.backups);
        if (backupsRes.maxBackups != null) setMaxBackups(backupsRes.maxBackups);
      }
    } catch (e) {
      showToast('加载存储信息失败', 'error');
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleToggle = useCallback(async (prefix) => {
    try {
      const res = await fetch('/prompt_gallery/settings/storage_files/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix }),
      }).then(r => r.json());
      if (res.success) {
        showToast(res.disabled ? '已禁用，请刷新页面生效' : '已启用，请刷新页面生效', 'success');
        loadData();
      } else {
        showToast(res.error || '操作失败', 'error');
      }
    } catch (e) {
      showToast('操作失败', 'error');
    }
  }, [loadData]);

  const handleApplyBackup = useCallback(async (name) => {
    if (!confirm(`确定要应用备份 ${formatBackupName(name)} 吗？\n当前数据会先自动备份。`)) return;
    try {
      const res = await fetch(`/prompt_gallery/settings/backups/${name}/apply`, {
        method: 'POST',
      }).then(r => r.json());
      if (res.success) {
        showToast('备份已应用' + (res.safety_backup ? `（安全备份: ${formatBackupName(res.safety_backup)}）` : ''), 'success');
        loadData();
      } else {
        showToast(res.error || '应用失败', 'error');
      }
    } catch (e) {
      showToast('应用备份失败', 'error');
    }
  }, [loadData]);

  const handleCreateBackup = useCallback(async () => {
    try {
      const res = await fetch('/prompt_gallery/settings/backups/create', {
        method: 'POST',
      }).then(r => r.json());
      if (res.success) {
        showToast(res.backup ? '备份已创建' : '无文件可备份', res.backup ? 'success' : 'info');
        loadData();
      } else {
        showToast(res.error || '备份失败', 'error');
      }
    } catch (e) {
      showToast('备份失败', 'error');
    }
  }, [loadData]);

  const handleMaxBackupsChange = useCallback(async (value) => {
    const num = parseInt(value, 10);
    if (isNaN(num) || num < 1) return;
    setMaxBackups(num);
    try {
      await fetch('/prompt_gallery/settings/max_backups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: num }),
      });
    } catch (e) {
      // ignore
    }
  }, []);

  if (loading) {
    return h('div', { class: 'settings-panel' }, [
      h('div', { class: 'settings-section-title' }, '存储管理'),
      h('div', { class: 'settings-placeholder' }, [
        h(Icon, { name: 'loader', size: 24, class: 'spin' }),
        h('span', {}, '加载中...'),
      ]),
    ]);
  }

  const renderFileGroups = () => {
    if (groups.length === 0) {
      return h('div', { class: 'storage-empty-hint' }, '暂无分片文件');
    }

    return groups.map(g => {
      const isExpanded = expandedPrefix === g.prefix;
      return h('div', { key: g.prefix, class: 'storage-file-group' + (g.disabled ? ' disabled' : '') }, [
        h('div', { class: 'storage-file-row' }, [
          h('div', {
            class: 'storage-file-info',
            onClick: () => setExpandedPrefix(isExpanded ? null : g.prefix),
          }, [
            h(Icon, {
              name: 'chevron-right',
              size: 12,
              class: 'storage-file-chevron' + (isExpanded ? ' expanded' : ''),
            }),
            h('span', { class: 'storage-file-name' }, g.prefix),
            h('span', { class: 'storage-file-size' }, g.totalSizeFormatted),
          ]),
          h('button', {
            class: 'storage-toggle-btn' + (g.disabled ? ' off' : ''),
            onClick: (e) => { e.stopPropagation(); handleToggle(g.prefix); },
            title: g.disabled ? '点击启用' : '点击禁用',
          }, h('div', { class: 'storage-toggle-knob' })),
        ]),
        isExpanded && h('div', { class: 'storage-file-details' },
          g.files.map(f =>
            h('div', { key: f.name, class: 'storage-file-detail-row' }, [
              h('span', { class: 'storage-file-detail-name' }, f.name),
              h('span', { class: 'storage-file-detail-size' }, f.sizeFormatted),
            ]),
          ),
        ),
      ]);
    });
  };

  const renderBackups = () => {
    const list = backups.length === 0
      ? h('div', { class: 'storage-empty-hint' }, '暂无备份记录')
      : backups.map(b =>
          h('div', { key: b.name, class: 'backup-row' }, [
            h('div', { class: 'backup-info' }, [
              h('div', { class: 'backup-name' }, formatBackupName(b.name)),
              h('div', { class: 'backup-meta' }, `${b.file_count} 个文件 · ${b.sizeFormatted || formatSize(b.total_size)}`),
            ]),
            h('button', {
              class: 'backup-apply-btn',
              onClick: () => handleApplyBackup(b.name),
            }, [
              h(Icon, { name: 'refresh-cw', size: 12 }),
              ' 应用',
            ]),
          ]),
        );

    return h('div', {}, [
      h('div', { class: 'backup-actions' }, [
        h('div', { class: 'backup-max-setting' }, [
          h('span', { class: 'backup-max-label' }, '最大备份数'),
          h('input', {
            type: 'number',
            class: 'backup-max-input',
            min: 1,
            max: 20,
            value: maxBackups,
            onInput: (e) => handleMaxBackupsChange(e.target.value),
          }),
        ]),
        h('button', {
          class: 'backup-create-btn',
          onClick: handleCreateBackup,
        }, [
          h(Icon, { name: 'download', size: 12 }),
          ' 立即备份',
        ]),
      ]),
      list,
    ]);
  };

  return h('div', { class: 'settings-panel' }, [
    h('div', { class: 'settings-section-title' }, '存储文件'),
    renderFileGroups(),
    h('div', { class: 'settings-divider' }),
    h('div', { class: 'settings-section-title' }, '备份管理'),
    h('div', { class: 'backup-list' }, renderBackups()),
  ]);
}

// ───────── FAQ 面板 ─────────

function FAQ() {
  const [items, setItems] = useState([]);
  const [expanded, setExpanded] = useState(-1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/prompt_gallery/faq')
      .then(r => r.json())
      .then(data => {
        if (data.success) setItems(data.items);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return h('div', { class: 'settings-panel' }, [
      h('div', { class: 'settings-section-title' }, '常见问题'),
      h('div', { class: 'settings-placeholder' }, [
        h(Icon, { name: 'loader', size: 24, class: 'spin' }),
      ]),
    ]);
  }

  return h('div', { class: 'settings-panel' }, [
    h('div', { class: 'settings-section-title' }, '常见问题'),
    h('div', { class: 'faq-list' },
      items.map((item, i) =>
        h('div', { key: i, class: 'faq-item' }, [
          h('div', {
            class: 'faq-question',
            onClick: () => setExpanded(expanded === i ? -1 : i),
          }, [
            h(Icon, {
              name: 'chevron-right',
              size: 14,
              class: 'faq-question-icon' + (expanded === i ? ' expanded' : ''),
            }),
            h('span', {}, item.question),
          ]),
          expanded === i &&
            h('div', { class: 'faq-answer' }, item.answer),
        ]),
      ),
    ),
  ]);
}

// ───────── 主组件 ─────────

const PANELS = {
  gallery: GallerySettings,
  node: NodeSettings,
  imageFields: ImageFieldPanel,
  storage: StorageSettings,
  faq: FAQ,
};

export function SettingsDialog({ isOpen, onClose }) {
  const [activeMenu, setActiveMenu] = useState(MENU_ITEMS[0].key);

  const ActivePanel = PANELS[activeMenu] || GallerySettings;

  return h(
    Dialog,
    {
      isOpen,
      onClose,
      title: '设置',
      titleIcon: h(Icon, { name: 'settings', size: 18 }),
      maxWidth: '720px',
      // 定高，避免切换不同 tab 时弹窗高度跳变
      height: '70vh',
      maxHeight: '80vh',
    },
    h('div', { class: 'settings-dialog' }, [
      h('div', { class: 'settings-sidebar' },
        MENU_ITEMS.map((item) =>
          h(
            'button',
            {
              key: item.key,
              class: 'settings-menu-item' + (activeMenu === item.key ? ' active' : ''),
              onClick: () => setActiveMenu(item.key),
            },
            [
              h(Icon, { name: item.icon, size: 14 }),
              item.label,
            ],
          ),
        ),
      ),
      h('div', { class: 'settings-content' }, h(ActivePanel)),
    ]),
  );
}
