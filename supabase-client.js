(function initSupabaseApp() {
  const SUPABASE_URL_DEFAULT = 'https://umxoodgxrnglohjiyvur.supabase.co';
  const SUPABASE_ANON_KEY_DEFAULT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVteG9vZGd4cm5nbG9oaml5dnVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzOTkxMDAsImV4cCI6MjA5Nzk3NTEwMH0.vLPMN5QJIUxy4oj_wZ8wWDj-mCW9HpyDRHo7pUCDG6Q';

  const AUTH_TOKEN_KEY = 'authToken';

  function getRuntimeConfig() {
    const storedUrl = localStorage.getItem('supabaseUrl') || '';
    const storedAnonKey = localStorage.getItem('supabaseAnonKey') || '';

    const url = storedUrl || SUPABASE_URL_DEFAULT;
    const anonKey = storedAnonKey || SUPABASE_ANON_KEY_DEFAULT;

    return { url, anonKey };
  }

  function isConfigured(config) {
    return !config.url.includes('YOUR-PROJECT-REF') && config.anonKey !== 'YOUR-ANON-KEY';
  }

  function clearLocalAuth() {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem('currentUser');
    sessionStorage.removeItem('currentSessionId');
  }

  function getClient() {
    const config = getRuntimeConfig();
    if (!isConfigured(config)) {
      throw new Error('Supabase is not configured. Set SUPABASE_URL_DEFAULT and SUPABASE_ANON_KEY_DEFAULT in supabase-client.js, or set localStorage keys supabaseUrl and supabaseAnonKey.');
    }
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      throw new Error('Supabase library not loaded.');
    }

    if (!window.__constructionSupabaseClient) {
      window.__constructionSupabaseClient = window.supabase.createClient(config.url, config.anonKey);
    }
    return window.__constructionSupabaseClient;
  }

  async function fetchProfile(userId) {
    const client = getClient();
    const { data, error } = await client
      .from('profiles')
      .select('id, role, company, email')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  function saveCurrentUser(profile, session) {
    const sessionId = crypto.randomUUID();
    localStorage.setItem(AUTH_TOKEN_KEY, session?.access_token || 'supabase-session');
    localStorage.setItem('currentUser', JSON.stringify({
      id: profile.id,
      role: profile.role,
      email: profile.email,
      company: profile.company,
      loginTime: Date.now(),
      sessionId,
    }));
    sessionStorage.setItem('currentSessionId', sessionId);
  }

  async function signUpWithRole({ role, company, email, password }) {
    const client = getClient();
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: {
        data: { role, company },
      },
    });
    if (error) throw error;

    const user = data.user;
    if (!user) {
      throw new Error('Unable to create account.');
    }

    // If email confirmation is enabled, session can be null here.
    // In that case, defer profile creation until first successful sign-in.
    if (!data.session) {
      return { profile: null, session: null };
    }

    const { error: profileError } = await client.from('profiles').upsert({
      id: user.id,
      role,
      company,
      email,
      created_at: new Date().toISOString(),
    });
    if (profileError) throw profileError;

    const profile = await fetchProfile(user.id);
    if (!profile) {
      throw new Error('Unable to load profile after sign up.');
    }

    saveCurrentUser(profile, data.session);
    return { profile, session: data.session };
  }

  async function signInWithRole({ role, email, password }) {
    const client = getClient();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;

    const user = data.user;
    const session = data.session;
    if (!user || !session) {
      throw new Error('Unable to sign in.');
    }

    let profile = await fetchProfile(user.id);

    // First login after confirmed sign-up may not have a profile row yet.
    if (!profile) {
      const userRole = user.user_metadata?.role || role;
      const userCompany = user.user_metadata?.company || 'Unknown company';
      const userEmail = user.email || email;

      const { error: profileCreateError } = await client.from('profiles').upsert({
        id: user.id,
        role: userRole,
        company: userCompany,
        email: userEmail,
        created_at: new Date().toISOString(),
      });
      if (profileCreateError) throw profileCreateError;

      profile = await fetchProfile(user.id);
      if (!profile) {
        throw new Error('Account profile could not be created.');
      }
    }

    saveCurrentUser(profile, session);
    return { profile, session };
  }

  async function restoreSession() {
    const client = getClient();
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    const session = data.session;
    if (!session || !session.user) {
      return null;
    }

    const profile = await fetchProfile(session.user.id);
    if (!profile) return null;

    saveCurrentUser(profile, session);
    return { profile, session };
  }

  async function requireRole(allowedRoles) {
    const restored = await restoreSession();
    if (!restored) {
      throw new Error('No active session');
    }

    const allowed = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
    if (!allowed.includes(restored.profile.role)) {
      throw new Error('Role not allowed');
    }

    return restored;
  }

  async function signOut() {
    try {
      const client = getClient();
      await client.auth.signOut();
    } finally {
      clearLocalAuth();
    }
  }

  async function loadOwnerData(ownerId) {
    const client = getClient();
    const [projectsRes, crewsRes, tasksRes, notesRes, assetsRes] = await Promise.all([
      client.from('projects').select('*').eq('owner_id', ownerId).order('created_at', { ascending: false }),
      client.from('crews').select('*').eq('owner_id', ownerId).order('created_at', { ascending: true }),
      client.from('tasks').select('*').eq('owner_id', ownerId).order('created_at', { ascending: false }),
      client.from('shift_notes').select('*').eq('owner_id', ownerId).order('timestamp', { ascending: false }),
      client.from('assets').select('*').eq('owner_id', ownerId).maybeSingle(),
    ]);

    if (projectsRes.error) throw projectsRes.error;
    if (crewsRes.error) throw crewsRes.error;
    if (tasksRes.error) throw tasksRes.error;
    if (notesRes.error) throw notesRes.error;
    if (assetsRes.error) throw assetsRes.error;

    return {
      projects: (projectsRes.data || []).map((p) => ({
        id: p.id,
        ownerId: p.owner_id,
        companyName: p.company_name,
        title: p.title,
        description: p.description || '',
        location: p.location || '',
        budget: p.budget,
        createdAt: p.created_at ? Date.parse(p.created_at) : Date.now(),
      })),
      crews: (crewsRes.data || []).map((c) => ({
        id: c.id,
        ownerId: c.owner_id,
        name: c.name,
        createdAt: c.created_at ? Date.parse(c.created_at) : Date.now(),
      })),
      tasks: (tasksRes.data || []).map((t) => ({
        id: t.id,
        ownerId: t.owner_id,
        title: t.title,
        location: t.location,
        projectId: t.project_id,
        projectTitle: t.project_title || '',
        crewId: t.crew_id || '',
        crewType: t.crew_type || '',
        note: t.note || '',
        due: t.due || '',
        status: t.status || 'pending',
        createdAt: t.created_at ? Date.parse(t.created_at) : Date.now(),
      })),
      shiftNotes: (notesRes.data || []).map((n) => ({
        id: n.id,
        ownerId: n.owner_id,
        target: n.target || 'all',
        text: n.text || '',
        timestamp: n.timestamp ? Date.parse(n.timestamp) : Date.now(),
      })),
      assets: assetsRes.data
        ? {
            blueprintUrl: assetsRes.data.blueprint_url || null,
            blueprintIsPdf: !!assetsRes.data.blueprint_is_pdf,
            modelUrl: assetsRes.data.model_url || null,
          }
        : null,
    };
  }

  async function loadAllData() {
    const client = getClient();
    const [projectsRes, crewsRes, tasksRes] = await Promise.all([
      client.from('projects').select('*').order('created_at', { ascending: false }),
      client.from('crews').select('*').order('created_at', { ascending: true }),
      client.from('tasks').select('*').order('created_at', { ascending: false }),
    ]);

    if (projectsRes.error) throw projectsRes.error;
    if (crewsRes.error) throw crewsRes.error;
    if (tasksRes.error) throw tasksRes.error;

    return {
      projects: (projectsRes.data || []).map((p) => ({
        id: p.id,
        ownerId: p.owner_id,
        companyName: p.company_name,
        title: p.title,
        description: p.description || '',
        location: p.location || '',
        budget: p.budget,
        createdAt: p.created_at ? Date.parse(p.created_at) : Date.now(),
      })),
      crews: (crewsRes.data || []).map((c) => ({
        id: c.id,
        ownerId: c.owner_id,
        name: c.name,
        createdAt: c.created_at ? Date.parse(c.created_at) : Date.now(),
      })),
      tasks: (tasksRes.data || []).map((t) => ({
        id: t.id,
        ownerId: t.owner_id,
        title: t.title,
        location: t.location,
        projectId: t.project_id,
        projectTitle: t.project_title || '',
        crewId: t.crew_id || '',
        crewType: t.crew_type || '',
        note: t.note || '',
        due: t.due || '',
        status: t.status || 'pending',
        createdAt: t.created_at ? Date.parse(t.created_at) : Date.now(),
      })),
    };
  }

  async function loadManagerData(managerId) {
    const client = getClient();
    const accessRes = await client
      .from('manager_project_access')
      .select('project_id')
      .eq('manager_id', managerId);

    if (accessRes.error) throw accessRes.error;

    const selectedProjectIds = Array.from(new Set((accessRes.data || []).map((row) => row.project_id).filter(Boolean)));
    if (!selectedProjectIds.length) {
      return {
        selectedProjectIds: [],
        projects: [],
        crews: [],
        tasks: [],
      };
    }

    const [projectsRes, tasksRes] = await Promise.all([
      client.from('projects').select('*').in('id', selectedProjectIds).order('created_at', { ascending: false }),
      client.from('tasks').select('*').in('project_id', selectedProjectIds).order('created_at', { ascending: false }),
    ]);

    if (projectsRes.error) throw projectsRes.error;
    if (tasksRes.error) throw tasksRes.error;

    const ownerIds = Array.from(new Set((projectsRes.data || []).map((project) => project.owner_id).filter(Boolean)));
    let crewsRes = { data: [], error: null };
    if (ownerIds.length) {
      crewsRes = await client.from('crews').select('*').in('owner_id', ownerIds).order('created_at', { ascending: true });
    }

    if (crewsRes.error) throw crewsRes.error;

    return {
      selectedProjectIds,
      projects: (projectsRes.data || []).map((p) => ({
        id: p.id,
        ownerId: p.owner_id,
        companyName: p.company_name,
        title: p.title,
        description: p.description || '',
        location: p.location || '',
        budget: p.budget,
        createdAt: p.created_at ? Date.parse(p.created_at) : Date.now(),
      })),
      crews: (crewsRes.data || []).map((c) => ({
        id: c.id,
        ownerId: c.owner_id,
        name: c.name,
        createdAt: c.created_at ? Date.parse(c.created_at) : Date.now(),
      })),
      tasks: (tasksRes.data || []).map((t) => ({
        id: t.id,
        ownerId: t.owner_id,
        title: t.title,
        location: t.location,
        projectId: t.project_id,
        projectTitle: t.project_title || '',
        crewId: t.crew_id || '',
        crewType: t.crew_type || '',
        note: t.note || '',
        due: t.due || '',
        status: t.status || 'pending',
        createdAt: t.created_at ? Date.parse(t.created_at) : Date.now(),
      })),
    };
  }

  async function searchProjects(companyName, projectName) {
    const client = getClient();
    const companyFilter = String(companyName || '').trim().toLowerCase();
    const projectFilter = String(projectName || '').trim().toLowerCase();
    const { data, error } = await client.rpc('manager_search_projects', {
      company_term: companyFilter,
      project_term: projectFilter,
    });
    if (error) throw error;

    return (data || []).map((p) => ({
      id: p.id,
      ownerId: p.owner_id,
      companyName: p.company_name,
      title: p.title,
      description: p.description || '',
      location: p.location || '',
      budget: p.budget,
      createdAt: p.created_at ? Date.parse(p.created_at) : Date.now(),
    }));
  }

  async function addManagerProject(managerId, projectId) {
    const client = getClient();
    const { error } = await client.from('manager_project_access').insert({
      manager_id: managerId,
      project_id: projectId,
      created_at: new Date().toISOString(),
    });
    if (error && error.code !== '23505') throw error;
  }

  async function removeManagerProject(managerId, projectId) {
    const client = getClient();
    const { error } = await client
      .from('manager_project_access')
      .delete()
      .eq('manager_id', managerId)
      .eq('project_id', projectId);
    if (error) throw error;
  }

  async function loadCrewBoardData() {
    const client = getClient();
    const [core, notesRes, assetsRes] = await Promise.all([
      loadAllData(),
      client.from('shift_notes').select('*').order('timestamp', { ascending: false }),
      client.from('assets').select('*'),
    ]);

    if (notesRes.error) throw notesRes.error;
    if (assetsRes.error) throw assetsRes.error;

    return {
      ...core,
      shiftNotes: (notesRes.data || []).map((n) => ({
        id: n.id,
        ownerId: n.owner_id,
        target: n.target || 'all',
        text: n.text || '',
        timestamp: n.timestamp ? Date.parse(n.timestamp) : Date.now(),
      })),
      assets: (assetsRes.data || []).map((a) => ({
        ownerId: a.owner_id,
        blueprintUrl: a.blueprint_url || null,
        blueprintIsPdf: !!a.blueprint_is_pdf,
        modelUrl: a.model_url || null,
        updatedAt: a.updated_at ? Date.parse(a.updated_at) : Date.now(),
      })),
    };
  }

  async function createCrew(ownerId, crew) {
    const client = getClient();
    const row = {
      id: crew.id,
      owner_id: ownerId,
      name: crew.name,
      created_at: new Date(crew.createdAt || Date.now()).toISOString(),
    };
    const { error } = await client.from('crews').insert(row);
    if (error) throw error;
  }

  async function deleteCrew(ownerId, crewId) {
    const client = getClient();
    const { error } = await client.from('crews').delete().eq('owner_id', ownerId).eq('id', crewId);
    if (error) throw error;
  }

  async function createProject(ownerId, project) {
    const client = getClient();
    const row = {
      id: project.id,
      owner_id: ownerId,
      company_name: project.companyName,
      title: project.title,
      description: project.description || '',
      location: project.location || '',
      budget: project.budget,
      created_at: new Date(project.createdAt || Date.now()).toISOString(),
    };
    const { error } = await client.from('projects').insert(row);
    if (error) throw error;
  }

  async function deleteProject(ownerId, projectId) {
    const client = getClient();
    const { error } = await client.from('projects').delete().eq('owner_id', ownerId).eq('id', projectId);
    if (error) throw error;
  }

  async function createTask(ownerId, task) {
    const client = getClient();
    const row = {
      id: task.id,
      owner_id: ownerId,
      title: task.title,
      location: task.location,
      project_id: task.projectId,
      project_title: task.projectTitle || '',
      crew_id: task.crewId,
      crew_type: task.crewType || '',
      note: task.note || '',
      due: task.due || '',
      status: task.status || 'pending',
      created_at: new Date(task.createdAt || Date.now()).toISOString(),
    };
    const { error } = await client.from('tasks').insert(row);
    if (error) throw error;
  }

  async function updateTask(ownerId, taskId, patch) {
    const client = getClient();
    const update = {};
    if (patch.status !== undefined) update.status = patch.status;
    if (patch.crewId !== undefined) update.crew_id = patch.crewId;
    if (patch.note !== undefined) update.note = patch.note;
    const { error } = await client.from('tasks').update(update).eq('owner_id', ownerId).eq('id', taskId);
    if (error) throw error;
  }

  async function deleteTask(ownerId, taskId) {
    const client = getClient();
    const { error } = await client.from('tasks').delete().eq('owner_id', ownerId).eq('id', taskId);
    if (error) throw error;
  }

  async function createShiftNote(ownerId, note) {
    const client = getClient();
    const row = {
      id: note.id,
      owner_id: ownerId,
      target: note.target || 'all',
      text: note.text || '',
      timestamp: new Date(note.timestamp || Date.now()).toISOString(),
    };
    const { error } = await client.from('shift_notes').insert(row);
    if (error) throw error;
  }

  async function upsertAssets(ownerId, assetPatch) {
    const client = getClient();
    const { error } = await client.from('assets').upsert({
      owner_id: ownerId,
      blueprint_url: assetPatch.blueprintUrl,
      blueprint_is_pdf: !!assetPatch.blueprintIsPdf,
      model_url: assetPatch.modelUrl,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
  }

  async function refreshAuthToken() {
    const client = getClient();
    const { data } = await client.auth.getSession();
    if (data.session?.access_token) {
      localStorage.setItem(AUTH_TOKEN_KEY, data.session.access_token);
    }
  }

  window.supabaseApp = {
    getClient,
    signUpWithRole,
    signInWithRole,
    restoreSession,
    requireRole,
    signOut,
    fetchProfile,
    loadOwnerData,
    loadAllData,
    loadManagerData,
    searchProjects,
    addManagerProject,
    removeManagerProject,
    loadCrewBoardData,
    createCrew,
    deleteCrew,
    createProject,
    deleteProject,
    createTask,
    updateTask,
    deleteTask,
    createShiftNote,
    upsertAssets,
    refreshAuthToken,
  };
})();
