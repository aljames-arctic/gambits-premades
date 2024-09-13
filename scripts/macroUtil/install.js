
import { animationApi } from './animations/animations.js';
import { combatApi } from './lib/combat.js';
import { dependencyApi } from './lib/dependency.js';
import { effectsApi } from './lib/effect.js';
import { genericApi } from './lib/generic.js';
import { itemApi } from './lib/item.js';
import { sceneApi } from './lib/scene.js';
import { workflowApi } from './lib/runWorkflows.js';

/**
 * Removes a previously exported function or variable and exports the specifed function or variable if the macro is active.
 *
 * @param {array} exportedIdentifierName the array of exported functions to be merged
 */
function setupApiCalls(exportedFunctions) {
    globalThis.macroUtil = foundry.utils.mergeObject(globalThis.macroUtil ?? {}, exportedFunctions);
}

/**
 * Initializes the environment with macroUtil for macros
 */
let debugLevel = 0;
const version = '0.12.2';
export function setupMacroUtil() {
    if (globalThis.macroUtil?.version) // only take newest changes
        if (!foundry.utils.isNewerVersion(version, globalThis.macroUtil.version)) return;
    // Initialize debugLevel variable
    globalThis.macroUtil = foundry.utils.mergeObject(globalThis.macroUtil ?? {}, {
        debugLevel,
        version,
    });

    setupApiCalls(workflowApi);
    setupApiCalls({ combat      : combatApi });
    setupApiCalls({ effect      : effectsApi });
    setupApiCalls({ item        : itemApi });
    setupApiCalls({ dependsOn   : dependencyApi });
    setupApiCalls({ animation   : animationApi });
    setupApiCalls({ generic     : genericApi });
    setupApiCalls({ scene       : sceneApi});
}
