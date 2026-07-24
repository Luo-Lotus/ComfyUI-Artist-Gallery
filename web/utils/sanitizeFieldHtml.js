const ALLOWED_TAGS = new Set([
  'A', 'ABBR', 'B', 'BLOCKQUOTE', 'BR', 'CODE', 'DEL', 'DIV', 'EM',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HR', 'I', 'KBD', 'LI', 'OL',
  'P', 'PRE', 'S', 'SMALL', 'SPAN', 'STRONG', 'SUB', 'SUP', 'TABLE',
  'TBODY', 'TD', 'TFOOT', 'TH', 'THEAD', 'TR', 'U', 'UL',
]);

const DROP_WITH_CONTENT_TAGS = new Set([
  'BASE', 'BUTTON', 'EMBED', 'FORM', 'IFRAME', 'INPUT', 'LINK', 'MATH',
  'META', 'NOSCRIPT', 'OBJECT', 'OPTION', 'SCRIPT', 'SELECT', 'STYLE',
  'SVG', 'TEMPLATE', 'TEXTAREA',
]);

const ALLOWED_ATTRIBUTES = {
  A: new Set(['href', 'target', 'title']),
  ABBR: new Set(['title']),
  TD: new Set(['colspan', 'rowspan']),
  TH: new Set(['colspan', 'rowspan', 'scope']),
};

const ALLOWED_STYLE_PROPERTIES = new Set([
  'align-items', 'background-color', 'border', 'border-bottom', 'border-color',
  'border-left', 'border-radius', 'border-right', 'border-style', 'border-top',
  'border-width', 'border-collapse', 'color', 'display', 'flex-direction',
  'flex-wrap', 'font-family', 'font-size', 'font-weight', 'gap', 'height',
  'justify-content', 'line-height', 'margin', 'margin-bottom', 'margin-left',
  'margin-right', 'margin-top', 'max-width', 'min-width', 'opacity', 'overflow',
  'overflow-wrap', 'overflow-x', 'overflow-y', 'padding', 'padding-bottom',
  'padding-left', 'padding-right', 'padding-top', 'table-layout', 'text-align',
  'text-decoration', 'vertical-align', 'white-space', 'width', 'word-break',
]);

function sanitizeStyleAttribute(element) {
  const rawStyle = element.getAttribute('style');
  if (!rawStyle) return;

  const probe = element.ownerDocument.createElement('span');
  probe.setAttribute('style', rawStyle);
  const declarations = [];
  for (let index = 0; index < probe.style.length; index += 1) {
    const property = probe.style.item(index).toLowerCase();
    const value = probe.style.getPropertyValue(property).trim();
    if (!ALLOWED_STYLE_PROPERTIES.has(property)) continue;
    if (/url\s*\(|expression\s*\(|@import|javascript\s*:|vbscript\s*:|behavior\s*:|-moz-binding/i.test(value)) {
      continue;
    }
    declarations.push(`${property}:${value}`);
  }

  if (declarations.length > 0) {
    element.setAttribute('style', declarations.join(';'));
  } else {
    element.removeAttribute('style');
  }
}

function isSafeHref(value) {
  const normalized = value
    .trim()
    .replace(/[\u0000-\u0020\u007f-\u009f]/g, '')
    .toLowerCase();

  if (!normalized) return false;
  const schemeMatch = normalized.match(/^([a-z][a-z0-9+.-]*):/);
  return !schemeMatch || ['http', 'https', 'mailto', 'tel'].includes(schemeMatch[1]);
}

function sanitizeAttributes(element) {
  const allowed = new Set(ALLOWED_ATTRIBUTES[element.tagName] || []);
  allowed.add('style');
  for (const attribute of Array.from(element.attributes)) {
    if (!allowed.has(attribute.name.toLowerCase())) {
      element.removeAttribute(attribute.name);
    }
  }
  sanitizeStyleAttribute(element);

  if (element.tagName === 'A') {
    const href = element.getAttribute('href');
    if (href && !isSafeHref(href)) element.removeAttribute('href');

    const target = element.getAttribute('target');
    if (target && !['_blank', '_self'].includes(target.toLowerCase())) {
      element.removeAttribute('target');
    }
    if (element.getAttribute('target')?.toLowerCase() === '_blank') {
      element.setAttribute('rel', 'noopener noreferrer');
    }
  }

  if (element.tagName === 'TD' || element.tagName === 'TH') {
    for (const name of ['colspan', 'rowspan']) {
      const value = element.getAttribute(name);
      if (value && (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 100)) {
        element.removeAttribute(name);
      }
    }
  }

  if (element.tagName === 'TH') {
    const scope = element.getAttribute('scope');
    if (scope && !['row', 'col', 'rowgroup', 'colgroup'].includes(scope.toLowerCase())) {
      element.removeAttribute('scope');
    }
  }
}

function sanitizeChildren(parent) {
  for (const node of Array.from(parent.childNodes)) {
    if (node.nodeType === Node.COMMENT_NODE) {
      node.remove();
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;

    if (DROP_WITH_CONTENT_TAGS.has(node.tagName)) {
      node.remove();
      continue;
    }

    if (!ALLOWED_TAGS.has(node.tagName)) {
      sanitizeChildren(node);
      while (node.firstChild) parent.insertBefore(node.firstChild, node);
      node.remove();
      continue;
    }

    sanitizeAttributes(node);
    sanitizeChildren(node);
  }
}

/**
 * 清洗图片字段返回的 HTML。只保留详情面板需要的安全富文本子集。
 */
export function sanitizeFieldHtml(value) {
  if (typeof value !== 'string' || !value) return '';
  const document = new DOMParser().parseFromString(value, 'text/html');
  sanitizeChildren(document.body);
  return document.body.innerHTML;
}
