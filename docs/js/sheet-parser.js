// Client-side sheet parser using SheetJS (xlsx.js)
// Ports Python sheet_parser.py logic to JavaScript

function parseTimecode(tc, fps = 29.97) {
  if (!tc || typeof tc !== 'string') return null;
  tc = tc.trim();
  if (tc.toLowerCase() === 'overall' || tc === '') return null;
  if (tc === '0000') return 0.0;
  if (tc.includes(' - ')) tc = tc.split(' - ')[0].trim();
  const parts = tc.replace(/\s/g, '').split(':');
  try {
    if (parts.length === 4) {
      const [h, m, s, f] = parts.map(Number);
      return Math.round((h * 3600 + m * 60 + s + f / fps) * 100) / 100;
    }
    if (parts.length === 3) {
      const [h, m, s] = parts.map(Number);
      return h * 3600 + m * 60 + s;
    }
    if (parts.length === 2) {
      const [m, s] = parts.map(Number);
      return m * 60 + s;
    }
  } catch (e) {}
  return null;
}

function detectSheetType(sheetName) {
  const name = sheetName.trim();
  if (/^ani_.*_FB$/i.test(name)) return 'animation';
  if (/^FB_/.test(name)) return 'reviewer';
  if (/^images_.*_FB$/i.test(name)) return 'image';
  if (/^\d+$/.test(name) || name.startsWith('Copy of')) return 'storyboard';
  return 'unknown';
}

function extractSceneNumber(text) {
  const m = text.match(/#S?(\d+)/);
  return m ? parseInt(m[1]) : null;
}

function extractReviewer(sheetName) {
  if (sheetName.startsWith('FB_')) return sheetName.slice(3);
  if (sheetName.includes('_FB')) return sheetName.replace('_FB', '');
  return sheetName;
}

function parseAnimationSheet(rows, sheetName, fps = 29.97) {
  const items = [];
  const reviewer = extractReviewer(sheetName);
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 2) continue;
    const tcRaw = row[0] != null ? String(row[0]) : null;
    const comment = row[1] != null ? String(row[1]).trim() : null;
    if (!comment) continue;
    items.push({
      id: `${sheetName}_${i}`,
      timecode_raw: tcRaw,
      timecode_seconds: tcRaw ? parseTimecode(tcRaw, fps) : null,
      scene_number: null,
      reviewer: reviewer,
      comment: comment,
      item_index: i,
      status: 'pending',
      note: '',
    });
  }
  return items;
}

function parseImageSheet(rows, sheetName) {
  const items = [];
  const reviewer = extractReviewer(sheetName);
  let idx = 0;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const comments = [];
    if (row.length >= 2 && row[1]) comments.push(String(row[1]).trim());
    if (row.length >= 3 && row[2]) comments.push(String(row[2]).trim());
    for (const comment of comments) {
      if (!comment) continue;
      idx++;
      items.push({
        id: `${sheetName}_${idx}`,
        timecode_raw: null,
        timecode_seconds: null,
        scene_number: extractSceneNumber(comment),
        reviewer: reviewer,
        comment: comment,
        item_index: idx,
        status: 'pending',
        note: '',
      });
    }
  }
  return items;
}

function parseStoryboardSheet(rows, sheetName) {
  const items = [];
  let headerRowIdx = -1;
  for (let r = 0; r < Math.min(5, rows.length); r++) {
    if (!rows[r]) continue;
    for (let c = 0; c < rows[r].length; c++) {
      if (rows[r][c] && String(rows[r][c]).toLowerCase().includes('comment')) {
        headerRowIdx = r;
        break;
      }
    }
    if (headerRowIdx >= 0) break;
  }
  if (headerRowIdx < 0) headerRowIdx = 2;

  const headers = (rows[headerRowIdx] || []).map(h => h != null ? String(h) : '');
  const commentCols = [];
  headers.forEach((h, i) => {
    if (h.toLowerCase().includes('comment')) {
      const reviewer = h.replace(/comment/i, '').trim().replace(/[()]/g, '') || 'unknown';
      commentCols.push({ col: i, reviewer });
    }
  });

  let idx = 0;
  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    let sceneNum = null;
    if (row[0] != null && !isNaN(row[0])) sceneNum = parseInt(row[0]);
    for (const { col, reviewer } of commentCols) {
      if (col < row.length && row[col]) {
        const comment = String(row[col]).trim();
        if (!comment) continue;
        idx++;
        items.push({
          id: `${sheetName}_${idx}`,
          timecode_raw: null,
          timecode_seconds: null,
          scene_number: sceneNum,
          reviewer: reviewer,
          comment: comment,
          item_index: idx,
          status: 'pending',
          note: '',
        });
      }
    }
  }
  return items;
}

function parseXlsxFile(workbook) {
  const result = {};
  workbook.SheetNames.forEach(sheetName => {
    const sheetType = detectSheetType(sheetName);
    if (sheetType === 'unknown') return;
    const ws = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    let items = [];
    if (sheetType === 'animation' || sheetType === 'reviewer') {
      items = parseAnimationSheet(rows, sheetName);
    } else if (sheetType === 'image') {
      items = parseImageSheet(rows, sheetName);
    } else if (sheetType === 'storyboard') {
      items = parseStoryboardSheet(rows, sheetName);
    }
    if (items.length > 0) {
      result[sheetName] = { type: sheetType, items };
    }
  });
  return result;
}
