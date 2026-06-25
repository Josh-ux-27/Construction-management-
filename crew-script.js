const taskList = document.getElementById('task-list');
const countTotal = document.getElementById('count-total');
const countPending = document.getElementById('count-pending');
const countInProgress = document.getElementById('count-in-progress');
const countCompleted = document.getElementById('count-completed');
const crewSelect = document.getElementById('crew-select');
const blueprintPreview = document.getElementById('blueprint-preview');
const blueprintPdfPreview = document.getElementById('blueprint-pdf-preview');
const blueprintFullscreenBtn = document.getElementById('blueprint-fullscreen-btn');
const modelViewer = document.getElementById('model-viewer');
const blueprintModal = document.getElementById('blueprint-modal');
const blueprintLarge = document.getElementById('blueprint-large');
const blueprintModalPdf = document.getElementById('blueprint-modal-pdf');
const blueprintModalClose = document.getElementById('blueprint-modal-close');

let currentUser = null;
let tasks = [];
let crews = [];
let shiftNotes = [];
let assets = [];
let selectedCrewId = 'all';
let currentBlueprintUrl = null;
let currentBlueprintIsPdf = false;
const completionTimers = new Map();

function cancelCompletionTimer(taskId) {
  const timerId = completionTimers.get(taskId);
  if (timerId) {
    clearTimeout(timerId);
    completionTimers.delete(taskId);
  }
}

function scheduleCompletedTaskRemoval(taskId, ownerId) {
  cancelCompletionTimer(taskId);
  const timerId = setTimeout(async () => {
    try {
      await window.supabaseApp.deleteTask(ownerId, taskId);
      tasks = tasks.filter((task) => task.id !== taskId);
      renderTasks();
    } catch (_error) {
      // Ignore transient delete failures; next refresh will reconcile data.
    } finally {
      completionTimers.delete(taskId);
    }
  }, 10000);

  completionTimers.set(taskId, timerId);
}

function clearAuthAndRedirect() {
  localStorage.removeItem('authToken');
  localStorage.removeItem('currentUser');
  sessionStorage.removeItem('currentSessionId');
  window.location.href = 'login.html';
}

function renderShiftNotesForCrew() {
  const shiftNotesEl = document.getElementById('shift-notes');
  if (!shiftNotesEl) return;

  const crewNotes = shiftNotes.filter((note) => note.target === 'all' || note.target === selectedCrewId);
  if (!crewNotes.length) {
    shiftNotesEl.textContent = 'No notes available. Check back for updates from the contractor.';
    return;
  }

  shiftNotesEl.innerHTML = crewNotes.map((note) => {
    const crewName = note.target === 'all' ? 'All crews' : (crews.find((c) => c.id === note.target)?.name || 'Unknown crew');
    const date = new Date(note.timestamp).toLocaleString();
    return `
      <div class="shift-notes-entry">
        <div class="shift-notes-entry-meta">
          <span class="shift-notes-target">To: ${crewName}</span>
          <span class="shift-notes-time">${date}</span>
        </div>
        <div class="shift-notes-entry-text">${note.text}</div>
      </div>
    `;
  }).join('');
}

function updateCrewSelect() {
  crewSelect.innerHTML = '<option value="all">All Tasks</option>';
  crews.forEach((crew) => {
    const opt = document.createElement('option');
    opt.value = crew.id;
    opt.textContent = crew.name;
    crewSelect.appendChild(opt);
  });
}

function updateCounts(filteredTasks) {
  const total = filteredTasks.length;
  const pending = filteredTasks.filter((task) => task.status === 'pending').length;
  const inProgress = filteredTasks.filter((task) => task.status === 'in-progress').length;
  const completed = filteredTasks.filter((task) => task.status === 'done').length;

  countTotal.textContent = total;
  countPending.textContent = pending;
  countInProgress.textContent = inProgress;
  countCompleted.textContent = completed;
}

async function updateTaskStatus(taskId, newStatus) {
  const target = tasks.find((task) => task.id === taskId);
  if (!target) return;

  await window.supabaseApp.updateTask(target.ownerId, taskId, { status: newStatus });
  tasks = tasks.map((task) => task.id === taskId ? { ...task, status: newStatus } : task);

  if (newStatus === 'done') {
    scheduleCompletedTaskRemoval(taskId, target.ownerId);
  } else {
    cancelCompletionTimer(taskId);
  }

  renderTasks();
}

function renderTasks() {
  taskList.innerHTML = '';

  const filteredTasks = selectedCrewId === 'all'
    ? tasks
    : tasks.filter((task) => task.crewId === selectedCrewId);

  if (!filteredTasks.length) {
    const message = selectedCrewId === 'all'
      ? 'No tasks assigned yet. Check back soon.'
      : 'No tasks assigned to your crew yet.';
    taskList.innerHTML = `<div class="no-tasks">${message}</div>`;
    updateCounts(filteredTasks);
    return;
  }

  filteredTasks.forEach((task) => {
    const card = document.createElement('article');
    card.className = 'task-card';

    const header = document.createElement('header');
    const title = document.createElement('h3');
    title.className = 'task-title';
    title.textContent = `${task.location} - ${task.title}`;

    const status = document.createElement('span');
    status.className = `tag ${task.status.replace(' ', '-')}`;
    status.textContent = task.status.replace('-', ' ').replace(/\b\w/g, (c) => c.toUpperCase());

    header.append(title, status);

    const meta = document.createElement('div');
    meta.className = 'task-meta';
    const crewName = task.crewId ? (crews.find((c) => c.id === task.crewId)?.name || 'Unknown') : 'Unassigned';
    meta.innerHTML = `
      <span>Type: ${task.crewType}</span>
      <span>Assigned: ${crewName}</span>
      <span>Due: ${task.due}</span>
    `;

    const note = document.createElement('p');
    note.className = 'task-notes';
    note.textContent = task.note;

    const actions = document.createElement('div');
    actions.className = 'task-actions';

    const complete = document.createElement('button');
    complete.className = 'small-button complete';
    complete.textContent = task.status === 'done' ? 'Completed' : 'Mark Complete';
    complete.disabled = task.status === 'done';
    complete.addEventListener('click', () => updateTaskStatus(task.id, 'done'));

    const start = document.createElement('button');
    start.className = 'small-button start';
    start.textContent = task.status === 'pending' ? 'Start Task' : 'Set Pending';
    start.addEventListener('click', () => updateTaskStatus(task.id, task.status === 'pending' ? 'in-progress' : 'pending'));

    actions.append(complete, start);
    card.append(header, meta, note, actions);
    taskList.appendChild(card);
  });

  updateCounts(filteredTasks);
}

function applyLatestAssets() {
  if (!assets.length) {
    blueprintPreview.src = '';
    blueprintPdfPreview.src = '';
    blueprintPdfPreview.hidden = true;
    modelViewer.removeAttribute('src');
    return;
  }

  const latest = assets.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
  currentBlueprintUrl = latest.blueprintUrl;
  currentBlueprintIsPdf = !!latest.blueprintIsPdf;

  if (currentBlueprintUrl) {
    if (currentBlueprintIsPdf) {
      blueprintPreview.hidden = true;
      blueprintPdfPreview.hidden = false;
      blueprintPdfPreview.src = currentBlueprintUrl;
    } else {
      blueprintPdfPreview.hidden = true;
      blueprintPreview.hidden = false;
      blueprintPreview.src = currentBlueprintUrl;
    }
  } else {
    blueprintPreview.src = '';
    blueprintPdfPreview.src = '';
    blueprintPdfPreview.hidden = true;
    blueprintPreview.hidden = false;
  }

  if (latest.modelUrl) {
    modelViewer.src = latest.modelUrl;
  } else {
    modelViewer.removeAttribute('src');
  }
}

function openBlueprintModal() {
  if (!currentBlueprintUrl || !blueprintModal || (!blueprintLarge && !blueprintModalPdf)) return;

  if (currentBlueprintIsPdf) {
    blueprintLarge.hidden = true;
    blueprintModalPdf.hidden = false;
    blueprintModalPdf.src = currentBlueprintUrl;
  } else {
    blueprintModalPdf.hidden = true;
    blueprintLarge.hidden = false;
    blueprintLarge.src = currentBlueprintUrl;
  }

  blueprintModal.setAttribute('aria-hidden', 'false');
}

function closeBlueprintModal() {
  if (!blueprintModal) return;
  blueprintModal.setAttribute('aria-hidden', 'true');
  if (blueprintModalPdf) blueprintModalPdf.src = '';
}

async function reloadBoardData() {
  const data = await window.supabaseApp.loadCrewBoardData();
  tasks = data.tasks;
  crews = data.crews;
  shiftNotes = data.shiftNotes;
  assets = data.assets;

  updateCrewSelect();
  renderTasks();
  renderShiftNotesForCrew();
  applyLatestAssets();
}

function bindHeader(profile) {
  const profileName = document.getElementById('profile-name');
  const profileAvatar = document.getElementById('profile-avatar');
  const profileBtn = document.getElementById('profile-btn');
  const profileMenu = document.getElementById('profile-menu-items');
  const foremanLink = document.getElementById('foreman-link');
  const logoutBtn = document.getElementById('logout-btn');

  const roleLabel = profile.role === 'contractor' ? 'Contractor' : 'Crew Member';
  const nameDisplay = profile.email || 'User';

  if (profileName) profileName.textContent = `${roleLabel} - ${nameDisplay}`;
  if (profileAvatar) profileAvatar.textContent = profile.role === 'contractor' ? 'CO' : 'CR';

  if (foremanLink && profile.role === 'contractor') {
    foremanLink.style.display = 'block';
    foremanLink.addEventListener('click', () => {
      window.location.href = 'index.1.3.1.html';
    });
  }

  if (profileBtn && profileMenu) {
    profileBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      const isOpen = !profileMenu.hidden;
      profileMenu.hidden = isOpen;
      profileBtn.setAttribute('aria-expanded', String(!isOpen));
    });

    document.addEventListener('click', (event) => {
      if (!profileMenu.contains(event.target) && !profileBtn.contains(event.target)) {
        profileMenu.hidden = true;
        profileBtn.setAttribute('aria-expanded', 'false');
      }
    });

    profileMenu.addEventListener('click', (event) => event.stopPropagation());
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await window.supabaseApp.signOut();
      clearAuthAndRedirect();
    });
  }
}

async function init() {
  try {
    const { profile } = await window.supabaseApp.requireRole(['crew', 'contractor']);
    currentUser = profile;
    bindHeader(profile);

    if (crewSelect) {
      crewSelect.addEventListener('change', (e) => {
        selectedCrewId = e.target.value;
        renderTasks();
        renderShiftNotesForCrew();
      });
    }

    if (blueprintFullscreenBtn) blueprintFullscreenBtn.addEventListener('click', openBlueprintModal);
    if (blueprintModalClose) blueprintModalClose.addEventListener('click', closeBlueprintModal);

    await reloadBoardData();
    setInterval(() => {
      reloadBoardData().catch(() => {
        // Silent refresh retry.
      });
    }, 8000);
  } catch (_error) {
    clearAuthAndRedirect();
  }
}

init();
