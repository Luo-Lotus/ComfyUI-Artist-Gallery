// 在浏览器控制台运行这些命令来调试

// 1. 检查按钮是否存在
const btn = document.getElementById('artist-gallery-floating-btn');
console.log('按钮存在:', !!btn);
console.log('按钮元素:', btn);

// 2. 检查按钮的位置和样式
if (btn) {
    const styles = window.getComputedStyle(btn);
    console.log('按钮位置:', {
        left: styles.left,
        top: styles.top,
        right: styles.right,
        bottom: styles.bottom,
        position: styles.position,
        zIndex: styles.zIndex,
        display: styles.display,
        visibility: styles.visibility
    });
    console.log('按钮尺寸:', {
        width: styles.width,
        height: styles.height
    });
    console.log('按钮在视口内:', (
        parseInt(styles.left || styles.right) >= 0 &&
        parseInt(styles.left || styles.right) <= window.innerWidth &&
        parseInt(styles.top || styles.bottom) >= 0 &&
        parseInt(styles.top || styles.bottom) <= window.innerHeight
    ));
}

// 3. 检查样式是否加载
const styleLoaded = document.querySelector('link[href*="gallery.css"]');
console.log('样式文件加载:', !!styleLoaded);

// 4. 重置按钮位置到默认位置
if (btn) {
    btn.style.left = 'auto';
    btn.style.top = 'auto';
    btn.style.right = '30px';
    btn.style.bottom = '100px';
    console.log('按钮位置已重置到默认位置');
}
