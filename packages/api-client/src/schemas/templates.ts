/** Prompt-template listing, render and mutation ack schemas. */
import * as openapi from '../generated/openapi-schemas';

export const templateNames = openapi.stringListResponse;
export const templateDetail = openapi.templateFetchView;
export const templateUploaded = openapi.templateUploadResult;
export const templateDeleted = openapi.templateDeleteResult;
export const templateDirDeleted = openapi.templateDeleteResult;
export const templateRendered = openapi.renderedTemplate;
export const templateCacheCleared = openapi.cacheClearResult;
