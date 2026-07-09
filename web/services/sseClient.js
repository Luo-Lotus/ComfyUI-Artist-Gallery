export function buildSSEUrl(path, params = {}) {
  const search = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item != null && item !== '') search.append(key, item);
      });
      return;
    }
    if (value != null && value !== '') {
      search.set(key, value);
    }
  });

  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

export function createSSE(url, handlers = {}) {
  const source = new EventSource(url);

  const parse = (event) => {
    try {
      return JSON.parse(event.data || '{}');
    } catch (e) {
      return {};
    }
  };

  source.addEventListener('progress', (event) => {
    handlers.onProgress?.(parse(event));
  });

  source.addEventListener('done', (event) => {
    handlers.onDone?.(parse(event));
    source.close();
  });

  source.addEventListener('error', (event) => {
    handlers.onError?.(event);
    source.close();
  });

  return () => source.close();
}
