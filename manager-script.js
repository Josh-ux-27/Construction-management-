let allProjects = [];
let allTasks = [];
let allCrews = [];
let selectedProjectIds = [];
let currentManagerId = '';

function getManagedProjects() {
  return selectedProjectIds
    .map((projectId) => allProjects.find((project) => project.id === projectId))
    .filter(Boolean);
}

function getManagedContractorIds() {
  return new Set(getManagedProjects().map((project) => project.ownerId).filter(Boolean));
}

function getManagedTasks() {
  const managedProjectIds = new Set(getManagedProjects().map((project) => project.id));
  return allTasks.filter((task) => managedProjectIds.has(task.projectId));
}

function getManagedCrews() {
  const managedContractorIds = getManagedContractorIds();
  return allCrews.filter((crew) => managedContractorIds.has(crew.ownerId));
}

function clearAuthAndRedirect() {
  localStorage.removeItem('authToken');
  localStorage.removeItem('currentUser');
  sessionStorage.removeItem('currentSessionId');
  window.location.href = 'login.html';
}

function bindHeader(profile) {
  const profileName = document.getElementById('profile-name');
  const profileAvatar = document.getElementById('profile-avatar');
  const profileBtn = document.getElementById('profile-btn');
  const profileMenu = document.getElementById('profile-menu-items');

  if (profileName) profileName.textContent = `Project Manager - ${profile.email || 'Manager'}`;
  if (profileAvatar) profileAvatar.textContent = 'PM';

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

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await window.supabaseApp.signOut();
      clearAuthAndRedirect();
    });
  }
}

function updateSummary() {
  const countContractors = document.getElementById('count-contractors');
  const countCrews = document.getElementById('count-crews');
  const countTasks = document.getElementById('count-tasks');

  const contractorCount = getManagedContractorIds().size;
  const crewCount = getManagedCrews().length;
  const taskCount = getManagedTasks().length;

  if (countContractors) countContractors.textContent = String(contractorCount);
  if (countCrews) countCrews.textContent = String(crewCount);
  if (countTasks) countTasks.textContent = String(taskCount);
}

function renderSearchResults(projects) {
  const projectSearchResults = document.getElementById('project-search-results');
  if (!projectSearchResults) return;

  if (!projects.length) {
    projectSearchResults.innerHTML = '<div class="crew-item">No projects found.</div>';
    return;
  }

  projectSearchResults.innerHTML = projects.map((project) => {
    const companyName = project.companyName || 'Unknown company';
    const locationLine = project.location ? `<div class="crew-item-subtitle">Location: ${project.location}</div>` : '';
    const createdDate = project.createdAt ? new Date(project.createdAt).toLocaleDateString() : 'Unknown';
    return `
      <div class="crew-item" style="display:block;" data-project-id="${project.id}">
        <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start;">
          <div>
            <div class="crew-item-title">${project.title || 'Untitled project'}</div>
            <div class="crew-item-subtitle">Company: ${companyName}</div>
            ${locationLine}
            <div class="crew-item-subtitle">Created: ${createdDate}</div>
          </div>
          <button type="button" class="small-button start add-project-btn" data-project-id="${project.id}">Add</button>
        </div>
      </div>
    `;
  }).join('');

  projectSearchResults.querySelectorAll('.add-project-btn').forEach((button) => {
    button.addEventListener('click', async () => {
      const projectId = button.dataset.projectId;
      if (projectId && !selectedProjectIds.includes(projectId)) {
        try {
          await window.supabaseApp.addManagerProject(currentManagerId, projectId);
          await reloadData();
        } catch (_error) {
          // Keep UX simple; next refresh can recover from transient failures.
        }
      }
    });
  });
}

function renderProjectList() {
  const managerProjectList = document.getElementById('manager-project-list');
  if (!managerProjectList) return;

  const selectedProjects = getManagedProjects();
  const managedTasks = getManagedTasks();
  const managedCrews = getManagedCrews();

  if (!selectedProjects.length) {
    managerProjectList.innerHTML = '<div class="crew-item">No projects in list yet. Search and click Add.</div>';
    return;
  }

  managerProjectList.innerHTML = selectedProjects.map((project) => {
    const companyName = project.companyName || 'Unknown company';
    const locationLine = project.location ? `<div class="crew-item-subtitle">Location: ${project.location}</div>` : '';
    const createdDate = project.createdAt ? new Date(project.createdAt).toLocaleDateString() : 'Unknown';
    const projectTasks = managedTasks.filter((task) => task.projectId === project.id);

    const taskMarkup = projectTasks.length
      ? projectTasks.map((task) => {
          const assignedCrew = task.crewId ? (managedCrews.find((crew) => crew.id === task.crewId)?.name || 'Unknown') : 'Unassigned';
          const statusLabel = String(task.status || 'pending').replace('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
          return `
            <div class="crew-item" style="display:block; margin-top:10px;">
              <div style="display:flex; justify-content:space-between; gap:10px; align-items:center;">
                <div class="crew-item-title">${task.location || 'Unknown location'} - ${task.title || 'Untitled task'}</div>
                <span class="tag ${String(task.status || 'pending').replace(' ', '-')}" style="pointer-events:none;">${statusLabel}</span>
              </div>
              <div class="crew-item-subtitle" style="margin-top:6px;">Crew: ${assignedCrew} - Type: ${task.crewType || 'General'} - Due: ${task.due || 'N/A'}</div>
              <div class="crew-item-subtitle" style="margin-top:4px;">${task.note || 'No notes'}</div>
            </div>
          `;
        }).join('')
      : '<div class="no-tasks" style="padding:8px 0; text-align:left;">No tasks assigned to this project yet.</div>';

    return `
      <article class="task-card">
        <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start;">
          <div>
            <div class="crew-item-title">${project.title || 'Untitled project'}</div>
            <div class="crew-item-subtitle">Company: ${companyName}</div>
            ${locationLine}
            <div class="crew-item-subtitle">Created: ${createdDate}</div>
            ${project.budget ? `<div class="crew-item-subtitle">Budget: $${Number(project.budget).toLocaleString()}</div>` : ''}
          </div>
          <button type="button" class="small-button delete remove-project-btn" data-project-id="${project.id}">Remove</button>
        </div>
        ${project.description ? `<p class="task-notes">${project.description}</p>` : ''}
        <p class="task-notes" style="font-weight:700;">Assigned tasks</p>
        ${taskMarkup}
      </article>
    `;
  }).join('');

  managerProjectList.querySelectorAll('.remove-project-btn').forEach((button) => {
    button.addEventListener('click', async () => {
      const projectId = button.dataset.projectId;
      if (!projectId) return;
      try {
        await window.supabaseApp.removeManagerProject(currentManagerId, projectId);
        await reloadData();
      } catch (_error) {
        // Keep UX simple; next refresh can recover from transient failures.
      }
    });
  });
}

async function reloadData() {
  const data = await window.supabaseApp.loadManagerData(currentManagerId);
  selectedProjectIds = data.selectedProjectIds || [];
  allProjects = data.projects;
  allTasks = data.tasks;
  allCrews = data.crews;

  updateSummary();
  renderProjectList();
}

function bindSearch() {
  const projectSearchForm = document.getElementById('project-search-form');
  const searchCompanyNameInput = document.getElementById('search-company-name');
  const searchProjectNameInput = document.getElementById('search-project-name');
  const projectSearchResults = document.getElementById('project-search-results');

  if (projectSearchResults) {
    projectSearchResults.innerHTML = '<div class="crew-item">Search by company and project name, then click Add.</div>';
  }

  if (projectSearchForm) {
    projectSearchForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const companyName = searchCompanyNameInput.value.trim().toLowerCase();
      const projectName = searchProjectNameInput.value.trim().toLowerCase();
      if (!companyName || !projectName) return;

      let matches = [];
      try {
        matches = await window.supabaseApp.searchProjects(companyName, projectName);
      } catch (_error) {
        if (projectSearchResults) {
          projectSearchResults.innerHTML = '<div class="no-tasks">Unable to search projects right now.</div>';
        }
        return;
      }

      matches = matches.filter((project) => !selectedProjectIds.includes(project.id));

      if (!matches.length) {
        if (projectSearchResults) {
          projectSearchResults.innerHTML = '<div class="no-tasks">No project found for that company and project name.</div>';
        }
        return;
      }

      renderSearchResults(matches);
    });
  }
}

async function init() {
  try {
    const { profile } = await window.supabaseApp.requireRole('manager');
    currentManagerId = profile.id || '';
    bindHeader(profile);
    bindSearch();
    await reloadData();

    setInterval(() => {
      reloadData().catch(() => {
        // Silent refresh retry.
      });
    }, 8000);
  } catch (_error) {
    clearAuthAndRedirect();
  }
}

init();
