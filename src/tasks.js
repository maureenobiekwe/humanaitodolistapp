export function localDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function selectTasks(tasks, { view = 'all', project = '', priority = '', query = '', today = localDate() } = {}) {
  const search = query.trim().toLocaleLowerCase();
  return tasks.filter(task => {
    if (view === 'completed' ? !task.completed : task.completed) return false;
    if (view === 'today' && (!task.dueDate || task.dueDate > today)) return false;
    if (view === 'upcoming' && (!task.dueDate || task.dueDate <= today)) return false;
    if (project && task.project !== project) return false;
    if (priority && task.priority !== priority) return false;
    return !search || task.title.toLocaleLowerCase().includes(search);
  }).sort((a, b) => {
    if (view === 'completed') return b.updatedAt - a.updatedAt;
    const due = (a.dueDate || '9999-12-31').localeCompare(b.dueDate || '9999-12-31');
    return due || ({ high: 0, medium: 1, low: 2 }[a.priority] - { high: 0, medium: 1, low: 2 }[b.priority]) || a.createdAt - b.createdAt;
  });
}
