export async function checksum(data) {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function fetchVerifiedChunk(base, chunk, {signal, label}) {
  async function verify(response, gzip) {
    if (!response.ok) throw new Error(label + '分块未能加载，请检查网络后重试。');
    const data = gzip
      ? await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
      : await response.arrayBuffer();
    if (data.byteLength !== chunk.bytes || await checksum(data) !== chunk.sha256) {
      throw new Error(label + '分块校验失败，请重试。');
    }
    return data;
  }

  if (chunk.gzip === true && typeof DecompressionStream === 'function') {
    const compressed = new URL(`transfer/${chunk.file}.${chunk.sha256.slice(0, 16)}.gz`, base);
    try {
      return await verify(await fetch(compressed, {signal}), true);
    } catch (error) {
      if (signal?.aborted) throw error;
      // Keep the original asset as a retry path for a missing or corrupt variant.
    }
  }
  return verify(await fetch(new URL(chunk.file, base), {signal}), false);
}
