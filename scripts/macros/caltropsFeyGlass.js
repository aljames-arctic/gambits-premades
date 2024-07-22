const regionTokenStates = new Map();

export async function caltropsFeyGlass({tokenUuid, regionUuid, regionScenario, originX, originY}) {
    const module = await import('../module.js');
    const socket = module.socket;
    let region = await fromUuid(regionUuid);
    let tokenDocument = await fromUuid(tokenUuid);
    let token = tokenDocument.object;
    if(!token || !region || !regionScenario) return;
    if (!MidiQOL.isTargetable(token)) return;

    if ((token.actor.type !== 'npc' && token.actor.type !== 'character')) return;

    const effectOriginActor = await fromUuid(region.flags["region-attacher"].actorUuid);

    let itemProperName = "Fey Glass Caltrops";
    let chosenItem = effectOriginActor.items.find(i => i.name === itemProperName);
    let dialogId = "feyglasscaltrops";
    let dialogTitlePrimary = `${token.actor.name} | ${itemProperName}`;
    let browserUser = MidiQOL.playerForActor(token.actor);
    if (!browserUser.active) {
        browserUser = game.users?.activeGM;
    }

    if(regionScenario === "onExit") {
        const tokenState = regionTokenStates.get(region.id);
        if (tokenState) {
            tokenState.delete(token.id);
            regionTokenStates.set(region.id, tokenState);
        }
        regionTokenStates.set(`${region.id}-${token.id}-exited`, true);

        const isRestrained = await token.actor.appliedEffects(e => e.name === "Restrained");
        if (isRestrained) await isRestrained.delete();
        return;
    }
    else if(regionScenario === "onEnter") {
        const tokenState = regionTokenStates.get(region.id) || new Set();
        tokenState.add(token.id);
        regionTokenStates.set(region.id, tokenState);
        regionTokenStates.set(`${region.id}-${token.id}-entered`, true);
    }
    else if(regionScenario === "onPostMove") {
        if (token?.regions?.has(region)) return;
        const entered = regionTokenStates.get(`${region.id}-${token.id}-entered`);
        const exited = regionTokenStates.get(`${region.id}-${token.id}-exited`);
    
        if (entered || exited) {
            // This move is part of an enter or exit event, do not trigger the move logic
            regionTokenStates.delete(`${region.id}-${token.id}-entered`);
            regionTokenStates.delete(`${region.id}-${token.id}-exited`);
            return;
        }
    }

    let dialogContent = `
        <div class="gps-dialog-container">
            <div class="gps-dialog-section">
                <div class="gps-dialog-content">
                    <div>
                        <div class="gps-dialog-flex">
                            <p class="gps-dialog-paragraph">${token.actor.name} moved through fey glass caltrops, are they moving at half speed?</p>
                            <div id="image-container" class="gps-dialog-image-container">
                                <img id="img_${dialogId}" src="${chosenItem.img}" class="gps-dialog-image">
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="gps-dialog-button-container">
                <button id="pauseButton_${dialogId}" type="button" class="gps-dialog-button">
                    <i class="fas fa-pause" id="pauseIcon_${dialogId}" style="margin-right: 5px;"></i>Pause
                </button>
            </div>
        </div>
    `;
    
    let result = await socket.executeAsGM("process3rdPartyReactionDialog", {dialogTitle:dialogTitlePrimary,dialogContent,dialogId,initialTimeLeft: 30,validTokenPrimaryUuid: token.document.uuid,source: "gm",type: "singleDialog"});
            
    const { userDecision, enemyTokenUuid, allyTokenUuid, damageChosen, abilityCheck, source, type } = result;

    if (!userDecision) {
        const itemData = {
            name: chosenItem.name,
            type: "feat",
            img: chosenItem.img,
            effects: [],
            flags: {
                "midi-qol": {
                    noProvokeReaction: true,
                    onUseMacroName: null,
                    forceCEOff: true
                },
                "midiProperties": {
                    nodam: true
                },
                "autoanimations": {
                    killAnim: true
                }
            },
            system: {
                equipped: true,
                actionType: "damage",
                save: { dc: 15, ability: 'dex', scaling: "flat" },
                damage: { parts: [['1d4', 'piercing']] },
                components: { concentration: false, material: false, ritual: false, somatic: false, value: "", vocal: false },
                duration: { units: "inst", value: undefined }
            }
            };
            const itemUpdate = new CONFIG.Item.documentClass(itemData, {parent: effectOriginActor});
            const options = { showFullCard: false, createWorkflow: true, versatile: false, configureDialog: false, targetUuids: [token.document.uuid], workflowOptions: {autoRollDamage: 'always', autoFastDamage: true} };
            const saveResult = await MidiQOL.completeItemUse(itemUpdate, {}, options);

            if (saveResult.failedSaves.size !== 0) {
                await token.document.update({ x: originX, y: originY }, { animate: false });
    
                let effectData = [
                    {
                    "name": "Fey Glass Caltrops Restriction",
                    "img": chosenItem.img,
                    "origin": effectOriginActor.uuid,
                    "disabled": false,
                    "changes": [
                        {
                            "key": "system.attributes.movement.all",
                            "mode": 0,
                            "value": "-10",
                            "priority": 20
                        }
                    ],
                    "transfer": false,
                    "flags": {
                        "dae": {
                            "stackable": "multi",
                            "specialDuration": [
                                "isHealed"
                            ]
                        }
                    }
                    }
                ];

                await MidiQOL.socket().executeAsGM("createEffects", { actorUuid: token.actor.uuid, effects: effectData });

                let actorPlayer = MidiQOL.playerForActor(token.actor);
                let chatData = {
                    user: actorPlayer.id,
                    speaker: ChatMessage.getSpeaker({ token: token }),
                    content: `${token.actor.name} takes ${saveResult.damageTotal} points of piercing damage. <div><img src="${token.actor.img}" width="30" height="30" style="border:0px"></div></div>`
                };
                ChatMessage.create(chatData);
            }
    }
    else if (userDecision) {
        return;
    }
}