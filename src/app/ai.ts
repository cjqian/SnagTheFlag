import { Action, ActionType, EndCharacterTurnAction, ShootAction, SelectCharacterStateAction, SelectTileAction, AimAction } from 'src/app/actions';
import { Point } from 'src/app/math/point';
import { GameState, GamePhase, SelectedCharacterState } from 'src/app/game_state';
import { Character } from 'src/app/character';
import { Grid, pathTo } from 'src/app/grid';
import { getProjectileTarget, getRayForShot, getRayForShot2 } from 'src/app/target_finder';
import { Target } from './math/target';

interface Delegate {
    getGameState: () => GameState;
    onAction: (action: Action) => void;
    isAnimating: () => boolean;
}

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

    async onNextTurn(delegate: Delegate) {
        let gameState = delegate.getGameState();
        const checkTurnAndTakeAction = () => {
            gameState = delegate.getGameState();
            if (gameState.currentTeamIndex !== this.teamIndex) {
                return;
            }
            if (delegate.isAnimating()) {
                setTimeout(() => {
                    checkTurnAndTakeAction();
                }, POST_ANIMATION_DELAY);
                return;
            }
            if (this.actionQueue.length === 0) {
                this.actionQueue = this.getActionsForGameState(gameState);
            }
            const nextActionProducer = this.actionQueue.shift();
            if (nextActionProducer == null) {
                throw new Error(`AI couldn't get action to perform`);
            }
            const nextAction = nextActionProducer(gameState);
            this.log(`AI: Taking action: ${JSON.stringify(nextAction)}`);
            delegate.onAction(nextAction);
            checkTurnAndTakeAction();
        };
        checkTurnAndTakeAction();
    }

    private getActionsForGameState(gameState: GameState): ActionSequenceItem[] {
        if (gameState.gamePhase === GamePhase.CHARACTER_PLACEMENT) {
            return [(gs) => {
                return this.placeCharacter(gameState);
            }];
        }
        if (gameState.selectedCharacter == null || gameState.selectedCharacterState == null) {
            throw new Error('Expected a selected character and state');
        }
        const selectedCharacter = gameState.selectedCharacter;
        const selectedCharacterState = gameState.selectedCharacterState;
        if (!selectedCharacter.hasMoved && !selectedCharacter.hasShot) {
            return this.getHasntMovedNorShot(selectedCharacter, gameState);
        }
        if (!selectedCharacter.hasMoved) {
            this.getSafeMoveTowardsEnemyFlag(selectedCharacter, gameState);
        }
        if (!selectedCharacter.hasShot) {
            const characterCenter = getCharacterCanvasCenter(selectedCharacter);
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
            const tileCenter = Grid.getCanvasFromTileCoords(tile).add(Grid.HALF_TILE);
            if (this.getEnemyTargetsInDirectSight(tileCenter, gameState).length === 0) {
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
        const characterCenter = getCharacterCanvasCenter(character);
        const potentialShots = this.getEnemyTargetsInDirectSight(characterCenter, gameState);
        if (potentialShots.length > 0) {
            // TODO - pick best.
            const shoot = this.getShootSequence(potentialShots[0]);
            const safeMove = this.getSafeMoveTowardsEnemyFlag(character, gameState);
            return shoot.concat(safeMove);
        } else {
            const startMoving = (gameState) => {
                const startMovingAction: SelectCharacterStateAction = {
                    type: ActionType.SELECT_CHARACTER_STATE,
                    state: SelectedCharacterState.MOVING,
                };
                return startMovingAction;
            };
            const thenMove = (gameState) => {
                const tileStringToDirectHits = new Map<string, ShotDetails[]>();
                for (const selectableTile of gameState.selectableTiles) {
                    const directHits = this.getEnemyTargetsInDirectSight(characterCenter, gameState);
                    tileStringToDirectHits.set(JSON.stringify(selectableTile), directHits);
                }
                let bestTile;
                for (const key of tileStringToDirectHits.keys()) {
                    const hits = tileStringToDirectHits.get(key)!;
                    // Prefer square where character can shoot enemy and is in sight of no others.
                    if (hits.length === 1) {
                        bestTile = JSON.parse(key) as Point;
                    }
                }
                if (bestTile == null) {
                    bestTile = this.getClosestSelectableTileToEnemyFlagWithFewestDirectHits(gameState);
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

    private getSafeMoveTowardsEnemyFlag(
        character: Character, gameState: GameState): ActionSequenceItem[] {
        const startMoving = (gameState) => {
            const startMovingAction: SelectCharacterStateAction = {
                type: ActionType.SELECT_CHARACTER_STATE,
                state: SelectedCharacterState.MOVING,
            };
            return startMovingAction;
        };
        const thenMove = (gameState) => {
            const bestTile = this.getClosestSelectableTileToEnemyFlagWithFewestDirectHits(gameState);
            const selectTileAction: SelectTileAction = {
                type: ActionType.SELECT_TILE,
                tile: bestTile,
            };
            return selectTileAction;
        };
        return [startMoving, thenMove];
    }

    private getClosestSelectableTileToEnemyFlagWithFewestDirectHits(gameState: GameState): Point {
        let bestTile = {
            tile: gameState.selectableTiles[0],
            distance: 10000,
            directHits: 100,
        };
        for (const selectableTile of gameState.selectableTiles) {
            const pathToFlag = pathToEnemyFlag(selectableTile, gameState);
            const directHits = this.getEnemyTargetsInDirectSight(selectableTile, gameState).length;
            if (directHits < bestTile.directHits
                || (directHits === bestTile.directHits && pathToFlag.length < bestTile.distance)) {
                bestTile.tile = selectableTile;
                bestTile.distance = pathToFlag.length;
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
            const enemyCenter = getCharacterCanvasCenter(enemy);
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

function getCharacterCanvasCenter(character: Character): Point {
    return Grid.getCanvasFromTileCoords(character.tileCoords).add(Grid.HALF_TILE)
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

function pathToEnemyFlag(startTile: Point, gameState: GameState): Point[] {
    return gameState.getPath({
        from: startTile,
        to: gameState.getEnemyFlag().tileCoords,
    });
}