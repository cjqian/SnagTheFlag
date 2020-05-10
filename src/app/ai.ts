import { Action, ActionType, EndCharacterTurnAction, ShootAction, SelectCharacterStateAction, SelectTileAction, AimAction } from 'src/app/actions';
import { Point } from 'src/app/math/point';
import { GameState, GamePhase, SelectedCharacterState } from 'src/app/game_state';
import { Character } from 'src/app/character';
import { Grid, pathTo } from 'src/app/grid';
import { getProjectileTarget, getRayForShot, getRayForShot2 } from 'src/app/target_finder';
import { Target } from './math/target';

interface ShotDetails {
    readonly aimAngleClockwiseRadians: number;
    readonly target: Target;
}

type ActionSequenceItem = (gameState: GameState) => Action;

const POST_ANIMATION_DELAY = 500;

export class Ai {

    readonly teamIndex: number;
    private actionQueue: ActionSequenceItem[];
    private readonly isLogging = true;

    constructor({ teamIndex }: { teamIndex: number; }) {
        this.teamIndex = teamIndex;
        this.actionQueue = [];
    }

    getNextAction(gameState: GameState): Action {
        if (this.actionQueue.length === 0) {
            this.actionQueue = this.getActionsForGameState(gameState);
        }
        const nextActionProducer = this.actionQueue.shift();
        if (nextActionProducer == null) {
            throw new Error(`AI couldn't get action to perform`);
        }
        const nextAction = nextActionProducer(gameState);
        if (gameState.selectedCharacter != null) {
            this.log(`selected character index - ${gameState.selectedCharacter!.index}`);
        }
        this.log(`AI: Taking action: ${JSON.stringify(nextAction)}`);
        return nextAction;
    }

    private getActionsForGameState(gameState: GameState): ActionSequenceItem[] {
        if (gameState.gamePhase === GamePhase.CHARACTER_PLACEMENT) {
            return [(gs) => {
                return this.placeCharacter(gs);
            }];
        }
        if (gameState.selectedCharacter == null || gameState.selectedCharacterState == null) {
            throw new Error('Expected a selected character and state');
        }
        const selectedCharacter = gameState.selectedCharacter;
        const selectedCharacterState = gameState.selectedCharacterState;
        const isFlagCarrier = selectedCharacter.tileCoords.equals(gameState.getEnemyFlag().tileCoords);
        if (isFlagCarrier && !selectedCharacter.hasMoved) {
            return this.getActionsForFlagCarrrier(selectedCharacter, gameState);
        }
        if (!selectedCharacter.hasMoved && !selectedCharacter.hasShot) {
            return this.getHasntMovedNorShot(selectedCharacter, gameState);
        }
        if (!selectedCharacter.hasShot) {
            const characterCenter = getTileCenterCanvas(selectedCharacter.tileCoords);
            const possibleShots = this.getEnemyTargetsInDirectSight(characterCenter, gameState);
            if (possibleShots.length > 0) {
                // TODO - pick best.
                return this.getShootSequence(possibleShots[0]);
            }
        }
        const endTurn = (gameState) => {
            const endTurnAction: EndCharacterTurnAction = {
                type: ActionType.END_CHARACTER_TURN,
            }
            return endTurnAction;
        };
        return [endTurn];
    }

    private placeCharacter(gameState: GameState): Action {
        for (const tile of gameState.selectableTiles) {
            const tileCenterCanvas = Grid.getCanvasFromTileCoords(tile).add(Grid.HALF_TILE);
            if (this.getEnemyTargetsInDirectSight(tileCenterCanvas, gameState).length === 0) {
                return {
                    type: ActionType.SELECT_TILE,
                    tile,
                };
            }
        }

        this.log("AI: No unexposed tiles");
        return {
            type: ActionType.SELECT_TILE,
            tile: gameState.selectableTiles[0],
        };
    }

    private getHasntMovedNorShot(character: Character, gameState: GameState): ActionSequenceItem[] {
        const currentCharacterCenterCanvas = getTileCenterCanvas(character.tileCoords);
        const potentialShots = this.getEnemyTargetsInDirectSight(currentCharacterCenterCanvas, gameState);
        if (potentialShots.length > 0) {
            // TODO - pick best.
            const shoot = this.getShootSequence(potentialShots[0]);
            const targetTile = gameState.enemyHasFlag()
                ? gameState.getActiveTeamFlag().tileCoords
                : gameState.getEnemyFlag().tileCoords;
            const safeMove = this.getSafeMoveTowardsLocation(character, targetTile);
            return shoot.concat(safeMove);
        } else {
            const startMoving = (gameState) => {
                const startMovingAction: SelectCharacterStateAction = {
                    type: ActionType.SELECT_CHARACTER_STATE,
                    state: SelectedCharacterState.MOVING,
                };
                return startMovingAction;
            };
            const thenMove = (gameState: GameState) => {
                const tileAndDirectHits: Array<{ tile: Point; directHits: number; }> = [];
                for (const selectableTile of gameState.selectableTiles) {
                    const tileCenterCanvas = getTileCenterCanvas(selectableTile);
                    const directHitDetails = this.getEnemyTargetsInDirectSight(tileCenterCanvas, gameState);
                    tileAndDirectHits.push({ tile: selectableTile, directHits: directHitDetails.length });
                }
                let bestTile;
                let bestTileAndHits = tileAndDirectHits.find((tileAndHit) => tileAndHit.directHits === 1);
                if (bestTileAndHits != null) {
                    bestTile = bestTileAndHits.tile;
                } else {
                    // Chase down flag if enemy has it, otherwise go for enemy flag.
                    const targetTile = gameState.enemyHasFlag()
                        ? gameState.getActiveTeamFlag().tileCoords
                        : gameState.getEnemyFlag().tileCoords;
                    bestTile = this.getClosestSelectableTileToLocationWithFewestDirectHits(targetTile, gameState);
                }
                const selectTileAction: SelectTileAction = {
                    type: ActionType.SELECT_TILE,
                    tile: bestTile,
                };
                return selectTileAction;
            };
            return [startMoving, thenMove];
        }
    }

    private getActionsForFlagCarrrier(character: Character, gameState: GameState): ActionSequenceItem[] {
        // TODO - need to differentiate flag starting spot and flag current spot.
        const teamFlagTile = gameState.getActiveTeamFlag().tileCoords;
        return this.getSafeMoveTowardsLocation(character, teamFlagTile);
    }

    private getSafeMoveTowardsLocation(character: Character, tileLocation: Point): ActionSequenceItem[] {
        const startMoving = (gameState) => {
            const startMovingAction: SelectCharacterStateAction = {
                type: ActionType.SELECT_CHARACTER_STATE,
                state: SelectedCharacterState.MOVING,
            };
            return startMovingAction;
        };
        const thenMove = (gameState) => {
            const bestTile = this.getClosestSelectableTileToLocationWithFewestDirectHits(tileLocation, gameState);
            const selectTileAction: SelectTileAction = {
                type: ActionType.SELECT_TILE,
                tile: bestTile,
            };
            return selectTileAction;
        };
        return [startMoving, thenMove];
    }

    private getClosestSelectableTileToLocationWithFewestDirectHits(tileLocation: Point, gameState: GameState): Point {
        let bestTile = {
            tile: gameState.selectableTiles[0],
            distance: 10000,
            directHits: 100,
        };
        for (const selectableTile of gameState.selectableTiles) {
            const pathToLocation = getPathToLocation(selectableTile, tileLocation, gameState);
            const tileCenterCanvas = getTileCenterCanvas(selectableTile)
            const directHits = this.getEnemyTargetsInDirectSight(tileCenterCanvas, gameState).length;
            if (directHits < bestTile.directHits
                || (directHits === bestTile.directHits && pathToLocation.length < bestTile.distance)) {
                bestTile.tile = selectableTile;
                bestTile.distance = pathToLocation.length;
                bestTile.directHits = directHits;
            }
        }
        return bestTile.tile;
    }

    private getShootSequence(shotDetails: ShotDetails): ActionSequenceItem[] {
        const startAiming = (gameState) => {
            const startAimingAction: SelectCharacterStateAction = {
                type: ActionType.SELECT_CHARACTER_STATE,
                state: SelectedCharacterState.AIMING,
            };
            return startAimingAction;
        };
        const thenAim = (gameState) => {
            const takeAimAction: AimAction = {
                type: ActionType.AIM,
                aimAngleClockwiseRadians: shotDetails.aimAngleClockwiseRadians,
            };
            return takeAimAction;
        };
        const thenShoot = (gameState) => {
            const shootAction: ShootAction = {
                type: ActionType.SHOOT,
            };
            return shootAction;
        };
        return [
            startAiming,
            thenAim,
            thenShoot,
        ];
    }

    private getEnemyTargetsInDirectSight(fromCanvas: Point, gameState: GameState): ShotDetails[] {
        const fromTile = Grid.getTileFromCanvasCoords(fromCanvas);
        const shots: ShotDetails[] = [];
        for (const enemy of gameState.getEnemyCharacters()) {
            const enemyCenter = getTileCenterCanvas(enemy.tileCoords);
            const direction = enemyCenter.subtract(fromCanvas).normalize();
            const aimAngleClockwiseRadians = direction.getPointRotationRadians();
            const target = getProjectileTarget({
                ray: getRayForShot2(fromCanvas, aimAngleClockwiseRadians),
                characters: gameState.getAliveCharacters(),
                obstacles: gameState.obstacles,
                fromTeamIndex: this.teamIndex,
                startTile: fromTile,
            });
            if (target.tile.equals(enemy.tileCoords)) {
                shots.push({
                    aimAngleClockwiseRadians,
                    target,
                });
            }
        }
        return shots;
    }

    private log(message: string) {
        if (this.isLogging) {
            console.log(message);
        }
    }
}

function getTileCenterCanvas(tile: Point): Point {
    return Grid.getCanvasFromTileCoords(tile).add(Grid.HALF_TILE)
}

function getTileClosestTo(tiles: Point[], to: Point): Point {
    let closestDistance = 10000;
    let closestTile = tiles[0];
    for (const tile of tiles) {
        const distance = tile.manhattanDistanceTo(to)
        if (distance < closestDistance) {
            closestDistance = distance;
            closestTile = tile;
        }
    }
    return closestTile;
}

function getPathToLocation(startTile: Point, tileLocation: Point, gameState: GameState): Point[] {
    return gameState.getPath({
        from: startTile,
        to: tileLocation,
    });
}