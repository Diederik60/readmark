// Path helpers that work for both POSIX (macOS) and Windows paths.

const isWindowsPath = (p) => /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith("\\\\");

export function basename(path) {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

export function dirname(path) {
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return i <= 0 ? path.slice(0, i + 1) : path.slice(0, i);
}

export function extname(path) {
  const name = basename(path);
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toLowerCase() : "";
}

/** True for URLs with a scheme (https:, mailto:, data:, ...). */
export function hasScheme(href) {
  return /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(href) && !/^[a-zA-Z]:[\\/]/.test(href);
}

/**
 * Resolve a (URL-encoded) relative reference such as `img/a%20b.png` or
 * `../notes.md` against a base directory. Returns an absolute file path.
 */
export function resolvePath(baseDir, ref) {
  let rel = ref;
  try {
    rel = decodeURI(ref);
  } catch {
    /* keep as is */
  }
  const windows = isWindowsPath(baseDir);
  const sep = windows ? "\\" : "/";

  let root;
  let segments;
  if (rel.startsWith("/") && !windows) {
    root = "/";
    segments = rel.split("/");
  } else if (isWindowsPath(rel)) {
    root = "";
    segments = rel.split(/[\\/]/);
  } else {
    root = windows ? "" : "/";
    segments = [...baseDir.split(/[\\/]/), ...rel.split(/[\\/]/)];
  }

  const out = [];
  for (const seg of segments) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") out.pop();
    else out.push(seg);
  }
  return root + out.join(sep);
}
