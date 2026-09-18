/** Minimal head-tag manager (no extra dependency): upsert + restore. */

export function setMetaName(name: string, content: string): () => void {
  let el = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  const created = !el;
  const prev = el?.getAttribute("content") ?? null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
  const node = el;
  return () => {
    if (created) node.remove();
    else if (prev !== null) node.setAttribute("content", prev);
  };
}

export function setMetaProperty(property: string, content: string): () => void {
  let el = document.querySelector<HTMLMetaElement>(
    `meta[property="${property}"]`
  );
  const created = !el;
  const prev = el?.getAttribute("content") ?? null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("property", property);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
  const node = el;
  return () => {
    if (created) node.remove();
    else if (prev !== null) node.setAttribute("content", prev);
  };
}

export function setCanonical(href: string): () => void {
  let el = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  const created = !el;
  const prev = el?.getAttribute("href") ?? null;
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
  const node = el;
  return () => {
    if (created) node.remove();
    else if (prev !== null) node.setAttribute("href", prev);
  };
}

/** Inject (or replace) a JSON-LD block, namespaced by id for cleanup. */
export function setJsonLd(id: string, data: Record<string, unknown>): () => void {
  const selector = `script[data-jsonld="${id}"]`;
  document.querySelector(selector)?.remove();
  const el = document.createElement("script");
  el.type = "application/ld+json";
  el.dataset.jsonld = id;
  el.textContent = JSON.stringify(data);
  document.head.appendChild(el);
  return () => document.querySelector(selector)?.remove();
}
