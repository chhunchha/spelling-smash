type Child = Node | string | null | false | undefined;
type Props = { class?: string; [key: string]: string | boolean | EventListener | undefined };

/** Tiny element builder: h('button', { class: 'btn', onclick: fn }, 'Label'). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === false) continue;
    if (key === 'class') el.className = value as string;
    else if (key.startsWith('on')) el.addEventListener(key.slice(2), value as EventListener);
    else el.setAttribute(key, value === true ? '' : (value as string));
  }
  for (const child of children) {
    if (child) el.append(child);
  }
  return el;
}
