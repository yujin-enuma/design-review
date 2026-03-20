const API = {
  async get(url) {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`API error: ${resp.status}`);
    return resp.json();
  },
  async post(url, data) {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!resp.ok) throw new Error(`API error: ${resp.status}`);
    return resp.json();
  },
  async put(url, data) {
    const resp = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!resp.ok) throw new Error(`API error: ${resp.status}`);
    return resp.json();
  },
  async del(url) {
    const resp = await fetch(url, { method: 'DELETE' });
    if (!resp.ok) throw new Error(`API error: ${resp.status}`);
    return resp.json();
  },
  async upload(url, formData) {
    const resp = await fetch(url, { method: 'POST', body: formData });
    if (!resp.ok) throw new Error(`API error: ${resp.status}`);
    return resp.json();
  },
};
