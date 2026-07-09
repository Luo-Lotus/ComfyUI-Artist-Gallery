import { useState, useRef, useCallback, useEffect } from '../../lib/hooks.mjs';
import { shufflePixels } from '../../lib/gilbert.mjs';
import { buildImageUrl } from '../../utils.js';
import { showToast } from '../Toast.js';

const MAX_UNDO = 20;

export function useLightboxEditor() {
    const [editMode, setEditMode] = useState(false);
    const [activeTool, setActiveTool] = useState('none');
    const [brushColor, setBrushColor] = useState('#ff0000');
    const [brushSize, setBrushSize] = useState(10);
    const [mosaicBrushSize, setMosaicBrushSize] = useState(48);
    const [mosaicBlockSize, setMosaicBlockSize] = useState(12);
    const [canvasReady, setCanvasReady] = useState(false);

    const canvasRef = useRef(null);
    const undoStack = useRef([]);
    const isDrawing = useRef(false);
    const lastPoint = useRef(null);
    const strokeBlocks = useRef(new Set());
    const currentImage = useRef({ path: null, type: null });

    const getCtx = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        return canvas.getContext('2d');
    }, []);

    const pushUndo = useCallback(() => {
        const ctx = getCtx();
        if (!ctx) return;
        const canvas = canvasRef.current;
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
        undoStack.current.push(data);
        if (undoStack.current.length > MAX_UNDO) {
            undoStack.current.shift();
        }
    }, [getCtx]);

    const loadImageToCanvas = useCallback((imagePath, imageType) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const url = buildImageUrl(imagePath, imageType);
        const img = new Image();
        img.crossOrigin = 'anonymous';

        img.onload = () => {
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            setCanvasReady(true);
        };

        img.onerror = () => {
            showToast('加载图片到画布失败', 'error');
            setCanvasReady(false);
        };

        img.src = url;
    }, []);

    const enterEditMode = useCallback((imagePath, imageType) => {
        setEditMode(true);
        setActiveTool('none');
        undoStack.current = [];
        setCanvasReady(false);
        currentImage.current = { path: imagePath, type: imageType };
        requestAnimationFrame(() => {
            loadImageToCanvas(imagePath, imageType);
        });
    }, [loadImageToCanvas]);

    const exitEditMode = useCallback(() => {
        setEditMode(false);
        setActiveTool('none');
        undoStack.current = [];
        setCanvasReady(false);
        currentImage.current = { path: null, type: null };
    }, []);

    const restoreOriginal = useCallback(() => {
        const { path, type } = currentImage.current;
        if (!path) return;
        undoStack.current = [];
        setActiveTool('none');
        loadImageToCanvas(path, type);
    }, [loadImageToCanvas]);

    const handleUndo = useCallback(() => {
        if (undoStack.current.length === 0) return;
        const ctx = getCtx();
        if (!ctx) return;
        const data = undoStack.current.pop();
        ctx.putImageData(data, 0, 0);
    }, [getCtx]);

    const applyObfuscation = useCallback(() => {
        const ctx = getCtx();
        const canvas = canvasRef.current;
        if (!ctx || !canvas) return;
        pushUndo();
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        shufflePixels(imageData, canvas.width, canvas.height, true);
        ctx.putImageData(imageData, 0, 0);
    }, [getCtx, pushUndo]);

    const getCanvasPoint = useCallback((e) => {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY,
        };
    }, []);

    const drawLine = useCallback((ctx, from, to, color, size) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
    }, []);

    const drawBrushDot = useCallback((ctx, point, color, size) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(point.x, point.y, size / 2, 0, Math.PI * 2);
        ctx.fill();
    }, []);

    const applyMosaicAtPoint = useCallback((ctx, point) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const brushRadius = Math.max(2, mosaicBrushSize / 2);
        const blockSize = Math.max(2, mosaicBlockSize);
        const startX = Math.max(0, Math.floor((point.x - brushRadius) / blockSize) * blockSize);
        const startY = Math.max(0, Math.floor((point.y - brushRadius) / blockSize) * blockSize);
        const endX = Math.min(canvas.width, Math.ceil((point.x + brushRadius) / blockSize) * blockSize);
        const endY = Math.min(canvas.height, Math.ceil((point.y + brushRadius) / blockSize) * blockSize);
        const radiusLimit = brushRadius + blockSize * 0.72;

        for (let by = startY; by < endY; by += blockSize) {
            for (let bx = startX; bx < endX; bx += blockSize) {
                const bw = Math.min(blockSize, canvas.width - bx);
                const bh = Math.min(blockSize, canvas.height - by);
                if (bw <= 0 || bh <= 0) continue;

                const cx = bx + bw / 2;
                const cy = by + bh / 2;
                const dx = cx - point.x;
                const dy = cy - point.y;
                if ((dx * dx + dy * dy) > radiusLimit * radiusLimit) continue;

                const blockKey = `${bx}:${by}`;
                if (strokeBlocks.current.has(blockKey)) continue;
                strokeBlocks.current.add(blockKey);

                let data;
                try {
                    data = ctx.getImageData(bx, by, bw, bh).data;
                } catch {
                    continue;
                }

                let r = 0;
                let g = 0;
                let b = 0;
                let a = 0;
                let count = 0;
                const sampleStep = Math.max(1, Math.floor(Math.sqrt((bw * bh) / 80)));
                for (let sy = 0; sy < bh; sy += sampleStep) {
                    for (let sx = 0; sx < bw; sx += sampleStep) {
                        const i = (sy * bw + sx) * 4;
                        r += data[i];
                        g += data[i + 1];
                        b += data[i + 2];
                        a += data[i + 3];
                        count += 1;
                    }
                }
                if (!count) continue;

                ctx.fillStyle = `rgba(${Math.round(r / count)}, ${Math.round(g / count)}, ${Math.round(b / count)}, ${(a / count / 255).toFixed(3)})`;
                ctx.fillRect(bx, by, bw, bh);
            }
        }
    }, [mosaicBrushSize, mosaicBlockSize]);

    const drawMosaicStroke = useCallback((ctx, from, to) => {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const step = Math.max(1, Math.min(mosaicBlockSize, mosaicBrushSize / 4));
        const steps = Math.max(1, Math.ceil(distance / step));

        for (let i = 1; i <= steps; i += 1) {
            const t = i / steps;
            applyMosaicAtPoint(ctx, {
                x: from.x + dx * t,
                y: from.y + dy * t,
            });
        }
    }, [applyMosaicAtPoint, mosaicBrushSize, mosaicBlockSize]);

    const handleDrawStart = useCallback((e) => {
        if (activeTool !== 'brush' && activeTool !== 'mosaic') return;
        if (e.button !== undefined && e.button !== 0) return;
        e.preventDefault();
        const point = getCanvasPoint(e);
        if (!point) return;
        const ctx = getCtx();
        if (!ctx) return;

        pushUndo();
        isDrawing.current = true;
        lastPoint.current = point;
        strokeBlocks.current = new Set();

        if (activeTool === 'brush') {
            drawBrushDot(ctx, point, brushColor, brushSize);
        } else {
            applyMosaicAtPoint(ctx, point);
        }
    }, [activeTool, pushUndo, getCanvasPoint, getCtx, drawBrushDot, brushColor, brushSize, applyMosaicAtPoint]);

    const handleDrawMove = useCallback((e) => {
        if (!isDrawing.current || (activeTool !== 'brush' && activeTool !== 'mosaic')) return;
        if (e.button !== undefined && e.button !== 0) return;
        e.preventDefault();
        const point = getCanvasPoint(e);
        if (!point || !lastPoint.current) return;
        const ctx = getCtx();
        if (!ctx) return;
        if (activeTool === 'brush') {
            drawLine(ctx, lastPoint.current, point, brushColor, brushSize);
        } else {
            drawMosaicStroke(ctx, lastPoint.current, point);
        }
        lastPoint.current = point;
    }, [activeTool, getCanvasPoint, getCtx, drawLine, brushColor, brushSize, drawMosaicStroke]);

    const handleDrawEnd = useCallback(() => {
        isDrawing.current = false;
        lastPoint.current = null;
        strokeBlocks.current = new Set();
    }, []);

    useEffect(() => {
        if (!editMode) return;
        const handleKeyDown = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                e.preventDefault();
                handleUndo();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [editMode, handleUndo]);

    return {
        editMode,
        activeTool,
        brushColor,
        brushSize,
        mosaicBrushSize,
        mosaicBlockSize,
        canvasReady,
        canvasRef,
        setActiveTool,
        setBrushColor,
        setBrushSize,
        setMosaicBrushSize,
        setMosaicBlockSize,
        enterEditMode,
        exitEditMode,
        applyObfuscation,
        restoreOriginal,
        handleUndo,
        handleBrushStart: handleDrawStart,
        handleBrushMove: handleDrawMove,
        handleBrushEnd: handleDrawEnd,
        handleDrawStart,
        handleDrawMove,
        handleDrawEnd,
    };
}
