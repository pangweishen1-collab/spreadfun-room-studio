export async function optimizeAtlasPng(png, level) {
  if (typeof Worker !== 'function') return png;
  let worker, timer;
  try {
    worker = new Worker(new URL('./atlas-png-worker.mjs', import.meta.url), {type: 'module'});
    return await new Promise(resolve => {
      worker.onmessage = ({data}) => resolve(
        data instanceof Blob && data.type === 'image/png' && data.size > 0 && data.size < png.size ? data : png,
      );
      worker.onerror = event => {
        event.preventDefault();
        resolve(png);
      };
      worker.onmessageerror = () => resolve(png);
      timer = setTimeout(() => resolve(png), 12000);
      worker.postMessage({png, level});
    });
  } catch {
    return png;
  } finally {
    clearTimeout(timer);
    worker?.terminate();
  }
}
