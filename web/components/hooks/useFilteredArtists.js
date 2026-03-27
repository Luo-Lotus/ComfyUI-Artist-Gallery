/**
 * 画师过滤和排序 Hook
 */
import { useMemo } from '../../lib/hooks.mjs';

export function useFilteredArtists(data, searchQuery, sortBy, sortOrder, showFavoritesOnly, favorites) {

    const filteredArtists = useMemo(() => {
        if (!data) return [];
        let result = [...data.artists];

        // 搜索过滤
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            result = result.filter((a) => a.name.toLowerCase().includes(query));
        }

        // 收藏过滤
        if (showFavoritesOnly) {
            result = result.filter((a) => favorites.has(a.name));
        }

        // 排序
        result.sort((a, b) => {
            let comparison = 0;
            if (sortBy === 'name') {
                comparison = a.name.localeCompare(b.name, 'zh-CN');
            } else if (sortBy === 'count') {
                comparison = a.imageCount - b.imageCount;
            } else if (sortBy === 'time') {
                // 使用预计算的 maxTime，避免重复计算
                comparison = (a.maxTime || 0) - (b.maxTime || 0);
            }
            return sortOrder === 'asc' ? comparison : -comparison;
        });

        return result;
    }, [data, searchQuery, sortBy, sortOrder, showFavoritesOnly, favorites]);

    return filteredArtists;
}
