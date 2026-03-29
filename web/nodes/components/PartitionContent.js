/**
 * 分区内容组件
 * 显示分区中的画师和分类标签
 */
import { h } from '../../lib/preact.mjs';

export function PartitionContent({
    artists,
    partitionCategories,
    partitionId,
    onArtistMove,
    onCategoryMove,
    onArtistRemove,
    onCategoryRemove,
    onDragOver,
    onDragLeave,
    onDrop,
}) {
    // 渲染分类标签
    const renderCategoryTag = (category) => {
        return h('span', {
            key: `cat-${category.id}`,
            class: 'artist-selector-tag category-tag',
            draggable: true,
            onDragStart: (e) => {
                e.dataTransfer.setData('text/plain', JSON.stringify({
                    type: 'category',
                    id: category.id,
                }));
                e.dataTransfer.effectAllowed = 'move';
            },
        }, [
            h('span', { class: 'artist-selector-tag-icon' }, '📁'),
            category.name,
            h('button', {
                class: 'artist-remove-btn',
                onClick: (e) => {
                    e.stopPropagation();
                    onCategoryRemove(category.id);
                },
            }, '×'),
        ]);
    };

    // 渲染画师标签
    const renderArtistTag = (artist) => {
        const key = `${artist.categoryId}:${artist.name}`;

        return h('span', {
            key: key,
            class: 'artist-selector-tag',
            draggable: true,
            onDragStart: (e) => {
                e.dataTransfer.setData('text/plain', JSON.stringify({
                    type: 'artist',
                    key: key,
                }));
                e.dataTransfer.effectAllowed = 'move';
            },
        }, [
            h('span', { class: 'artist-name' }, artist.displayName || artist.name),
            h('button', {
                class: 'artist-remove-btn',
                onClick: (e) => {
                    e.stopPropagation();
                    onArtistRemove(key);
                },
            }, '×'),
        ]);
    };

    const hasContent = artists.length > 0 || partitionCategories.length > 0;

    return h('div', {
        class: 'partition-artists',
        onDragOver: (e) => onDragOver(e),
        onDragLeave: () => onDragLeave(),
        onDrop: (e) => onDrop(e),
    }, [
        // 渲染该分区的分类
        ...partitionCategories.map(renderCategoryTag),

        // 渲染该分区的画师
        hasContent
            ? artists.map(renderArtistTag)
            : h('div', { class: 'partition-empty' }, '拖拽画师或分类到此处'),
    ]);
}
