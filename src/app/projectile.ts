import { Point } from 'src/app/math/point';
import { Ray } from 'src/app/math/collision_detection';
import { Grid } from 'src/app/grid';
import { THEME } from 'src/app/theme';
import { ShotInfo } from 'src/app/shot_info';
import { hexStringToColor } from 'src/app/color';

const PROJECTILE_CANVAS_RADIUS = Grid.TILE_SIZE / 12;
const PROJECTILE_SPEED_PER_MS = Grid.TILE_SIZE / 80;
const MAX_TRAIL_DISTANCE = Grid.TILE_SIZE * 3;

// TODO - extract into shared constant
const TWO_PI = Math.PI * 2;

export interface Target {
    readonly normal: Point;
    readonly tile: Point;
    readonly canvasCoords: Point;
}

export class Projectile {

    private readonly context: CanvasRenderingContext2D;
    readonly ray: Ray;
    readonly maxDistance: number;
    readonly shotInfo: ShotInfo;
    readonly target: Target;

    isDead: boolean;
    distance: number;

    constructor(params: {
        context: CanvasRenderingContext2D;
        ray: Ray;
        shotInfo: ShotInfo;
        maxDistance: number;
        target: Target;
    }) {
        this.context = params.context;
        this.ray = params.ray;
        this.maxDistance = params.maxDistance;
        this.shotInfo = params.shotInfo;
        this.distance = 0;
        this.target = params.target;
        this.isDead = false;
    }

    update(elapsedMs: number): void {
        this.distance = this.distance + PROJECTILE_SPEED_PER_MS * elapsedMs;
    }

    isAtTarget(): boolean {
        return !this.isDead && this.distance >= this.maxDistance;
    }

    isTrailGone(): boolean {
        return this.distance - this.maxDistance > MAX_TRAIL_DISTANCE;
    }

    setIsDead(): void {
        this.isDead = true;
    }

    render(): void {
        const context = this.context;
        const currentPointCanvas = this.ray.pointAtDistance(this.distance);

        if (this.distance > PROJECTILE_CANVAS_RADIUS && !this.isTrailGone()) {
            const bacwardsDirection = this.ray.startPt.subtract(currentPointCanvas).normalize();
            let overshotDistance = 0;
            let trailStartPointCanvas = currentPointCanvas;
            if (this.distance > this.maxDistance) {
                overshotDistance = MAX_TRAIL_DISTANCE - (this.distance - this.maxDistance);
                trailStartPointCanvas = this.ray.pointAtDistance(this.maxDistance);
            }
            let trailDistance = Math.min(
                MAX_TRAIL_DISTANCE,
                this.distance,
                this.distance + overshotDistance);
            const trailFadePointCanvas = currentPointCanvas.add(
                bacwardsDirection.multiplyScaler(trailDistance));
            const gradient = context.createLinearGradient(
                currentPointCanvas.x, currentPointCanvas.y,
                trailFadePointCanvas.x, trailFadePointCanvas.y);
            const fullColor = THEME.projectileTrailColor;
            const fadedColor = `${THEME.projectileTrailColor}00`;
            gradient.addColorStop(0, fullColor);
            gradient.addColorStop(1, fadedColor);

            // Draw trail.
            context.strokeStyle = gradient;
            context.beginPath();
            context.moveTo(trailStartPointCanvas.x, trailStartPointCanvas.y);
            context.lineTo(trailFadePointCanvas.x, trailFadePointCanvas.y);
            context.closePath();
            context.stroke();
        }

        if (this.isDead) {
            return;
        }

        context.fillStyle = THEME.projectileColor;
        context.beginPath();
        context.arc(currentPointCanvas.x, currentPointCanvas.y, PROJECTILE_CANVAS_RADIUS, 0, TWO_PI);
        context.closePath();
        context.fill();
    }
}