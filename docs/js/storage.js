// localStorage-based data store (replaces SQLite backend)
const DB_KEY = 'design_review_db';

const Store = {
  _load() {
    const raw = localStorage.getItem(DB_KEY);
    return raw ? JSON.parse(raw) : { projects: [], nextId: 1 };
  },
  _save(db) {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  },

  getProjects() {
    return this._load().projects;
  },

  createProject(name) {
    const db = this._load();
    const project = {
      id: db.nextId++,
      name,
      created_at: new Date().toISOString(),
      feedbackItems: [],
      sheets: [],
    };
    db.projects.push(project);
    this._save(db);
    return project;
  },

  deleteProject(id) {
    const db = this._load();
    db.projects = db.projects.filter(p => p.id !== id);
    this._save(db);
  },

  getProject(id) {
    return this._load().projects.find(p => p.id === id) || null;
  },

  importFeedback(projectId, sheetResults) {
    const db = this._load();
    const project = db.projects.find(p => p.id === projectId);
    if (!project) return null;

    const imported = {};
    for (const [sheetName, data] of Object.entries(sheetResults)) {
      // Avoid duplicate sheet imports
      if (project.sheets.find(s => s.sheet_name === sheetName)) continue;

      project.sheets.push({
        sheet_name: sheetName,
        sheet_type: data.type,
        imported_at: new Date().toISOString(),
      });

      // Merge statuses from existing items if re-importing
      data.items.forEach(item => {
        item.sheet_name = sheetName;
        item.sheet_type = data.type;
        const existing = project.feedbackItems.find(
          f => f.sheet_name === sheetName && f.item_index === item.item_index
        );
        if (existing) {
          item.status = existing.status;
          item.note = existing.note;
        }
      });
      project.feedbackItems = project.feedbackItems.filter(f => f.sheet_name !== sheetName);
      project.feedbackItems.push(...data.items);
      imported[sheetName] = { type: data.type, count: data.items.length };
    }
    this._save(db);
    return imported;
  },

  getFeedback(projectId, filters = {}) {
    const project = this.getProject(projectId);
    if (!project) return [];
    let items = [...project.feedbackItems];
    if (filters.reviewer) items = items.filter(i => i.reviewer === filters.reviewer);
    if (filters.status) items = items.filter(i => i.status === filters.status);
    if (filters.sheet_name) items = items.filter(i => i.sheet_name === filters.sheet_name);
    items.sort((a, b) => {
      if (a.timecode_seconds == null && b.timecode_seconds == null) return 0;
      if (a.timecode_seconds == null) return 1;
      if (b.timecode_seconds == null) return -1;
      return a.timecode_seconds - b.timecode_seconds;
    });
    return items;
  },

  updateStatus(projectId, itemId, status, note) {
    const db = this._load();
    const project = db.projects.find(p => p.id === projectId);
    if (!project) return;
    const item = project.feedbackItems.find(i => i.id === itemId);
    if (item) {
      item.status = status;
      item.note = note || '';
    }
    this._save(db);
  },

  getSummary(projectId) {
    const items = this.getFeedback(projectId);
    const total = items.length;
    const counts = { pending: 0, applied: 0, partially_applied: 0, rejected: 0, needs_discussion: 0 };
    items.forEach(i => { counts[i.status] = (counts[i.status] || 0) + 1; });
    const resolved = counts.applied + counts.partially_applied + counts.rejected;
    return {
      total,
      ...counts,
      progress_percent: total > 0 ? Math.round((resolved / total) * 100) : 0,
    };
  },

  getReviewers(projectId) {
    const items = this.getFeedback(projectId);
    return [...new Set(items.map(i => i.reviewer).filter(Boolean))].sort();
  },

  getSheets(projectId) {
    const project = this.getProject(projectId);
    return project ? project.sheets : [];
  },
};
