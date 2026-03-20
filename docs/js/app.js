let state = {
  projects: [],
  currentProject: null,
  feedbackItems: [],
  filters: { reviewer: null, status: null, sheet_name: null },
  player: null,
};

function init() {
  state.player = new DualVideoPlayer('video-original', 'video-revised');
  setupEventListeners();
  loadProjects();
}

function setupEventListeners() {
  document.getElementById('btn-new-project').addEventListener('click', createProject);
  document.getElementById('btn-import-sheet').addEventListener('click', () => {
    document.getElementById('file-input-sheet').click();
  });
  document.getElementById('file-input-sheet').addEventListener('change', importSheet);
  document.getElementById('btn-upload-original').addEventListener('click', () => {
    document.getElementById('file-input-original').click();
  });
  document.getElementById('file-input-original').addEventListener('change', (e) => loadVideo(e, 1));
  document.getElementById('btn-upload-revised').addEventListener('click', () => {
    document.getElementById('file-input-revised').click();
  });
  document.getElementById('file-input-revised').addEventListener('change', (e) => loadVideo(e, 2));
  document.getElementById('btn-sync-toggle').addEventListener('click', toggleSync);
  document.getElementById('btn-play-pause').addEventListener('click', () => state.player.playPause());

  document.querySelectorAll('.btn-individual-play').forEach(btn => {
    btn.addEventListener('click', () => {
      const video = document.getElementById(btn.dataset.video);
      if (!video) return;
      if (video.paused) { video.play(); btn.textContent = 'Pause'; }
      else { video.pause(); btn.textContent = 'Play'; }
    });
  });

  document.getElementById('filter-reviewer').addEventListener('change', applyFilters);
  document.getElementById('filter-status').addEventListener('change', applyFilters);
  document.getElementById('filter-sheet').addEventListener('change', applyFilters);

  const video1 = document.getElementById('video-original');
  const video2 = document.getElementById('video-revised');
  if (video1) {
    video1.addEventListener('timeupdate', () => {
      updateTimeDisplay();
      document.getElementById('time-original').textContent = formatTimecode(video1.currentTime);
    });
  }
  if (video2) {
    video2.addEventListener('timeupdate', () => {
      document.getElementById('time-revised').textContent = formatTimecode(video2.currentTime);
    });
  }
}

function loadProjects() {
  state.projects = Store.getProjects();
  const select = document.getElementById('project-select');
  select.innerHTML = '<option value="">-- 프로젝트 선택 --</option>';
  state.projects.forEach(p => {
    select.innerHTML += `<option value="${p.id}">${p.name}</option>`;
  });
  select.addEventListener('change', () => {
    const id = parseInt(select.value);
    if (id) selectProject(id);
  });
  if (state.projects.length > 0) {
    select.value = state.projects[0].id;
    selectProject(state.projects[0].id);
  }
}

function selectProject(projectId) {
  state.currentProject = projectId;
  updateFilterDropdowns();
  loadFeedback();
}

function updateFilterDropdowns() {
  const reviewers = Store.getReviewers(state.currentProject);
  const sheets = Store.getSheets(state.currentProject);

  const reviewerSel = document.getElementById('filter-reviewer');
  reviewerSel.innerHTML = '<option value="">전체 리뷰어</option>';
  reviewers.forEach(r => {
    reviewerSel.innerHTML += `<option value="${r}">${r}</option>`;
  });

  const sheetSel = document.getElementById('filter-sheet');
  sheetSel.innerHTML = '<option value="">전체 시트</option>';
  sheets.forEach(s => {
    sheetSel.innerHTML += `<option value="${s.sheet_name}">${s.sheet_name} (${s.sheet_type})</option>`;
  });
}

function loadFeedback() {
  if (!state.currentProject) return;
  state.feedbackItems = Store.getFeedback(state.currentProject, state.filters);
  renderFeedbackTable(state.feedbackItems, onRowClick, onStatusClick);
  renderTimelineMarkers();
  renderSummaryBar(Store.getSummary(state.currentProject));
}

function onRowClick(item) {
  if (item.timecode_seconds !== null && item.timecode_seconds !== undefined) {
    state.player.seekTo(item.timecode_seconds);
  }
  document.getElementById('detail-comment').textContent = item.comment;
  document.getElementById('detail-reviewer').textContent = item.reviewer || '-';
  document.getElementById('detail-tc').textContent = formatTimecode(item.timecode_seconds);
  document.getElementById('detail-panel').style.display = 'block';
}

function onStatusClick(item) {
  showStatusModal(item, (itemId, status, note) => {
    Store.updateStatus(state.currentProject, itemId, status, note);
    loadFeedback();
  });
}

function renderTimelineMarkers() {
  const container = document.getElementById('timeline-markers');
  if (!container) return;
  container.innerHTML = '';
  const duration = state.player.getDuration() || 34;
  state.feedbackItems.forEach(item => {
    if (item.timecode_seconds === null) return;
    const pct = (item.timecode_seconds / duration) * 100;
    const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending;
    const marker = document.createElement('div');
    marker.className = 'timeline-marker';
    marker.style.left = `${pct}%`;
    marker.style.backgroundColor = cfg.color;
    marker.title = `${formatTimecode(item.timecode_seconds)} - ${item.reviewer}`;
    marker.addEventListener('click', () => state.player.seekTo(item.timecode_seconds));
    container.appendChild(marker);
  });
}

function updateTimeDisplay() {
  const video = document.getElementById('video-original');
  if (!video) return;
  const current = formatTimecode(video.currentTime);
  const total = formatTimecode(video.duration);
  document.getElementById('time-display').textContent = `${current} / ${total}`;
}

function createProject() {
  const name = prompt('프로젝트 이름을 입력하세요:');
  if (!name) return;
  Store.createProject(name);
  loadProjects();
}

function importSheet(e) {
  if (!state.currentProject) { alert('프로젝트를 먼저 선택하세요'); return; }
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (ev) {
    try {
      const data = new Uint8Array(ev.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const result = parseXlsxFile(workbook);
      const imported = Store.importFeedback(state.currentProject, result);
      if (imported) {
        const counts = Object.entries(imported).map(([k, v]) => `${k}: ${v.count}건`).join(', ');
        alert(`임포트 완료! ${counts}`);
      }
      selectProject(state.currentProject);
    } catch (err) {
      alert(`임포트 실패: ${err.message}`);
    }
  };
  reader.readAsArrayBuffer(file);
  e.target.value = '';
}

function loadVideo(e, versionNumber) {
  const file = e.target.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  state.player.setSource(versionNumber, url);
  const label = versionNumber === 1 ? 'btn-upload-original' : 'btn-upload-revised';
  document.getElementById(label).textContent =
    (versionNumber === 1 ? '원본: ' : '수정본: ') + file.name;
  e.target.value = '';
}

function toggleSync() {
  const btn = document.getElementById('btn-sync-toggle');
  state.player.syncLock = !state.player.syncLock;
  btn.textContent = state.player.syncLock ? 'Sync: ON' : 'Sync: OFF';
  btn.classList.toggle('active', state.player.syncLock);
}

function applyFilters() {
  state.filters.reviewer = document.getElementById('filter-reviewer').value || null;
  state.filters.status = document.getElementById('filter-status').value || null;
  state.filters.sheet_name = document.getElementById('filter-sheet').value || null;
  loadFeedback();
}

document.addEventListener('DOMContentLoaded', init);
