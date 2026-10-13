/** Prompt-template listing, render and mutation sub-client. */
import { apiRoutes } from '../generated/api-routes';
import * as s from '../schemas';
import type { Transport } from './transport';

export function templatesClient(t: Transport) {
  const { req } = t;
  return {
    listTemplates: (signal?: AbortSignal) =>
      req(apiRoutes.get_api_templates.path, s.templateNames, { signal }),
    getTemplate: (templateId: string) =>
      req(apiRoutes.post_api_template.path, s.templateDetail, {
        method: 'POST',
        body: { template_id: templateId },
      }),
    uploadTemplate: (path: string, content: string) =>
      req(apiRoutes.post_api_upload_template.path, s.templateUploaded, {
        method: 'POST',
        body: { path, content },
      }),
    deleteTemplate: (path: string) =>
      req(apiRoutes.post_api_delete_template.path, s.templateDeleted, {
        method: 'POST',
        body: { path },
      }),
    // Delete every stored template under a directory prefix. Unlike the idempotent
    // single delete, the server 404s a prefix matching nothing and 400s the template
    // root; those surface as loud errors, never a faked success.
    deleteTemplateDir: (path: string) =>
      req(apiRoutes.post_api_delete_template_dir.path, s.templateDirDeleted, {
        method: 'POST',
        body: { path },
      }),
    // Render one authored text — inline `content` OR a stored template `id`, plus its
    // render `kwargs` — and parse the rendered output. The value is the shared
    // `TemplatedText` (exactly one source); the route wraps it under `text`.
    renderTemplate: (text: s.TemplatedText) =>
      req(apiRoutes.post_api_render_template.path, s.templateRendered, {
        method: 'POST',
        body: { text },
      }),
    clearTemplatesCache: () =>
      req(apiRoutes.post_api_clear_templates_cache.path, s.templateCacheCleared, {
        method: 'POST',
      }),
  };
}
