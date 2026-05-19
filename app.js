/**
 * app.js — Main application: router, views, business logic, event wiring
 */

const App = (() => {

  // ─── State ────────────────────────────────────────────────────────────────

  let currentView = 'dashboard';
  let currentProjectId = null;
  let dragSrcTicketId = null;
  let pomodoroInterval = null;
  let pomodoroSeconds = 0;
  let pomodoroRunning = false;
  let pomodoroType = 'work'; // 'work' | 'break'
  let searchQuery = '';
  let filterType = 'all';
  let filterStatus = 'all';

  // ─── Router ───────────────────────────────────────────────────────────────

  function navigate(view, projectId = null) {
    currentView = view;
    currentProjectId = projectId;
    UI.setActiveSidebarItem(view);
    renderMainContent();
    window.scrollTo(0, 0);
  }

  // ─── Main Render Dispatcher ───────────────────────────────────────────────

  function renderMainContent() {
    const main = document.getElementById('main-content');
    switch (currentView) {
      case 'dashboard':   main.innerHTML = renderDashboard(); bindDashboard(); break;
      case 'projects':    main.innerHTML = renderProjectsList(); bindProjectsList(); break;
      case 'project':     main.innerHTML = renderProjectDetail(); bindProjectDetail(); break;
      case 'focus':       main.innerHTML = renderFocus(); bindFocus(); break;
      case 'activity':    main.innerHTML = renderActivity(); break;
      case 'analytics':   main.innerHTML = renderAnalytics(); bindAnalytics(); break;
      default:            main.innerHTML = renderDashboard(); bindDashboard();
    }
  }

  // ─── Dashboard ────────────────────────────────────────────────────────────

  function renderDashboard() {
    const stats = Storage.getStats();
    const projects = Storage.getProjects().filter(p => p.status === 'active').slice(0, 6);
    const pinned = Storage.getPinned();
    const pinnedTickets = pinned.map(id => Storage.getTicket(id)).filter(Boolean).slice(0, 5);
    const recentActivity = Storage.getActivity(8);
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    return `
      <div class="view-header">
        <div>
          <h1 class="view-title">Dashboard</h1>
          <p class="view-subtitle">${today}</p>
        </div>
        <button class="btn btn-primary" id="btn-new-project">+ New Project</button>
      </div>

      <div class="stats-grid">
        ${statCard('Projects', stats.totalProjects, '📁', '#6366f1', `${stats.activeProjects} active`)}
        ${statCard('Tickets Done', stats.completedTickets, '✅', '#10b981', `of ${stats.totalTickets} total`)}
        ${statCard('Focus Hours', (stats.studyHours + stats.devHours).toFixed(1), '⏱', '#f59e0b', `${stats.studyHours.toFixed(1)}h study · ${stats.devHours.toFixed(1)}h dev`)}
        ${statCard('Streak', stats.streak, '🔥', '#ef4444', `${stats.streak === 1 ? 'day' : 'days'} in a row`)}
      </div>

      ${pinnedTickets.length ? `
        <section class="section">
          <h2 class="section-title">📌 Pinned Tickets</h2>
          <div class="pinned-list">
            ${pinnedTickets.map(t => renderTicketRow(t)).join('')}
          </div>
        </section>
      ` : ''}

      <section class="section">
        <div class="section-header">
          <h2 class="section-title">Active Projects</h2>
          <button class="btn btn-ghost btn-sm" data-view="projects">View all →</button>
        </div>
        ${projects.length ? `
          <div class="projects-grid">
            ${projects.map(p => renderProjectCard(p)).join('')}
          </div>
        ` : UI.emptyState('📂', 'No active projects', 'Create your first project to get started', { id: 'empty-new-project', label: '+ New Project' })}
      </section>

      <section class="section">
        <h2 class="section-title">Recent Activity</h2>
        ${recentActivity.length ? `
          <div class="activity-list">
            ${recentActivity.map(a => renderActivityEntry(a)).join('')}
          </div>
        ` : UI.emptyState('📋', 'No activity yet', 'Start working to see your activity here')}
      </section>
    `;
  }

  function statCard(label, value, icon, color, sub) {
    return `
      <div class="stat-card" style="--stat-color:${color}">
        <div class="stat-icon">${icon}</div>
        <div class="stat-body">
          <div class="stat-value">${value}</div>
          <div class="stat-label">${label}</div>
          ${sub ? `<div class="stat-sub">${sub}</div>` : ''}
        </div>
      </div>
    `;
  }

  function bindDashboard() {
    document.getElementById('btn-new-project')?.addEventListener('click', openProjectModal);
    document.getElementById('empty-new-project')?.addEventListener('click', openProjectModal);
    document.getElementById('main-content').querySelectorAll('[data-view]').forEach(el => {
      el.addEventListener('click', () => navigate(el.dataset.view));
    });
    document.querySelectorAll('[data-project-id]').forEach(el => {
      el.addEventListener('click', (e) => {
        if (!e.target.closest('.card-action')) {
          navigate('project', el.dataset.projectId);
        }
      });
    });
    bindTicketRowActions(document.getElementById('main-content'));
  }

  // ─── Projects List ────────────────────────────────────────────────────────

  function renderProjectsList() {
    const all = Storage.getProjects();
    const filtered = all.filter(p => {
      const matchSearch = !searchQuery || p.title.toLowerCase().includes(searchQuery) || (p.description || '').toLowerCase().includes(searchQuery);
      const matchType = filterType === 'all' || p.type === filterType;
      const matchStatus = filterStatus === 'all' || p.status === filterStatus;
      return matchSearch && matchType && matchStatus;
    });

    return `
      <div class="view-header">
        <div>
          <h1 class="view-title">Projects</h1>
          <p class="view-subtitle">${all.length} total · ${all.filter(p=>p.status==='active').length} active</p>
        </div>
        <button class="btn btn-primary" id="btn-new-project">+ New Project</button>
      </div>

      <div class="toolbar">
        <input type="text" class="search-input" id="project-search" placeholder="Search projects…" value="${UI.escapeHtml(searchQuery)}">
        <select class="select-input" id="filter-type">
          <option value="all" ${filterType==='all'?'selected':''}>All Types</option>
          <option value="startup" ${filterType==='startup'?'selected':''}>Startup</option>
          <option value="study" ${filterType==='study'?'selected':''}>Study</option>
          <option value="personal" ${filterType==='personal'?'selected':''}>Personal</option>
        </select>
        <select class="select-input" id="filter-status">
          <option value="all" ${filterStatus==='all'?'selected':''}>All Status</option>
          <option value="active" ${filterStatus==='active'?'selected':''}>Active</option>
          <option value="paused" ${filterStatus==='paused'?'selected':''}>Paused</option>
          <option value="completed" ${filterStatus==='completed'?'selected':''}>Completed</option>
        </select>
      </div>

      ${filtered.length ? `
        <div class="projects-grid">
          ${filtered.map(p => renderProjectCard(p)).join('')}
        </div>
      ` : UI.emptyState('📂', 'No projects found', searchQuery ? 'Try a different search' : 'Create your first project', { id: 'empty-new-project', label: '+ New Project' })}
    `;
  }

  function renderProjectCard(p) {
    const tickets = Storage.getTickets(p.id);
    const done = tickets.filter(t => t.status === 'done').length;
    const total = tickets.length;
    const progress = total ? Math.round((done / total) * 100) : (p.progress || 0);
    const color = UI.typeColor(p.type);

    return `
      <div class="project-card glass" data-project-id="${p.id}" style="--project-color:${color}">
        <div class="project-card-top">
          <div class="project-type-dot" style="background:${color}"></div>
          <span class="project-type-label">${p.type || 'project'}</span>
          <div class="card-actions">
            <button class="btn-icon card-action" data-action="edit-project" data-id="${p.id}" title="Edit">✏️</button>
            <button class="btn-icon card-action" data-action="delete-project" data-id="${p.id}" title="Delete">🗑️</button>
          </div>
        </div>
        <h3 class="project-title">${UI.escapeHtml(p.title)}</h3>
        <p class="project-desc">${UI.escapeHtml(p.description || '')}</p>
        <div class="project-tags">${UI.tagChips(p.tags || [])}</div>
        <div class="project-meta">
          ${UI.statusBadge(p.status)}
          <span class="meta-tickets">${done}/${total} tickets</span>
        </div>
        ${UI.progressBar(progress, color)}
        <div class="project-footer">
          <span class="meta-date">Started ${p.startDate ? UI.formatDate(new Date(p.startDate).getTime()) : 'N/A'}</span>
          <span class="progress-pct">${progress}%</span>
        </div>
      </div>
    `;
  }

  function bindProjectsList() {
    document.getElementById('btn-new-project')?.addEventListener('click', openProjectModal);
    document.getElementById('empty-new-project')?.addEventListener('click', openProjectModal);

    const search = document.getElementById('project-search');
    search?.addEventListener('input', UI.debounce(e => {
      searchQuery = e.target.value.toLowerCase();
      document.getElementById('main-content').innerHTML = renderProjectsList();
      bindProjectsList();
    }));

    document.getElementById('filter-type')?.addEventListener('change', e => {
      filterType = e.target.value;
      document.getElementById('main-content').innerHTML = renderProjectsList();
      bindProjectsList();
    });

    document.getElementById('filter-status')?.addEventListener('change', e => {
      filterStatus = e.target.value;
      document.getElementById('main-content').innerHTML = renderProjectsList();
      bindProjectsList();
    });

    document.querySelectorAll('[data-project-id]').forEach(el => {
      el.addEventListener('click', e => {
        if (!e.target.closest('.card-action')) navigate('project', el.dataset.projectId);
      });
    });

    document.querySelectorAll('[data-action="edit-project"]').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); openProjectModal(Storage.getProject(btn.dataset.id)); });
    });

    document.querySelectorAll('[data-action="delete-project"]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        UI.confirm(`Delete project "${Storage.getProject(btn.dataset.id)?.title}"? This will also delete all tickets and notes.`, () => {
          Storage.deleteProject(btn.dataset.id);
          Storage.logActivity({ type: 'project_deleted', label: 'Project deleted' });
          UI.toast('Project deleted', 'success');
          navigate('projects');
        });
      });
    });
  }

  // ─── Project Modal ────────────────────────────────────────────────────────

  function openProjectModal(project = null) {
    const isEdit = project && project.id;
    const p = isEdit ? project : {};

    UI.showModal({
      id: 'project-modal',
      title: isEdit ? 'Edit Project' : 'New Project',
      body: `
        <form id="project-form" class="form-grid">
          <div class="form-group">
            <label class="form-label">Title *</label>
            <input class="form-input" id="pf-title" placeholder="Project title" value="${UI.escapeHtml(p.title || '')}" required>
          </div>
          <div class="form-group">
            <label class="form-label">Description</label>
            <textarea class="form-input form-textarea" id="pf-desc" placeholder="What is this project about?">${UI.escapeHtml(p.description || '')}</textarea>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Type</label>
              <select class="form-input" id="pf-type">
                <option value="startup" ${p.type==='startup'?'selected':''}>🚀 Startup</option>
                <option value="study" ${p.type==='study'?'selected':''}>📚 Study</option>
                <option value="personal" ${p.type==='personal'?'selected':''}>🌱 Personal</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Status</label>
              <select class="form-input" id="pf-status">
                <option value="active" ${p.status==='active'?'selected':''}>Active</option>
                <option value="paused" ${p.status==='paused'?'selected':''}>Paused</option>
                <option value="completed" ${p.status==='completed'?'selected':''}>Completed</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Start Date</label>
            <input class="form-input" id="pf-start" type="date" value="${p.startDate || ''}">
          </div>
          <div class="form-group">
            <label class="form-label">Tags (comma-separated)</label>
            <input class="form-input" id="pf-tags" placeholder="react, mvp, backend" value="${(p.tags || []).join(', ')}">
          </div>
        </form>
      `,
      actions: [
        { label: 'Cancel', class: 'btn btn-ghost', id: 'pm-cancel', onClick: () => UI.closeModal('project-modal') },
        { label: isEdit ? 'Save Changes' : 'Create Project', class: 'btn btn-primary', id: 'pm-save', onClick: () => saveProjectFromModal(isEdit ? p.id : null) },
      ],
    });
  }

  function saveProjectFromModal(existingId) {
    const title = document.getElementById('pf-title').value.trim();
    if (!title) { UI.toast('Title is required', 'error'); return; }

    const tags = document.getElementById('pf-tags').value.split(',').map(t => t.trim()).filter(Boolean);
    const project = {
      id: existingId || Storage.generateId(),
      title,
      description: document.getElementById('pf-desc').value.trim(),
      type: document.getElementById('pf-type').value,
      status: document.getElementById('pf-status').value,
      startDate: document.getElementById('pf-start').value,
      tags,
    };

    Storage.saveProject(project);
    Storage.logActivity({ type: 'project_created', label: existingId ? `Updated project: ${title}` : `Created project: ${title}`, projectId: project.id });
    UI.toast(existingId ? 'Project updated' : 'Project created', 'success');
    UI.closeModal('project-modal');
    navigate(currentView === 'project' ? 'project' : 'projects', currentProjectId);
  }

  // ─── Project Detail (Kanban) ──────────────────────────────────────────────

  function renderProjectDetail() {
    const p = Storage.getProject(currentProjectId);
    if (!p) return `<div class="error-state">Project not found. <button class="btn btn-ghost" onclick="App.navigate('projects')">← Back</button></div>`;

    const tickets = Storage.getTickets(currentProjectId);
    const todo = tickets.filter(t => t.status === 'todo');
    const inprog = tickets.filter(t => t.status === 'in-progress');
    const done = tickets.filter(t => t.status === 'done');
    const progress = tickets.length ? Math.round((done.length / tickets.length) * 100) : 0;
    const color = UI.typeColor(p.type);

    return `
      <div class="view-header">
        <div class="breadcrumb">
          <button class="btn btn-ghost btn-sm" id="btn-back-projects">← Projects</button>
          <span class="breadcrumb-sep">/</span>
          <span class="breadcrumb-current">${UI.escapeHtml(p.title)}</span>
        </div>
        <div class="header-actions">
          <button class="btn btn-ghost btn-sm" id="btn-edit-project">Edit</button>
          <button class="btn btn-primary" id="btn-new-ticket">+ Ticket</button>
        </div>
      </div>

      <div class="project-detail-header glass">
        <div class="pdh-left">
          <div class="project-type-dot lg" style="background:${color}"></div>
          <div>
            <h2 class="pdh-title">${UI.escapeHtml(p.title)}</h2>
            <p class="pdh-desc">${UI.escapeHtml(p.description || '')}</p>
            <div class="pdh-meta">
              ${UI.statusBadge(p.status)}
              ${UI.tagChips(p.tags || [])}
            </div>
          </div>
        </div>
        <div class="pdh-right">
          <canvas id="project-donut" width="80" height="80"></canvas>
          <div class="pdh-stats">
            <div class="pdh-stat"><span class="pdh-num">${todo.length}</span><span class="pdh-lbl">Todo</span></div>
            <div class="pdh-stat"><span class="pdh-num">${inprog.length}</span><span class="pdh-lbl">In Progress</span></div>
            <div class="pdh-stat"><span class="pdh-num">${done.length}</span><span class="pdh-lbl">Done</span></div>
          </div>
        </div>
      </div>

      <div class="kanban-board">
        ${kanbanColumn('todo', 'Todo', todo, color)}
        ${kanbanColumn('in-progress', 'In Progress', inprog, color)}
        ${kanbanColumn('done', 'Done', done, color)}
      </div>
    `;
  }

  function kanbanColumn(status, label, tickets, color) {
    const icons = { todo: '○', 'in-progress': '◑', done: '●' };
    return `
      <div class="kanban-col" data-status="${status}" id="col-${status}">
        <div class="kanban-col-header">
          <span class="kanban-icon">${icons[status]}</span>
          <span class="kanban-col-title">${label}</span>
          <span class="kanban-count">${tickets.length}</span>
        </div>
        <div class="kanban-cards" data-status="${status}" id="cards-${status}">
          ${tickets.map(t => renderKanbanCard(t)).join('')}
          <div class="kanban-drop-hint" data-status="${status}">Drop here</div>
        </div>
        <button class="btn-add-ticket" data-status="${status}">+ Add ticket</button>
      </div>
    `;
  }

  function renderKanbanCard(t) {
    const pinned = Storage.isPinned(t.id);
    const notesCount = Storage.getNotes(t.id).length;
    return `
      <div class="kanban-card glass" draggable="true" data-ticket-id="${t.id}" data-status="${t.status}">
        <div class="kc-top">
          ${UI.priorityBadge(t.priority)}
          <div class="kc-actions">
            <button class="btn-icon" data-action="pin" data-id="${t.id}" title="${pinned?'Unpin':'Pin'}">${pinned?'📌':'📍'}</button>
            <button class="btn-icon" data-action="edit-ticket" data-id="${t.id}" title="Edit">✏️</button>
            <button class="btn-icon" data-action="delete-ticket" data-id="${t.id}" title="Delete">🗑️</button>
          </div>
        </div>
        <h4 class="kc-title">${UI.escapeHtml(t.title)}</h4>
        ${t.description ? `<p class="kc-desc">${UI.escapeHtml(t.description)}</p>` : ''}
        <div class="kc-tags">${UI.tagChips(t.labels || [])}</div>
        <div class="kc-footer">
          ${t.estimatedHours ? `<span class="kc-meta">⏱ ${t.estimatedHours}h</span>` : ''}
          ${notesCount ? `<span class="kc-meta">📝 ${notesCount}</span>` : ''}
          <button class="btn-ghost-sm" data-action="open-notes" data-id="${t.id}">Notes →</button>
        </div>
      </div>
    `;
  }

  function bindProjectDetail() {
    const p = Storage.getProject(currentProjectId);
    if (!p) return;

    document.getElementById('btn-back-projects')?.addEventListener('click', () => navigate('projects'));
    document.getElementById('btn-edit-project')?.addEventListener('click', () => openProjectModal(p));
    document.getElementById('btn-new-ticket')?.addEventListener('click', () => openTicketModal());

    document.querySelectorAll('.btn-add-ticket').forEach(btn => {
      btn.addEventListener('click', () => openTicketModal(null, btn.dataset.status));
    });

    // Kanban drag-and-drop
    setupDragDrop();

    // Donut chart
    const color = UI.typeColor(p.type);
    const tickets = Storage.getTickets(currentProjectId);
    const done = tickets.filter(t => t.status === 'done').length;
    const pct = tickets.length ? (done / tickets.length) * 100 : 0;
    setTimeout(() => Charts.renderDonut('project-donut', pct, color), 50);

    // Card actions
    const main = document.getElementById('main-content');
    main.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const { action, id } = btn.dataset;

      if (action === 'pin') {
        const wasPinned = Storage.togglePin(id);
        UI.toast(wasPinned ? 'Ticket pinned' : 'Ticket unpinned', 'info');
        renderMainContent();
      }
      if (action === 'edit-ticket') openTicketModal(Storage.getTicket(id));
      if (action === 'delete-ticket') {
        UI.confirm('Delete this ticket?', () => {
          Storage.deleteTicket(id);
          Storage.logActivity({ type: 'ticket_deleted', label: 'Ticket deleted', projectId: currentProjectId });
          UI.toast('Ticket deleted', 'success');
          renderMainContent();
        });
      }
      if (action === 'open-notes') openNotesPanel(id);
    });
  }

  // ─── Drag and Drop ────────────────────────────────────────────────────────

  function setupDragDrop() {
    const cards = document.querySelectorAll('.kanban-card');
    const cols = document.querySelectorAll('.kanban-cards');

    cards.forEach(card => {
      card.addEventListener('dragstart', e => {
        dragSrcTicketId = card.dataset.ticketId;
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        document.querySelectorAll('.kanban-drop-hint').forEach(h => h.classList.remove('drop-active'));
      });
    });

    cols.forEach(col => {
      col.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        col.querySelector('.kanban-drop-hint')?.classList.add('drop-active');
      });
      col.addEventListener('dragleave', () => {
        col.querySelector('.kanban-drop-hint')?.classList.remove('drop-active');
      });
      col.addEventListener('drop', e => {
        e.preventDefault();
        const newStatus = col.dataset.status;
        if (!dragSrcTicketId) return;
        const ticket = Storage.getTicket(dragSrcTicketId);
        if (!ticket || ticket.status === newStatus) return;

        const oldStatus = ticket.status;
        ticket.status = newStatus;
        if (newStatus === 'done') ticket.completedAt = Date.now();
        else ticket.completedAt = null;

        Storage.saveTicket(ticket);
        Storage.logActivity({
          type: 'ticket_moved',
          label: `"${ticket.title}" moved to ${newStatus}`,
          projectId: currentProjectId,
        });

        if (newStatus === 'done') UI.toast('Ticket completed! 🎉', 'success');
        renderMainContent();
      });
    });
  }

  // ─── Ticket Modal ─────────────────────────────────────────────────────────

  function openTicketModal(ticket = null, defaultStatus = 'todo') {
    const isEdit = ticket && ticket.id;
    const t = isEdit ? ticket : { status: defaultStatus };

    UI.showModal({
      id: 'ticket-modal',
      title: isEdit ? 'Edit Ticket' : 'New Ticket',
      body: `
        <form id="ticket-form" class="form-grid">
          <div class="form-group">
            <label class="form-label">Title *</label>
            <input class="form-input" id="tf-title" placeholder="What needs to be done?" value="${UI.escapeHtml(t.title || '')}" required>
          </div>
          <div class="form-group">
            <label class="form-label">Description</label>
            <textarea class="form-input form-textarea" id="tf-desc" placeholder="Details, acceptance criteria…">${UI.escapeHtml(t.description || '')}</textarea>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Priority</label>
              <select class="form-input" id="tf-priority">
                <option value="low" ${t.priority==='low'?'selected':''}>Low</option>
                <option value="medium" ${t.priority==='medium'||!t.priority?'selected':''}>Medium</option>
                <option value="high" ${t.priority==='high'?'selected':''}>High</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Status</label>
              <select class="form-input" id="tf-status">
                <option value="todo" ${t.status==='todo'?'selected':''}>Todo</option>
                <option value="in-progress" ${t.status==='in-progress'?'selected':''}>In Progress</option>
                <option value="done" ${t.status==='done'?'selected':''}>Done</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Estimated Hours</label>
              <input class="form-input" id="tf-hours" type="number" min="0" step="0.5" value="${t.estimatedHours || ''}">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Labels (comma-separated)</label>
            <input class="form-input" id="tf-labels" placeholder="bug, feature, docs" value="${(t.labels || []).join(', ')}">
          </div>
        </form>
      `,
      actions: [
        { label: 'Cancel', class: 'btn btn-ghost', id: 'tm-cancel', onClick: () => UI.closeModal('ticket-modal') },
        { label: isEdit ? 'Save Changes' : 'Create Ticket', class: 'btn btn-primary', id: 'tm-save', onClick: () => saveTicketFromModal(isEdit ? t.id : null) },
      ],
    });
  }

  function saveTicketFromModal(existingId) {
    const title = document.getElementById('tf-title').value.trim();
    if (!title) { UI.toast('Title is required', 'error'); return; }

    const labels = document.getElementById('tf-labels').value.split(',').map(l => l.trim()).filter(Boolean);
    const status = document.getElementById('tf-status').value;
    const ticket = {
      id: existingId || Storage.generateId(),
      projectId: currentProjectId,
      title,
      description: document.getElementById('tf-desc').value.trim(),
      priority: document.getElementById('tf-priority').value,
      status,
      estimatedHours: parseFloat(document.getElementById('tf-hours').value) || null,
      labels,
      completedAt: status === 'done' ? (existingId ? Storage.getTicket(existingId)?.completedAt || Date.now() : Date.now()) : null,
    };

    Storage.saveTicket(ticket);
    Storage.logActivity({
      type: existingId ? 'ticket_updated' : 'ticket_created',
      label: `${existingId ? 'Updated' : 'Created'} ticket: ${title}`,
      projectId: currentProjectId,
    });
    UI.toast(existingId ? 'Ticket updated' : 'Ticket created', 'success');
    UI.closeModal('ticket-modal');
    renderMainContent();
  }

  // ─── Notes Panel ──────────────────────────────────────────────────────────

  function openNotesPanel(ticketId) {
    const ticket = Storage.getTicket(ticketId);
    if (!ticket) return;

    const notes = Storage.getNotes(ticketId);
    let autoSaveTimer;

    UI.showModal({
      id: 'notes-modal',
      title: `Notes — ${ticket.title}`,
      body: `
        <div class="notes-panel">
          <div class="notes-composer">
            <textarea class="form-input form-textarea notes-input" id="note-input" placeholder="Write a note… Supports **bold**, *italic*, \`code\`" rows="4"></textarea>
            <div class="notes-composer-actions">
              <span class="notes-autosave-hint" id="autosave-hint"></span>
              <button class="btn btn-primary btn-sm" id="btn-save-note">Add Note</button>
            </div>
          </div>
          <div class="notes-preview" id="notes-preview"></div>
          <div class="notes-list" id="notes-list">
            ${notes.length ? notes.map(n => renderNote(n)).join('') : '<p class="notes-empty">No notes yet. Add the first one above.</p>'}
          </div>
        </div>
      `,
    });

    const input = document.getElementById('note-input');
    const preview = document.getElementById('notes-preview');

    input?.addEventListener('input', () => {
      UI.autoResize(input);
      preview.innerHTML = input.value ? `<div class="markdown-preview">${UI.renderMarkdown(input.value)}</div>` : '';
      clearTimeout(autoSaveTimer);
      document.getElementById('autosave-hint').textContent = 'Unsaved…';
      autoSaveTimer = setTimeout(() => {
        document.getElementById('autosave-hint').textContent = '';
      }, 1000);
    });

    document.getElementById('btn-save-note')?.addEventListener('click', () => {
      const content = input.value.trim();
      if (!content) return;
      Storage.saveNote({ ticketId, content });
      Storage.logActivity({ type: 'note_added', label: `Note added to "${ticket.title}"`, projectId: currentProjectId });
      input.value = '';
      preview.innerHTML = '';
      const list = document.getElementById('notes-list');
      const newNotes = Storage.getNotes(ticketId);
      list.innerHTML = newNotes.map(n => renderNote(n)).join('');
      UI.toast('Note saved', 'success');
    });

    document.getElementById('notes-list')?.addEventListener('click', e => {
      const btn = e.target.closest('[data-delete-note]');
      if (btn) {
        UI.confirm('Delete this note?', () => {
          Storage.deleteNote(btn.dataset.deleteNote);
          const newNotes = Storage.getNotes(ticketId);
          document.getElementById('notes-list').innerHTML = newNotes.length
            ? newNotes.map(n => renderNote(n)).join('')
            : '<p class="notes-empty">No notes yet.</p>';
        });
      }
    });
  }

  function renderNote(n) {
    return `
      <div class="note-entry">
        <div class="note-header">
          <span class="note-time">${UI.relativeTime(n.createdAt)}</span>
          <button class="btn-icon" data-delete-note="${n.id}">🗑️</button>
        </div>
        <div class="note-body markdown-preview">${UI.renderMarkdown(n.content)}</div>
      </div>
    `;
  }

  // ─── Focus View ───────────────────────────────────────────────────────────

  function renderFocus() {
    const settings = Storage.getSettings();
    const mins = settings.pomodoroWork || 25;
    const reflection = Storage.getTodayReflection();
    const pinned = Storage.getPinned().map(id => Storage.getTicket(id)).filter(Boolean);

    return `
      <div class="view-header">
        <div>
          <h1 class="view-title">Focus</h1>
          <p class="view-subtitle">Deep work & daily reflection</p>
        </div>
      </div>

      <div class="focus-grid">
        <div class="focus-left">
          <div class="pomodoro-card glass">
            <h3 class="section-title">Pomodoro Timer</h3>
            <div class="pomodoro-display" id="pomodoro-display">${formatTime(mins * 60)}</div>
            <div class="pomodoro-type" id="pomodoro-type-label">Work Session</div>
            <div class="pomodoro-controls">
              <button class="btn btn-primary" id="btn-pomo-toggle">Start</button>
              <button class="btn btn-ghost" id="btn-pomo-reset">Reset</button>
            </div>
            <div class="pomo-settings">
              <label>Work <input class="pomo-input" id="pomo-work" type="number" value="${settings.pomodoroWork||25}" min="1" max="90">m</label>
              <label>Break <input class="pomo-input" id="pomo-break" type="number" value="${settings.pomodoroBreak||5}" min="1" max="30">m</label>
            </div>
          </div>

          <div class="glass p-4 mt-4">
            <h3 class="section-title">Today's Reflection</h3>
            <textarea class="form-input form-textarea" id="reflection-input" placeholder="What did you accomplish today? What's blocking you? What are you grateful for?" rows="5">${UI.escapeHtml(reflection?.content || '')}</textarea>
            <button class="btn btn-primary btn-sm mt-2" id="btn-save-reflection">Save Reflection</button>
          </div>
        </div>

        <div class="focus-right">
          <div class="glass p-4">
            <h3 class="section-title">📌 Today's Focus</h3>
            ${pinned.length ? `
              <div class="focus-tickets">
                ${pinned.map(t => renderTicketRow(t)).join('')}
              </div>
            ` : UI.emptyState('📍', 'No pinned tickets', 'Pin tickets from any project to focus on them here')}
          </div>

          <div class="glass p-4 mt-4">
            <h3 class="section-title">Log Focus Session</h3>
            <form id="focus-form" class="form-grid">
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Type</label>
                  <select class="form-input" id="fs-type">
                    <option value="dev">Development</option>
                    <option value="study">Study</option>
                    <option value="planning">Planning</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Duration (minutes)</label>
                  <input class="form-input" id="fs-duration" type="number" min="1" value="25">
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Notes (optional)</label>
                <input class="form-input" id="fs-notes" placeholder="What did you work on?">
              </div>
              <button type="submit" class="btn btn-primary">Log Session</button>
            </form>
          </div>
        </div>
      </div>
    `;
  }

  function bindFocus() {
    // Pomodoro
    pomodoroSeconds = (Storage.getSettings().pomodoroWork || 25) * 60;
    pomodoroType = 'work';

    document.getElementById('btn-pomo-toggle')?.addEventListener('click', togglePomodoro);
    document.getElementById('btn-pomo-reset')?.addEventListener('click', resetPomodoro);

    document.getElementById('pomo-work')?.addEventListener('change', e => {
      Storage.saveSettings({ pomodoroWork: parseInt(e.target.value) || 25 });
      if (!pomodoroRunning) { pomodoroSeconds = (parseInt(e.target.value) || 25) * 60; updatePomodoroDisplay(); }
    });
    document.getElementById('pomo-break')?.addEventListener('change', e => {
      Storage.saveSettings({ pomodoroBreak: parseInt(e.target.value) || 5 });
    });

    // Reflection
    document.getElementById('btn-save-reflection')?.addEventListener('click', () => {
      const content = document.getElementById('reflection-input').value.trim();
      Storage.saveReflection({ content });
      UI.toast('Reflection saved', 'success');
    });

    // Focus session log
    document.getElementById('focus-form')?.addEventListener('submit', e => {
      e.preventDefault();
      const type = document.getElementById('fs-type').value;
      const duration = parseInt(document.getElementById('fs-duration').value) || 0;
      const notes = document.getElementById('fs-notes').value.trim();
      if (!duration) { UI.toast('Enter a duration', 'error'); return; }
      Storage.saveFocusSession({ type, duration, notes, completed: true });
      Storage.logActivity({ type: 'focus_logged', label: `Logged ${duration}m ${type} session` });
      UI.toast('Session logged!', 'success');
      document.getElementById('fs-duration').value = 25;
      document.getElementById('fs-notes').value = '';
    });

    // Pinned ticket actions
    bindTicketRowActions(document.getElementById('main-content'));
  }

  function togglePomodoro() {
    const btn = document.getElementById('btn-pomo-toggle');
    if (pomodoroRunning) {
      clearInterval(pomodoroInterval);
      pomodoroRunning = false;
      btn.textContent = 'Resume';
    } else {
      pomodoroRunning = true;
      btn.textContent = 'Pause';
      pomodoroInterval = setInterval(() => {
        pomodoroSeconds--;
        updatePomodoroDisplay();
        if (pomodoroSeconds <= 0) {
          clearInterval(pomodoroInterval);
          pomodoroRunning = false;
          const settings = Storage.getSettings();
          if (pomodoroType === 'work') {
            Storage.saveFocusSession({ type: 'pomodoro', duration: settings.pomodoroWork, completed: true });
            Storage.logActivity({ type: 'pomodoro_done', label: `Completed ${settings.pomodoroWork}m pomodoro` });
            UI.toast('Work session done! Take a break 🎉', 'success', 5000);
            pomodoroType = 'break';
            pomodoroSeconds = (settings.pomodoroBreak || 5) * 60;
          } else {
            UI.toast('Break over! Back to work 💪', 'info', 5000);
            pomodoroType = 'work';
            pomodoroSeconds = (settings.pomodoroWork || 25) * 60;
          }
          document.getElementById('pomodoro-type-label').textContent = pomodoroType === 'work' ? 'Work Session' : 'Break Time';
          document.getElementById('btn-pomo-toggle').textContent = 'Start';
          updatePomodoroDisplay();
        }
      }, 1000);
    }
  }

  function resetPomodoro() {
    clearInterval(pomodoroInterval);
    pomodoroRunning = false;
    pomodoroType = 'work';
    pomodoroSeconds = (Storage.getSettings().pomodoroWork || 25) * 60;
    const btn = document.getElementById('btn-pomo-toggle');
    if (btn) btn.textContent = 'Start';
    updatePomodoroDisplay();
  }

  function updatePomodoroDisplay() {
    const el = document.getElementById('pomodoro-display');
    if (el) el.textContent = formatTime(pomodoroSeconds);
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  // ─── Activity Timeline ────────────────────────────────────────────────────

  function renderActivity() {
    const activity = Storage.getActivity();
    const icons = {
      project_created: '📁', project_deleted: '🗑️',
      ticket_created: '🎫', ticket_moved: '↕️', ticket_deleted: '🗑️', ticket_updated: '✏️',
      note_added: '📝', focus_logged: '⏱', pomodoro_done: '🍅',
    };

    return `
      <div class="view-header">
        <h1 class="view-title">Activity Timeline</h1>
        <p class="view-subtitle">${activity.length} events recorded</p>
      </div>
      ${activity.length ? `
        <div class="timeline">
          ${activity.map(a => `
            <div class="timeline-entry">
              <div class="timeline-dot">${icons[a.type] || '●'}</div>
              <div class="timeline-content">
                <p class="timeline-label">${UI.escapeHtml(a.label || a.type)}</p>
                <span class="timeline-time">${UI.relativeTime(a.timestamp)}</span>
              </div>
            </div>
          `).join('')}
        </div>
      ` : UI.emptyState('📋', 'No activity yet', 'Start working to see your history here')}
    `;
  }

  // ─── Analytics ────────────────────────────────────────────────────────────

  function renderAnalytics() {
    const stats = Storage.getStats();
    return `
      <div class="view-header">
        <h1 class="view-title">Analytics</h1>
        <p class="view-subtitle">Your productivity at a glance</p>
      </div>

      <div class="stats-grid">
        ${statCard('Total Projects', stats.totalProjects, '📁', '#6366f1')}
        ${statCard('Tickets Done', stats.completedTickets, '✅', '#10b981')}
        ${statCard('Study Hours', stats.studyHours.toFixed(1), '📚', '#f59e0b')}
        ${statCard('Dev Hours', stats.devHours.toFixed(1), '💻', '#3b82f6')}
      </div>

      <div class="analytics-grid">
        <div class="glass p-4">
          <h3 class="section-title">Weekly Productivity</h3>
          <div style="height:220px;position:relative">
            <canvas id="weekly-chart"></canvas>
          </div>
        </div>
        <div class="glass p-4">
          <h3 class="section-title">Project Status</h3>
          ${renderProjectStatusBreakdown()}
        </div>
      </div>

      <div class="glass p-4 mt-4">
        <h3 class="section-title">Activity Heatmap</h3>
        <div id="heatmap-container"></div>
      </div>

      <div class="glass p-4 mt-4">
        <div class="export-row">
          <div>
            <h3 class="section-title">Data Management</h3>
            <p class="text-muted">Export or import your data as JSON</p>
          </div>
          <div class="export-actions">
            <button class="btn btn-ghost" id="btn-export">Export JSON</button>
            <button class="btn btn-ghost" id="btn-import">Import JSON</button>
            <input type="file" id="import-file" accept=".json" style="display:none">
          </div>
        </div>
      </div>
    `;
  }

  function renderProjectStatusBreakdown() {
    const projects = Storage.getProjects();
    if (!projects.length) return UI.emptyState('📊', 'No data yet', '');
    const statusCounts = { active: 0, paused: 0, completed: 0 };
    projects.forEach(p => { statusCounts[p.status] = (statusCounts[p.status] || 0) + 1; });
    const total = projects.length;
    return Object.entries(statusCounts).map(([s, c]) => `
      <div class="breakdown-row">
        <span>${UI.statusBadge(s)}</span>
        <div class="breakdown-bar-track">
          <div class="breakdown-bar-fill" style="width:${total ? (c/total*100) : 0}%"></div>
        </div>
        <span class="breakdown-count">${c}</span>
      </div>
    `).join('');
  }

  function bindAnalytics() {
    setTimeout(() => {
      Charts.renderWeeklyChart('weekly-chart');
      Charts.renderHeatmap('heatmap-container');
    }, 50);

    document.getElementById('btn-export')?.addEventListener('click', () => {
      const data = Storage.exportData();
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tracker-backup-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      UI.toast('Data exported!', 'success');
    });

    document.getElementById('btn-import')?.addEventListener('click', () => {
      document.getElementById('import-file').click();
    });

    document.getElementById('import-file')?.addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        UI.confirm('Import will overwrite existing data. Continue?', () => {
          try {
            Storage.importData(ev.target.result);
            UI.toast('Data imported!', 'success');
            renderMainContent();
          } catch {
            UI.toast('Invalid JSON file', 'error');
          }
        });
      };
      reader.readAsText(file);
    });
  }

  // ─── Ticket Row (used in dashboard/focus) ─────────────────────────────────

  function renderTicketRow(t) {
    const project = Storage.getProject(t.projectId);
    return `
      <div class="ticket-row glass" data-ticket-id="${t.id}">
        <div class="tr-left">
          ${UI.priorityBadge(t.priority)}
          <div class="tr-title">${UI.escapeHtml(t.title)}</div>
          ${project ? `<span class="tr-project">${UI.escapeHtml(project.title)}</span>` : ''}
        </div>
        <div class="tr-right">
          ${UI.statusBadge(t.status)}
          <button class="btn-icon" data-action="open-notes-row" data-id="${t.id}" title="Notes">📝</button>
          <button class="btn-icon" data-action="go-project" data-id="${t.projectId}" title="Open project">→</button>
        </div>
      </div>
    `;
  }

  function bindTicketRowActions(container) {
    container?.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      if (btn.dataset.action === 'open-notes-row') openNotesPanel(btn.dataset.id);
      if (btn.dataset.action === 'go-project') navigate('project', btn.dataset.id);
    });
  }

  function renderActivityEntry(a) {
    const icons = { project_created: '📁', ticket_created: '🎫', ticket_moved: '↕️', note_added: '📝', focus_logged: '⏱', pomodoro_done: '🍅' };
    return `
      <div class="activity-entry">
        <span class="activity-icon">${icons[a.type] || '●'}</span>
        <div class="activity-body">
          <span class="activity-label">${UI.escapeHtml(a.label || a.type)}</span>
          <span class="activity-time">${UI.relativeTime(a.timestamp)}</span>
        </div>
      </div>
    `;
  }

  // ─── Keyboard Shortcuts ───────────────────────────────────────────────────

  function setupKeyboardShortcuts() {
    document.addEventListener('keydown', e => {
      // Skip if typing in an input
      if (e.target.matches('input, textarea, select')) return;

      if (e.key === 'Escape') UI.closeAllModals();
      if (e.key === 'n' && currentView === 'project') openTicketModal();
      if (e.key === 'N' && (currentView === 'projects' || currentView === 'dashboard')) openProjectModal();
      if (e.key === '1') navigate('dashboard');
      if (e.key === '2') navigate('projects');
      if (e.key === '3') navigate('focus');
      if (e.key === '4') navigate('activity');
      if (e.key === '5') navigate('analytics');

      // Command palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        openCommandPalette();
      }
    });
  }

  // ─── Command Palette ──────────────────────────────────────────────────────

  function openCommandPalette() {
    const projects = Storage.getProjects();
    UI.showModal({
      id: 'cmd-modal',
      title: '',
      body: `
        <div class="cmd-palette">
          <input class="cmd-input" id="cmd-input" placeholder="Type a command or search…" autofocus>
          <div class="cmd-results" id="cmd-results"></div>
        </div>
      `,
    });

    const cmds = [
      { label: '📊 Go to Dashboard', action: () => { navigate('dashboard'); UI.closeModal('cmd-modal'); } },
      { label: '📁 Go to Projects', action: () => { navigate('projects'); UI.closeModal('cmd-modal'); } },
      { label: '⏱ Go to Focus', action: () => { navigate('focus'); UI.closeModal('cmd-modal'); } },
      { label: '📋 Go to Activity', action: () => { navigate('activity'); UI.closeModal('cmd-modal'); } },
      { label: '📈 Go to Analytics', action: () => { navigate('analytics'); UI.closeModal('cmd-modal'); } },
      { label: '+ New Project', action: () => { UI.closeModal('cmd-modal'); openProjectModal(); } },
      ...projects.map(p => ({ label: `📁 ${p.title}`, action: () => { navigate('project', p.id); UI.closeModal('cmd-modal'); } })),
    ];

    const input = document.getElementById('cmd-input');
    const results = document.getElementById('cmd-results');

    function renderCmds(query = '') {
      const filtered = cmds.filter(c => c.label.toLowerCase().includes(query.toLowerCase()));
      results.innerHTML = filtered.slice(0, 8).map((c, i) =>
        `<div class="cmd-item ${i===0?'cmd-item-active':''}" data-idx="${i}">${c.label}</div>`
      ).join('') || '<div class="cmd-empty">No results</div>';

      results.querySelectorAll('.cmd-item').forEach((el, i) => {
        el.addEventListener('click', () => filtered[i].action());
        el.addEventListener('mouseenter', () => {
          results.querySelectorAll('.cmd-item').forEach(x => x.classList.remove('cmd-item-active'));
          el.classList.add('cmd-item-active');
        });
      });
    }

    renderCmds();
    input?.addEventListener('input', e => renderCmds(e.target.value));
    input?.addEventListener('keydown', e => {
      const items = results.querySelectorAll('.cmd-item');
      const active = results.querySelector('.cmd-item-active');
      const idx = [...items].indexOf(active);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        items[idx + 1]?.classList.add('cmd-item-active');
        active?.classList.remove('cmd-item-active');
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        items[idx - 1]?.classList.add('cmd-item-active');
        active?.classList.remove('cmd-item-active');
      }
      if (e.key === 'Enter') {
        active?.click();
      }
    });
    setTimeout(() => input?.focus(), 50);
  }

  // ─── Demo Data ────────────────────────────────────────────────────────────

  function seedDemoData() {
    if (Storage.getProjects().length > 0) return; // already seeded

    const p1 = { id: Storage.generateId(), title: 'SaaS MVP', type: 'startup', status: 'active', description: 'Building the core product with auth, billing, and dashboard.', startDate: '2026-01-15', tags: ['react', 'node', 'mvp'] };
    const p2 = { id: Storage.generateId(), title: 'System Design Mastery', type: 'study', status: 'active', description: 'Working through Designing Data-Intensive Applications and Grokking System Design.', startDate: '2026-02-01', tags: ['architecture', 'distributed'] };
    const p3 = { id: Storage.generateId(), title: 'Personal Portfolio', type: 'personal', status: 'paused', description: 'Redesigning my portfolio site with case studies.', startDate: '2026-03-01', tags: ['design', 'nextjs'] };

    Storage.saveProject(p1);
    Storage.saveProject(p2);
    Storage.saveProject(p3);

    const tickets = [
      { projectId: p1.id, title: 'Set up auth with JWT', priority: 'high', status: 'done', labels: ['backend'] },
      { projectId: p1.id, title: 'Design landing page', priority: 'medium', status: 'done', labels: ['frontend', 'design'] },
      { projectId: p1.id, title: 'Integrate Stripe billing', priority: 'high', status: 'in-progress', labels: ['backend', 'payments'] },
      { projectId: p1.id, title: 'Build dashboard UI', priority: 'medium', status: 'in-progress', labels: ['frontend'] },
      { projectId: p1.id, title: 'Write API docs', priority: 'low', status: 'todo', labels: ['docs'] },
      { projectId: p1.id, title: 'Set up CI/CD pipeline', priority: 'medium', status: 'todo', labels: ['devops'] },
      { projectId: p2.id, title: 'Read DDIA chapters 1-3', priority: 'high', status: 'done', labels: ['reading'] },
      { projectId: p2.id, title: 'Design a URL shortener', priority: 'medium', status: 'done', labels: ['practice'] },
      { projectId: p2.id, title: 'Design Twitter feed system', priority: 'high', status: 'in-progress', labels: ['practice'] },
      { projectId: p2.id, title: 'Study consistent hashing', priority: 'medium', status: 'todo', labels: ['concepts'] },
      { projectId: p3.id, title: 'Write case study: E-commerce app', priority: 'low', status: 'todo', labels: ['writing'] },
    ];

    tickets.forEach(t => {
      const id = Storage.generateId();
      Storage.saveTicket({ ...t, id, completedAt: t.status === 'done' ? Date.now() - Math.random() * 7 * 86400000 : null });
    });

    // Seed activity entries with staggered timestamps
    const activityEntries = [
      { label: 'Demo data loaded 🎉', type: 'project_created' },
      { label: 'Created project: SaaS MVP', type: 'project_created' },
      { label: 'Set up auth with JWT ✅', type: 'ticket_created' },
      { label: 'Designed landing page ✅', type: 'ticket_created' },
      { label: 'Started: Integrate Stripe billing', type: 'ticket_moved' },
      { label: 'Created project: System Design Mastery', type: 'project_created' },
      { label: 'Read DDIA chapters 1-3 ✅', type: 'ticket_created' },
    ];
    // Directly insert into localStorage to allow custom timestamps
    const existing = JSON.parse(localStorage.getItem('tracker_activity') || '[]');
    const seeded = activityEntries.map((e, i) => ({
      ...e,
      id: Storage.generateId(),
      timestamp: Date.now() - i * 3600000 * 4,
    }));
    localStorage.setItem('tracker_activity', JSON.stringify([...seeded, ...existing].slice(0, 500)));
  }

  // ─── Sidebar Toggle (mobile) ──────────────────────────────────────────────

  function setupSidebar() {
    document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
      const sidebar = document.getElementById('sidebar');
      const overlay = document.getElementById('sidebar-overlay');
      sidebar.classList.toggle('sidebar-open');
      overlay.classList.toggle('overlay-show');
    });
    document.getElementById('sidebar-overlay')?.addEventListener('click', () => {
      document.getElementById('sidebar').classList.remove('sidebar-open');
      document.getElementById('sidebar-overlay').classList.remove('overlay-show');
    });
  }

  // ─── Init ─────────────────────────────────────────────────────────────────

  function init() {
    seedDemoData();
    setupKeyboardShortcuts();
    setupSidebar();

    // Wire sidebar nav items
    document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        navigate(btn.dataset.view);
        // Close mobile sidebar after navigation
        document.getElementById('sidebar').classList.remove('sidebar-open');
        document.getElementById('sidebar-overlay').classList.remove('overlay-show');
      });
    });

    navigate('dashboard');

    // Close modals on backdrop click (global)
    document.addEventListener('click', e => {
      if (e.target.matches('.modal-backdrop')) UI.closeAllModals();
    });
  }

  // Expose navigate for inline onclick
  window.App = { navigate };

  return { init, navigate };
})();

document.addEventListener('DOMContentLoaded', () => App.init());
