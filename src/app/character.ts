import { Point } from 'src/app/math/point';
import { Grid } from 'src/app/grid';
import { THEME } from 'src/app/theme';
import { LineSegment } from 'src/app/math/collision_detection';
import { ShotInfo, ProjectileDetailsType } from 'src/app/shot_info';
import { ActionType } from 'src/app/actions';
import { CharacterAbility, CharacterSettings, CharacterAbilityState, ThrowGrenadeAbility, ClassType } from 'src/app/character_settings';

const TWO_PI = Math.PI * 2;

const AIM_ANGLE_RADIANS_DELTA = Math.PI / 32;
const CHARACTER_CIRCLE_RADIUS = Grid.TILE_SIZE / 4;

interface AnimationState {
    movementSpeedMs: number;
    isAnimating: boolean;
    currentCoords: Point;
    targetCoords?: Point;
    remainingTargetCoords: Point[];
}

/** Represents one squad member on a team. */
export class Character {
    readonly isBlueTeam: boolean;
    readonly settings: CharacterSettings;
    readonly index: number;

    // Turn-state.
    hasMoved: boolean;
    hasShot: boolean;
    extraAbilities: CharacterAbility[];
    isFinishedWithTurn: boolean;

    private isAiming: boolean;
    private aimAngleRadiansClockwise: number;

    // Game-state.
    hasFlag: boolean;
    health: number;
    tileCoords: Point;
    characterActionTypeToAbilityState: Map<ActionType, CharacterAbilityState>;
    animationState: AnimationState;

    constructor(params: { startCoords: Point; isBlueTeam: boolean; index: number; settings: CharacterSettings; }) {
        this.tileCoords = params.startCoords;
        this.animationState = {
            movementSpeedMs: Grid.TILE_SIZE * .005,
            isAnimating: false,
            remainingTargetCoords: [],
            currentCoords: Grid.getCanvasFromTileCoords(this.tileCoords).add(Grid.HALF_TILE),
        }
        this.isBlueTeam = params.isBlueTeam;
        this.index = params.index;

        this.settings = params.settings;

        this.health = this.settings.maxHealth;
        this.hasFlag = false;
        this.hasMoved = false;
        this.characterActionTypeToAbilityState = new Map();
        for (const extraAction of this.settings.extraActions) {
            const actionState: CharacterAbilityState = {
                cooldownTurnsLeft: 0,
            };
            if (extraAction.maxUses !== 0) {
                actionState.usesLeft = extraAction.maxUses;
            }
            this.characterActionTypeToAbilityState.set(extraAction.actionType, actionState);
        }
        this.isAiming = false;
        this.aimAngleRadiansClockwise = 0;

        this.resetTurnState();
    }

    render(context: CanvasRenderingContext2D): void {
        const tileTopLeftCanvas = this.animationState.currentCoords.subtract(Grid.HALF_TILE);
        const tileCenterCanvas = this.animationState.currentCoords;

        context.fillStyle = this.getCharacterColor();
        context.beginPath();
        context.arc(
            tileCenterCanvas.x,
            tileCenterCanvas.y,
            CHARACTER_CIRCLE_RADIUS,
            0,
            TWO_PI);
        context.closePath();
        context.fill();

        // Character number.
        const tileBottomLeftCanvas = tileTopLeftCanvas.add(new Point(0, Grid.TILE_SIZE));
        const text = `${this.index + 1}`;
        context.fillStyle = THEME.textColor;
        const fontSize = 12;
        const margins = new Point(Grid.TILE_SIZE / 12, Grid.TILE_SIZE / 12);
        context.font = `${fontSize}px fantasy`;
        context.fillText(
            text,
            tileBottomLeftCanvas.x + margins.x,
            tileBottomLeftCanvas.y - margins.y);

        // Draws bounding box.
        // for (const edge of this.getEdges()) {
        //     context.beginPath();
        //     context.moveTo(edge.startPt.x, edge.startPt.y);
        //     context.lineTo(edge.endPt.x, edge.endPt.y);
        //     context.closePath();
        //     context.stroke();
        // }

        // Health bar.
        const healthBarHeight = Grid.TILE_SIZE / 10;
        const healthBarWidth = 2 * CHARACTER_CIRCLE_RADIUS + healthBarHeight;
        const fractionHealthLeft = this.health / this.settings.maxHealth;
        const healthBarTopLeft = tileCenterCanvas
            .add(new Point(
                -healthBarWidth / 2,
                -CHARACTER_CIRCLE_RADIUS - healthBarHeight * 2));
        const remainingHealthWidth = healthBarWidth * fractionHealthLeft;
        context.fillStyle = THEME.remainingHealthBarColor;
        context.fillRect(healthBarTopLeft.x, healthBarTopLeft.y, remainingHealthWidth, healthBarHeight);
        if (this.health !== this.settings.maxHealth) {
            context.fillStyle = THEME.lostHealthBarColor;
            context.fillRect(
                healthBarTopLeft.x + remainingHealthWidth,
                healthBarTopLeft.y,
                healthBarWidth - remainingHealthWidth,
                healthBarHeight);
        }

        // Class Symbol.
        switch (this.settings.type) {
            case ClassType.SCOUT:
                // Boots.
                const ankleWidth = CHARACTER_CIRCLE_RADIUS * .75;
                const ankleHeight = CHARACTER_CIRCLE_RADIUS * .75;
                const toeWidth = CHARACTER_CIRCLE_RADIUS * .75;
                const toeHeight = ankleHeight / 2;
                const topLeftBoot = tileCenterCanvas.add(new Point(-ankleWidth, -ankleHeight / 2));
                context.fillStyle = '#804526';
                context.fillRect(
                    topLeftBoot.x, topLeftBoot.y,
                    ankleWidth, ankleHeight);
                context.fillRect(
                    tileCenterCanvas.x,
                    tileCenterCanvas.y,
                    toeWidth, toeHeight);
                break;

            case ClassType.ASSAULT:
                // Up-arrows.
                context.fillStyle = '#e8d100';
                const arrowWidth = CHARACTER_CIRCLE_RADIUS * .6;
                const arrowHeight = CHARACTER_CIRCLE_RADIUS * .4;
                const drawPathFrom = (start: Point) => {
                    context.beginPath();
                    context.moveTo(start.x, start.y);
                    const offsets: Point[] = [
                        new Point(0, -arrowHeight / 2),
                        new Point(arrowWidth / 2, -arrowHeight),
                        new Point(arrowWidth, -arrowHeight / 2),
                        new Point(arrowWidth, 0),
                        new Point(arrowWidth / 2, -arrowHeight / 2),
                    ];
                    for (const offset of offsets) {
                        const pt = start.add(offset);
                        context.lineTo(pt.x, pt.y);
                    }
                    context.closePath();
                    context.fill();
                };
                const topArrowStart = tileCenterCanvas.add(new Point(-arrowWidth / 2, 0));
                const bottomArrowStart = topArrowStart.add(new Point(0, arrowHeight * 1.5));
                drawPathFrom(topArrowStart);
                drawPathFrom(bottomArrowStart);
                break;

            case ClassType.SNIPER:
                // Crosshair.
                context.strokeStyle = '#1d1570';
                context.fillStyle = '#1d1570';

                // Plus.
                const radius = CHARACTER_CIRCLE_RADIUS * .7;
                const width = radius * 2;
                const height = CHARACTER_CIRCLE_RADIUS * .2;
                const horizontalTopLeft = tileCenterCanvas.add(new Point(-width / 2, -height / 2));
                context.fillRect(
                    horizontalTopLeft.x, horizontalTopLeft.y,
                    width, height);
                const verticalTopLeft = tileCenterCanvas.add(new Point(-height / 2, -width / 2));
                context.fillRect(
                    verticalTopLeft.x, verticalTopLeft.y,
                    height, width);

                // Circle.
                context.beginPath();
                context.arc(tileCenterCanvas.x, tileCenterCanvas.y, radius, 0, TWO_PI);
                context.closePath();
                context.stroke();
                break;

            case ClassType.DEMOLITION:

                // Draw flame.
                const flameWidth = CHARACTER_CIRCLE_RADIUS * .75;
                const flameHeight = CHARACTER_CIRCLE_RADIUS * .85;
                const drawFlameFrom = (start: Point) => {
                    context.beginPath();
                    context.moveTo(start.x, start.y);
                    const offsets: Point[] = [
                        new Point(flameWidth / 4, -flameHeight / 4),
                        new Point(flameWidth / 2, -flameHeight / 2),
                        new Point(flameWidth, -flameHeight / 4),
                        new Point(flameWidth, 0),
                        new Point(3 * flameWidth / 4, flameHeight / 2),
                        new Point(flameWidth / 4, flameHeight / 2),
                    ];
                    for (const offset of offsets) {
                        const pt = start.add(offset);
                        context.lineTo(pt.x, pt.y);
                    }
                    context.closePath();
                    context.fill();
                };
                const flameStart = tileCenterCanvas.add(new Point(-flameWidth / 2, 0));
                const gradient = context.createLinearGradient(
                    flameStart.x, flameStart.y - flameHeight,
                    flameStart.x + flameWidth, flameStart.y);
                const fullColor = '#f74d40';
                const fadedColor = `#e8ba3c`;
                gradient.addColorStop(0, fullColor);
                gradient.addColorStop(1, fadedColor);
                context.fillStyle = gradient;
                drawFlameFrom(flameStart);
                break;
        }

        // Aim indicator.
        if (!this.isAiming) {
            return;
        }
        const aimLength = this.settings.gun.aimIndicatorLength;
        const aimIndicatorEnd =
            tileCenterCanvas
                .add(new Point(
                    Math.cos(this.aimAngleRadiansClockwise),
                    Math.sin(this.aimAngleRadiansClockwise))
                    .multiplyScaler(aimLength));
        context.beginPath();
        context.moveTo(tileCenterCanvas.x, tileCenterCanvas.y);
        context.lineTo(aimIndicatorEnd.x, aimIndicatorEnd.y);
        context.closePath();
        context.stroke();
    }

    moveTo(tileCoords: Point, path: Point[]): void {
        if (this.isFinishedWithTurn || this.hasMoved) {
            throw new Error(`Already moved.`);
        }
        this.animationState.currentCoords = Grid.getCanvasFromTileCoords(this.tileCoords).add(Grid.HALF_TILE);
        this.tileCoords = tileCoords;
        this.animationState.targetCoords = Grid.getCanvasFromTileCoords(path.shift()!).add(Grid.HALF_TILE);
        this.animationState.remainingTargetCoords = path;
        this.animationState.isAnimating = true;
        this.hasMoved = true;
        this.checkAndSetTurnOver();
    }

    // TODO - extract common animation state logic.
    update(elapsedMs: number): void {
        if (!this.animationState.isAnimating || this.animationState.targetCoords == null) {
            return;
        }
        const direction = this.animationState.targetCoords.subtract(this.animationState.currentCoords).normalize();
        this.animationState.currentCoords = this.animationState.currentCoords.add(direction.multiplyScaler(this.animationState.movementSpeedMs * elapsedMs));

        const distanceAway = this.animationState.currentCoords.distanceTo(this.animationState.targetCoords);
        if (distanceAway > Grid.TILE_SIZE * .1) {
            return;
        }
        if (this.animationState.remainingTargetCoords.length === 0) {
            this.animationState.currentCoords = Grid.getCanvasFromTileCoords(this.tileCoords).add(Grid.HALF_TILE);
            this.animationState.isAnimating = false;
            return;
        }
        this.animationState.targetCoords = Grid.getCanvasFromTileCoords(this.animationState.remainingTargetCoords.shift()!).add(Grid.HALF_TILE);
    }

    isAlive(): boolean {
        return this.health > 0;
    }

    startAiming(): void {
        if (!this.canShoot()) {
            throw new Error(`Already shot or used non-free action.`);
        }
        this.isAiming = true;
    }

    cancelAiming(): void {
        this.isAiming = false;
    }

    aimCounterClockwise(): void {
        this.aimAngleRadiansClockwise -= AIM_ANGLE_RADIANS_DELTA;
    }

    aimClockwise(): void {
        this.aimAngleRadiansClockwise += AIM_ANGLE_RADIANS_DELTA;
    }

    shoot(): ShotInfo[] {
        if (!this.canShoot()) {
            throw new Error(`Already shot or used non - free action.`);
        }
        this.isAiming = false;
        this.hasShot = true;
        this.extraAbilities = this.extraAbilities.filter((ability: CharacterAbility) => {
            return ability.isFree;
        });
        this.checkAndSetTurnOver();
        const straightShotInfo: ShotInfo = {
            isShotFromBlueTeam: this.isBlueTeam,
            fromTileCoords: this.tileCoords,
            // Shoot from center of tile.
            fromCanvasCoords: Grid.getCanvasFromTileCoords(this.tileCoords).add(Grid.HALF_TILE),
            aimAngleRadiansClockwise: this.aimAngleRadiansClockwise,
            projectileDetails: this.settings.gun.projectileDetails,
        };
        const shotInfos: ShotInfo[] = [straightShotInfo];
        if (this.settings.gun.spray) {
            const spray = this.settings.gun.spray;
            while (shotInfos.length < spray.projectiles) {
                const offsetDirection = shotInfos.length % 2 === 0 ? 1 : -1;
                shotInfos.push({
                    isShotFromBlueTeam: this.isBlueTeam,
                    fromTileCoords: this.tileCoords,
                    // Shoot from center of tile.
                    fromCanvasCoords: Grid.getCanvasFromTileCoords(this.tileCoords).add(Grid.HALF_TILE),
                    aimAngleRadiansClockwise: this.aimAngleRadiansClockwise + spray.offsetAngleRadians * offsetDirection,
                    projectileDetails: this.settings.gun.projectileDetails,
                });
            }
        }
        return shotInfos;
    }

    getGrenadeAbility(): ThrowGrenadeAbility {
        const grenadeAbility = this.extraAbilities
            .find((ability) => ability.actionType === ActionType.THROW_GRENADE);
        if (grenadeAbility == null) {
            throw new Error(`Trying to getGrenadeAction but character does not have that action`);
        }
        return grenadeAbility as ThrowGrenadeAbility;
    }

    useAbility(actionType: ActionType): void {
        const action = this.extraAbilities
            .find((extraAbility) => extraAbility.actionType === actionType);
        if (action == null) {
            throw new Error(`Character doesn't have ability for ActionType: ${actionType}`);
        }
        this.extraAbilities = this.extraAbilities
            .filter((extraAbility) => extraAbility.actionType !== actionType);
        const actionState = this.characterActionTypeToAbilityState.get(actionType)!;
        if (actionState.usesLeft) {
            actionState.usesLeft -= 1;
        }
        actionState.cooldownTurnsLeft =
            [...this.settings.extraActions]
                .find((extraAction) => extraAction.actionType === action.actionType)!.cooldownTurns;
        if (!action.isFree) {
            // Character can't shoot and use non-free actions in same turn.
            this.hasShot = true;
            this.extraAbilities = this.extraAbilities.filter((ability: CharacterAbility) => {
                return ability.isFree;
            });
        }
        this.checkAndSetTurnOver();
    }

    regenHealth(amount: number): void {
        this.health = Math.min(this.health + amount, this.settings.maxHealth);
    }

    // TODO - cache after first construction.
    getEdges(): LineSegment[] {
        const tileTopLeftCanvas = Grid.getCanvasFromTileCoords(this.tileCoords);
        const tileCenterCanvas = tileTopLeftCanvas.add(Grid.HALF_TILE);
        const topLeftCorner =
            tileCenterCanvas.subtract(
                new Point(CHARACTER_CIRCLE_RADIUS, CHARACTER_CIRCLE_RADIUS));
        const topRightCorner = topLeftCorner.add(new Point(CHARACTER_CIRCLE_RADIUS * 2, 0));
        const bottomLeftCorner = topLeftCorner.add(new Point(0, CHARACTER_CIRCLE_RADIUS * 2));
        const bottomRightCorner = topLeftCorner.add(new Point(CHARACTER_CIRCLE_RADIUS * 2, CHARACTER_CIRCLE_RADIUS * 2));
        const topEdge = new LineSegment(topLeftCorner, topRightCorner, new Point(0, -1));
        const rightEdge = new LineSegment(topRightCorner, bottomRightCorner, new Point(1, 0));
        const bottomEdge = new LineSegment(bottomLeftCorner, bottomRightCorner, new Point(0, 1));
        const leftEdge = new LineSegment(topLeftCorner, bottomLeftCorner, new Point(-1, 0));
        return [
            topEdge,
            rightEdge,
            bottomEdge,
            leftEdge,
        ];
    }

    isTurnOver(): boolean {
        return this.isFinishedWithTurn;
    }

    setTurnOver(): void {
        this.isFinishedWithTurn = true;
        this.isAiming = false;
    }

    resetTurnState(): void {
        this.hasMoved = false;
        this.hasShot = false;
        this.extraAbilities = [];
        for (const extraAbility of this.settings.extraActions) {
            const state = this.characterActionTypeToAbilityState.get(extraAbility.actionType);
            if (!state) {
                throw new Error(`Didn't initialize characterActionsToState for ${extraAbility.actionType}`);
            }
            if (state.usesLeft !== 0 && state.cooldownTurnsLeft <= 0) {
                this.extraAbilities.push(extraAbility);
            }
            state.cooldownTurnsLeft -= 1;
        }
        this.isFinishedWithTurn = false;
    }

    private checkAndSetTurnOver(): void {
        if (this.isFinishedWithTurn) {
            return;
        }
        if (this.extraAbilities.some((extraAbility) => extraAbility.isFree)) {
            // If free actions available, need to explicitly call setTurnOver.
            return;
        }
        if (this.hasMoved && (this.hasShot || !this.settings.gun.canFireAfterMoving)) {
            this.setTurnOver();
            return;
        }
        if (this.hasShot && !this.settings.gun.canFireAfterMoving) {
            this.setTurnOver();
            return;
        }
    }

    private getCharacterColor(): string {
        if (this.isFinishedWithTurn) {
            return this.isBlueTeam ? THEME.blueCharacterDoneColor : THEME.redCharacterDoneColor;
        }
        return this.isBlueTeam ? THEME.blueCharacterReadyColor : THEME.redCharacterReadyColor;
    }

    canShoot(): boolean {
        if (this.isFinishedWithTurn) {
            return false;
        }
        if (!this.settings.gun.canFireAfterMoving && this.hasMoved) {
            return false;
        }
        return !this.hasShot;
    }
}