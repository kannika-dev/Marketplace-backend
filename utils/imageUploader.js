/**
 * Image Uploader Utility
 * Formats uploaded image metadata and generates accessible URL paths
 */
export const formatUploadedFileUrl = (req, filename) => {
  if (!filename) return null;
  const protocol = req.protocol;
  const host = req.get('host');
  return `${protocol}://${host}/uploads/${filename}`;
};

export const sanitizeFileName = (name) => {
  return name.replace(/[^a-zA-Z0-9.-]/g, '_');
};
