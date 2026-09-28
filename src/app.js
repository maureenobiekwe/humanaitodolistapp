import { localDate, selectTasks } from './tasks.js';
import { loadTasks, removeTask, saveTask } from './storage.js';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

const $ = selector => document.querySelector(selector);
const savedPreferences = JSON.parse(localStorage.getItem('daymark-preferences') || '{}');
const state = { tasks: [], view: 'all', project: '', priority: '', query: '', layout: savedPreferences.layout || 'list', theme: savedPreferences.theme || 'meadow', soundEnabled: savedPreferences.soundEnabled !== false, editingId: null, draftSubtasks: [] };
const viewNames = { all: 'All tasks', today: 'Today', upcoming: 'Upcoming', completed: 'Completed' };
let today = localDate();

function statusFor(task) { return task.status || (task.completed ? 'done' : 'todo'); }

function normalizeTask(task) {
  return { ...task, description: task.description || '', reaction: task.reaction || '', status: statusFor(task), subtasks: Array.isArray(task.subtasks) ? task.subtasks : [] };
}

function savePreferences() {
  localStorage.setItem('daymark-preferences', JSON.stringify({ layout: state.layout, theme: state.theme, soundEnabled: state.soundEnabled }));
}

function applyPreferences() {
  document.documentElement.dataset.theme = state.theme;
  $('#theme-select').value = state.theme;
  $('#sound-toggle').textContent = state.soundEnabled ? '♫' : '♩';
  $('#sound-toggle').setAttribute('aria-pressed', String(state.soundEnabled));
  $('#sound-toggle').setAttribute('aria-label', state.soundEnabled ? 'Turn completion sound off' : 'Turn completion sound on');
  document.querySelectorAll('[data-layout]').forEach(button => button.classList.toggle('is-active', button.dataset.layout === state.layout));
}

function playNotificationSound() {
  if (!state.soundEnabled) return;
  const audio = new AudioContext();
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.frequency.value = 660;
  oscillator.type = 'sine';
  gain.gain.setValueAtTime(0.0001, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.08, audio.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.18);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start();
  oscillator.stop(audio.currentTime + 0.2);
  oscillator.addEventListener('ended', () => audio.close(), { once: true });
}

applyPreferences();

$('#today-label').textContent = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date());

function showError(message) {
  const banner = $('#error-banner');
  banner.textContent = message;
  banner.hidden = false;
  if ($('#task-dialog').open) {
    $('#dialog-error').textContent = message;
    $('#dialog-error').hidden = false;
  }
}

function clearError() { $('#error-banner').hidden = true; $('#dialog-error').hidden = true; }

function dateLabel(value) {
  if (!value) return 'No due date';
  if (value < today) return `Overdue · ${formattedDate(value)}`;
  if (value === today) return 'Due today';
  return `Due ${formattedDate(value)}`;
}

function formattedDate(value) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(`${value}T12:00:00`));
}

function renderProjects() {
  const projects = [...new Set(state.tasks.map(task => task.project).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  if (state.project && !projects.includes(state.project)) state.project = '';
  $('#project-total').textContent = String(projects.length).padStart(2, '0');
  $('#project-nav').replaceChildren(...projects.map(project => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `project-item${state.project === project ? ' is-active' : ''}`;
    button.dataset.project = project;
    const dot = document.createElement('span');
    dot.className = 'project-dot';
    const name = document.createElement('span');
    name.textContent = project;
    const count = document.createElement('span');
    count.className = 'project-count';
    count.textContent = state.tasks.filter(task => task.project === project && !task.completed).length;
    button.append(dot, name, count);
    return button;
  }));
  const filter = $('#project-filter');
  filter.replaceChildren(new Option('All projects', ''), ...projects.map(project => new Option(project, project)));
  filter.value = state.project;
  $('#project-options').replaceChildren(...projects.map(project => new Option(project)));
}

function renderTask(task) {
  const card = $('#task-template').content.firstElementChild.cloneNode(true);
  card.dataset.id = task.id;
  card.classList.toggle('is-completed', task.completed);
  card.querySelector('.task-check').setAttribute('aria-label', task.completed ? `Reopen ${task.title}` : `Complete ${task.title}`);
  const project = card.querySelector('.project-tag');
  project.textContent = task.project || 'INBOX';
  card.querySelector('.priority-tag').textContent = `${task.priority} priority`;
  card.querySelector('.priority-tag').classList.add(`priority-${task.priority}`);
  card.querySelector('.task-title').textContent = task.title;
  const description = card.querySelector('.task-description');
  description.textContent = task.description;
  description.hidden = !task.description;
  card.querySelector('.reaction-row').querySelectorAll('[data-reaction]').forEach(button => button.classList.toggle('is-selected', button.dataset.reaction === task.reaction));
  const due = card.querySelector('.due-label');
  due.textContent = dateLabel(task.dueDate);
  if (task.dueDate && task.dueDate < today && !task.completed) due.classList.add('is-overdue');
  const done = task.subtasks.filter(step => step.completed).length;
  const steps = card.querySelector('.step-label');
  steps.textContent = task.subtasks.length ? `${done}/${task.subtasks.length} steps` : '';
  steps.hidden = !task.subtasks.length;
  const list = card.querySelector('.card-subtasks');
  list.replaceChildren(...task.subtasks.map(step => {
    const label = document.createElement('label');
    label.className = 'card-step';
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = step.completed;
    check.dataset.action = 'subtask';
    check.dataset.stepId = step.id;
    const title = document.createElement('span');
    title.textContent = step.title;
    label.append(check, title);
    return label;
  }));
  card.querySelector('.edit-button').setAttribute('aria-label', `Edit ${task.title}`);
  card.querySelector('.delete-button').setAttribute('aria-label', `Delete ${task.title}`);
  card.dataset.status = statusFor(task);
  return card;
}

function render() {
  today = localDate();
  renderProjects();
  const counts = Object.fromEntries(Object.keys(viewNames).map(view => [view, selectTasks(state.tasks, { view, today }).length]));
  document.querySelectorAll('[data-count]').forEach(element => { element.textContent = counts[element.dataset.count]; });
  document.querySelectorAll('[data-view]').forEach(button => button.classList.toggle('is-active', button.dataset.view === state.view));
  const visibleTasks = selectTasks(state.tasks, { view: state.view, project: state.project, priority: state.priority, query: state.query, today });
  const completedVisible = state.layout === 'board' && state.view === 'all' ? selectTasks(state.tasks, { view: 'completed', project: state.project, priority: state.priority, query: state.query, today }) : [];
  const visible = [...visibleTasks, ...completedVisible];
  $('#list-title').firstChild.textContent = `${viewNames[state.view]} `;
  $('#visible-count').textContent = String(visibleTasks.length).padStart(2, '0');
  $('#task-list').replaceChildren(...visible.map(renderTask));
  $('#task-list').hidden = state.layout !== 'list';
  $('#task-board').hidden = state.layout !== 'board';
  document.querySelectorAll('.board-column-list').forEach(list => list.replaceChildren());
  document.querySelectorAll('[data-column-count]').forEach(count => { count.textContent = visible.filter(task => statusFor(task) === count.dataset.columnCount).length; });
  visible.forEach(task => { const column = document.querySelector(`[data-status="${statusFor(task)}"] .board-column-list`); if (column) column.append(renderTask(task)); });
  const empty = $('#empty-state');
  empty.hidden = visibleTasks.length > 0;
  const isFiltered = state.query || state.project || state.priority;
  $('#empty-title').textContent = isFiltered ? 'Nothing in this corner.' : state.view === 'completed' ? 'Nothing finished yet.' : state.view === 'today' ? 'Today is wide open.' : state.view === 'upcoming' ? 'Nothing on the horizon.' : 'A clean slate.';
  $('#empty-copy').textContent = isFiltered ? 'Try another search or adjust your filters.' : state.view === 'completed' ? 'Completed tasks will find a home here.' : state.view === 'all' ? 'Add a task and give your day a little direction.' : 'Add a task whenever something comes to mind.';
  $('#empty-add').hidden = Boolean(isFiltered) || state.view === 'completed';
  const completed = state.tasks.filter(task => task.completed).length;
  const total = state.tasks.length;
  const percent = total ? Math.round(completed / total * 100) : 0;
  $('#progress-percent').textContent = `${percent}%`;
  $('#progress-bar').style.width = `${percent}%`;
  $('#progress-copy').textContent = total ? `${completed} of ${total} tasks complete. Keep going.` : 'A fresh start looks good on you.';
}

function renderDraftSubtasks() {
  $('#subtask-count').textContent = `${state.draftSubtasks.length} added`;
  $('#draft-subtasks').replaceChildren(...state.draftSubtasks.map(step => {
    const row = document.createElement('div');
    row.className = 'draft-step';
    const label = document.createElement('label');
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = step.completed;
    check.dataset.stepId = step.id;
    const title = document.createElement('span');
    title.textContent = step.title;
    label.append(check, title);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.dataset.removeStep = step.id;
    remove.setAttribute('aria-label', `Remove ${step.title}`);
    remove.textContent = '×';
    row.append(label, remove);
    return row;
  }));
}

function openDialog(task = null) {
  clearError();
  state.editingId = task?.id || null;
  state.draftSubtasks = task?.subtasks.map(step => ({ ...step })) || [];
  $('#task-form').reset();
  $('#dialog-title').textContent = task ? 'Edit this task' : 'A new task';
  $('#save-task').firstChild.textContent = task ? 'Save changes ' : 'Create task ';
  $('#task-title').value = task?.title || '';
  $('#task-project').value = task?.project || '';
  $('#task-date').value = task?.dueDate || '';
  $('#task-priority').value = task?.priority || 'medium';
  $('#task-description').value = task?.description || '';
  $('#task-status').value = statusFor(task || { completed: false });
  $('#subtask-input').value = '';
  renderDraftSubtasks();
  $('#task-dialog').showModal();
  $('#task-title').focus();
}

function addDraftSubtask() {
  const input = $('#subtask-input');
  const title = input.value.trim();
  if (!title) return;
  state.draftSubtasks.push({ id: crypto.randomUUID(), title, completed: false });
  input.value = '';
  renderDraftSubtasks();
  input.focus();
}

async function persist(task, previous = null) {
  try {
    await saveTask(task);
    if (previous) state.tasks.splice(state.tasks.findIndex(item => item.id === previous.id), 1, task);
    else state.tasks.push(task);
    clearError();
    render();
    return true;
  } catch {
    showError('Your change could not be saved. Check browser storage and try again.');
    return false;
  }
}

$('.view-nav').addEventListener('click', event => {
  const button = event.target.closest('[data-view]');
  if (!button) return;
  state.view = button.dataset.view;
  render();
});
$('#project-nav').addEventListener('click', event => {
  const button = event.target.closest('[data-project]');
  if (!button) return;
  state.project = state.project === button.dataset.project ? '' : button.dataset.project;
  render();
});
$('#project-filter').addEventListener('change', event => { state.project = event.target.value; render(); });
$('#priority-filter').addEventListener('change', event => { state.priority = event.target.value; render(); });
$('#search').addEventListener('input', event => { state.query = event.target.value; render(); });
$('#new-task').addEventListener('click', () => openDialog());
$('#empty-add').addEventListener('click', () => openDialog());
$('#close-dialog').addEventListener('click', () => $('#task-dialog').close());
$('#cancel-dialog').addEventListener('click', () => $('#task-dialog').close());
$('#add-subtask').addEventListener('click', addDraftSubtask);
$('#subtask-input').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); addDraftSubtask(); } });
$('#draft-subtasks').addEventListener('click', event => {
  const button = event.target.closest('[data-remove-step]');
  if (!button) return;
  state.draftSubtasks = state.draftSubtasks.filter(step => step.id !== button.dataset.removeStep);
  renderDraftSubtasks();
});
$('#draft-subtasks').addEventListener('change', event => {
  const step = state.draftSubtasks.find(item => item.id === event.target.dataset.stepId);
  if (step) step.completed = event.target.checked;
});
$('#task-form').addEventListener('submit', async event => {
  event.preventDefault();
  const title = $('#task-title').value.trim();
  if (!title) { $('#task-title').setCustomValidity('Please name this task.'); $('#task-title').reportValidity(); return; }
  $('#task-title').setCustomValidity('');
  if ($('#subtask-input').value.trim()) addDraftSubtask();
  const previous = state.tasks.find(task => task.id === state.editingId);
  const now = Date.now();
  const status = $('#task-status').value;
  const task = { id: previous?.id || crypto.randomUUID(), title, description: $('#task-description').value.trim(), project: $('#task-project').value.trim(), dueDate: $('#task-date').value, priority: $('#task-priority').value, status, reaction: previous?.reaction || '', subtasks: state.draftSubtasks.map(step => ({ ...step })), completed: status === 'done', createdAt: previous?.createdAt || now, updatedAt: now };
  $('#save-task').disabled = true;
  const saved = await persist(task, previous);
  $('#save-task').disabled = false;
  if (saved) $('#task-dialog').close();
});
$('#task-title').addEventListener('input', () => $('#task-title').setCustomValidity(''));
$('.task-section').addEventListener('click', async event => {
  const button = event.target.closest('[data-action]');
  if (!button || button.dataset.action === 'subtask') return;
  const task = state.tasks.find(item => item.id === button.closest('[data-id]').dataset.id);
  if (!task) return;
  if (button.dataset.action === 'edit') return openDialog(task);
  if (button.dataset.action === 'react') {
    const reaction = task.reaction === button.dataset.reaction ? '' : button.dataset.reaction;
    return persist({ ...task, reaction, updatedAt: Date.now() }, task);
  }
  if (button.dataset.action === 'toggle') {
    const completed = !task.completed;
    if (completed) playNotificationSound();
    return persist({ ...task, completed, status: completed ? 'done' : 'todo', updatedAt: Date.now() }, task);
  }
  if (button.dataset.action === 'delete' && confirm(`Delete “${task.title}”?`)) {
    try {
      await removeTask(task.id);
      state.tasks = state.tasks.filter(item => item.id !== task.id);
      clearError();
      render();
    } catch { showError('This task could not be deleted. Please try again.'); }
  }
});
$('.task-section').addEventListener('change', async event => {
  if (event.target.dataset.action !== 'subtask') return;
  const task = state.tasks.find(item => item.id === event.target.closest('[data-id]').dataset.id);
  if (!task) return;
  const subtasks = task.subtasks.map(step => step.id === event.target.dataset.stepId ? { ...step, completed: event.target.checked } : step);
  if (!await persist({ ...task, subtasks, updatedAt: Date.now() }, task)) event.target.checked = !event.target.checked;
});

$('.task-section').addEventListener('dragstart', event => {
  const card = event.target.closest('.task-card');
  if (card) event.dataTransfer.setData('text/plain', card.dataset.id);
});
$('#task-board').addEventListener('dragover', event => event.preventDefault());
$('#task-board').addEventListener('drop', async event => {
  event.preventDefault();
  const column = event.target.closest('.board-column');
  const id = event.dataTransfer.getData('text/plain');
  const task = state.tasks.find(item => item.id === id);
  if (!column || !task || statusFor(task) === column.dataset.status) return;
  const status = column.dataset.status;
  if (status === 'done') playNotificationSound();
  await persist({ ...task, status, completed: status === 'done', updatedAt: Date.now() }, task);
});

$('#theme-select').addEventListener('change', event => { state.theme = event.target.value; savePreferences(); applyPreferences(); });
$('#sound-toggle').addEventListener('click', () => { state.soundEnabled = !state.soundEnabled; savePreferences(); applyPreferences(); });
document.querySelectorAll('[data-layout]').forEach(button => button.addEventListener('click', () => { state.layout = button.dataset.layout; savePreferences(); applyPreferences(); render(); }));

try {
  state.tasks = (await loadTasks()).map(normalizeTask);
  render();
} catch {
  showError('Browser storage is unavailable. Your tasks cannot be loaded or saved here.');
  render();
}
