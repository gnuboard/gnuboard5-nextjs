import { createServerInstallScript } from './live-deploy-install-script.mjs';
import { createServerRollbackScript } from './live-deploy-rollback-script.mjs';
import { createServerActivateThemeScript } from './live-deploy-activate-theme-script.mjs';
import { createServerNginxPlanScript } from './live-deploy-nginx-plan-script.mjs';
import { createServerRootApplyScript } from './live-deploy-root-apply-script.mjs';
import { createServerRootCommandsScript } from './live-deploy-root-commands-script.mjs';
import { createServerVerifyScript } from './live-deploy-verify-script.mjs';

export function createLiveDeployServerScripts(options) {
  const scriptOptions = {
    themeName: options.themeName,
    liveDefaultWebRoot: options.liveDefaultWebRoot,
    liveDefaultNginxConf: options.liveDefaultNginxConf,
    liveDefaultSiteConf: options.liveDefaultSiteConf,
    liveDefaultNginxSnippetsDir: options.liveDefaultNginxSnippetsDir,
  };

  return {
    serverInstallScript: createServerInstallScript(scriptOptions),
    serverRollbackScript: createServerRollbackScript(scriptOptions),
    serverActivateThemeScript: createServerActivateThemeScript(scriptOptions),
    serverNginxPlanScript: createServerNginxPlanScript(scriptOptions),
    serverRootApplyScript: createServerRootApplyScript(scriptOptions),
    serverRootCommandsScript: createServerRootCommandsScript(scriptOptions),
    serverVerifyScript: createServerVerifyScript(scriptOptions),
  };
}
