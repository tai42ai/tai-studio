/** Prompt-template listing, render and mutation sub-client. */
import * as s from '../schemas';
import type { Transport } from './transport';

export function templatesClient(t: Transport) {
  const { req } = t;
  return {
    listTemplates: (signal?: AbortSignal) => req('/api/templates', s.templateNames, { signal }),
    getTemplate: (templateId: string) =>
      req('/api/template', s.templateDetail, { method: 'POST', body: { template_id: templateId } }),
    uploadTemplate: (path: string, content: string) =>
      req('/api/upload-template', s.templateUploaded, { method: 'POST', body: { path, content } }),
    deleteTemplate: (path: string) =>
      req('/api/delete-template', s.templateDeleted, { method: 'POST', body: { path } }),
    // Delete every stored template under a directory prefix. Unlike the idempotent
    // single delete, the server 404s a prefix matching nothing and 400s the template
    // root; those surface as loud errors, never a faked success.
    deleteTemplateDir: (path: string) =>
      req('/api/delete-template-dir', s.templateDirDeleted, { method: 'POST', body: { path } }),
    // Render one authored text — inline `content` OR a stored template `id`, plus its
    // render `kwargs` — and parse the rendered output. The value is the shared
    // `TemplatedText` (exactly one source); the route wraps it under `text`.
    renderTemplate: (text: s.TemplatedText) =>
      req('/api/render-template', s.templateRendered, { method: 'POST', body: { text } }),
    clearTemplatesCache: () =>
      req('/api/clear-templates-cache', s.templateCacheCleared, { method: 'POST' }),
  };
}
