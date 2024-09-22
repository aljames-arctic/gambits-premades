export async function deleteChatMessage({ chatId }) {
    if(!chatId) return;
    let chatMessage = game.messages.get(chatId);
    await chatMessage.delete();
}

export async function addReaction({ actorUuid }) {
    if(!actorUuid) return;
    let actor = await fromUuid(`${actorUuid}`);
    if(actor) {
        const hasEffectApplied = MidiQOL.hasUsedReaction(actor);
        if (!hasEffectApplied) {
            await MidiQOL.setReactionUsed(actor);
            //await actor.setFlag("midi-qol", "actions.reactionCombatRound", game.combat?.round);
            //await actor.setFlag("midi-qol", "actions.reaction", true);
        }
        /*let effectData = [
            {
                "icon": "modules/gambits-premades/assets/images/reaction.svg",
                "origin": `${actorUuid}`,
                "disabled": false,
                "name": "Reaction",
                "transfer": true,
                "duration": {
                    "seconds": 6
                },
                "flags": {
                    "dae": {
                        "specialDuration": [
                        "turnStart"
                        ]
                    }
                }
            }
        ];
        await MidiQOL.socket().executeAsGM("createEffects", { actorUuid: actor.uuid, effects: effectData });*/
    }
}

export async function gmIdentifyItem({ itemUuid }) {
    if(!itemUuid) return;
    let itemData = await fromUuid(`${itemUuid}`);
    if(itemData) await itemData.update({"system.identified": true});
}

export async function gmUpdateDisposition({ tokenUuid, disposition }) {
    if(!tokenUuid || (disposition !== 0 && disposition !== 1 && disposition !== -1)) return;
    let token = await fromUuid(`${tokenUuid}`);
    if(token) await token.update({"disposition" : disposition});
}

export async function gmToggleStatus({ tokenUuid, status, active }) {
    if(!tokenUuid || !status || (active !== true && active !== false)) return;
    let token = await fromUuid(`${tokenUuid}`);
    if(token) await token.actor.toggleStatusEffect(status, { active: active, overlay: false });
}

export async function freeSpellUse({ workflowUuid }) {
    if(!workflowUuid) return;

    const workflow = await MidiQOL.Workflow.getWorkflow(`${workflowUuid}`);
    if(workflow.macroPass !== "preItemRoll") return;

    const effectName = `${workflow.item.name}: Long Rest Charge Used`;

    if (!workflow.actor.appliedEffects.some(e => e.name === effectName)) {
        await foundry.applications.api.DialogV2.wait({
            window: { title: `Free ${workflow.item.name} Use` },
            content: `
                <div class="gps-dialog-container">
                    <div class="gps-dialog-section">
                        <div class="gps-dialog-content">
                            <div>
                                <div class="gps-dialog-flex">
                                    <p class="gps-dialog-paragraph">Would you like to activate your free use of ${workflow.item.name}? It will be cast at its base level.</p>
                                    <div id="image-container" class="gps-dialog-image-container">
                                        <img src="${workflow.item.img}" class="gps-dialog-image">
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `,
            buttons: [{
                action: "Yes",
                label: "Yes",
                callback: async (event, button, dialog) => {
                    workflow.config.consumeSpellSlot = false;
                    workflow.config.consumeSpellLevel = false;
                    workflow.config.needsConfiguration = false;
                    workflow.options.configureDialog = false;
                    const effectData = {
                        name: effectName,
                        icon: workflow.item.img,
                        duration: {},
                        origin: workflow.actor.uuid,
                        flags: {dae:{specialDuration:['longRest']}}
                    }
                    ui.notifications.info(`You used your once per long rest option to initiate ${workflow.item.name} and did not use a spell slot`)
                    return await workflow.actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
                }
            },
            {
                action: "No",
                label: "No",
                callback: async () => false
            }],
            close: async (event, dialog) => {
                return;
            }, rejectClose:false
        });
    }
}

export async function gmUpdateTemplateSize({ templateUuid, templateSize }) {
    if(!templateUuid || !templateSize) return;
    let template = await fromUuid(`${templateUuid}`);
    if(template) await template.update({"distance": templateSize});
}

export async function closeDialogById({ dialogId }) {
  if (ui.activeWindow && ui.activeWindow.dialogState && ui.activeWindow.dialogState.dialogId === dialogId) {
      ui.activeWindow.dialogState.programmaticallyClosed = true;
      ui.activeWindow.close();
  } else {
      let dialog = Object.values(ui.windows).find(d => d.dialogState && d.dialogState.dialogId === dialogId);
      if (dialog) {
          dialog.dialogState.programmaticallyClosed = true;
          dialog.close();
      }
  }
}

export function pauseDialogById({ dialogId, timeLeft, isPaused }) {
    const updateDialogState = (dialog) => {
        dialog.timeLeft = timeLeft;
        dialog.isPaused = isPaused;
        dialog.pausedTime = isPaused ? Date.now() : dialog.pausedTime;

        if (!isPaused) {
            dialog.endTime += (Date.now() - dialog.pausedTime);
            requestAnimationFrame(dialog.animate);
        }

        dialog.updateTimer(dialog.timeLeft, isPaused);
    };

    if (ui.activeWindow && ui.activeWindow.dialogState && ui.activeWindow.dialogState.dialogId === dialogId) {
        updateDialogState(ui.activeWindow);
    } else {
        let dialog = Object.values(ui.windows).find(d => d.dialogState && d.dialogState.dialogId === dialogId);
        if (dialog) {
            updateDialogState(dialog);
        }
    }
}

export async function rollAsUser({ rollParams, type }) {
    if(!rollParams) return;
    let reroll;
    
    reroll = await new Roll(`${rollParams}`).evaluate();

    await MidiQOL.displayDSNForRoll(reroll, 'damageRoll');
    return reroll;
}

export function convertFromFeet({ range }) {
    const units = canvas.scene.grid.units;
    let conversionFactor;
    if (units === "meters" || units === "m" || units === "mt" || units === "metri") conversionFactor = 0.3;
    else conversionFactor = 1;
    return range * conversionFactor;
}

export async function handleDialogPromises({userDialogArgs, gmDialogArgs}) {
    if(!userDialogArgs || !gmDialogArgs) return;
    console.log(userDialogArgs)
    console.log(gmDialogArgs)
    const module = await import('./module.js');
    const socket = module.socket;
    let userDialogPromise = socket.executeAsUser("process3rdPartyReactionDialog", userDialogArgs.browserUser, userDialogArgs);
    let gmDialogPromise = socket.executeAsUser("process3rdPartyReactionDialog", getPrimaryGM(), gmDialogArgs);

    return new Promise((resolve, reject) => {
        let userResolved = false;
        let gmResolved = false;
        let anyDialogInteracted = false;

        const checkAndResolve = () => {
            if (anyDialogInteracted) {
                resolve(anyDialogInteracted);
            } else if (userResolved && gmResolved) {
                resolve({ programmaticallyClosed: true });
            }
        };

        userDialogPromise.then(result => {
            userResolved = true;
            if (result && !result.programmaticallyClosed) {
                anyDialogInteracted = result;
            }
            checkAndResolve();
        }).catch(reject);

        gmDialogPromise.then(result => {
            gmResolved = true;
            if (result && !result.programmaticallyClosed) {
                anyDialogInteracted = result;
            }
            checkAndResolve();
        }).catch(reject);
    });
}

export function findValidTokens({initiatingToken, targetedToken, itemName, itemType, itemChecked, reactionCheck, sightCheck, sightCheckType = "enemy", rangeCheck, rangeTotal, dispositionCheck, dispositionCheckType, workflowType, workflowCombat, gpsUuid}) {
    let validTokens;

    let debugEnabled = MidiQOL.safeGetGameSetting('gambits-premades', 'debugEnabled');
    let workflowNonCombat = MidiQOL.safeGetGameSetting('gambits-premades', 'enable3prNoCombat');

    if (!workflowCombat || workflowNonCombat) {
        validTokens = canvas.tokens.placeables.filter(t => filterToken(t));
    } else {
        validTokens = game.combat?.combatants?.map(combatant => canvas.tokens.get(combatant.tokenId)).filter(t => filterToken(t));
    }
    
    function filterToken(t) {
        // Check if invalid token on the canvas
        if (!t.actor) {
            if(debugEnabled) console.error(`${itemName} for ${t.actor ? t.actor.name : "Unknown Actor"} failed at invalid token actor on canvas`);
            return;
        }
        let checkItem;
        if(gpsUuid) checkItem = t?.actor?.items?.find(i => i.flags["gambits-premades"]?.gpsUuid === gpsUuid);
        else checkItem = t?.actor?.items?.find(i => i.name.toLowerCase() === itemName.toLowerCase());
        const effectNamesOrigin = ["Confusion", "Arms of Hadar", "Shocking Grasp", "Slow", "Staggering Smite"];
        let hasEffectOrigin = t?.actor?.appliedEffects.some(effect => effectNamesOrigin.includes(effect.name));
        let measuredDistance = (dispositionCheckType === "ally" || dispositionCheckType === "enemyAlly") ? MidiQOL.computeDistance(targetedToken,t,true) : MidiQOL.computeDistance(initiatingToken,t,true);
        let range = game.gps.convertFromFeet({range: rangeTotal});

        // Check if the token has the actual item to use
        if(!checkItem) {
            if(debugEnabled) console.error(`${itemName} for ${t.actor.name} failed at check if reaction item exists`);
            return;
        }

        // Check if the tokens reaction already used
        else if(reactionCheck && MidiQOL.hasUsedReaction(t.actor)) {
            if(debugEnabled) console.error(`${itemName} for ${t.actor.name} failed at reaction available`);
            return;
        }

        // Check if the token is incapacitated
        else if(MidiQOL.checkIncapacitated(t)) {
            if(debugEnabled) console.error(`${itemName} for ${t.actor.name} failed at is incapacitated`);
            return;
        }

        // Check if the token is the initiating token or not a qualifying token disposition
        else if(dispositionCheck && ((t.id === initiatingToken.id && workflowType === "attack") || ((dispositionCheckType === "enemy" || dispositionCheckType === "enemyAlly") && t.document.disposition === initiatingToken.document.disposition) || (dispositionCheckType === "ally" && t.document.disposition !== initiatingToken.document.disposition))) {
            if(debugEnabled) console.error(`${itemName} for ${t.actor.name} failed at token disposition check`);
            return;
        }

        // Check if token can see initiating token
        else if(sightCheck && ((sightCheckType === "ally" && !MidiQOL.canSee(t, targetedToken)) || (sightCheckType === "enemy" && !MidiQOL.canSee(t, initiatingToken)))) {
            if(debugEnabled) console.error(`${itemName} for ${t.actor.name} failed at sight check`);
            return;
        }

        // Check if token is under an effect preventing reactions
        else if(hasEffectOrigin) {
            if(debugEnabled) console.error(`${itemName} for ${t.actor.name} failed at spell effect preventing reaction`);
            return;
        }

        // Check if token is within range
        else if(rangeCheck && (measuredDistance === -1 || (measuredDistance > range))) {
            if(debugEnabled) console.error(`${itemName} for ${t.actor.name} failed at range check`);
            return;
        }

        // Check if the token has available spell slots/uses
        if(itemType === "spell") {
            const spells = t.actor.system.spells;
            let spellLevel = checkItem?.system?.level;
            let checkType = checkItem?.system?.preparation?.mode;
            let hasSpellSlots = false;
            if(checkType === "prepared" && checkItem?.system?.preparation?.prepared === false) return;
            if(checkType === "prepared" || checkType === "always")
            {
                for (let level = spellLevel; level <= 9; level++) {
                    let spellSlot = t.actor.system.spells[`spell${level}`].value;
                    if (spellSlot > 0) {
                        hasSpellSlots = true;
                        break;
                    }
                }
            }
            else if(checkType === "pact")
            {
                let spellSlotValue = spells.pact.value;
                if (spellSlotValue > 0) hasSpellSlots = true;
            }
            else if(checkType === "innate" || checkType === "atwill")
            {
                let slotValue = checkItem.system.uses.value;
                let slotEnabled = checkItem.system.uses.per;
                if (slotValue > 0 || slotEnabled === null) hasSpellSlots = true;
            }

            if (!hasSpellSlots) {
                if(debugEnabled) console.error(`${itemName} for ${t.actor.name} failed at check valid spell slots/preparation`);
                return;
            }
        }

        // Check if the token has available resource or item uses
        if(itemType === "feature") {
            const itemNames = itemChecked.map(item => item.toLowerCase());

            let resourceExistsWithValue = [t.actor.system.resources.primary, t.actor.system.resources.secondary, t.actor.system.resources.tertiary].some(resource => itemNames.includes(resource?.label.toLowerCase()) && resource.value !== 0);
            let itemExistsWithValue;

            if (!resourceExistsWithValue) {
                itemExistsWithValue = t.actor.items.some(i => itemNames.includes(i.name.toLowerCase()) && i.system.uses?.value !== 0);
            }

            if (!resourceExistsWithValue && !itemExistsWithValue) {
                if(debugEnabled) console.error(`${itemName} for ${t.actor.name} failed at check valid feature item/resource uses`);
                return;
            }
        }

        if(itemType === "item") {
            const itemNames = itemChecked.map(item => item.toLowerCase());
            let itemExists = t.actor.items.some(i => itemNames.includes(i.name.toLowerCase()) || itemNames.includes(i.system.actionType?.toLowerCase()));

            if (!itemExists) {
                if(debugEnabled) console.error(`${itemName} for ${t.actor.name} failed at valid item supporting feature`);
                return;
            }
        }

        if(debugEnabled) {
            console.warn(`%c${itemName} for ${t.actor.name} Reaction Validation Passed`, 'font-weight: bold');
        }

        return t;
    };

    return validTokens;
}

export async function process3rdPartyReactionDialog({ dialogTitle, dialogContent, dialogId, initialTimeLeft, validTokenPrimaryUuid, source, type, notificationId }) {
    console.log("made it to 3rd party dialog")
    const module = await import('./module.js');
    const socket = module.socket;
    let validTokenPrimary = await fromUuid(validTokenPrimaryUuid);
    let browserUser = getBrowserUser({ actorUuid: validTokenPrimary.actor.uuid });
    console.log(browserUser, "3rd party dialog browseruser")

    let dialogState = { interacted: false, decision: null, programmaticallyClosed: false, dialogId: dialogId };
    let result = null;

    function attachEventListeners(dialog, animate) {
        const dialogElement = dialog?.element;
        const windowTitle = dialogElement?.querySelector('.window-title');
        const pauseButton = dialogElement?.querySelector(`#pauseButton_${dialogId}`);
        const itemSelect = dialogElement?.querySelector(`#item-select_${dialogId}`);
        const weaponImg = dialogElement?.querySelector(`#weapon-img_${dialogId}`);
        const damageList = dialogElement?.querySelector(`#damage-list`);
        let draggedItem = null;

        function handleFocusIn(event) {
            validTokenPrimary.object.control({ releaseOthers: true });
        }

        function handleFocusOut(event) {
            validTokenPrimary.object.release();
        }

        function handleMouseDown(event) {
            setTimeout(() => dialogElement.focus(), 0);
            validTokenPrimary.object.control({ releaseOthers: true });
        }

        function handlePauseButtonClick() {
            dialog.isPaused = !dialog.isPaused;
            if (dialog.isPaused) {
                dialog.pausedTime = Date.now();
            } else {
                dialog.endTime += Date.now() - dialog.pausedTime;
                requestAnimationFrame(animate);
            }
            dialog.updateTimer(dialog.timeLeft, dialog.isPaused);
        
            const pauseState = { dialogId: dialogId, timeLeft: dialog.timeLeft, isPaused: dialog.isPaused };
            if (source === "user" && type === "multiDialog") {
                socket.executeAsUser("pauseDialogById", getPrimaryGM(), pauseState);
            } else if (source === "gm" && type === "multiDialog") {
                socket.executeAsUser("pauseDialogById", browserUser, pauseState);
            }
        }

        function handleItemSelectChange(event) {
            const selectedOption = event.target.options[event.target.selectedIndex];
            weaponImg.src = selectedOption.getAttribute('name');
        }

        function handleDragStart(event) {
            event.dataTransfer.setData('text/plain', event.target.innerText);
            event.dataTransfer.effectAllowed = 'move';
            draggedItem = event.target;
        }

        function handleDragOver(event) {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            const target = event.target;
            if (target && target.nodeName === 'LI') {
                const rect = target.getBoundingClientRect();
                const next = (event.clientY - rect.top) / (rect.bottom - rect.top) > 0.5;
                damageList.insertBefore(draggedItem, next && target.nextSibling || target);
            }
        }

        function handleDragEnd() {
            draggedItem = null;
        }

        if (windowTitle) {
            windowTitle.addEventListener('focusin', handleFocusIn);
            windowTitle.addEventListener('focusout', handleFocusOut);
            windowTitle.addEventListener('mousedown', handleMouseDown);
        }

        if (pauseButton) {
            pauseButton.addEventListener('click', handlePauseButtonClick);

            if (source === "gm" && type === "multiDialog") {
                pauseButton.setAttribute("autofocus", "true");
                pauseButton.focus();
            }
        }

        if (itemSelect && itemSelect.options.length > 0 && weaponImg) {
            weaponImg.src = itemSelect.options[0].getAttribute('name');
            itemSelect.addEventListener('change', handleItemSelectChange);
        }

        if (damageList) {
            const damageListItems = damageList.querySelectorAll('li');
            damageListItems.forEach(item => {
                item.addEventListener('dragstart', handleDragStart);
            });
            damageList.addEventListener('dragover', handleDragOver);
            damageList.addEventListener('dragend', handleDragEnd);
        }

        return { windowTitle, pauseButton, itemSelect, damageList, handleFocusIn, handleFocusOut, handleMouseDown, handlePauseButtonClick, handleItemSelectChange, handleDragStart, handleDragOver, handleDragEnd };
    }

    function cleanupEventListeners(listeners) {
        const { windowTitle, pauseButton, itemSelect, damageList, handleFocusIn, handleFocusOut, handleMouseDown, handlePauseButtonClick, handleItemSelectChange, handleDragStart, handleDragOver, handleDragEnd } = listeners;
        
        if (windowTitle) {
            windowTitle.removeEventListener('focusin', handleFocusIn);
            windowTitle.removeEventListener('focusout', handleFocusOut);
            windowTitle.removeEventListener('mousedown', handleMouseDown);
        }

        if (pauseButton) {
            pauseButton.removeEventListener('click', handlePauseButtonClick);
        }

        if (itemSelect) {
            itemSelect.removeEventListener('change', handleItemSelectChange);
        }

        if (damageList) {
            const damageListItems = damageList.querySelectorAll('li');
            damageListItems.forEach(item => {
                item.removeEventListener('dragstart', handleDragStart);
            });
            damageList.removeEventListener('dragover', handleDragOver);
            damageList.removeEventListener('dragend', handleDragEnd);
        }
    }

    await foundry.applications.api.DialogV2.wait({
        window: { title: dialogTitle },
        content: dialogContent,
        buttons: [
            {
                action: "yes",
                label: "<i class='fas fa-check' style='margin-right: 5px;'></i>Yes",
                callback: async (event, button, dialog) => {
                    await socket.executeAsUser("deleteChatMessage", getPrimaryGM(), {chatId: notificationId});
                    dialogState.interacted = true;
                    dialogState.decision = "yes";
                    if (source && source === "user" && type === "multiDialog") await socket.executeAsUser("closeDialogById", getPrimaryGM(), { dialogId: dialogId });
                    else if (source && source === "gm" && type === "multiDialog") await socket.executeAsUser("closeDialogById", browserUser, { dialogId: dialogId });

                    let enemyTokenUuid = button.form?.elements["enemy-token"]?.value ?? false;
                    let allyTokenUuid = button.form?.elements["ally-token"]?.value ?? false;
                    let abilityCheck = button.form?.elements["ability-check"] ?? false;
                    if(abilityCheck) {
                        for (let i = 0; i < abilityCheck.length; i++) {
                            if (abilityCheck[i].checked) {
                                abilityCheck = abilityCheck[i].value;
                                break;
                            }
                        }
                    }
                    
                    let damageChosen = [];
                    let damageListItems = document.querySelectorAll(`#damage-list li .damage-type`);
                    if (damageListItems?.length > 0) {
                        damageListItems.forEach(item => damageChosen.push(item.textContent.trim()));
                    }

                    let selectedItemUuid = button.form?.elements[`item-select_${dialogId}`]?.value ?? false;
                    let favoriteCheck = button.form?.elements["gps-favorite-checkbox"]?.checked ?? false;

                    result = ({ userDecision: true, enemyTokenUuid, allyTokenUuid, damageChosen, selectedItemUuid, favoriteCheck, abilityCheck, programmaticallyClosed: false, source, type });
                }
            },
            {
                action: "no",
                label: `<i class='fas fa-times' style='margin-right: 5px;'></i>No`,
                default: true,
                callback: async (event, button, dialog) => {
                    await socket.executeAsUser("deleteChatMessage", getPrimaryGM(), {chatId: notificationId});
                    dialogState.interacted = true;
                    dialogState.decision = "no";
                    if(source && source === "user" && type === "multiDialog") await socket.executeAsUser("closeDialogById", getPrimaryGM(), { dialogId: dialogId });
                    else if(source && source === "gm" && type === "multiDialog") await socket.executeAsUser("closeDialogById", browserUser, { dialogId: dialogId });

                    let enemyTokenUuid = button.form?.elements["enemy-token"]?.value ?? false;

                    result = ({ userDecision: false, enemyTokenUuid, programmaticallyClosed: false, source, type });
                }
            },
        ],
        render: (event) => {
            let dialog = event.target;
            dialog.dialogState = dialogState;          
            dialog.timeLeft = initialTimeLeft;
            dialog.isPaused = false;
            dialog.pausedTime = 0;
            const startTime = Date.now();
            dialog.endTime = startTime + initialTimeLeft * 1000;

            dialog.timer = setInterval(() => {
                if (!dialog.isPaused) {
                    const now = Date.now();
                    dialog.timeLeft = Math.max((dialog.endTime - now) / 1000, 0);
                    dialog.updateTimer(dialog.timeLeft, dialog.isPaused);
                    if (dialog.timeLeft <= 0) {
                        clearInterval(dialog.timer);
                        dialog.close();
                    }
                }
            }, 1000);

            dialog.animate = () => {
                if (!dialog.isPaused) {
                    const now = Date.now();
                    dialog.timeLeft = Math.max((dialog.endTime - now) / 1000, 0);
                    dialog.updateTimer(dialog.timeLeft, dialog.isPaused);
                    if (dialog.timeLeft > 0) {
                        requestAnimationFrame(dialog.animate);
                    }
                }
            };
            requestAnimationFrame(dialog.animate);

            dialog.listeners = attachEventListeners(dialog, dialog.animate);

            dialog.updateTimer = function updateTimer(newTimeLeft, paused) {
                let useFullTitleBar = false;
                if(game.settings.get("gambits-premades", "enableTimerFullAnim")) useFullTitleBar = true;
                this.timeLeft = newTimeLeft;
                this.isPaused = paused;
                const dialogElement = dialog?.element;
                const pauseIcon = dialogElement?.querySelector(`#pauseIcon_${dialogId}`);
                const pauseButton = dialogElement?.querySelector(`#pauseButton_${dialogId}`);
                const titleElement = dialogElement?.querySelector(`.window-title`);
                const titleBackground = dialogElement?.querySelector(`.window-header`);
    
                if (titleElement) {
                    titleElement.textContent = `${dialogTitle} - ${Math.ceil(this.timeLeft)}s`;
                }
    
                const progressPercentage = (this.timeLeft / initialTimeLeft) * 100;
                const transitionStart = 75;
                const transitionPercentage = Math.max((transitionStart - progressPercentage) / transitionStart, 0) * 100;
    
                const redValue = Math.floor(181 + (transitionPercentage / 100) * (255 - 181));
                const greenValue = Math.floor(99 - (transitionPercentage / 100) * 99);
                const blueValue = Math.floor(69 - (transitionPercentage / 100) * 69);
                const borderColorStop = `rgb(${redValue}, ${greenValue}, ${blueValue})`;
    
                const colorStop1 = Math.max(progressPercentage - 5, 0);
                const borderColor = `linear-gradient(to right, ${borderColorStop}, ${borderColorStop} ${colorStop1}%, rgba(0, 0, 0, 0.5) ${progressPercentage}%, rgba(0, 0, 0, 0.5))`;
    
                if (useFullTitleBar && titleBackground) {
                    titleBackground.style.background = borderColor;
                } else if (titleBackground) {
                    titleBackground.style.border = `2px solid`;
                    titleBackground.style.borderImage = borderColor;
                    titleBackground.style.borderImageSlice = 1;
                }
    
                if (pauseIcon && pauseButton) {
                    pauseIcon.classList.toggle("fa-play", this.isPaused);
                    pauseIcon.classList.toggle("fa-pause", !this.isPaused);
                    pauseButton.style.backgroundColor = this.isPaused ? "rgba(181, 99, 69, 0.80)" : "";
                }
            };
            requestAnimationFrame(dialog.animate);
            dialog.updateTimer(dialog.timeLeft, dialog.isPaused);
        },
        close: async (event, dialog) => {
            clearInterval(dialog.timer);
            cleanupEventListeners(dialog.listeners);
            
            if (dialog.dialogState.programmaticallyClosed) result = ({ userDecision: false, programmaticallyClosed: true, source, type });
            else if (!dialog.dialogState.interacted) result = ({ userDecision: false, programmaticallyClosed: false, source, type });

            if(source && source === "user" && type === "multiDialog" && !dialog.dialogState.programmaticallyClosed) await socket.executeAsUser("closeDialogById", getPrimaryGM(), { dialogId: dialogId });
            else if(source && source === "gm" && type === "multiDialog" && !dialog.dialogState.programmaticallyClosed) await socket.executeAsUser("closeDialogById", browserUser, { dialogId: dialogId });
        }, rejectClose:false
    });
    return result;
}

export async function moveTokenByOriginPoint({ originX, originY, targetUuid, distance }) {

    if (!targetUuid) return console.log("No valid target to move");
    if (!distance || isNaN(distance)) return console.log("No valid distance to move");
    if (!originX || !originY) return console.log("No valid origin x/y coordinate given, for a token object this value should be token.center.x/token.center.y");

    const targetDocument = await fromUuid(targetUuid);
    const target = targetDocument.object;

    const gridDistance = canvas.scene.dimensions.distance;
    const pixelsPerFoot = canvas.scene.grid.size / gridDistance;
    const moveDistancePixels = distance * pixelsPerFoot;

    let vectorX = target.center.x - originX;
    let vectorY = target.center.y - originY;
    let magnitude;

    const gridDiagonals = game.settings.get("core", "gridDiagonals");

    const initialX = target.x;
    const initialY = target.y;

    switch (gridDiagonals) {
        case 0:  // Equidistant
        magnitude = Math.max(Math.abs(vectorX), Math.abs(vectorY));
            break;
        case 1:  // Exact
            magnitude = Math.sqrt(vectorX ** 2 + vectorY ** 2);
            break;
        case 2:  // Approximate (1.5x cost for diagonals)
            magnitude = Math.abs(vectorX) + Math.abs(vectorY);
            let diagonals = Math.min(Math.abs(vectorX), Math.abs(vectorY));
            magnitude += (diagonals * 0.5) - diagonals;
            break;
        case 3:  // Rectilinear (2x cost for diagonals)
            magnitude = Math.abs(vectorX) + Math.abs(vectorY);
            break;
        case 4:  // Alternating (1/2/1)
            magnitude = Math.max(Math.abs(vectorX), Math.abs(vectorY));
            break;
        case 5:  // Alternating (2/1/2)
            let steps = 0;
            let dx = Math.abs(vectorX);
            let dy = Math.abs(vectorY);

            while (dx > 0 || dy > 0) {
                if (dx > 0 && dy > 0) {
                    steps += (steps % 2 === 0) ? 2 : 1;
                    dx -= 1;
                    dy -= 1;
                } else if (dx > 0) {
                    steps += 1;
                    dx -= 1;
                } else if (dy > 0) {
                    steps += 1;
                    dy -= 1;
                }
            }
            magnitude = steps;
            break;
        case 6:  // Illegal
            magnitude = Infinity;
            break;
        default:  // Default to Equidistant
            console.error("Unknown gridDiagonals setting:", gridDiagonals);
            magnitude = Math.max(Math.abs(vectorX), Math.abs(vectorY));
            break;
    }

    vectorX /= magnitude;
    vectorY /= magnitude;

    let moveX = vectorX * moveDistancePixels;
    let moveY = vectorY * moveDistancePixels;
    let finalX = target.x + moveX;
    let finalY = target.y + moveY;

    if (canvas.scene.grid.type === 1) {
        const snapped = canvas.scene.grid.getSnappedPoint({ x: finalX, y: finalY }, { mode: 0xFF0, resolution: 1 });
        finalX = snapped.x;
        finalY = snapped.y;
    }

    let endPoint = new PIXI.Point(finalX, finalY);
    let collisionDetected = CONFIG.Canvas.polygonBackends.move.testCollision(target.center, endPoint, { type: "move", mode: "any" });

    if (!collisionDetected) {
        await target.document.update({ x: finalX, y: finalY });
    } else {
        let stepDistance = canvas.scene.grid.size / 10;
        let totalSteps = moveDistancePixels / stepDistance;
        let stepCounter = 0;

        for (let step = 1; step <= totalSteps; step++) {
            let nextX = target.x + vectorX * stepDistance * step;
            let nextY = target.y + vectorY * stepDistance * step;
            if (canvas.scene.grid.type === 1) {
                const snapped = canvas.scene.grid.getSnappedPoint({ x: nextX, y: nextY }, { mode: 0xFF0, resolution: 1 });
                nextX = snapped.x;
                nextY = snapped.y;
            }
            let nextPoint = new PIXI.Point(nextX, nextY);

            collisionDetected = CONFIG.Canvas.polygonBackends.move.testCollision(target.center, nextPoint, { type: "move", mode: "any" });

            if (collisionDetected) {
                break;
            }
            stepCounter = step;
        }

        finalX = target.x + vectorX * stepDistance * stepCounter;
        finalY = target.y + vectorY * stepDistance * stepCounter;

        if (stepCounter > 0) {
            if (canvas.scene.grid.type === 1) {
                const snapped = canvas.scene.grid.getSnappedPoint({ x: finalX, y: finalY }, { mode: 0xFF0, resolution: 1 });
                finalX = snapped.x;
                finalY = snapped.y;
            }
            await target.document.update({ x: finalX, y: finalY });
        }
    }

    let totalDistanceMoved;

    const dx = Math.abs(finalX - initialX) / canvas.grid.size;
    const dy = Math.abs(finalY - initialY) / canvas.grid.size;
    const diagonalSteps = Math.min(dx, dy);
    const straightSteps = Math.abs(dx - dy);

    switch (gridDiagonals) {
        case 0: // Equidistant
            totalDistanceMoved = (diagonalSteps + straightSteps) * gridDistance;
            break;
        case 1: // Exact
            totalDistanceMoved = Math.hypot(finalX - initialX, finalY - initialY) / pixelsPerFoot;
            break;
        case 2: // 1.5x cost for diagonals
            totalDistanceMoved = (diagonalSteps * 1.5 + straightSteps) * gridDistance;
            break;
        case 3: // 2x cost for diagonals
            totalDistanceMoved = (diagonalSteps * 2 + straightSteps) * gridDistance;
            break;
        case 4: // Alternating (1/2/1)
            totalDistanceMoved = ((diagonalSteps % 2 === 0 ? diagonalSteps * 1 : diagonalSteps * 2) + straightSteps) * gridDistance;
            break;
        case 5: // Alternating (2/1/2)
            totalDistanceMoved = ((diagonalSteps % 2 === 0 ? diagonalSteps * 2 : diagonalSteps * 1) + straightSteps) * gridDistance;
            break;
        default:
            totalDistanceMoved = (diagonalSteps + straightSteps) * gridDistance;
    }

    return totalDistanceMoved;
}

export async function moveTokenByCardinal({ targetUuid, distance, direction }) {
    const directions = ["North", "South", "East", "West", "Northwest", "Northeast", "Southwest", "Southeast"];

    if (!targetUuid) return console.log("No valid target to move");
    if (!distance || isNaN(distance)) return console.log("No valid distance to move");
    if (!directions.includes(direction)) return console.log("No valid direction to move (Valid Options: 'North', 'South', 'East', 'West', 'Northwest', 'Northeast', 'Southwest', 'Southeast')");

    const targetDocument = await fromUuid(targetUuid);
    const target = targetDocument.object;

    const gridDistance = canvas.scene.dimensions.distance;
    const pixelsPerFoot = canvas.scene.grid.size / gridDistance;
    const moveDistancePixels = distance * pixelsPerFoot;

    const gridDiagonals = game.settings.get("core", "gridDiagonals");

    let moveX = 0;
    let moveY = 0;

    const initialX = target.x;
    const initialY = target.y;

    switch (direction) {
        case "North":
            moveY = -moveDistancePixels;
            break;
        case "South":
            moveY = moveDistancePixels;
            break;
        case "East":
            moveX = moveDistancePixels;
            break;
        case "West":
            moveX = -moveDistancePixels;
            break;
        case "Northwest":
        case "Northeast":
        case "Southwest":
        case "Southeast":
            let dx = 1;
            let dy = 1;

            if (direction.includes("North")) dy = -1;
            if (direction.includes("South")) dy = 1;
            if (direction.includes("East")) dx = 1;
            if (direction.includes("West")) dx = -1;

            switch (gridDiagonals) {
                case 0: // Equidistant
                    moveX = moveDistancePixels * dx;
                    moveY = moveDistancePixels * dy;
                    break;
                case 1: // Exact
                    moveX = (moveDistancePixels / Math.hypot(dx, dy)) * dx;
                    moveY = (moveDistancePixels / Math.hypot(dx, dy)) * dy;
                    break;
                case 2: // Approximate (1.5x cost for diagonals)
                    const diagonalSteps = Math.min(Math.abs(dx), Math.abs(dy));
                    const straightSteps = Math.abs(dx - dy);
                    const magnitude = diagonalSteps * 1.5 + straightSteps;
                    moveX = (moveDistancePixels / magnitude) * dx;
                    moveY = (moveDistancePixels / magnitude) * dy;
                    break;
                case 3: // Rectilinear (2x cost for diagonals)
                    moveX = moveDistancePixels * dx * 2;
                    moveY = moveDistancePixels * dy * 2;
                    break;
                case 4: // Alternating (1/2/1)
                    const alternatingMagnitude1 = ((Math.abs(dx) + Math.abs(dy)) % 2 === 0) ? 1 : 2;
                    moveX = (moveDistancePixels / alternatingMagnitude1) * dx;
                    moveY = (moveDistancePixels / alternatingMagnitude1) * dy;
                    break;
                case 5: // Alternating (2/1/2)
                    const alternatingMagnitude2 = ((Math.abs(dx) + Math.abs(dy)) % 2 === 0) ? 2 : 1;
                    moveX = (moveDistancePixels / alternatingMagnitude2) * dx;
                    moveY = (moveDistancePixels / alternatingMagnitude2) * dy;
                    break;
                case 6: // Illegal
                    moveX = moveY = 0;
                    break;
                default: // Default to Equidistant
                    console.error("Unknown gridDiagonals setting:", gridDiagonals);
                    moveX = moveDistancePixels * dx;
                    moveY = moveDistancePixels * dy;
                    break;
            }
            break;
    }

    let finalX = target.x + moveX;
    let finalY = target.y + moveY;

    if (canvas.scene.grid.type === 1) {
        const snapped = canvas.scene.grid.getSnappedPoint({ x: finalX, y: finalY }, { mode: 0xFF0, resolution: 1 });
        finalX = snapped.x;
        finalY = snapped.y;
    }

    let endPoint = new PIXI.Point(finalX, finalY);
    let collisionDetected = CONFIG.Canvas.polygonBackends.move.testCollision(target.center, endPoint, { type: "move", mode: "any" });

    if (!collisionDetected) {
        await target.document.update({ x: finalX, y: finalY });
    } else {
        let directionVector = { x: moveX, y: moveY };
        let magnitude = Math.hypot(directionVector.x, directionVector.y);
        directionVector.x /= magnitude;
        directionVector.y /= magnitude;

        let totalSteps = moveDistancePixels / (canvas.scene.grid.size / 10);
        let stepCounter = 0;

        for (let step = 1; step <= totalSteps; step++) {
            let nextX = target.x + directionVector.x * (canvas.scene.grid.size / 10) * step;
            let nextY = target.y + directionVector.y * (canvas.scene.grid.size / 10) * step;
            if (canvas.scene.grid.type === 1) {
                const snapped = canvas.scene.grid.getSnappedPoint({ x: nextX, y: nextY }, { mode: 0xFF0, resolution: 1 });
                nextX = snapped.x;
                nextY = snapped.y;
            }
            let nextPoint = new PIXI.Point(nextX, nextY);

            collisionDetected = CONFIG.Canvas.polygonBackends.move.testCollision(target.center, nextPoint, { type: "move", mode: "any" });

            if (collisionDetected) {
                break;
            }
            stepCounter = step;
        }

        finalX = target.x + directionVector.x * (canvas.scene.grid.size / 10) * stepCounter;
        finalY = target.y + directionVector.y * (canvas.scene.grid.size / 10) * stepCounter;

        if (stepCounter > 0) {
            if (canvas.scene.grid.type === 1) {
                const snapped = canvas.scene.grid.getSnappedPoint({ x: finalX, y: finalY }, { mode: 0xFF0, resolution: 1 });
                finalX = snapped.x;
                finalY = snapped.y;
            }
            await target.document.update({ x: finalX, y: finalY });
        }
    }

    let totalDistanceMoved;

        const dx = Math.abs(finalX - initialX) / canvas.grid.size;
        const dy = Math.abs(finalY - initialY) / canvas.grid.size;
        const diagonalSteps = Math.min(dx, dy);
        const straightSteps = Math.abs(dx - dy);

        switch (gridDiagonals) {
            case 0: // Equidistant
                totalDistanceMoved = (diagonalSteps + straightSteps) * gridDistance;
                break;
            case 1: // Exact
                totalDistanceMoved = Math.hypot(finalX - initialX, finalY - initialY) / pixelsPerFoot;
                break;
            case 2: // 1.5x cost for diagonals
                totalDistanceMoved = (diagonalSteps * 1.5 + straightSteps) * gridDistance;
                break;
            case 3: // 2x cost for diagonals
                totalDistanceMoved = (diagonalSteps * 2 + straightSteps) * gridDistance;
                break;
            case 4: // Alternating (1/2/1)
                totalDistanceMoved = ((diagonalSteps % 2 === 0 ? diagonalSteps * 1 : diagonalSteps * 2) + straightSteps) * gridDistance;
                break;
            case 5: // Alternating (2/1/2)
                totalDistanceMoved = ((diagonalSteps % 2 === 0 ? diagonalSteps * 2 : diagonalSteps * 1) + straightSteps) * gridDistance;
                break;
            default:
                totalDistanceMoved = (diagonalSteps + straightSteps) * gridDistance;
        }

    return totalDistanceMoved;
}

export async function replaceChatCard({ actorUuid, itemUuid, chatContent, rollData }) {
    if(!actorUuid || !itemUuid || !chatContent) return;
    let actor = await fromUuid(actorUuid);
    let token = await MidiQOL.tokenForActor(actor);
    let item = await fromUuid(itemUuid);
    if(rollData) rollData = Roll.fromJSON(JSON.stringify(rollData));
    else rollData = null;
    let rollContent = rollData ? await rollData.render() : '';

    let msgHistory = [];
    game.messages.reduce((list, message) => {
        if (message.flags["midi-qol"]?.itemId === item._id && message.speaker.token === token.document.id) msgHistory.push(message.id);
    }, msgHistory);
    let itemCard = msgHistory[msgHistory.length - 1];
    let chatMessage = false;
    if(itemCard) chatMessage = await game.messages.get(itemCard);
    if(chatMessage) {
        let content = await foundry.utils.duplicate(chatMessage.content);
        let insertPosition = content.indexOf('<div class="end-midi-qol-attack-roll"></div>');
        if (insertPosition !== -1) {
            content = content.slice(0, insertPosition) + rollContent + chatContent + content.slice(insertPosition);
        }
        await chatMessage.update({ content: content });
    }
    else {
        let actorPlayer = MidiQOL.playerForActor(actor);
        let chatData = await item.getChatData();

        chatData.hasProperties = true;
        chatData.subtitle = chatData.properties[0];

        let itemCardData = {
            actor: item.actor,
            item: item,
            data: chatData
        };

        let itemContent = await renderTemplate("modules/midi-qol/templates/item-card.hbs", itemCardData);

        let combinedContent = `
            <div class="custom-message">
                ${itemContent}
                ${rollContent}
                <div style="margin-top: 10px; margin-bottom: 5px;">
                    ${chatContent}
                </div>
            </div>
        `;

        ChatMessage.create({
            user: actorPlayer.id,
            content: combinedContent,
            speaker: ChatMessage.getSpeaker({ token: token })
        });
    }
}

let regionTokenStates = new Map();
export function validateRegionMovement({regionScenario, regionStatus, regionUuid, tokenUuid, isTeleport = false, validExit = true}) {
    let region = fromUuidSync(regionUuid);
    let token = fromUuidSync(tokenUuid);
    let regionId = region.id;
    let tokenId = token.id;
    let validatedRegionMovement;

    if(regionScenario === "tokenStatusChanged" && regionStatus) {
        regionTokenStates.set(`${regionId}-${tokenId}-statuschanged`, true);
        return validatedRegionMovement = ({ validRegionMovement: false, validReroute: false });
    }
    else if(regionScenario === "tokenStatusChanged" && !regionStatus) return validatedRegionMovement = ({ validRegionMovement: false, validReroute: false });

    if(regionScenario === "tokenExit") {
        regionTokenStates.set(`${regionId}-${tokenId}-exited`, true);
        return validatedRegionMovement = ({ validRegionMovement: false, validReroute: false });
    }
    else if(regionScenario === "tokenEnter") {
        regionTokenStates.set(`${regionId}-${tokenId}-entered`, true);
        return validatedRegionMovement = ({ validRegionMovement: false, validReroute: false });
    }
    else if(regionScenario === "tokenForcedMovement") {
        regionTokenStates.set(`${regionId}-${tokenId}-forcedMovement`, true);
        return validatedRegionMovement = ({ validRegionMovement: false, validReroute: false });
    }
    else if(regionScenario === "tokenPostMove") {
        const entered = regionTokenStates.get(`${regionId}-${tokenId}-entered`);
        const exited = regionTokenStates.get(`${regionId}-${tokenId}-exited`);
        const forcedMovement = regionTokenStates.get(`${regionId}-${tokenId}-forcedMovement`);
        const statusChanged = regionTokenStates.get(`${regionId}-statuschanged`);

        if(exited) regionTokenStates.delete(`${regionId}-${tokenId}-exited`);
        if(entered) regionTokenStates.delete(`${regionId}-${tokenId}-entered`);
        if(forcedMovement) regionTokenStates.delete(`${regionId}-${tokenId}-forcedMovement`);
        if(statusChanged) regionTokenStates.delete(`${regionId}-${tokenId}-statuschanged`);

        if(forcedMovement || statusChanged) return validatedRegionMovement = ({ validRegionMovement: false, validReroute: false });

        if (!exited && !entered && !isTeleport) {
            if (token.regions.has(region)) return validatedRegionMovement = ({ validRegionMovement: false, validReroute: false });
            else return validatedRegionMovement = ({ validRegionMovement: true, validReroute: true });
        }
        else if(exited && validExit && !isTeleport) {
            return validatedRegionMovement = ({ validRegionMovement: true, validReroute: true });
        }
        else if (entered && !isTeleport) {
            return validatedRegionMovement = ({ validRegionMovement: true, validReroute: false });
        }
    }
    else if(regionScenario === "tokenTurnStart") {
        return validatedRegionMovement = ({ validRegionMovement: true, validReroute: false });
    }
    else return validatedRegionMovement = ({ validRegionMovement: false, validReroute: false });
}

export async function ritualSpellUse({ workflowUuid }) {
    if(!workflowUuid) return;

    const workflow = await MidiQOL.Workflow.getWorkflow(`${workflowUuid}`);
    if(workflow.macroPass !== "preItemRoll") return;
    if(!workflow.item.system.properties.has("ritual")) return;

    await foundry.applications.api.DialogV2.wait({
        window: { title: `Ritual ${workflow.item.name} Use` },
        content: `
            <div class="gps-dialog-container">
                <div class="gps-dialog-section">
                    <div class="gps-dialog-content">
                        <div>
                            <div class="gps-dialog-flex">
                                <p class="gps-dialog-paragraph">Would you like to cast ${workflow.item.name} ritually? This will increase its cast time (${workflow.item.system.activation.cost} ${workflow.item.system.activation.type}) by 10 minutes.</p>
                                <div id="image-container" class="gps-dialog-image-container">
                                    <img src="${workflow.item.img}" class="gps-dialog-image">
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `,
        buttons: [{
            action: "Yes",
            label: "Yes",
            callback: async (event, button, dialog) => {
                workflow.config.consumeSpellSlot = false;
                workflow.config.consumeSpellLevel = false;
                workflow.config.needsConfiguration = false;
                workflow.options.configureDialog = false;

                let content = `<span style='text-wrap: wrap;'><img src="${workflow.actor.img}" style="width: 25px; height: auto;" /> ${workflow.actor.name} cast ${workflow.item.name} ritually.</span>`
                let chatData = {
                user: getPrimaryGM(),
                content: content,
                whisper: getPrimaryGM()
                };
                await MidiQOL.socket().executeAsUser("createChatMessage", getPrimaryGM(), { chatData });
                return;
            }
        },
        {
            action: "No",
            label: "No",
            callback: async () => false
        }],
        close: async (event, dialog) => {
            return;
        }, rejectClose:false
    });
}

export function getBrowserUser({ actorUuid }) {
    if(!actorUuid) return;

    let actor = fromUuidSync(actorUuid);
    let player = MidiQOL.playerForActor(actor);
    let playerId;
    
    if(!player.active) playerId = getPrimaryGM();
    else playerId = player.id;
    return playerId;
}

export function getPrimaryGM() {
    const primaryGMId = game.settings.get("gambits-premades", "primaryGM");
    const primaryGM = game.users.find(user => user.id === primaryGMId && user.active && user.isGM);
    
    if (!primaryGM) {
      const activeGM = game.users.activeGM;
      
      if (!activeGM) {
        console.warn("No active GM found.");
        return false;
      }
      
      return activeGM.id;
    }

    return primaryGMId;
  }