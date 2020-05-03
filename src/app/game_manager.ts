import { RENDER_SETTINGS } from 'src/app/render_settings';
import { Grid, bfs } from 'src/app/grid';
import { Point, pointFromSerialized } from 'src/app/math/point';
import { Obstacle } from 'src/app/obstacle';
import { MatchType } from 'src/app/match_type';
import { CONTROLS, ControlMap, EventType, Key, numberToKey, numberToOrdinal } from 'src/app/controls';
import { THEME } from 'src/app/theme';
import { Flag } from 'src/app/flag';
import { LEVELS } from 'src/app/level';
import { GameSettings, DEFAULT_GAME_SETTINGS } from 'src/app/game_settings';
import { Character, ShotInfo } from 'src/app/character';
import { Hud, TextType, Duration } from 'src/app/hud';
import { Ray, LineSegment, detectRayLineSegmentCollision } from 'src/app/math/collision_detection';
import { Projectile } from 'src/app/projectile';


enum GamePhase {
    // Setup.
    CHARACTER_PLACEMENT,
    // Main game.
    COMBAT,
}

enum ActionType {
    PLACE_CHARACTER,
    MOVE_CHARACTER,
    SHOOT,
    END_CHARACTER_TURN,
}

interface PlaceCharacterAction {
    readonly type: ActionType.PLACE_CHARACTER;
    readonly tileCoords: Point;
}

interface MoveCharacterAction {
    readonly type: ActionType.MOVE_CHARACTER;
    readonly character: Character;
    readonly tileCoords: Point;
}

interface EndCharacterTurnAction {
    readonly type: ActionType.END_CHARACTER_TURN;
    readonly character: Character;
}

interface ShootAction {
    readonly type: ActionType.SHOOT;
    readonly firingCharacter: Character;
}

type Action = PlaceCharacterAction | MoveCharacterAction |
    EndCharacterTurnAction | ShootAction;

/** Used for exhaustive Action checking. */
function throwBadAction(action: never): never {
    throw new Error('Action not handled');
}

enum SelectedCharacterState {
    AWAITING,
    MOVING,
    AIMING,
    // TODO - add other character actions.
}

const MOVE_KEY = Key.M;
/** Used to start and cancel shooting, but doesn't fire the shot.  */
const TOGGLE_AIM_KEY = Key.A;
const AIM_COUNTERCLOCKWISE_KEY = Key.S;
const AIM_CLOCKWISE_KEY = Key.D;
const SHOOT_KEY = Key.F;
const END_TURN_KEY = Key.E;

export class GameManager {

    private readonly canvas: HTMLCanvasElement;
    private readonly context: CanvasRenderingContext2D;
    private readonly levelIndex: number;
    private readonly matchType: MatchType;
    private readonly onExitGameCallback: () => void;

    private gameSettings: GameSettings;
    private obstacles: Obstacle[];
    private redFlag: Flag;
    private blueFlag: Flag;
    private hud: Hud;

    private blueSquad: Character[];
    private redSquad: Character[];
    private gamePhase: GamePhase;
    private isBlueTurn: boolean;

    private controlMap: ControlMap;
    private selectableTiles: Point[];
    private selectedCharacter?: Character;
    private selectedCharacterState?: SelectedCharacterState;

    private projectile?: Projectile;
    private projectileTargetTile?: Point;

    constructor(
        canvas: HTMLCanvasElement,
        context: CanvasRenderingContext2D,
        params: {
            matchType: MatchType;
            levelIndex: number;
            onExitGameCallback: () => void;
        }) {

        this.canvas = canvas;
        this.context = context;
        this.matchType = params.matchType;
        this.levelIndex = params.levelIndex;
        this.onExitGameCallback = params.onExitGameCallback;
        this.resetGame();
    }

    update(elapsedMs: number): void {
        if (this.projectile != null) {
            this.updateProjectile(elapsedMs);
            return;
        }

        this.controlMap.check();
        if (this.gamePhase === GamePhase.CHARACTER_PLACEMENT && CONTROLS.hasClick()) {
            const mouseTileCoords = Grid.getTileFromCanvasCoords(CONTROLS.handleClick());
            this.tryPlacingCharacter(mouseTileCoords);
        } else if (this.gamePhase === GamePhase.COMBAT && CONTROLS.hasClick()) {
            const mouseTileCoords = Grid.getTileFromCanvasCoords(CONTROLS.handleClick());
            switch (this.selectedCharacterState) {
                case SelectedCharacterState.AWAITING:
                    this.trySelectingCharacter(mouseTileCoords);
                    break;
                case (SelectedCharacterState.MOVING):
                    this.tryMovingSelectedCharacter(mouseTileCoords);
                    break;
            }
        }
        this.hud.update(elapsedMs);
    }

    private updateProjectile(elapsedMs: number): void {
        if (this.projectile == null) {
            throw new Error(`Projectile is null in updateProjectile`);
        }
        this.projectile.update(elapsedMs);
        if (this.projectile.distance < this.projectile.maxDistance) {
            return;
        }
        if (this.projectileTargetTile != null) {
            const targetCharacter = this.redSquad.concat(this.blueSquad)
                .find((character) => character.tileCoords.equals(this.projectileTargetTile!));
            if (targetCharacter) {
                // Assumes friendly fire check occurred in 'fire'.
                targetCharacter.health -= this.projectile.damage;
            }
        }
        // TODO - ricochet
        if (this.selectedCharacter!.isTurnOver()) {
            this.onCharacterTurnOver();
        } else {
            this.setSelectedCharacterState(SelectedCharacterState.AWAITING);
        }
        this.projectile = undefined;
    }

    render(): void {
        const context = this.context;
        context.fillStyle = THEME.gridBackgroundColor;
        context.clearRect(0, 0, RENDER_SETTINGS.canvasWidth, RENDER_SETTINGS.canvasHeight);
        context.fillRect(0, 0, RENDER_SETTINGS.canvasWidth, RENDER_SETTINGS.canvasHeight);

        if (this.selectableTiles != null && this.selectableTiles.length) {
            for (const availableTile of this.selectableTiles) {
                const tileCanvasTopLeft = Grid.getCanvasFromTileCoords(availableTile);
                context.fillStyle = THEME.availableForMovementColor;
                context.fillRect(tileCanvasTopLeft.x, tileCanvasTopLeft.y, Grid.TILE_SIZE, Grid.TILE_SIZE);
            }
            // Indicate hovered tile.
            const mouseTileCoords = Grid.getTileFromCanvasCoords(CONTROLS.getMouseCanvasCoords());
            if (this.selectableTiles.find((tile) => tile.equals(mouseTileCoords))) {
                const tileCanvasTopLeft = Grid.getCanvasFromTileCoords(mouseTileCoords);
                context.fillStyle = THEME.emptyCellHoverColor;
                context.fillRect(tileCanvasTopLeft.x, tileCanvasTopLeft.y, Grid.TILE_SIZE, Grid.TILE_SIZE);
            }
        }
        for (const obstacle of this.obstacles) {
            obstacle.render(context);
        }
        this.redFlag.render(this.context);
        this.blueFlag.render(this.context);
        const remainingCharacters =
            this.blueSquad
                .concat(this.redSquad)
                .filter((character) => character.isAlive());
        for (const character of remainingCharacters) {
            character.render(this.context);
        }
        if (this.selectedCharacter != null) {
            const tileCanvasTopLeft = Grid.getCanvasFromTileCoords(this.selectedCharacter.tileCoords);
            context.strokeStyle = THEME.selectedCharacterOutlineColor;
            context.lineWidth = 2;
            context.strokeRect(tileCanvasTopLeft.x, tileCanvasTopLeft.y, Grid.TILE_SIZE, Grid.TILE_SIZE);
        }
        if (this.projectile != null) {
            this.projectile.render();
        }
        this.hud.render();
    }

    destroy(): void {
        if (this.controlMap) {
            this.controlMap.clear();
        }
    }

    onAction(action: Action): void {
        const squad = this.isBlueTurn ? this.blueSquad : this.redSquad;
        switch (action.type) {
            case ActionType.PLACE_CHARACTER:
                if (this.gamePhase !== GamePhase.CHARACTER_PLACEMENT) {
                    throw new Error(
                        `PLACE_CHARACTER action only allowed in character placement phase`);
                }
                if (!this.selectableTiles
                    .find((tile) => tile.equals(action.tileCoords))) {

                    throw new Error(
                        `Invalid character placement location: ${action.tileCoords.toString()}`);
                }
                const squadIndex = squad.length;
                squad.push(new Character({
                    startCoords: action.tileCoords,
                    isBlueTeam: this.isBlueTurn,
                    index: squadIndex,
                }));
                if (squad.length === this.gameSettings.squadSize) {
                    // Placed all characters, end turn.
                    this.nextTurn();
                } else {
                    this.selectableTiles = this.selectableTiles
                        .filter((availableTile) => !availableTile.equals(action.tileCoords));
                }
                break;
            case ActionType.MOVE_CHARACTER:
                if (this.gamePhase !== GamePhase.COMBAT) {
                    throw new Error(
                        `MOVE_CHARACTER action only allowed in combat phase`);
                }
                if (!this.selectableTiles
                    .find((tile) => tile.equals(action.tileCoords))) {

                    throw new Error(
                        `Invalid character movement location: ${action.tileCoords.toString()}`);
                }
                const manhattandDistanceAway = action.character.tileCoords.manhattanDistanceTo(action.tileCoords);
                if (manhattandDistanceAway > action.character.settings.maxMovesPerTurn) {
                    throw new Error(`Invalid character movement location (too far): ` +
                        `start: ${action.character.tileCoords.toString()}, end: ${action.tileCoords.toString()}`)
                }
                action.character.moveTo(action.tileCoords);
                if (action.character.isTurnOver()) {
                    this.onCharacterTurnOver();
                } else {
                    this.setSelectedCharacterState(SelectedCharacterState.AWAITING);
                }
                break;
            case ActionType.SHOOT:
                if (this.selectedCharacter == null || action.firingCharacter !== this.selectedCharacter) {
                    throw new Error(`Selected character is null or is not firing character on FIRE action`);
                }
                const shotInfo = this.selectedCharacter.shoot();
                this.fireShot(shotInfo);
                // Next turn logic runs when projectile dies.
                break;
            case ActionType.END_CHARACTER_TURN:
                action.character.setTurnOver();
                this.onCharacterTurnOver();
                break;
            default:
                throwBadAction(action);
        }
    }

    /** Checks if there's another squad member still active, or advances turn if not. */
    private onCharacterTurnOver(): void {
        const squad = this.isBlueTurn ? this.blueSquad : this.redSquad;
        const activeSquadMember = squad.find((character: Character) => {
            return !character.isTurnOver() && character.isAlive();
        });
        if (activeSquadMember) {
            this.setSelectedCharacter(activeSquadMember.index);
        } else {
            this.nextTurn();
        }
    }

    private nextTurn(): void {
        if (this.gamePhase === GamePhase.CHARACTER_PLACEMENT) {
            if (this.isBlueTurn) {
                this.isBlueTurn = false;
                this.selectableTiles = this.getAvailableTilesForCharacterPlacement();
                this.hud.setText('Red team turn', TextType.TITLE, Duration.LONG);
                this.hud.setText(
                    `Place squad members (${this.gameSettings.squadSize} remaining)`,
                    TextType.SUBTITLE,
                    Duration.LONG);
            } else {
                this.gamePhase = GamePhase.COMBAT;
                this.advanceToNextCombatTurn();
            }
            return;
        }
        this.advanceToNextCombatTurn();
    }

    private advanceToNextCombatTurn(): void {
        this.isBlueTurn = !this.isBlueTurn;
        const squad = this.isBlueTurn ? this.blueSquad : this.redSquad;
        for (const character of squad) {
            character.resetTurnState();
        }
        const teamName = this.isBlueTurn ? `Blue` : `Red`;
        this.setSelectedCharacter(this.getFirstCharacterIndex());
        this.hud.setText(`${teamName} team turn`, TextType.TITLE, Duration.LONG);
        this.hud.setText(
            `Move squad members`,
            TextType.SUBTITLE,
            Duration.LONG);
    }

    // TODO - this is a monster method.
    private fireShot(shotInfo: ShotInfo): void {
        const ray = new Ray(
            Grid.getCanvasFromTileCoords(shotInfo.fromTileCoords).add(Grid.HALF_TILE),
            new Point(
                Math.cos(shotInfo.aimAngleRadiansClockwise),
                Math.sin(shotInfo.aimAngleRadiansClockwise)));

        // Find which game border the ray intersects.
        const topLeftCanvas = new Point(0, 0);
        const topRightCanvas = topLeftCanvas.add(new Point(RENDER_SETTINGS.canvasWidth, 0));
        const bottomLeftCanvas = topLeftCanvas.add(new Point(0, RENDER_SETTINGS.canvasHeight));
        const bottomRightCanvas = topRightCanvas.add(bottomLeftCanvas);
        const leftBorderSegment = new LineSegment(topLeftCanvas, bottomLeftCanvas);
        const topBorderSegment = new LineSegment(topLeftCanvas, topRightCanvas);
        const rightBorderSegment = new LineSegment(topRightCanvas, bottomRightCanvas);
        const bottomBorderSegment = new LineSegment(bottomLeftCanvas, bottomRightCanvas);
        const borders = [leftBorderSegment, topBorderSegment, rightBorderSegment, bottomBorderSegment];
        let gridBorderCollisionPt: Point | null = null;
        for (const border of borders) {
            const collisionResult = detectRayLineSegmentCollision(ray, border);
            if (collisionResult.isCollision) {
                gridBorderCollisionPt = collisionResult.collisionPt!;
                break;
            }
        }
        if (gridBorderCollisionPt == null) {
            throw new Error(`Shot ray does not intersect with any Grid`);
        }

        const maxProjectileDistance = ray.startPt.distanceTo(gridBorderCollisionPt);
        const stepSize = 3 * Grid.TILE_SIZE / 4;
        let curDistance = stepSize;
        const checkedTilesStringSet: Set<string> = new Set([ray.startPt.toString()]);
        let closestCollisionPt: Point | null = null;
        let closestCollisionTile: Point | null = null;
        let closestCollisionDistance = maxProjectileDistance;
        while (curDistance < maxProjectileDistance) {
            const curTile = Grid.getTileFromCanvasCoords(ray.pointAtDistance(curDistance));
            const tilesToCheck =
                [curTile]
                    .concat(Grid.getAdjacentTiles(curTile))
                    .filter((tile: Point) => !checkedTilesStringSet.has(tile.toString()));

            for (const tile of tilesToCheck) {
                checkedTilesStringSet.add(tile.toString());
                if (!this.isTileOccupied(tile)) {
                    continue;
                }
                // Either an obstacle or player in tile.
                const obstacle = this.obstacles.find((obstacle) => obstacle.tileCoords.equals(tile));
                if (obstacle) {
                    for (const edge of obstacle.getEdges()) {
                        const collisionResult = detectRayLineSegmentCollision(ray, edge);
                        if (collisionResult.isCollision) {
                            const distance = ray.startPt.distanceTo(collisionResult.collisionPt!);
                            if (distance < closestCollisionDistance) {
                                closestCollisionDistance = distance;
                                closestCollisionTile = tile;
                                closestCollisionPt = collisionResult.collisionPt!;
                            }
                        }
                    }
                } else {
                    const character = this.redSquad.concat(this.blueSquad)
                        .filter((character) => character.isAlive())
                        .find((character) => character.tileCoords.equals(tile));
                    if (!character) {
                        throw new Error(`Tile is occupied but no obstacle or character...`);
                    }
                    if (character.isBlueTeam === shotInfo.isShotFromBlueTeam) {
                        // TODO - allow friendly fire?
                        continue;
                    }
                    // Approximate with bounding box for now.
                    for (const edge of character.getEdges()) {
                        const collisionResult = detectRayLineSegmentCollision(ray, edge);
                        if (collisionResult.isCollision) {
                            const distance = ray.startPt.distanceTo(collisionResult.collisionPt!);
                            if (distance < closestCollisionDistance) {
                                closestCollisionDistance = distance;
                                closestCollisionTile = tile;
                                closestCollisionPt = collisionResult.collisionPt!;
                            }
                        }
                    }
                }
            }
            if (closestCollisionPt != null) {
                break;
            }
            curDistance += stepSize;
        }

        if (closestCollisionTile != null) {
            this.projectileTargetTile = closestCollisionTile;
        }
        this.projectile = new Projectile({
            context: this.context,
            ray,
            maxDistance: closestCollisionDistance,
            damage: shotInfo.damage,
        });
    }

    private tryPlacingCharacter(tileCoords: Point): void {
        if (!this.selectableTiles.find((tile) => tile.equals(tileCoords))) {
            this.hud.setText(`Can't place character here`, TextType.TOAST, Duration.SHORT);
            return;
        }

        const placeCharacterAction: PlaceCharacterAction = {
            type: ActionType.PLACE_CHARACTER,
            tileCoords,
        };
        this.onAction(placeCharacterAction);
    }

    private tryMovingSelectedCharacter(tileCoords: Point): void {
        if (!this.selectableTiles.find((tile) => tile.equals(tileCoords))) {
            this.hud.setText(`Can't move character here`, TextType.TOAST, Duration.SHORT);
            return;
        }

        const moveCharacterAction: MoveCharacterAction = {
            type: ActionType.MOVE_CHARACTER,
            character: this.selectedCharacter!,
            tileCoords,
        };
        this.onAction(moveCharacterAction);
    }

    private trySelectingCharacter(tileCoords: Point): void {
        const squad = this.isBlueTurn ? this.blueSquad : this.redSquad;
        const squadMemeberAtTile =
            squad.find((character) => character.tileCoords.equals(tileCoords));
        if (squadMemeberAtTile) {
            this.setSelectedCharacter(squadMemeberAtTile.index);
        }
    }

    private getAvailableTilesForCharacterPlacement(): Point[] {
        const flagCoords = this.isBlueTurn ? this.blueFlag.tileCoords : this.redFlag.tileCoords;
        const maxDistFromFlag = this.gameSettings.maxSpawnDistanceFromFlag;
        const availableTiles = bfs({
            startTile: flagCoords,
            maxDepth: maxDistFromFlag,
            isAvailable: (tile: Point): boolean => {
                return !this.isTileOccupied(tile) && !tile.equals(flagCoords);
            },
            canGoThrough: (tile: Point): boolean => {
                // Can go through other players, just not obstacles.
                return this.obstacles.find(
                    (obstacle: Obstacle) => obstacle.tileCoords.equals(tile)) == null;
            },
        });
        return availableTiles;
    }

    private getAvailableTilesForCharacterMovement(): Point[] {
        if (this.selectedCharacter == null) {
            throw new Error(`No character selected in getAvailableTilesForCharacterMovement`);
        }
        const ownFlagCoords = this.isBlueTurn ? this.blueFlag.tileCoords : this.redFlag.tileCoords;
        const currentCoords = this.selectedCharacter.tileCoords;
        const maxMoves = this.selectedCharacter.settings.maxMovesPerTurn;
        const isAvailable = (tile: Point): boolean => {
            return !this.isTileOccupied(tile)
                && (!tile.equals(ownFlagCoords) || this.selectedCharacter!.hasFlag);
        };
        const canGoThrough = (tile: Point): boolean => {
            // Characters can go through tiles occupied by squad members.
            // but they can't stop there.
            const squad = this.isBlueTurn ? this.blueSquad : this.redSquad;
            const isSquadMemberAtTile = squad.find((squadMember: Character) => {
                return squadMember.tileCoords.equals(tile) && squadMember !== this.selectedCharacter;
            }) != null;
            return isAvailable(tile) || isSquadMemberAtTile;
        };
        const availableTiles = bfs({
            startTile: currentCoords,
            maxDepth: maxMoves,
            isAvailable,
            canGoThrough,
        });
        return availableTiles;
    }

    private setSelectedCharacter(index: number): void {
        const squad = this.isBlueTurn ? this.blueSquad : this.redSquad;
        const character = squad[index];
        if (character.isTurnOver()) {
            this.hud.setText(
                `Unit ${index + 1}'s turn is over.`, TextType.TOAST, Duration.SHORT);
            return;
        }
        this.selectedCharacter = character;
        this.setSelectedCharacterState(SelectedCharacterState.AWAITING);
    }

    private setSelectedCharacterState(state: SelectedCharacterState) {
        if (this.selectedCharacter == null) {
            throw new Error(
                `There needs to be a selected character before calling setSelectedCharacterState`);
        }
        this.selectedCharacterState = state;
        this.controlMap.clear();
        this.addDefaultControls();
        this.addSwitchSquadMemberControls();

        this.controlMap.add({
            key: END_TURN_KEY,
            name: 'End character turn',
            func: () => {
                if (this.selectedCharacter == null) {
                    throw new Error(
                        `There's no selected character when ending turn.`);
                }
                const action: EndCharacterTurnAction = {
                    type: ActionType.END_CHARACTER_TURN,
                    character: this.selectedCharacter,
                };
                this.onAction(action);
            },
            eventType: EventType.KeyPress,
        });

        switch (state) {
            case SelectedCharacterState.AWAITING:
                this.selectableTiles = [];
                if (!this.selectedCharacter.hasMoved) {
                    this.controlMap.add({
                        key: MOVE_KEY,
                        name: 'Move',
                        func: () => {
                            this.setSelectedCharacterState(SelectedCharacterState.MOVING);
                        },
                        eventType: EventType.KeyPress,
                    });
                }
                if (this.selectedCharacter.canShoot()) {
                    this.controlMap.add({
                        key: TOGGLE_AIM_KEY,
                        name: 'Aim',
                        func: () => {
                            this.setSelectedCharacterState(SelectedCharacterState.AIMING);
                        },
                        eventType: EventType.KeyPress,
                    });
                }
                break;
            case SelectedCharacterState.MOVING:
                this.selectableTiles = this.getAvailableTilesForCharacterMovement();
                this.controlMap.add({
                    key: MOVE_KEY,
                    name: 'Cancel Move',
                    func: () => {
                        this.setSelectedCharacterState(SelectedCharacterState.AWAITING);
                    },
                    eventType: EventType.KeyPress,
                });
                break;
            case SelectedCharacterState.AIMING:
                this.selectedCharacter.startAiming();
                this.controlMap.add({
                    key: TOGGLE_AIM_KEY,
                    name: 'Stop Aiming',
                    func: () => {
                        if (this.selectedCharacter == null) {
                            throw new Error(
                                `There's no selected character when canceling shooting.`);
                        }
                        this.selectedCharacter.cancelAiming();
                        this.setSelectedCharacterState(SelectedCharacterState.AWAITING);
                    },
                    eventType: EventType.KeyPress,
                });
                this.controlMap.add({
                    key: AIM_COUNTERCLOCKWISE_KEY,
                    name: 'Aim counterclockwise',
                    func: () => {
                        if (this.selectedCharacter == null) {
                            throw new Error(
                                `There's no selected character when aiming CCW.`);
                        }
                        this.selectedCharacter.aimCounterClockwise();
                    },
                    eventType: EventType.KeyDown,
                });
                this.controlMap.add({
                    key: AIM_CLOCKWISE_KEY,
                    name: 'Aim clockwise',
                    func: () => {
                        if (this.selectedCharacter == null) {
                            throw new Error(
                                `There's no selected character when aiming CC.`);
                        }
                        this.selectedCharacter.aimClockwise();
                    },
                    eventType: EventType.KeyDown,
                });
                this.controlMap.add({
                    key: SHOOT_KEY,
                    name: 'Fire',
                    func: () => {
                        if (this.selectedCharacter == null) {
                            throw new Error(
                                `There's no selected character when canceling shooting.`);
                        }
                        const fireAction: ShootAction = {
                            type: ActionType.SHOOT,
                            firingCharacter: this.selectedCharacter,
                        };
                        this.onAction(fireAction);
                        this.setSelectedCharacterState(SelectedCharacterState.AWAITING);
                    },
                    eventType: EventType.KeyPress,
                });
                break;
            default:
                throw new Error(`Unknown selected character state`);
        }
    }

    /** 
     * Whether a tile contains an obstacle or character. 
     * Tiles with flags are NOT considered occupied. 
     */
    private isTileOccupied(tileCoords: Point): boolean {
        const potentialObstacle = this.obstacles.find(
            (obstacle: Obstacle) => obstacle.tileCoords.equals(tileCoords));
        const potentialCharacter =
            this.blueSquad
                .concat(this.redSquad)
                .find(
                (character) => {
                    return character.isAlive() && character.tileCoords.equals(tileCoords);
                });
        return potentialObstacle != null || potentialCharacter != null;
    }

    private resetGame = (): void => {
        this.destroy();
        this.loadLevel();
        this.gameSettings = DEFAULT_GAME_SETTINGS;
        this.gamePhase = GamePhase.CHARACTER_PLACEMENT;
        this.blueSquad = [];
        this.redSquad = [];
        // Blue is always assumed to go first...
        this.isBlueTurn = true;
        this.selectableTiles = this.getAvailableTilesForCharacterPlacement();
        this.controlMap = new ControlMap();
        this.addDefaultControls();
        this.hud = new Hud(this.context);
        this.hud.setControlMap(this.controlMap);
        this.hud.setText('Blue team turn', TextType.TITLE, Duration.LONG);
        this.hud.setText(
            `Place squad members (${this.gameSettings.squadSize} remaining)`,
            TextType.SUBTITLE,
            Duration.LONG);
    }

    private loadLevel(): void {
        const level = LEVELS[this.levelIndex];
        this.redFlag = new Flag({
            tileCoords: pointFromSerialized(level.data.redFlag),
            isBlue: false,
        });
        this.blueFlag = new Flag({
            tileCoords: pointFromSerialized(level.data.blueFlag),
            isBlue: true,
        });
        this.obstacles = level.data.obstacles.map((serializedPt) => {
            return new Obstacle(pointFromSerialized(serializedPt));
        });
    }

    private addDefaultControls(): void {
        this.controlMap.add({
            key: Key.Q,
            name: 'Quit',
            func: this.onExitGameCallback,
            eventType: EventType.KeyPress,
        });
        this.controlMap.add({
            key: Key.R,
            name: 'Reset',
            func: this.resetGame,
            eventType: EventType.KeyPress,
        });
        this.controlMap.add({
            key: Key.QUESTION_MARK,
            name: 'Show/Hide controls',
            func: () => { this.hud.toggleShowControlMap(); },
            eventType: EventType.KeyPress,
        });
    }

    private addSwitchSquadMemberControls(): void {
        const squad = this.isBlueTurn ? this.blueSquad : this.redSquad;
        for (const character of squad) {
            // Use 1-based numbers for UI.
            const characterNumber = character.index + 1;
            const key = numberToKey.get(characterNumber);
            if (key == null) {
                throw new Error(`Not enough keys for all character numbers!`);
            }
            this.controlMap.add({
                key,
                name: `Select ${numberToOrdinal.get(characterNumber)} character`,
                func: () => { this.setSelectedCharacter(character.index); },
                eventType: EventType.KeyPress,
            });
        }
    }

    private getFirstCharacterIndex(): number {
        const squad = this.isBlueTurn ? this.blueSquad : this.redSquad;
        for (let index = 0; index < squad.length; index++) {
            if (squad[index].isAlive()) {
                return index;
            }
        }
        throw new Error(`No more characters alive - should be game over?`);
    }
}
