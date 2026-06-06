// The context store: one shared, live map of resolved campaign contexts.
//
// CONTEXTS is what every route handler serves. Its entries start as the
// code-defined contexts (campaignData/) and are REPLACED whenever a DB
// content overlay applies — at startup (index.ts → applyCampaignOverlays)
// and after a content edit (routes/campaigns.ts → refreshCampaignOverlay).
//
// CODE_CONTEXTS is the pristine code-only snapshot taken before any
// overlay. Re-merging after an edit must always start from code, not from
// an already-merged object — otherwise deleting a DB section couldn't
// restore the code version.

import type { Context } from '../types.js';
import { loadContexts } from './contextLoader.js';

export const CONTEXTS: Record<string, Context> = await loadContexts();

export const CODE_CONTEXTS: Record<string, Context> = { ...CONTEXTS };
