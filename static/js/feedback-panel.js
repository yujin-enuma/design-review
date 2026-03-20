const STATUS_CONFIG = {
  pending: { label: '미확인', color: '#9ca3af', bg: '#f3f4f6' },
  applied: { label: '반영됨', color: '#16a34a', bg: '#dcfce7' },
  partially_applied: { label: '부분반영', color: '#ca8a04', bg: '#fef9c3' },
  rejected: { label: '미반영', color: '#dc2626', bg: '#fee2e2' },
  needs_discussion: { label: '논의필요', color: '#7c3aed', bg: '#ede9fe' },
};

function formatTimecode(seconds) {
  if (seconds === null || seconds === undefined) return '-';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 100);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
}

function renderStatusChip(status) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  return `<span class="status-chip" data-status="${status}"
    style="background:${cfg.bg};color:${cfg.color};border:1px solid ${cfg.color}30;
    padding:2px 8px;border-radius:12px;font-size:12px;cursor:pointer;white-space:nowrap">
    ${cfg.label}</span>`;
}

function renderFeedbackTable(items, onRowClick, onStatusClick) {
  const table = document.getElementById('feedback-table-body');
  if (!table) return;
  table.innerHTML = '';
  items.forEach((item) => {
    const tr = document.createElement('tr');
    tr.className = 'feedback-row';
    tr.style.cursor = 'pointer';
    tr.innerHTML = `
      <td class="tc-cell">${formatTimecode(item.timecode_seconds)}</td>
      <td class="scene-cell">${item.scene_number || '-'}</td>
      <td class="comment-cell" title="${item.comment.replace(/"/g, '&quot;')}">${truncate(item.comment, 80)}</td>
      <td class="reviewer-cell">${item.reviewer || '-'}</td>
      <td class="status-cell">${renderStatusChip(item.status)}</td>
    `;
    tr.addEventListener('click', (e) => {
      if (e.target.closest('.status-chip')) {
        onStatusClick(item);
        return;
      }
      document.querySelectorAll('.feedback-row').forEach(r => r.classList.remove('active'));
      tr.classList.add('active');
      onRowClick(item);
    });
    table.appendChild(tr);
  });
}

function renderSummaryBar(summary) {
  const el = document.getElementById('summary-bar');
  if (!el) return;
  const resolved = summary.applied + summary.partially_applied + summary.rejected;
  el.innerHTML = `
    <div class="summary-stats">
      <span><strong>${resolved}</strong>/${summary.total} 확인완료 (${summary.progress_percent}%)</span>
      <span class="summary-chips">
        ${renderStatusChip('applied')} ${summary.applied}
        ${renderStatusChip('partially_applied')} ${summary.partially_applied}
        ${renderStatusChip('rejected')} ${summary.rejected}
        ${renderStatusChip('needs_discussion')} ${summary.needs_discussion}
        ${renderStatusChip('pending')} ${summary.pending}
      </span>
    </div>
    <div class="progress-bar">
      <div class="progress-fill" style="width:${summary.progress_percent}%"></div>
    </div>
  `;
}

function truncate(str, len) {
  if (!str) return '';
  return str.length > len ? str.substring(0, len) + '...' : str;
}

function showStatusModal(item, versionId, onUpdate) {
  const existing = document.getElementById('status-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'status-modal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-content">
      <h3>상태 변경</h3>
      <p class="modal-comment">${item.comment}</p>
      <div class="status-options">
        ${Object.entries(STATUS_CONFIG).map(([key, cfg]) => `
          <button class="status-btn ${item.status === key ? 'active' : ''}"
            data-status="${key}" style="border-color:${cfg.color};color:${cfg.color}">
            ${cfg.label}
          </button>
        `).join('')}
      </div>
      <textarea id="status-note" placeholder="메모 (선택사항)">${item.note || ''}</textarea>
      <div class="modal-actions">
        <button id="modal-cancel">취소</button>
        <button id="modal-save">저장</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  let selectedStatus = item.status;
  modal.querySelectorAll('.status-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      modal.querySelectorAll('.status-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedStatus = btn.dataset.status;
    });
  });
  document.getElementById('modal-cancel').addEventListener('click', () => modal.remove());
  document.getElementById('modal-save').addEventListener('click', async () => {
    const note = document.getElementById('status-note').value;
    await onUpdate(item.id, versionId, selectedStatus, note);
    modal.remove();
  });
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
}
