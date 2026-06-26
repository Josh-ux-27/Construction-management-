// Authentication check for manager-only contractor detail page
(async function checkAuth() {
  try {
    const restored = await window.supabaseApp.requireRole('manager');
    const userData = restored.profile;
    const sessionId = crypto.randomUUID();
    sessionStorage.setItem('currentUser', JSON.stringify({
      id: userData.id,
      role: userData.role,
      email: userData.email,
      company: userData.company,
      loginTime: Date.now(),
      sessionId,
    }));
    sessionStorage.setItem('currentSessionId', sessionId);

    const profileName = document.getElementById('profile-name');
    const profileAvatar = document.getElementById('profile-avatar');
    const profileBtn = document.getElementById('profile-btn');
    const profileMenu = document.getElementById('profile-menu-items');
    const backToManagerBtn = document.getElementById('back-to-manager-btn');

    if (profileName) {
      profileName.textContent = `Project Manager • ${userData.email || 'Manager'}`;
    }
    if (profileAvatar) {
      profileAvatar.textContent = 'PM';
    }

    if (profileBtn && profileMenu) {
      profileBtn.addEventListener('click', event => {
        event.stopPropagation();
        const isOpen = !profileMenu.hidden;
        profileMenu.hidden = isOpen;
        profileBtn.setAttribute('aria-expanded', String(!isOpen));
      });

      document.addEventListener('click', event => {
        if (!profileMenu.contains(event.target) && !profileBtn.contains(event.target)) {
          profileMenu.hidden = true;
          profileBtn.setAttribute('aria-expanded', 'false');
        }
      });

      profileMenu.addEventListener('click', event => event.stopPropagation());
    }

    if (backToManagerBtn) {
      backToManagerBtn.addEventListener('click', () => {
        window.location.href = 'manager.html';
      });
    }

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        await window.supabaseApp.signOut();
        window.location.href = 'login.html';
      });
    }

    const contractors = JSON.parse(localStorage.getItem('managerContractors') || '[]');
    const tasks = JSON.parse(localStorage.getItem('constructionTasks') || '[]');
    const contractorId = new URLSearchParams(window.location.search).get('contractorId');

    const contractor = contractors.find(item => item.id === contractorId);
    const contractorTitle = document.getElementById('contractor-title');
    const contractorSubtitle = document.getElementById('contractor-subtitle');
    const contractorCompanyLabel = document.getElementById('contractor-company-label');
    const projectList = document.getElementById('project-list');
    const projectForm = document.getElementById('project-form');
    const projectTitleInput = document.getElementById('project-title');
    const projectNotesInput = document.getElementById('project-notes');
    const countProjects = document.getElementById('count-projects');
    const countTasks = document.getElementById('count-tasks');
    const taskOverview = document.getElementById('task-overview');

    if (!contractor) {
      if (contractorTitle) contractorTitle.textContent = 'Contractor not found';
      if (contractorSubtitle) contractorSubtitle.textContent = 'Return to the manager page and select a contractor.';
      if (contractorCompanyLabel) contractorCompanyLabel.textContent = 'No contractor data found.';
      if (projectList) projectList.innerHTML = '<div class="crew-item">No contractor selected.</div>';
      if (taskOverview) taskOverview.innerHTML = '<div class="no-tasks">No contractor selected.</div>';
      return;
    }

    if (contractorTitle) contractorTitle.textContent = contractor.name;
    if (contractorSubtitle) contractorSubtitle.textContent = contractor.company || 'No company listed';
    if (contractorCompanyLabel) contractorCompanyLabel.textContent = contractor.company || 'No company listed';

    function loadContractorProjects() {
      const freshContractors = JSON.parse(localStorage.getItem('managerContractors') || '[]');
      const freshContractor = freshContractors.find(item => item.id === contractorId);
      return freshContractor && Array.isArray(freshContractor.projects) ? freshContractor.projects : [];
    }

    function saveContractorProjects(projects) {
      const freshContractors = JSON.parse(localStorage.getItem('managerContractors') || '[]');
      const updated = freshContractors.map(item => {
        if (item.id !== contractorId) return item;
        return { ...item, projects };
      });
      localStorage.setItem('managerContractors', JSON.stringify(updated));
    }

    function getProjectTaskCount(project) {
      return Array.isArray(project.tasks) ? project.tasks.length : 0;
    }

    function renderProjects() {
      const projects = loadContractorProjects();
      const taskTotal = projects.reduce((total, project) => total + getProjectTaskCount(project), 0);
      if (countProjects) countProjects.textContent = String(projects.length);
      if (countTasks) countTasks.textContent = String(taskTotal);
      if (!projectList) return;

      if (!projects.length) {
        projectList.innerHTML = '<div class="crew-item">No projects added yet.</div>';
        return;
      }

      projectList.innerHTML = projects.map((project, index) => {
        const projectTasks = Array.isArray(project.tasks) ? project.tasks : [];
        const taskMarkup = projectTasks.length
          ? projectTasks.map((task, taskIndex) => `
              <div class="crew-item" style="margin-top:8px;">
                <div>
                  <div class="crew-item-title">${task.title}</div>
                  <div class="crew-item-subtitle">${task.notes || 'No details'}</div>
                </div>
                <button type="button" class="delete-crew project-delete-task" data-project-index="${index}" data-task-index="${taskIndex}">Remove</button>
              </div>
            `).join('')
          : '<div class="crew-item" style="margin-top:8px;">No tasks in this project yet.</div>';

        return `
          <div class="crew-item contractor-project-card" style="display:block;">
            <div style="display:flex; justify-content:space-between; gap:16px; align-items:flex-start;">
              <div>
                <div class="crew-item-title">${project.title}</div>
                <div class="crew-item-subtitle">${project.notes || 'No notes'}</div>
              </div>
              <button type="button" class="delete-crew project-remove" data-index="${index}">Remove Project</button>
            </div>

            <div style="margin-top:12px; display:grid; gap:8px;">
              <input class="project-task-title" data-project-index="${index}" type="text" placeholder="Task title" />
              <textarea class="project-task-notes" data-project-index="${index}" rows="2" placeholder="Task details"></textarea>
              <button type="button" class="small-button project-add-task" data-index="${index}">Add Task to Project</button>
            </div>

            <div style="margin-top:12px;">
              ${taskMarkup}
            </div>
          </div>
        `;
      }).join('');

      projectList.querySelectorAll('.project-remove').forEach(button => {
        button.addEventListener('click', () => {
          const index = Number(button.dataset.index);
          const nextProjects = loadContractorProjects().filter((_, projectIndex) => projectIndex !== index);
          saveContractorProjects(nextProjects);
          renderProjects();
        });
      });

      projectList.querySelectorAll('.project-add-task').forEach(button => {
        button.addEventListener('click', () => {
          const index = Number(button.dataset.index);
          const projectCard = button.closest('.contractor-project-card');
          const titleInput = projectCard.querySelector('.project-task-title');
          const notesInput = projectCard.querySelector('.project-task-notes');
          const title = titleInput.value.trim();
          const notes = notesInput.value.trim();
          if (!title) return;

          const projects = loadContractorProjects();
          const project = projects[index];
          if (!project.tasks) project.tasks = [];
          project.tasks.push({
            id: crypto.randomUUID(),
            title,
            notes,
            createdAt: Date.now(),
          });
          saveContractorProjects(projects);
          renderProjects();
        });
      });

      projectList.querySelectorAll('.project-delete-task').forEach(button => {
        button.addEventListener('click', () => {
          const projectIndex = Number(button.dataset.projectIndex);
          const taskIndex = Number(button.dataset.taskIndex);
          const projects = loadContractorProjects();
          const project = projects[projectIndex];
          if (!project || !Array.isArray(project.tasks)) return;
          project.tasks = project.tasks.filter((_, index) => index !== taskIndex);
          saveContractorProjects(projects);
          renderProjects();
        });
      });
    }

    function renderTaskOverview() {
      if (!taskOverview) return;
      const projects = loadContractorProjects();
      const allTasks = projects.flatMap(project => (Array.isArray(project.tasks) ? project.tasks.map(task => ({ ...task, projectTitle: project.title })) : []));
      if (countTasks) countTasks.textContent = String(allTasks.length);

      if (!allTasks.length) {
        taskOverview.innerHTML = '<div class="no-tasks">No tasks scheduled yet.</div>';
        return;
      }

      taskOverview.innerHTML = allTasks.map(task => `
          <article class="task-card">
            <header>
              <h3 class="task-title">${task.projectTitle} — ${task.title}</h3>
              <span class="tag pending" style="pointer-events:none;">Pending</span>
            </header>
            <div class="task-meta">
              <span>Project: ${task.projectTitle}</span>
            </div>
            <p class="task-notes">${task.notes || ''}</p>
          </article>
        `).join('');
    }

    if (projectForm) {
      projectForm.addEventListener('submit', event => {
        event.preventDefault();
        const title = projectTitleInput.value.trim();
        const notes = projectNotesInput.value.trim();
        if (!title) return;

        const projects = loadContractorProjects();
        projects.push({
          id: crypto.randomUUID(),
          title,
          notes,
          tasks: [],
          createdAt: Date.now(),
        });
        saveContractorProjects(projects);
        projectForm.reset();
        renderProjects();
      });
    }

    renderProjects();
    renderTaskOverview();

    window.addEventListener('storage', event => {
      if (event.key === 'managerContractors' || event.key === 'constructionTasks') {
        renderProjects();
        renderTaskOverview();
      }
    });
  } catch (e) {
    const message = String(e?.message || '');
    if (message.includes('No active session') || message.includes('Role not allowed')) {
      localStorage.removeItem('authToken');
      localStorage.removeItem('currentUser');
      sessionStorage.removeItem('authToken');
      sessionStorage.removeItem('currentUser');
      sessionStorage.removeItem('currentSessionId');
      window.location.href = 'login.html?authError=session';
      return;
    }

    console.error('Contractor detail initialization failed:', e);
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    sessionStorage.removeItem('authToken');
    sessionStorage.removeItem('currentUser');
    sessionStorage.removeItem('currentSessionId');
  }
})();
