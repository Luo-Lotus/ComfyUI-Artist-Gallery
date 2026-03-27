/**
 * Artist Selector Widget
 * 画师选择节点的自定义控件
 */
import { app } from '../../../scripts/app.js';
import { $el } from '../../../scripts/ui.js';

app.registerExtension({
    name: 'ArtistGallery.ArtistSelector',

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name === 'ArtistSelector') {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                onNodeCreated?.apply(this, arguments);

                // 设置节点大小
                this.setSize([400, 500]);

                const nodeInstance = this;

                // 获取由 INPUT_TYPES 自动创建的隐藏 widgets
                const selectedInput = this.widgets.find(w => w.name === "selected_artists");
                const metadataInput = this.widgets.find(w => w.name === "metadata");

                // 配置隐藏显示
                if (selectedInput) {
                    selectedInput.computeSize = () => [0, -4];
                    selectedInput.draw = () => {};
                    selectedInput.type = "hidden";
                }

                if (metadataInput) {
                    metadataInput.computeSize = () => [0, -4];
                    metadataInput.draw = () => {};
                    metadataInput.type = "hidden";
                }

                // 创建容器
                const container = $el("div.artist-selector-widget", {
                    style: {
                        width: "100%",
                        minHeight: "260px",
                        height: "100%",
                        background: "#1e1e1e",
                        borderRadius: "8px",
                        padding: "12px",
                        boxSizing: "border-box",
                        display: "flex",
                        flexDirection: "column",
                        gap: "10px",
                        overflow: "hidden"
                    }
                });

                // 添加初始加载提示
                container.innerHTML = '<div class="artist-selector-loading">Loading artist selector...</div>';

                // 添加DOM widget
                this.addDOMWidget("artist_selector_widget", "div", container, {
                    onDraw: () => {}
                });

                // 等待 Preact 加载
                setTimeout(async () => {
                    // 等待全局 hooks 可用（由 artist_gallery.js 提供）
                    const waitForHooks = () => {
                        return new Promise((resolve) => {
                            const checkHooks = () => {
                                if (self.preactCore && self.preactHooks) {
                                    resolve();
                                } else {
                                    setTimeout(checkHooks, 100);
                                }
                            };
                            checkHooks();
                        });
                    };

                    await waitForHooks();

                    const { h, render } = self.preactCore;
                    const { useState, useEffect, useMemo } = self.preactHooks;

                    // 渲染函数
                    const renderWidget = () => {
                        function ArtistSelectorComponent() {
                            // 状态管理 - 所有 hooks 必须在组件内调用
                            const [artists, setArtists] = useState([]);
                            const [selectedIds, setSelectedIds] = useState(new Set());
                            const [loading, setLoading] = useState(true);
                            const [searchQuery, setSearchQuery] = useState('');
                            const [hoveredImage, setHoveredImage] = useState(null);
                            const [hoverPosition, setHoverPosition] = useState({ x: 0, y: 0 });
                            const [sortBy, setSortBy] = useState('name');
                            const [sortOrder, setSortOrder] = useState('asc');

                            // 加载画师列表
                            useEffect(() => {
                                const loadArtists = async () => {
                                    try {
                                        const response = await fetch('/artist_gallery/artists');
                                        const data = await response.json();
                                        setArtists(data.artists || []);

                                        // 画师列表加载后，恢复之前的选择
                                        const savedSelection = localStorage.getItem('artist_selector_selection');
                                        if (savedSelection) {
                                            try {
                                                const savedIds = JSON.parse(savedSelection);
                                                if (Array.isArray(savedIds) && savedIds.length > 0) {
                                                    setSelectedIds(new Set(savedIds));
                                                }
                                            } catch (e) {
                                                console.error('[ArtistSelector] Failed to load saved selection:', e);
                                            }
                                        }
                                    } catch (error) {
                                        console.error('[ArtistSelector] Failed to load artists:', error);
                                    } finally {
                                        setLoading(false);
                                    }
                                };
                                loadArtists();
                            }, []);

                            // 过滤和排序
                            const filteredArtists = useMemo(() => {
                                if (!artists || artists.length === 0) return [];
                                let result = [...artists];

                                if (searchQuery) {
                                    const query = searchQuery.toLowerCase();
                                    result = result.filter(a =>
                                        a.name.toLowerCase().includes(query) ||
                                        a.displayName.toLowerCase().includes(query)
                                    );
                                }

                                result.sort((a, b) => {
                                    let comparison = 0;
                                    if (sortBy === 'name') {
                                        comparison = a.name.localeCompare(b.name, 'zh-CN');
                                    } else if (sortBy === 'created_at') {
                                        comparison = a.createdAt - b.createdAt;
                                    } else if (sortBy === 'image_count') {
                                        comparison = a.imageCount - b.imageCount;
                                    }
                                    return sortOrder === 'asc' ? comparison : -comparison;
                                });

                                return result;
                            }, [artists, searchQuery, sortBy, sortOrder]);

                            const toggleSelection = (artistId) => {
                                const newSelected = new Set(selectedIds);
                                if (newSelected.has(artistId)) {
                                    newSelected.delete(artistId);
                                } else {
                                    newSelected.add(artistId);
                                }
                                setSelectedIds(newSelected);

                                // 保存到 localStorage
                                localStorage.setItem('artist_selector_selection', JSON.stringify([...newSelected]));

                                updateNodeValue(newSelected);
                            };

                            const updateNodeValue = (selectedSet) => {
                                const selectedArtists = artists.filter(a => selectedSet.has(a.id));

                                if (selectedArtists.length > 0) {
                                    // 原样输出，不添加或删除任何符号
                                    const artistsString = selectedArtists.map(a => a.name).join(',');
                                    const metadata = {
                                        artist_ids: selectedArtists.map(a => a.id),
                                        artist_names: selectedArtists.map(a => a.name),
                                        display_names: selectedArtists.map(a => a.displayName)
                                    };

                                    // 更新隐藏的 inputs
                                    if (selectedInput) selectedInput.value = artistsString;
                                    if (metadataInput) metadataInput.value = JSON.stringify(metadata);
                                } else {
                                    if (selectedInput) selectedInput.value = "";
                                    if (metadataInput) metadataInput.value = "{}";
                                }

                                // 触发节点更新和重新执行
                                if (nodeInstance.graph) {
                                    nodeInstance.graph.change();
                                }
                                nodeInstance.setDirtyCanvas(true, true);
                            };

                            const handleMouseEnter = (artist, event) => {
                                if (artist.imageCount > 0) {
                                    fetch(`/artist_gallery/artist/${artist.id}/images`)
                                        .then(res => res.json())
                                        .then(data => {
                                            if (data.images && data.images.length > 0) {
                                                const imagePath = data.images[0].path;
                                                const imageUrl = `/view?filename=${imagePath}`;
                                                setHoveredImage(imageUrl);
                                                setHoverPosition({
                                                    x: event.clientX + 15,
                                                    y: event.clientY + 15
                                                });
                                            }
                                        });
                                }
                            };

                            const selectedArtistsList = artists.filter(a => selectedIds.has(a.id));

                            return h('div', {
                                class: 'artist-selector-container'
                            }, [
                                // 顶部：已选择的画师
                                h('div', {
                                    class: 'artist-selector-selected-section'
                                }, [
                                    h('div', {
                                        class: 'artist-selector-label'
                                    }, `已选择 (${selectedArtistsList.length})`),
                                    h('div', {
                                        class: 'artist-selector-selected-list'
                                    },
                                        selectedArtistsList.length > 0
                                            ? selectedArtistsList.map(artist =>
                                                h('span', {
                                                    key: artist.id,
                                                    class: 'artist-selector-tag'
                                                }, [
                                                    artist.displayName,
                                                    h('button', {
                                                        onClick: (e) => {
                                                            e.stopPropagation();
                                                            toggleSelection(artist.id);
                                                        }
                                                    }, '×')
                                                ])
                                            )
                                            : h('span', {
                                                class: 'artist-selector-empty'
                                            }, '未选择画师')
                                    )
                                ]),

                                // 搜索框
                                h('input', {
                                    type: 'text',
                                    class: 'artist-selector-search',
                                    placeholder: '搜索画师...',
                                    value: searchQuery,
                                    onInput: (e) => setSearchQuery(e.target.value)
                                }),

                                // 排序控件
                                h('div', {
                                    class: 'artist-selector-sort-controls'
                                }, [
                                    h('select', {
                                        class: 'artist-selector-sort-select',
                                        value: sortBy,
                                        onChange: (e) => setSortBy(e.target.value)
                                    }, [
                                        h('option', { value: 'name' }, '名称'),
                                        h('option', { value: 'created_at' }, '创建时间'),
                                        h('option', { value: 'image_count' }, '图片数量')
                                    ]),
                                    h('button', {
                                        class: 'artist-selector-sort-button',
                                        onClick: () => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
                                    }, sortOrder === 'asc' ? '↑ 升序' : '↓ 降序')
                                ]),

                                // 画师列表
                                h('div', {
                                    class: 'artist-selector-list'
                                },
                                    loading
                                        ? h('div', {
                                            class: 'artist-selector-loading'
                                        }, '加载中...')
                                        : filteredArtists.length === 0
                                            ? h('div', {
                                                class: 'artist-selector-empty-artists'
                                            }, '没有找到画师')
                                            : filteredArtists.map(artist =>
                                                h('div', {
                                                    key: artist.id,
                                                    class: `artist-selector-item ${selectedIds.has(artist.id) ? 'selected' : ''}`,
                                                    onClick: () => toggleSelection(artist.id),
                                                    onMouseEnter: (e) => handleMouseEnter(artist, e),
                                                    onMouseLeave: () => setHoveredImage(null)
                                                }, [
                                                    h('div', {
                                                        class: 'artist-selector-item-info'
                                                    }, [
                                                        h('span', {
                                                            class: 'artist-selector-item-name'
                                                        }, artist.displayName),
                                                        h('span', {
                                                            class: 'artist-selector-item-count'
                                                        }, `${artist.imageCount}张`)
                                                    ]),
                                                    selectedIds.has(artist.id) &&
                                                        h('span', {
                                                            class: 'artist-selector-item-check'
                                                        }, '✓')
                                                ])
                                            )
                                ),

                                // 图片预览悬浮窗
                                hoveredImage && h('div', {
                                    class: 'artist-selector-hover-preview',
                                    style: {
                                        left: `${hoverPosition.x}px`,
                                        top: `${hoverPosition.y}px`
                                    }
                                }, [
                                    h('img', {
                                        src: hoveredImage
                                    })
                                ])
                            ]);
                        }

                        return h(ArtistSelectorComponent);
                    };

                    // 初始渲染
                    try {
                        const vnode = renderWidget();
                        render(vnode, container);
                    } catch (e) {
                        console.error('[ArtistSelector] Render failed:', e);
                    }
                }, 100);
            };
        }
    }
});
