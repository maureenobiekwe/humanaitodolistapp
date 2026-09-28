import test from 'node:test';
import assert from 'node:assert/strict';
import { localDate, selectTasks } from '../src/tasks.js';

test('task views, filters, and ordering', () => {
  const today = '2026-09-28';
  const task = (id, dueDate, priority, extra = {}) => ({ id, title: id, dueDate, priority, project: 'Home', completed: false, createdAt: 1, updatedAt: 1, ...extra });
  const tasks = [
    task('later', '2026-10-01', 'low'),
    task('high', today, 'high'),
    task('low', today, 'low'),
    task('overdue', '2026-09-27', 'medium'),
    task('no date', '', 'high'),
    task('done', today, 'high', { completed: true, updatedAt: 2 }),
  ];
  assert.deepEqual(selectTasks(tasks, { today }).map(task => task.id), ['overdue', 'high', 'low', 'later', 'no date']);
  assert.deepEqual(selectTasks(tasks, { view: 'today', today }).map(task => task.id), ['overdue', 'high', 'low']);
  assert.deepEqual(selectTasks(tasks, { view: 'upcoming', today }).map(task => task.id), ['later']);
  assert.deepEqual(selectTasks(tasks, { view: 'completed', today }).map(task => task.id), ['done']);
  assert.deepEqual(selectTasks(tasks, { query: 'HIGH', project: 'Home', priority: 'high', today }).map(task => task.id), ['high']);
  assert.equal(localDate(new Date(2026, 8, 28, 23, 59)), today);
});
