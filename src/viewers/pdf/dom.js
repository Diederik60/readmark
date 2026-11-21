// Tiny DOM helpers.

/** el("button.cls", { title: "x", onclick }, [children]) */
export function el(spec, props = {}, children = []) {
  const [tag, ...classes] = spec.split(".");
  const node = document.createElement(tag || "div");
  if (classes.length) node.className = classes.join(" ");
  for (const [key, value] of Object.entries(props)) {
    if (value == null) continue;
    if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key === "html") node.innerHTML = value;
    else if (key === "value") node.value = value; // textarea ignores the attribute
    else if (key in node && typeof value !== "string") node[key] = value;
    else node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) {
    if (child != null) node.append(child);
  }
  return node;
}

export const icons = {
  sidebar:
    '<svg viewBox="0 0 16 16" width="16" height="16"><path fill="currentColor" d="M2.5 2h11A1.5 1.5 0 0 1 15 3.5v9a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 12.5v-9A1.5 1.5 0 0 1 2.5 2Zm0 1a.5.5 0 0 0-.5.5v9a.5.5 0 0 0 .5.5H5V3H2.5ZM6 3v10h7.5a.5.5 0 0 0 .5-.5v-9a.5.5 0 0 0-.5-.5H6Z"/></svg>',
  up: '<svg viewBox="0 0 16 16" width="16" height="16"><path fill="currentColor" d="M8 4.3 2.9 9.4l.7.7L8 5.7l4.4 4.4.7-.7L8 4.3Z"/></svg>',
  down: '<svg viewBox="0 0 16 16" width="16" height="16"><path fill="currentColor" d="m8 11.7 5.1-5.1-.7-.7L8 10.3 3.6 5.9l-.7.7L8 11.7Z"/></svg>',
  minus: '<svg viewBox="0 0 16 16" width="16" height="16"><path fill="currentColor" d="M3 7.5h10v1H3z"/></svg>',
  plus: '<svg viewBox="0 0 16 16" width="16" height="16"><path fill="currentColor" d="M7.5 3h1v4.5H13v1H8.5V13h-1V8.5H3v-1h4.5z"/></svg>',
  fit: '<svg viewBox="0 0 16 16" width="16" height="16"><path fill="currentColor" d="M1 4h1v8H1zm13 0h1v8h-1zM3.6 8l2.2 2.2-.7.7L2.2 8l2.9-2.9.7.7L3.6 8Zm8.8 0-2.2-2.2.7-.7L13.8 8l-2.9 2.9-.7-.7L12.4 8ZM5 7.5h6v1H5z"/></svg>',
  note: '<svg viewBox="0 0 16 16" width="16" height="16"><path fill="currentColor" d="M3 2h10a1 1 0 0 1 1 1v7.6a1 1 0 0 1-.3.7l-3.4 3.4a1 1 0 0 1-.7.3H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Zm0 1v11h6v-3a1 1 0 0 1 1-1h3V3H3Zm7 10.3L12.3 11H10v2.3ZM5 5.5h6v1H5Zm0 2h6v1H5Z"/></svg>',
  search:
    '<svg viewBox="0 0 16 16" width="16" height="16"><path fill="currentColor" d="M6.5 1a5.5 5.5 0 0 1 4.4 8.8l3.9 3.9-.7.7-3.9-3.9A5.5 5.5 0 1 1 6.5 1Zm0 1a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Z"/></svg>',
  comments:
    '<svg viewBox="0 0 16 16" width="16" height="16"><path fill="currentColor" d="M2.5 2h11A1.5 1.5 0 0 1 15 3.5v7a1.5 1.5 0 0 1-1.5 1.5H8.2l-3.4 2.7A.5.5 0 0 1 4 14.3V12H2.5A1.5 1.5 0 0 1 1 10.5v-7A1.5 1.5 0 0 1 2.5 2Zm0 1a.5.5 0 0 0-.5.5v7a.5.5 0 0 0 .5.5H5v2.3L7.9 11h5.6a.5.5 0 0 0 .5-.5v-7a.5.5 0 0 0-.5-.5h-11Z"/></svg>',
  save: '<svg viewBox="0 0 16 16" width="16" height="16"><path fill="currentColor" d="M3 1.5h8.3l3.2 3.2V13a1.5 1.5 0 0 1-1.5 1.5H3A1.5 1.5 0 0 1 1.5 13V3A1.5 1.5 0 0 1 3 1.5Zm0 1a.5.5 0 0 0-.5.5v10a.5.5 0 0 0 .5.5h1V9.5A1.5 1.5 0 0 1 5.5 8h5A1.5 1.5 0 0 1 12 9.5v4h1a.5.5 0 0 0 .5-.5V5.1l-2.6-2.6H11v2A1.5 1.5 0 0 1 9.5 6h-4A1.5 1.5 0 0 1 4 4.5v-2H3Zm2 0v2a.5.5 0 0 0 .5.5h4a.5.5 0 0 0 .5-.5v-2H5Zm6 11v-4a.5.5 0 0 0-.5-.5h-5a.5.5 0 0 0-.5.5v4h6Z"/></svg>',
  trash:
    '<svg viewBox="0 0 16 16" width="14" height="14"><path fill="currentColor" d="M6 1h4a1 1 0 0 1 1 1v1h3v1h-1v9.5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 13.5V4H2V3h3V2a1 1 0 0 1 1-1Zm0 2h4V2H6v1ZM4 4v9.5a.5.5 0 0 0 .5.5h7a.5.5 0 0 0 .5-.5V4H4Zm2 2h1v6H6V6Zm3 0h1v6H9V6Z"/></svg>',
  close: '<svg viewBox="0 0 16 16" width="14" height="14"><path fill="currentColor" d="m8 7.3 4.6-4.7.8.8L8.7 8l4.7 4.6-.8.8L8 8.7l-4.6 4.7-.8-.8L7.3 8 2.6 3.4l.8-.8L8 7.3Z"/></svg>',
  bubble:
    '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" stroke="rgba(0,0,0,.45)" stroke-width="1.2" d="M4 3h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-7.5L7 21.5V17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path fill="rgba(0,0,0,.5)" d="M6 7h12v1.5H6zm0 3.5h9V12H6z"/></svg>',
};
