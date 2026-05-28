/**
 * Plasmo background service worker entry point.
 *
 * Delegates all logic to the structured background/ runtime module.
 * Kept thin so Plasmo can instrument it without conflict.
 */
export * from './background/index.js';
