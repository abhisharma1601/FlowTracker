/**
 * ui.js — Reusable UI components: toasts, modals, confirms, DOM helpers
 */

const UI = (() => {

  // --- Toast Notifications ---

  let toastQueue = [];

  function toast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;

    const icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
    el.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ'}</span><span class="toast-msg">${escapeHtml(message)}</span>`;

    container.appendChild(el);
    requestAnimationFrame(() => el.classList.add('toast-show'));

    setTimeout(() => {
      el.classList.remove('toast-show');
      el.classList.add('toast-hide');
      setTimeout(() => el.remove(), 300);
    }, duration);
  }

  // --- Modal System ---

  function openModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.add('modal-open');
    modal.querySelector('.modal-box')?.classList.add('modal-box-show');
    document.body.style.overflow = 'hidden';
  }

  function closeModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    const box = modal.querySelector('.modal-box');
    box?.classList.remove('modal-box-show');
    setTimeout(() => {
      modal.classList.remove('modal-open');
      document.body.style.overflow = '';
    }, 200);
  }

  function closeAllModals() {
    document.querySelectorAll('.modal.modal-open').forEach(m => closeModal(m.id));
  }

  // Generic dynamic modal builder
  function showModal({ title, body, actions = [], id = 'dynamic-modal' }) {
    let modal = document.getElementById(id);
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = id;
    modal.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-box">
        <div class="modal-header">
          <h3 class="modal-title">${escapeHtml(title)}</h3>
          <button class="modal-close btn-icon" data-close="${id}">✕</button>
        </div>
        <div class="modal-body">${body}</div>
        ${actions.length ? `<div class="modal-footer">${actions.map(a =>
          `<button class="btn ${a.class || 'btn-primary'}" id="${a.id || ''}">${escapeHtml(a.label)}</button>`
        ).join('')}</div>` : ''}
      </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('.modal-backdrop').addEventListener('click', () => closeModal(id));
    modal.querySelector('[data-close]').addEventListener('click', () => closeModal(id));

    actions.forEach(a => {
      if (a.id && a.onClick) {
        modal.querySelector(`#${a.id}`)?.addEventListener('click', a.onClick);
      }
    });

    openModal(id);
    return modal;
  }

  // Confirmation dialog
  function confirm(message, onConfirm, onCancel) {
    showModal({
      id: 'confirm-modal',
      title: 'Confirm Action',
      body: `<p class="confirm-message">${escapeHtml(message)}</p>`,
      actions: [
        { label: 'Cancel', class: 'btn btn-ghost', id: 'confirm-cancel', onClick: () => { closeModal('confirm-modal'); onCancel?.(); } },
        { label: 'Confirm', class: 'btn btn-danger', id: 'confirm-ok', onClick: () => { closeModal('confirm-modal'); onConfirm?.(); } },
      ],
    });
  }

  // --- Empty State ---

  function emptyState(icon, title, subtitle = '', action = null) {
    return `
      <div class="empty-state">
        <div class="empty-icon">${icon}</div>
        <h3 class="empty-title">${escapeHtml(title)}</h3>
        ${subtitle ? `<p class="empty-subtitle">${escapeHtml(subtitle)}</p>` : ''}
        ${action ? `<button class="btn btn-primary mt-2" id="${action.id}">${escapeHtml(action.label)}</button>` : ''}
      </div>
    `;
  }

  // --- Progress Bar ---

  function progressBar(percent, color = 'var(--accent)') {
    const safe = Math.min(100, Math.max(0, percent));
    return `
      <div class="progress-track">
        <div class="progress-fill" style="width:${safe}%;background:${color}"></div>
      </div>
    `;
  }

  // --- Priority Badge ---

  function priorityBadge(priority) {
    const map = { low: 'badge-low', medium: 'badge-med', high: 'badge-high' };
    const labels = { low: 'Low', medium: 'Med', high: 'High' };
    return `<span class="badge ${map[priority] || 'badge-low'}">${labels[priority] || priority}</span>`;
  }

  // --- Status Badge ---

  function statusBadge(status) {
    const map = {
      todo: 'badge-todo', 'in-progress': 'badge-inprog', done: 'badge-done',
      active: 'badge-active', paused: 'badge-paused', completed: 'badge-done',
    };
    const labels = {
      todo: 'Todo', 'in-progress': 'In Progress', done: 'Done',
      active: 'Active', paused: 'Paused', completed: 'Completed',
    };
    return `<span class="badge ${map[status] || ''}">${labels[status] || status}</span>`;
  }

  // --- Tag Chips ---

  function tagChips(tags = []) {
    if (!tags.length) return '';
    return tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('');
  }

  // --- Relative time ---

  function relativeTime(ts) {
    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}d ago`;
    return new Date(ts).toLocaleDateString();
  }

  function formatDate(ts) {
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // --- Escape HTML ---

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // --- Simple Markdown preview ---

  function renderMarkdown(text) {
    if (!text) return '';
    return escapeHtml(text)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>');
  }

  // --- Keyboard shortcut hint ---

  function kbdHint(keys) {
    return keys.map(k => `<kbd>${escapeHtml(k)}</kbd>`).join(' + ');
  }

  // --- Sidebar active state ---

  function setActiveSidebarItem(view) {
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    document.querySelector(`.nav-item[data-view="${view}"]`)?.classList.add('active');
  }

  // --- Skeleton loader ---

  function skeleton(lines = 3) {
    return Array.from({ length: lines }, (_, i) =>
      `<div class="skeleton" style="width:${70 + (i % 3) * 10}%;height:14px;margin-bottom:8px"></div>`
    ).join('');
  }

  // --- Color for project type ---

  function typeColor(type) {
    const map = { startup: '#f59e0b', study: '#6366f1', personal: '#10b981' };
    return map[type] || '#6366f1';
  }

  // --- Debounce ---

  function debounce(fn, delay = 300) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
  }

  // --- Auto-resize textarea ---

  function autoResize(el) {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }

  return {
    toast, openModal, closeModal, closeAllModals, showModal, confirm,
    emptyState, progressBar, priorityBadge, statusBadge, tagChips,
    relativeTime, formatDate, escapeHtml, renderMarkdown, kbdHint,
    setActiveSidebarItem, skeleton, typeColor, debounce, autoResize,
  };
})();
