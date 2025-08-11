// All selectors and constants
export const ONETRUST_SELECTORS = [
  '#onetrust-banner-sdk',
  '#onetrust-consent-sdk',
  '#onetrust-group-container',
  '#onetrust-policy',
  '.onetrust-banner-sdk',
  '#ot-sdk-container',
];

export const GENERAL_BANNER_SELECTORS = [
  '[id*="cookie"]',
  '[class*="cookie"]',
  '[id*="consent"]',
  '[class*="consent"]',
  '[id*="gdpr"]',
  '[class*="gdpr"]',
  '#truste-consent-track',
  '.cc-window',
  '.cookie-banner',
  '.cookie-notice',
  '.consent-popup',
  '.gdpr-banner',
  '.privacy-banner',
  '.eucookie',
  '.cookie-consent',
  '.cookie-policy',
  '.banner-consent',
  '[data-consent]',
  '.js-cookie-consent',
  '.cmp-container',
  '[data-cmp-host]'
];

export const EXCLUDE_SELECTORS = [
  '[aria-modal="true"][role="dialog"]:not([aria-label*="cookie"])',
  '[role="dialog"]:not([aria-label*="cookie"]):not([aria-label*="consent"]):not([aria-label*="privacy"])',
  '.signin-dialog',
  '.login-dialog',
  '.auth-dialog',
  '.modal-backdrop:not(.cookie)',
  '.g-signin2',
  '[data-testid*="signin"]',
  '[data-testid*="login"]',
  '[id*="signin"]',
  '[id*="login"]',
  '[class*="signin"]',
  '[class*="login"]'
];

export const OVERLAY_SELECTORS = [
  '.onetrust-pc-dark-filter',
  '.ot-sdk-overlay',
  '.cookie-modal-backdrop',
  '[class*="modal-backdrop"]'
];

export const BANNER_SELECTORS = [...ONETRUST_SELECTORS, ...GENERAL_BANNER_SELECTORS];

export const CONTENT_SELECTORS = [
  '#onetrust-policy-text',
  '#onetrust-policy-title',
  '.ot-b-addl-desc',
  '.banner-text',
  '.cookie-message',
  '.consent-message',
  '.privacy-notice',
  '.cookie-notice-text',
  '[data-testid*="message"]',
  '[data-consent*="message"]',
  '.cmp-intro_intro',
  '.cookie-consent__message',
  '.banner-content',
  '.consent-content'
];

export const CUSTOMIZATION_SELECTORS = [
  '#onetrust-pc-sdk',
  '#onetrust-consent-sdk',
  '.cookie-preferences',
  '.consent-preferences',
  '.privacy-preferences',
  '[id*="preference-center"]',
  '[class*="preference-center"]'
];

export const buttonKeywords = {
  accept: ['accept', 'agree', 'allow', 'ok', 'confirm', 'got it', 'understand'],
  reject: ['reject', 'decline', 'deny', 'disagree', 'no thanks', 'opt out'],
  customize: ['customize', 'settings', 'preferences', 'manage', 'options']
};