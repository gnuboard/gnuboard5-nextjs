import { readdirSync } from 'node:fs';

export const actionScripts = [
  'check:local-auth-actions',
  'check:local-user-actions',
  'check:local-shop-actions',
  'check:local-order-actions',
  'check:local-shop-content-actions',
  'check:local-address-actions',
  'check:local-memo-actions',
  'check:local-member-actions',
  'check:local-notification-actions',
  'check:local-scrap-actions',
  'check:local-coupon-actions',
  'check:local-qa-actions',
  'check:local-personalpay-actions',
  'check:local-point-actions',
  'check:local-poll-actions',
  'check:local-post-reaction-actions',
];

export function actionFileToScript(file) {
  return file.replace(/^check-local-/, 'check:local-').replace(/\.mjs$/, '');
}

export function scriptToActionFile(script) {
  return `${script.replace(/^check:local-/, 'check-local-')}.mjs`;
}

export function discoverActionScripts(scriptDir) {
  return readdirSync(scriptDir)
    .filter((file) => /^check-local-.+-actions\.mjs$/.test(file))
    .map(actionFileToScript)
    .sort();
}

export function actionScriptListIssues(scriptDir) {
  const discoveredScripts = discoverActionScripts(scriptDir);
  const configuredScripts = [...actionScripts].sort();
  const configuredSet = new Set(configuredScripts);
  const discoveredSet = new Set(discoveredScripts);

  return {
    unlisted: discoveredScripts.filter((script) => !configuredSet.has(script)),
    missingFiles: configuredScripts.filter((script) => !discoveredSet.has(script)),
  };
}

export function assertActionScriptList(scriptDir, fail) {
  const { unlisted, missingFiles } = actionScriptListIssues(scriptDir);

  if (unlisted.length === 0 && missingFiles.length === 0) {
    return;
  }

  if (unlisted.length > 0) {
    fail(`Unlisted action check scripts: ${unlisted.join(', ')}`);
  }

  if (missingFiles.length > 0) {
    fail(`Missing action check files: ${missingFiles.join(', ')}`);
  }
}
