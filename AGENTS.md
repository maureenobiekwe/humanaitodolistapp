# Daymark Project Guide

## Project

Daymark is a small browser-based task manager built with plain HTML, CSS, and modern JavaScript modules. It stores tasks locally in the browser with IndexedDB.

## Important files

- `index.html`: page structure, dialog form, and task-card template.
- `styles.css`: all visual styling and responsive layout.
- `src/app.js`: UI state, event handlers, rendering, and task persistence calls.
- `src/tasks.js`: date helpers, filtering, and task sorting logic.
- `src/storage.js`: IndexedDB load, save, and delete operations.
- `tests/tasks.test.mjs`: automated tests for task filtering and ordering.
- `manifest.webmanifest`: install metadata for the Progressive Web App.
- `sw.js`: offline app-shell caching and service-worker lifecycle.
- `icon.svg`: install icon used by the web manifest.

## Development rules

- Keep the app dependency-free unless a new dependency is clearly necessary.
- Preserve the existing visual language and responsive behavior.
- Keep task selection and sorting logic in `src/tasks.js`; do not duplicate it in the UI.
- Keep browser persistence logic in `src/storage.js`.
- Use `textContent` for user-provided task text. Do not add unsafe HTML interpolation.
- Preserve accessible labels, keyboard behavior, and semantic HTML when changing controls.
- Make focused changes and avoid unrelated rewrites.
- Keep the service worker cache name versioned when changing cached app files.
- Preserve backward compatibility when adding fields to saved task records; older tasks may not have the new field.
- Keep layout preferences in local storage and task data in IndexedDB.

## Testing

Run the test suite with:

```text
node --test tests/tasks.test.mjs
```

When changing UI code, also open `index.html` in a browser and check creating, editing, completing, filtering, and deleting a task.

When changing the service worker or manifest, serve the project over HTTP rather than opening `index.html` directly. Check the browser's Application panel for an active service worker and test once with the network disabled.

## Deployment

This is a static site. There is no build step. Vercel can deploy the project from the repository root.
