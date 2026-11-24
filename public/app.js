// Shared browser code for every page: one fetch helper and small DOM helpers.
// Rendering happens in the browser (client-side): the server only sends JSON.

/** Calls the API. Resolves with the JSON body, or throws an Error whose message is readable. */
export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error('Cannot reach the server. Check your connection and try again.');
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || `The server answered ${res.status}.`);
    error.status = res.status;
    throw error;
  }
  return data;
}

/** The signed-in person, or null. Pages that need sign-in send you to the sign-in page. */
export async function currentUser({ required = true } = {}) {
  try {
    return await api('/api/me');
  } catch (error) {
    if (error.status === 401 && required) window.location.href = '/';
    return null;
  }
}

/** Builds an element safely: text is always set as text, never as HTML, so no XSS. */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === false || value == null) continue;
    if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (key === 'class') node.className = value;
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) if (child != null) node.append(child instanceof Node ? child : String(child));
  return node;
}

/** Shows a message in a live region, so a screen reader announces it too. */
export function showStatus(region, kind, text) {
  region.replaceChildren(text ? el('div', { class: `status ${kind}` }, text) : '');
}

export const formatDate = (iso) =>
  new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

export async function signOut() {
  await api('/api/auth/signout', { method: 'POST', body: {} }).catch(() => {});
  window.location.href = '/';
}
