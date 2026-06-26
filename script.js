const taskForm = document.getElementById('task-form');
const projectForm = document.getElementById('project-form');
const projectList = document.getElementById('project-list');
const countTotal = document.getElementById('count-total');
const countPending = document.getElementById('count-pending');
const countInProgress = document.getElementById('count-in-progress');
const countCompleted = document.getElementById('count-completed');
const newCrewNameInput = document.getElementById('new-crew-name');
const addCrewBtn = document.getElementById('add-crew-btn');
const crewsList = document.getElementById('crews-list');
const taskAssignedCrewSelect = document.getElementById('task-assigned-crew');
const taskProjectSelect = document.getElementById('task-project');
const blueprintUpload = document.getElementById('blueprint-upload');
const blueprintPreview = document.getElementById('blueprint-preview');
const blueprintPdfPreview = document.getElementById('blueprint-pdf-preview');
const blueprintPreviewBtn = document.getElementById('blueprint-preview-btn');
const blueprintClearBtn = document.getElementById('blueprint-clear-btn');
const modelUpload = document.getElementById('model-upload');
const modelViewer = document.getElementById('model-viewer');
const modelPreviewBtn = document.getElementById('model-preview-btn');
const modelClearBtn = document.getElementById('model-clear-btn');
const noteTargetCrewSelect = document.getElementById('note-target-crew');
const shiftNotesInput = document.getElementById('shift-notes-input');
const saveShiftNotesBtn = document.getElementById('save-shift-notes-btn');
const shiftNotesLog = document.getElementById('shift-notes-log');
const openProjectModalBtn = document.getElementById('open-project-modal-btn');
const openTaskModalBtn = document.getElementById('open-task-modal-btn');
const projectModal = document.getElementById('project-modal');
const projectModalClose = document.getElementById('project-modal-close');
const projectModalCancel = document.getElementById('project-modal-cancel');
const taskModal = document.getElementById('task-modal');
const taskModalClose = document.getElementById('task-modal-close');
const taskModalCancel = document.getElementById('task-modal-cancel');

const blueprintModal = document.getElementById('blueprint-modal');
const blueprintLarge = document.getElementById('blueprint-large');
const blueprintModalPdf = document.getElementById('blueprint-modal-pdf');
const blueprintModalClose = document.getElementById('blueprint-modal-close');

let currentUser = null;
let currentBlueprintIsPdf = false;
let currentBlueprintUrl = null;
let currentModelUrl = null;
let crews = [];
let tasks = [];
let projects = [];
let shiftNotes = [];
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

function clearAuthAndRedirect(reason = '') {
  localStorage.removeItem('authToken');
  localStorage.removeItem('currentUser');
  sessionStorage.removeItem('authToken');
  sessionStorage.removeItem('currentUser');
  sessionStorage.removeItem('currentSessionId');
  const loginUrl = reason ? `login.html?authError=${encodeURIComponent(reason)}` : 'login.html';
  window.location.href = loginUrl;
}

function getCurrentContractorId() {
  return currentUser?.id || '';
}

function openProjectModal() {
  if (projectModal) projectModal.setAttribute('aria-hidden', 'false');
}

function closeProjectModal() {
  if (projectModal) projectModal.setAttribute('aria-hidden', 'true');
}

function openTaskModal() {
  if (!taskModal) return;
  if (!projects.length) {
    alert('Create a project first before creating tasks.');
    return;
  }
  taskModal.setAttribute('aria-hidden', 'false');
}

function closeTaskModal() {
  if (taskModal) taskModal.setAttribute('aria-hidden', 'true');
}

function updateCounts() {
  const total = tasks.length;
  const pending = tasks.filter((task) => task.status === 'pending').length;
  const inProgress = tasks.filter((task) => task.status === 'in-progress').length;
  const completed = tasks.filter((task) => task.status === 'done').length;

  countTotal.textContent = total;
  countPending.textContent = pending;
  countInProgress.textContent = inProgress;
  countCompleted.textContent = completed;
}

function updateProjectSelect() {
  if (!taskProjectSelect) return;
  const selectedProjectId = taskProjectSelect.value;
  taskProjectSelect.innerHTML = '<option value="">Select a project...</option>';
  projects.forEach((project) => {
    const opt = document.createElement('option');
    opt.value = project.id;
    opt.textContent = project.title || 'Untitled project';
    taskProjectSelect.appendChild(opt);
  });

  const projectStillExists = projects.some((project) => project.id === selectedProjectId);
  if (projectStillExists) {
    taskProjectSelect.value = selectedProjectId;
  }
}

function renderCrews() {
  if (!crewsList) return;
  crewsList.innerHTML = '';
  crews.forEach((crew) => {
    const crewEl = document.createElement('div');
    crewEl.className = 'crew-item';
    crewEl.innerHTML = `
      <span>${crew.name}</span>
      <button type="button" class="small-button delete-crew" data-crew-id="${crew.id}">Remove</button>
    `;
    crewEl.querySelector('.delete-crew').addEventListener('click', () => deleteCrew(crew.id));
    crewsList.appendChild(crewEl);
  });
}

function updateCrewSelect() {
  const selectedCrewId = taskAssignedCrewSelect ? taskAssignedCrewSelect.value : '';
  const selectedNoteTarget = noteTargetCrewSelect ? noteTargetCrewSelect.value : 'all';

  taskAssignedCrewSelect.innerHTML = '<option value="">Select a crew...</option>';
  crews.forEach((crew) => {
    const opt = document.createElement('option');
    opt.value = crew.id;
    opt.textContent = crew.name;
    taskAssignedCrewSelect.appendChild(opt);
  });

  const crewStillExists = crews.some((crew) => crew.id === selectedCrewId);
  if (crewStillExists) {
    taskAssignedCrewSelect.value = selectedCrewId;
  }

  if (noteTargetCrewSelect) {
    noteTargetCrewSelect.innerHTML = '<option value="all">All crews</option>';
    crews.forEach((crew) => {
      const opt = document.createElement('option');
      opt.value = crew.id;
      opt.textContent = crew.name;
      noteTargetCrewSelect.appendChild(opt);
    });

    const noteTargetStillExists = selectedNoteTarget === 'all' || crews.some((crew) => crew.id === selectedNoteTarget);
    if (noteTargetStillExists) {
      noteTargetCrewSelect.value = selectedNoteTarget;
    }
  }
}

function renderShiftNotesList() {
  if (!shiftNotesLog) return;
  if (!shiftNotes.length) {
    shiftNotesLog.innerHTML = '<p class="note-help">No notes sent yet.</p>';
    return;
  }

  shiftNotesLog.innerHTML = shiftNotes.slice().reverse().map((note) => {
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

function renderTasks() {
  if (!projectList) return;
  projectList.innerHTML = '';

  if (!projects.length) {
    projectList.innerHTML = '<div class="no-tasks">No projects yet. Create a project to get started.</div>';
    updateCounts();
    return;
  }

  projects.forEach((project) => {
    const card = document.createElement('article');
    card.className = 'task-card';

    const projectHeader = document.createElement('header');
    const projectTitle = document.createElement('h3');
    projectTitle.className = 'task-title';
    projectTitle.textContent = project.title || 'Untitled project';

    const deleteProjectBtn = document.createElement('button');
    deleteProjectBtn.className = 'small-button delete';
    deleteProjectBtn.textContent = 'Delete Project';
    deleteProjectBtn.addEventListener('click', () => removeProject(project.id));

    projectHeader.append(projectTitle, deleteProjectBtn);

    const projectMeta = document.createElement('div');
    projectMeta.className = 'task-meta';
    projectMeta.innerHTML = `
      <span>Company: ${project.companyName || 'Not set'}</span>
      ${project.location ? `<span>Location: ${project.location}</span>` : ''}
      ${project.budget ? `<span>Budget: $${Number(project.budget).toLocaleString()}</span>` : ''}
    `;

    card.append(projectHeader, projectMeta);

    if (project.description) {
      const description = document.createElement('p');
      description.className = 'task-notes';
      description.textContent = project.description;
      card.appendChild(description);
    }

    const sectionTitle = document.createElement('p');
    sectionTitle.className = 'task-notes';
    sectionTitle.style.fontWeight = '700';
    sectionTitle.textContent = 'Assigned tasks';
    card.appendChild(sectionTitle);

    const projectTasks = tasks.filter(task => task.projectId === project.id);
    if (!projectTasks.length) {
      const noTasks = document.createElement('div');
      noTasks.className = 'no-tasks';
      noTasks.style.padding = '8px 0';
      noTasks.style.textAlign = 'left';
      noTasks.textContent = 'No tasks assigned to this project yet.';
      card.appendChild(noTasks);
    } else {
      projectTasks.forEach((task) => {
        const taskCard = document.createElement('div');
        taskCard.className = 'crew-item';
        taskCard.style.display = 'block';
        taskCard.style.marginTop = '10px';

        const taskHeader = document.createElement('div');
        taskHeader.style.display = 'flex';
        taskHeader.style.justifyContent = 'space-between';
        taskHeader.style.alignItems = 'center';
        taskHeader.style.gap = '10px';

        const taskTitle = document.createElement('div');
        taskTitle.className = 'crew-item-title';
        taskTitle.textContent = `${task.location} - ${task.title}`;

        const status = document.createElement('span');
        status.className = `tag ${String(task.status || 'pending').replace(' ', '-')}`;
        status.textContent = String(task.status || 'pending').replace('-', ' ').replace(/\b\w/g, (c) => c.toUpperCase());

        taskHeader.append(taskTitle, status);

        const crewName = task.crewId ? (crews.find(c => c.id === task.crewId)?.name || 'Unknown') : 'Unassigned';
        const taskMeta = document.createElement('div');
        taskMeta.className = 'crew-item-subtitle';
        taskMeta.style.marginTop = '6px';
        taskMeta.textContent = `Crew: ${crewName} - Type: ${task.crewType || 'General'} - Due: ${task.due || 'N/A'}`;

        const taskNote = document.createElement('div');
        taskNote.className = 'crew-item-subtitle';
        taskNote.style.marginTop = '4px';
        taskNote.textContent = task.note || 'No notes';

        const actions = document.createElement('div');
        actions.className = 'task-actions';
        actions.style.marginTop = '8px';

        const complete = document.createElement('button');
        complete.className = 'small-button complete';
        complete.textContent = task.status === 'done' ? 'Completed' : 'Mark Complete';
        complete.disabled = task.status === 'done';
        complete.addEventListener('click', () => updateTaskStatus(task.id, 'done'));

        const start = document.createElement('button');
        start.className = 'small-button start';
        start.textContent = task.status === 'pending' ? 'Start Task' : 'Set Pending';
        start.addEventListener('click', () => updateTaskStatus(task.id, task.status === 'pending' ? 'in-progress' : 'pending'));

        const remove = document.createElement('button');
        remove.className = 'small-button delete';
        remove.textContent = 'Remove Task';
        remove.addEventListener('click', () => removeTask(task.id));

        actions.append(complete, start, remove);
        taskCard.append(taskHeader, taskMeta, taskNote, actions);
        card.appendChild(taskCard);
      });
    }

    projectList.appendChild(card);
  });

  updateCounts();
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
  const ownerId = getCurrentContractorId();
  if (!ownerId) return;
  const data = await window.supabaseApp.loadOwnerData(ownerId);
  projects = data.projects;
  crews = data.crews;
  tasks = data.tasks;
  shiftNotes = data.shiftNotes;

  currentBlueprintUrl = data.assets?.blueprintUrl || null;
  currentBlueprintIsPdf = !!data.assets?.blueprintIsPdf;
  currentModelUrl = data.assets?.modelUrl || null;

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

  if (currentModelUrl) {
    modelViewer.src = currentModelUrl;
  } else {
    modelViewer.removeAttribute('src');
  }

  renderCrews();
  updateCrewSelect();
  updateProjectSelect();
  renderShiftNotesList();
  renderTasks();
}

async function addCrew() {
  const name = newCrewNameInput.value.trim();
  if (!name) {
    alert('Enter a crew name.');
    return;
  }

  const crew = {
    id: crypto.randomUUID(),
    name,
    createdAt: Date.now(),
  };

  await window.supabaseApp.createCrew(getCurrentContractorId(), crew);
  crews.push({ ...crew, ownerId: getCurrentContractorId() });
  newCrewNameInput.value = '';
  renderCrews();
  updateCrewSelect();
}

async function deleteCrew(crewId) {
  if (!confirm('Remove this crew? All tasks assigned to this crew will also be deleted.')) return;
  await window.supabaseApp.deleteCrew(getCurrentContractorId(), crewId);
  crews = crews.filter((c) => c.id !== crewId);
  tasks = tasks.filter((t) => t.crewId !== crewId);
  renderCrews();
  updateCrewSelect();
  renderTasks();
}

function setBlueprintPreview(url, isPdf) {
  currentBlueprintUrl = url;
  currentBlueprintIsPdf = isPdf;
  if (isPdf) {
    blueprintPreview.hidden = true;
    blueprintPreview.src = '';
    blueprintPdfPreview.hidden = false;
    blueprintPdfPreview.src = url;
  } else {
    blueprintPdfPreview.hidden = true;
    blueprintPdfPreview.src = '';
    blueprintPreview.hidden = false;
    blueprintPreview.src = url;
  }
}

function handleBlueprintUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    setBlueprintPreview(e.target.result, file.type === 'application/pdf');
    await window.supabaseApp.upsertAssets(getCurrentContractorId(), {
      blueprintUrl: currentBlueprintUrl,
      blueprintIsPdf: currentBlueprintIsPdf,
      modelUrl: currentModelUrl,
    });
  };
  reader.readAsDataURL(file);
}

function handleModelUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    currentModelUrl = e.target.result;
    modelViewer.src = currentModelUrl;
    await window.supabaseApp.upsertAssets(getCurrentContractorId(), {
      blueprintUrl: currentBlueprintUrl,
      blueprintIsPdf: currentBlueprintIsPdf,
      modelUrl: currentModelUrl,
    });
  };
  reader.readAsDataURL(file);
}

async function clearBlueprint() {
  currentBlueprintUrl = null;
  currentBlueprintIsPdf = false;
  blueprintUpload.value = '';
  blueprintPreview.src = '';
  blueprintPreview.hidden = false;
  blueprintPdfPreview.src = '';
  blueprintPdfPreview.hidden = true;
  await window.supabaseApp.upsertAssets(getCurrentContractorId(), {
    blueprintUrl: null,
    blueprintIsPdf: false,
    modelUrl: currentModelUrl,
  });
}

async function clearModel() {
  currentModelUrl = null;
  modelUpload.value = '';
  modelViewer.removeAttribute('src');
  await window.supabaseApp.upsertAssets(getCurrentContractorId(), {
    blueprintUrl: currentBlueprintUrl,
    blueprintIsPdf: currentBlueprintIsPdf,
    modelUrl: null,
  });
}

async function saveShiftNotes() {
  if (!shiftNotesInput || !noteTargetCrewSelect) return;
  const text = shiftNotesInput.value.trim();
  if (!text) {
    alert('Enter a note before sending.');
    return;
  }

  const note = {
    id: crypto.randomUUID(),
    target: noteTargetCrewSelect.value || 'all',
    text,
    timestamp: Date.now(),
  };

  await window.supabaseApp.createShiftNote(getCurrentContractorId(), note);
  shiftNotes.push({ ...note, ownerId: getCurrentContractorId() });
  shiftNotesInput.value = '';
  renderShiftNotesList();
  alert('Shift note sent. Crew will see the update.');
}

async function addProject(event) {
  event.preventDefault();

  const companyName = document.getElementById('project-company').value.trim();
  const title = document.getElementById('project-title').value.trim();
  const description = document.getElementById('project-description').value.trim();
  const location = document.getElementById('project-location').value.trim();
  const budgetRaw = document.getElementById('project-budget').value;
  const budget = budgetRaw ? Number(budgetRaw) : null;

  if (!companyName || !title) {
    alert('Please enter company name and project name.');
    return;
  }

  const project = {
    id: crypto.randomUUID(),
    ownerId: getCurrentContractorId(),
    companyName,
    title,
    description,
    location,
    budget,
    createdAt: Date.now(),
  };

  await window.supabaseApp.createProject(getCurrentContractorId(), project);
  projects.unshift(project);
  updateProjectSelect();
  projectForm.reset();
  closeProjectModal();
  renderTasks();
}

async function removeProject(projectId) {
  if (!confirm('Delete this project? All tasks in this project will also be deleted.')) return;
  await window.supabaseApp.deleteProject(getCurrentContractorId(), projectId);
  projects = projects.filter(project => project.id !== projectId);
  tasks = tasks.filter(task => task.projectId !== projectId);
  updateProjectSelect();
  renderTasks();
}

async function addTask(event) {
  event.preventDefault();

  const title = document.getElementById('task-title').value.trim();
  const location = document.getElementById('task-location').value.trim();
  const projectId = document.getElementById('task-project').value.trim();
  const crewId = document.getElementById('task-assigned-crew').value.trim();
  const crewType = document.getElementById('task-crew-type').value.trim();
  const due = document.getElementById('task-due').value;
  const note = document.getElementById('task-note').value.trim();

  const selectedProject = projects.find((project) => project.id === projectId);
  if (!title || !location || !projectId || !crewId || !crewType || !due) {
    alert('Please fill out all required fields.');
    return;
  }
  if (!selectedProject) {
    alert('Please select a valid project.');
    return;
  }

  const task = {
    id: crypto.randomUUID(),
    title,
    location,
    projectId,
    projectTitle: selectedProject.title || 'Untitled project',
    crewId,
    crewType,
    note,
    due,
    status: 'pending',
    createdAt: Date.now(),
  };

  await window.supabaseApp.createTask(getCurrentContractorId(), task);
  tasks.unshift({ ...task, ownerId: getCurrentContractorId() });
  taskForm.reset();
  closeTaskModal();
  renderTasks();
}

async function updateTaskStatus(taskId, newStatus) {
  const ownerId = getCurrentContractorId();
  await window.supabaseApp.updateTask(ownerId, taskId, { status: newStatus });
  tasks = tasks.map((task) => task.id === taskId ? { ...task, status: newStatus } : task);

  if (newStatus === 'done') {
    scheduleCompletedTaskRemoval(taskId, ownerId);
  } else {
    cancelCompletionTimer(taskId);
  }

  renderTasks();
}

async function removeTask(taskId) {
  cancelCompletionTimer(taskId);
  await window.supabaseApp.deleteTask(getCurrentContractorId(), taskId);
  tasks = tasks.filter((task) => task.id !== taskId);
  renderTasks();
}

function openPreviewTab(source) {
  if (source === 'blueprint') {
    if (!currentBlueprintUrl) return alert('Upload a blueprint first.');
    window.open(currentBlueprintUrl, '_blank');
  } else if (source === 'model') {
    if (!currentModelUrl) return alert('Upload a 3D model first.');
    window.open(currentModelUrl, '_blank');
  }
}

function bindEvents() {
  if (projectForm) projectForm.addEventListener('submit', addProject);
  if (taskForm) taskForm.addEventListener('submit', addTask);
  if (openProjectModalBtn) openProjectModalBtn.addEventListener('click', openProjectModal);
  if (projectModalClose) projectModalClose.addEventListener('click', closeProjectModal);
  if (projectModalCancel) projectModalCancel.addEventListener('click', closeProjectModal);
  if (openTaskModalBtn) openTaskModalBtn.addEventListener('click', openTaskModal);
  if (taskModalClose) taskModalClose.addEventListener('click', closeTaskModal);
  if (taskModalCancel) taskModalCancel.addEventListener('click', closeTaskModal);
  if (blueprintModalClose) blueprintModalClose.addEventListener('click', closeBlueprintModal);

  if (projectModal) {
    projectModal.addEventListener('click', (event) => {
      if (event.target === projectModal) closeProjectModal();
    });
  }
  if (taskModal) {
    taskModal.addEventListener('click', (event) => {
      if (event.target === taskModal) closeTaskModal();
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && projectModal && projectModal.getAttribute('aria-hidden') === 'false') closeProjectModal();
    if (event.key === 'Escape' && taskModal && taskModal.getAttribute('aria-hidden') === 'false') closeTaskModal();
  });

  if (blueprintUpload) blueprintUpload.addEventListener('change', handleBlueprintUpload);
  if (modelUpload) modelUpload.addEventListener('change', handleModelUpload);
  if (blueprintPreviewBtn) blueprintPreviewBtn.addEventListener('click', () => openPreviewTab('blueprint'));
  if (modelPreviewBtn) modelPreviewBtn.addEventListener('click', () => openPreviewTab('model'));
  if (blueprintClearBtn) blueprintClearBtn.addEventListener('click', clearBlueprint);
  if (modelClearBtn) modelClearBtn.addEventListener('click', clearModel);
  if (addCrewBtn) addCrewBtn.addEventListener('click', addCrew);
  if (saveShiftNotesBtn) saveShiftNotesBtn.addEventListener('click', saveShiftNotes);
}

async function init() {
  try {
    const { profile } = await window.supabaseApp.requireRole('contractor');
    currentUser = profile;

    const profileName = document.getElementById('profile-name');
    const profileAvatar = document.getElementById('profile-avatar');
    const profileBtn = document.getElementById('profile-btn');
    const profileMenu = document.getElementById('profile-menu-items');
    const crewLink = document.getElementById('crew-site-link');
    const logoutBtn = document.getElementById('logout-btn');

    if (profileName) profileName.textContent = `Contractor - ${profile.email || 'Contractor'}`;
    if (profileAvatar) profileAvatar.textContent = 'CO';

    if (crewLink) {
      crewLink.style.display = 'block';
      crewLink.addEventListener('click', () => {
        window.location.href = 'crew.html';
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

    bindEvents();
    await reloadBoardData();

    setInterval(() => {
      reloadBoardData().catch(() => {
        // Silent refresh retry.
      });
    }, 8000);
  } catch (error) {
    const message = String(error?.message || '');
    if (message.includes('No active session') || message.includes('Role not allowed')) {
      clearAuthAndRedirect('session');
      return;
    }

    const projectListEl = document.getElementById('project-list');
    if (projectListEl) {
      projectListEl.innerHTML = '<div class="no-tasks">Unable to load board data right now. Please refresh in a moment.</div>';
    }

    console.error('Contractor board initialization failed:', error);
  }
}

init();
