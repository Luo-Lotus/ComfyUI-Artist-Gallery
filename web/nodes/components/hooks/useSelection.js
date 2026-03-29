/**
 * 画师选择管理 Hook
 * 负责画师和分类的选择状态管理
 */
import { useState, useCallback } from '../../../lib/hooks.mjs';

export function useSelection(artists) {
    // 选择状态
    const [selectedKeys, setSelectedKeys] = useState(new Set()); // 使用组合键 "categoryId:name"
    const [selectedArtistsCache, setSelectedArtistsCache] = useState({}); // 缓存所有已选择的画师信息
    const [selectedCategories, setSelectedCategories] = useState(new Set()); // 已选择的分类

    // 辅助函数：创建画师键
    const makeArtistKey = useCallback((categoryId, name) => {
        return `${categoryId}:${name}`;
    }, []);

    // 辅助函数：解析画师键
    const parseArtistKey = useCallback((key) => {
        const parts = key.split(':');
        return {
            categoryId: parts.slice(0, -1).join(':'), // 处理名称中可能包含冒号的情况
            name: parts[parts.length - 1],
        };
    }, []);

    // 切换画师选择状态（使用函数式更新避免闭包陷阱）
    const toggleSelection = useCallback((categoryId, name) => {
        const key = makeArtistKey(categoryId, name);

        // 使用函数式更新确保获取最新状态
        setSelectedKeys((prevSelectedKeys) => {
            const newSelected = new Set(prevSelectedKeys);
            const isAdding = !newSelected.has(key);

            if (isAdding) {
                newSelected.add(key);
            } else {
                newSelected.delete(key);
            }

            // 同时更新缓存
            setSelectedArtistsCache((prevCache) => {
                const newCache = { ...prevCache };
                if (isAdding) {
                    // 从当前画师列表中找到完整的画师信息并缓存
                    const artist = artists.find(
                        (a) => a.categoryId === categoryId && a.name === name,
                    );
                    if (artist) {
                        newCache[key] = artist;
                    }
                } else {
                    delete newCache[key];
                }
                return newCache;
            });

            return newSelected;
        });
    }, [artists, makeArtistKey]);

    // 切换分类选择状态（使用函数式更新避免闭包陷阱）
    const toggleCategorySelection = useCallback((categoryId) => {
        // 使用函数式更新确保获取最新状态
        setSelectedCategories((prevSelectedCats) => {
            const newSelectedCats = new Set(prevSelectedCats);
            const isAdding = !newSelectedCats.has(categoryId);

            if (isAdding) {
                newSelectedCats.add(categoryId);
            } else {
                newSelectedCats.delete(categoryId);
            }

            return newSelectedCats;
        });
    }, []);

    return {
        // 状态
        selectedKeys,
        selectedArtistsCache,
        selectedCategories,

        // 操作
        setSelectedKeys,
        setSelectedCategories,
        toggleSelection,
        toggleCategorySelection,
        makeArtistKey,
        parseArtistKey,
    };
}
