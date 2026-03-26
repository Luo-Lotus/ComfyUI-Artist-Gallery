/**
 * 拖动功能类
 */
export class Draggable {
    constructor(element, onDragEnd = null) {
        this.element = element;
        this.onDragEnd = onDragEnd;
        this.isDragging = false;
        this.hasMoved = false;
        this.startX = 0;
        this.startY = 0;
        this.initialX = 0;
        this.initialY = 0;
        this.bindEvents();
    }

    bindEvents() {
        this.element.addEventListener(
            'mousedown',
            this.handleMouseDown.bind(this),
        );
        document.addEventListener(
            'mousemove',
            this.handleMouseMove.bind(this),
        );
        document.addEventListener('mouseup', this.handleMouseUp.bind(this));
    }

    handleMouseDown(e) {
        this.isDragging = true;
        this.hasMoved = false;
        this.startX = e.clientX;
        this.startY = e.clientY;
        this.initialX = this.element.offsetLeft;
        this.initialY = this.element.offsetTop;
        this.element.style.cursor = 'grabbing';
        this.element.style.transition = 'none';
    }

    handleMouseMove(e) {
        if (!this.isDragging) return;
        const dx = e.clientX - this.startX;
        const dy = e.clientY - this.startY;
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
            this.hasMoved = true;
        }
        const newX = this.initialX + dx;
        const newY = this.initialY + dy;
        const maxX = window.innerWidth - this.element.offsetWidth;
        const maxY = window.innerHeight - this.element.offsetHeight;
        this.element.style.left =
            Math.max(0, Math.min(newX, maxX)) + 'px';
        this.element.style.top =
            Math.max(0, Math.min(newY, maxY)) + 'px';
        this.element.style.right = 'auto';
        this.element.style.bottom = 'auto';
    }

    handleMouseUp(e) {
        if (!this.isDragging) return;
        this.isDragging = false;
        this.element.style.cursor = 'move';
        this.element.style.transition = 'box-shadow 0.2s, transform 0.1s';
        if (this.onDragEnd) {
            this.onDragEnd(this.hasMoved);
        }
    }
}
