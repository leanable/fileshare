export function fmtSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export function fmtDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function extOf(name: string): string {
  return name.split(".").pop()?.toLowerCase() || "";
}

// Icons live in /public/icons/<name>.png
const ICON_ALIASES: Record<string, string> = {
  // archives without their own icon
  bz2: "archive", xz: "archive", tgz: "archive", zst: "archive", iso: "archive",
  // close relatives
  htm: "html", jsx: "js", mjs: "js", tsx: "ts",
  markdown: "md", tsv: "csv", yml: "json", yaml: "json",
  log: "txt", rtf: "txt",
  heic: "png", bmp: "png", ico: "png",
  mpeg: "mp4", m4v: "mp4", "3gp": "mp4",
  aac: "m4a", opus: "ogg", wma: "mp3",
};

const KNOWN_ICONS = new Set([
  "pdf", "png", "jpg", "jpeg", "gif", "webp", "svg", "avif",
  "mp4", "webm", "mov", "mkv", "avi",
  "mp3", "wav", "ogg", "flac", "m4a",
  "zip", "rar", "7z", "tar", "gz", "archive",
  "txt", "md", "csv", "json", "xml",
  "doc", "docx", "xls", "xlsx", "ppt", "pptx",
  "js", "ts", "py", "html", "css", "cs",
]);

/** Returns the public URL of the icon image for a filename. */
export function iconFor(name: string): string {
  const ext = extOf(name);
  const key = KNOWN_ICONS.has(ext) ? ext : ICON_ALIASES[ext] || "txt";
  return `/icons/${key}.png`;
}

export function nameFromPathname(pathname: string): string {
  return pathname.split("/").pop() || pathname;
}
