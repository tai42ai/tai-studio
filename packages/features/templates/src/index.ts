/**
 * @tai42/feature-templates — the templates surface. Exposes one shell page:
 * a master list of templates with an escaped-content detail view, plus upload,
 * delete, render-preview, and clear-cache actions. Imports only @tai42/studio-sdk,
 * @tai42/api-client (via the SDK's typed client), and TanStack Query.
 */
export { TemplatesPage } from './TemplatesPage';
