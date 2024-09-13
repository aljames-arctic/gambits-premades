function getCombatInfo() {
    return {
        active  : game.combat?.active,
        round   : game.combat?.round,
        turn    : game.combat?.turn,
        id      : game.combat?.id,
    };
}

function isSameTurn(combatInfo) {
    if (!game.combat) return false;
    if (combatInfo.id != game.combat.id) return false;
    if (combatInfo.round != game.combat.round) return false;
    return combatInfo.turn == game.combat.turn;
}

function isSameRound(combatInfo) {
    if (!game.combat) return false;
    if (combatInfo.id != game.combat.id) return false;
    return combatInfo.round == game.combat.round;
}

export const combatApi = {
    getCombatInfo,
    isSameTurn,
    isSameRound,
};
