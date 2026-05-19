/**
 * storage.js — LocalStorage abstraction layer
 * All data access goes through this module.
 */

const Storage = (() => {
  const KEYS = {
    PROJECTS: 'tracker_projects',
    TICKETS: 'tracker_tickets',
    NOTES: 'tracker_notes',
    ACTIVITY: 'tracker_activity',
    FOCUS_SESSIONS: 'tracker_focus_sessions',
    REFLECTIONS: 'tracker_reflections',
    SETTINGS: 'tracker_settings',
    PINNED: 'tracker_pinned',
  };

  // --- Low-level helpers ---

  function _get(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function _set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error('Storage write failed:', e);
      return false;
    }
  }

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // --- Projects ---

  function getProjects() {
    return _get(KEYS.PROJECTS) || [];
  }

  function getProject(id) {
    return getProjects().find(p => p.id === id) || null;
  }

  function saveProject(project) {
    const projects = getProjects();
    const idx = projects.findIndex(p => p.id === project.id);
    if (idx >= 0) {
      projects[idx] = { ...projects[idx], ...project, updatedAt: Date.now() };
    } else {
      projects.unshift({ ...project, id: project.id || generateId(), createdAt: Date.now(), updatedAt: Date.now() });
    }
    _set(KEYS.PROJECTS, projects);
    return project;
  }

  function deleteProject(id) {
    const projects = getProjects().filter(p => p.id !== id);
    _set(KEYS.PROJECTS, projects);
    // cascade delete tickets and notes
    const tickets = getTickets().filter(t => t.projectId !== id);
    const deletedTicketIds = getTickets().filter(t => t.projectId === id).map(t => t.id);
    _set(KEYS.TICKETS, tickets);
    const notes = getNotes().filter(n => !deletedTicketIds.includes(n.ticketId));
    _set(KEYS.NOTES, notes);
  }

  // --- Tickets ---

  function getTickets(projectId) {
    const all = _get(KEYS.TICKETS) || [];
    return projectId ? all.filter(t => t.projectId === projectId) : all;
  }

  function getTicket(id) {
    return getTickets().find(t => t.id === id) || null;
  }

  function saveTicket(ticket) {
    const tickets = getTickets();
    const idx = tickets.findIndex(t => t.id === ticket.id);
    if (idx >= 0) {
      tickets[idx] = { ...tickets[idx], ...ticket, updatedAt: Date.now() };
    } else {
      tickets.unshift({ ...ticket, id: ticket.id || generateId(), createdAt: Date.now(), updatedAt: Date.now() });
    }
    _set(KEYS.TICKETS, tickets);
    return ticket;
  }

  function deleteTicket(id) {
    _set(KEYS.TICKETS, getTickets().filter(t => t.id !== id));
    _set(KEYS.NOTES, getNotes().filter(n => n.ticketId !== id));
  }

  // --- Notes ---

  function getNotes(ticketId) {
    const all = _get(KEYS.NOTES) || [];
    return ticketId ? all.filter(n => n.ticketId === ticketId) : all;
  }

  function saveNote(note) {
    const notes = getNotes();
    const idx = notes.findIndex(n => n.id === note.id);
    if (idx >= 0) {
      notes[idx] = { ...notes[idx], ...note, updatedAt: Date.now() };
    } else {
      notes.unshift({ ...note, id: note.id || generateId(), createdAt: Date.now(), updatedAt: Date.now() });
    }
    _set(KEYS.NOTES, notes);
    return note;
  }

  function deleteNote(id) {
    _set(KEYS.NOTES, getNotes().filter(n => n.id !== id));
  }

  // --- Activity Log ---

  function getActivity(limit) {
    const all = _get(KEYS.ACTIVITY) || [];
    return limit ? all.slice(0, limit) : all;
  }

  function logActivity(entry) {
    const activity = getActivity();
    activity.unshift({ ...entry, id: generateId(), timestamp: Date.now() });
    // keep last 500 entries
    _set(KEYS.ACTIVITY, activity.slice(0, 500));
  }

  // --- Focus Sessions ---

  function getFocusSessions() {
    return _get(KEYS.FOCUS_SESSIONS) || [];
  }

  function saveFocusSession(session) {
    const sessions = getFocusSessions();
    sessions.unshift({ ...session, id: session.id || generateId(), createdAt: Date.now() });
    _set(KEYS.FOCUS_SESSIONS, sessions);
    return session;
  }

  // --- Reflections ---

  function getReflections() {
    return _get(KEYS.REFLECTIONS) || [];
  }

  function saveReflection(reflection) {
    const reflections = getReflections();
    const today = new Date().toDateString();
    const idx = reflections.findIndex(r => new Date(r.date).toDateString() === today);
    if (idx >= 0) {
      reflections[idx] = { ...reflections[idx], ...reflection, updatedAt: Date.now() };
    } else {
      reflections.unshift({ ...reflection, id: generateId(), date: Date.now(), updatedAt: Date.now() });
    }
    _set(KEYS.REFLECTIONS, reflections);
  }

  function getTodayReflection() {
    const today = new Date().toDateString();
    return getReflections().find(r => new Date(r.date).toDateString() === today) || null;
  }

  // --- Pinned Tickets ---

  function getPinned() {
    return _get(KEYS.PINNED) || [];
  }

  function togglePin(ticketId) {
    const pinned = getPinned();
    const idx = pinned.indexOf(ticketId);
    if (idx >= 0) pinned.splice(idx, 1);
    else pinned.unshift(ticketId);
    _set(KEYS.PINNED, pinned);
    return idx < 0; // returns true if pinned, false if unpinned
  }

  function isPinned(ticketId) {
    return getPinned().includes(ticketId);
  }

  // --- Settings ---

  function getSettings() {
    return _get(KEYS.SETTINGS) || { theme: 'dark', accentColor: '#6366f1', pomodoroWork: 25, pomodoroBreak: 5 };
  }

  function saveSettings(settings) {
    _set(KEYS.SETTINGS, { ...getSettings(), ...settings });
  }

  // --- Stats helpers ---

  function getStats() {
    const projects = getProjects();
    const tickets = getTickets();
    const sessions = getFocusSessions();

    const totalProjects = projects.length;
    const activeProjects = projects.filter(p => p.status === 'active').length;
    const completedTickets = tickets.filter(t => t.status === 'done').length;
    const totalTickets = tickets.length;

    const studyHours = sessions
      .filter(s => s.type === 'study' && s.completed)
      .reduce((acc, s) => acc + (s.duration || 0), 0);

    const devHours = sessions
      .filter(s => s.type === 'dev' && s.completed)
      .reduce((acc, s) => acc + (s.duration || 0), 0);

    // streak: consecutive days with any activity
    const activity = getActivity();
    const streak = calculateStreak(activity);

    return { totalProjects, activeProjects, completedTickets, totalTickets, studyHours, devHours, streak };
  }

  function calculateStreak(activity) {
    if (!activity.length) return 0;
    const days = new Set(activity.map(a => new Date(a.timestamp).toDateString()));
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      if (days.has(d.toDateString())) streak++;
      else break;
    }
    return streak;
  }

  // --- Export / Import ---

  function exportData() {
    const data = {};
    Object.entries(KEYS).forEach(([k, v]) => { data[k] = _get(v); });
    return JSON.stringify(data, null, 2);
  }

  function importData(json) {
    const data = JSON.parse(json);
    Object.entries(KEYS).forEach(([k, v]) => {
      if (data[k] !== undefined) _set(v, data[k]);
    });
  }

  function clearAll() {
    Object.values(KEYS).forEach(k => localStorage.removeItem(k));
  }

  return {
    generateId,
    getProjects, getProject, saveProject, deleteProject,
    getTickets, getTicket, saveTicket, deleteTicket,
    getNotes, saveNote, deleteNote,
    getActivity, logActivity,
    getFocusSessions, saveFocusSession,
    getReflections, saveReflection, getTodayReflection,
    getPinned, togglePin, isPinned,
    getSettings, saveSettings,
    getStats,
    exportData, importData, clearAll,
  };
})();
