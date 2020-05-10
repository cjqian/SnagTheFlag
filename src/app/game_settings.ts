export interface GameSettings {
    squadSize: number;
    /** 
     * Manhattan distance from flag that characters 
     * can be spawned upon game start. 
     */
    maxSpawnDistanceFromFlag: number;
    numTeams: number;
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
    squadSize: 1,
    maxSpawnDistanceFromFlag: 8,
    numTeams: 2,
}