let allProjects = [];
let allTasks = [];
let allCrews = [];
let selectedProjectIds = [];

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

  const contractorCount = new Set(allProjects.map((project) => project.ownerId).filter(Boolean)).size;

  if (countContractors) countContractors.textContent = String(contractorCount);
  if (countCrews) countCrews.textContent = String(allCrews.length);
  if (countTasks) countTasks.textContent = String(allTasks.length);
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
    button.addEventListener('click', () => {
      const projectId = button.dataset.projectId;
      if (projectId && !selectedProjectIds.includes(projectId)) {
        selectedProjectIds.push(projectId);
        renderProjectList();
      }
    });
  });
}

function renderProjectList() {
  const managerProjectList = document.getElementById('manager-project-list');
  if (!managerProjectList) return;

  const selectedProjects = selectedProjectIds
    .map((projectId) => allProjects.find((project) => project.id === projectId))
    .filter(Boolean);

  if (!selectedProjects.length) {
    managerProjectList.innerHTML = '<div class="crew-item">No projects in list yet. Search and click Add.</div>';
    return;
  }

  managerProjectList.innerHTML = selectedProjects.map((project) => {
    const companyName = project.companyName || 'Unknown company';
    const locationLine = project.location ? `<div class="crew-item-subtitle">Location: ${project.location}</div>` : '';
    const createdDate = project.createdAt ? new Date(project.createdAt).toLocaleDateString() : 'Unknown';
    const projectTasks = allTasks.filter((task) => task.projectId === project.id);

    const taskMarkup = projectTasks.length
      ? projectTasks.map((task) => {
          const assignedCrew = task.crewId ? (allCrews.find((crew) => crew.id === task.crewId)?.name || 'Unknown') : 'Unassigned';
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
    button.addEventListener('click', () => {
      const projectId = button.dataset.projectId;
      selectedProjectIds = selectedProjectIds.filter((id) => id !== projectId);
      renderProjectList();
    });
  });
}

async function reloadData() {
  const data = await window.supabaseApp.loadAllData();
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
    projectSearchForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const companyName = searchCompanyNameInput.value.trim().toLowerCase();
      const projectName = searchProjectNameInput.value.trim().toLowerCase();
      if (!companyName || !projectName) return;

      const matches = allProjects.filter((project) => {
        const projectCompany = String(project.companyName || '').toLowerCase();
        const projectTitle = String(project.title || '').toLowerCase();
        return projectCompany.includes(companyName) && projectTitle.includes(projectName);
      });

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
