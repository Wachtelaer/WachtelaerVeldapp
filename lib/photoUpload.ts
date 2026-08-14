const KNOWN_IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'heic', 'heif', 'webp', 'gif'];

/**
 * Resolves a picked photo's uri to an uploadable blob + a trustworthy
 * content type. Native file:// uris carry a real extension, but web
 * blob: uris (from expo-image-picker's web implementation) don't — so
 * the browser-reported blob.type is preferred whenever it's a real
 * image type, and the uri extension is only a fallback.
 */
export async function resolveImageBlob(uri: string): Promise<{ blob: Blob; ext: string; contentType: string }> {
  const response = await fetch(uri);
  const blob = await response.blob();

  if (blob.type && blob.type.startsWith('image/')) {
    const ext = blob.type.split('/')[1] === 'jpeg' ? 'jpg' : blob.type.split('/')[1];
    return { blob, ext, contentType: blob.type };
  }

  const uriExt = uri.split('.').pop()?.toLowerCase();
  if (uriExt && KNOWN_IMAGE_EXTS.includes(uriExt)) {
    return { blob, ext: uriExt, contentType: `image/${uriExt === 'jpg' ? 'jpeg' : uriExt}` };
  }

  return { blob, ext: 'jpg', contentType: 'image/jpeg' };
}
