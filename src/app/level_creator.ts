import { RENDER_SETTINGS } from 'src/app/render_settings';
import { Grid } from 'src/app/grid';
import { Point } from 'src/app/math/point';
import { Obstacle } from 'src/app/obstacle';
import { CONTROLS, ControlMap, EventType, Key } from 'src/app/controls';


const BACKGROUND_COLOR = '#959aa3';
const GRID_COLOR = '#1560e8';
const HOVERED_TILE_COLOR = '#f7c25e';

export class LevelCreator {

    canvas: HTMLCanvasElement;
    context: CanvasRenderingContext2D;
    onExitGameCallback: () => void;
    obstacles: Obstacle[];
    controlMap: ControlMap;

    constructor(
        canvas: HTMLCanvasElement,
        context: CanvasRenderingContext2D,
        onExitGameCallback: () => void) {

        this.canvas = canvas;
        this.context = context;
        this.onExitGameCallback = onExitGameCallback;
        this.resetGame();
    }

    update(elapsedMs: number): void {
        this.controlMap.check();
        if (CONTROLS.hasClick()) {
            const clickCoords = CONTROLS.handleClick();
            const mouseTileCoords = Grid.getTileFromCanvasCoords(clickCoords);
            const obstacle = new Obstacle(mouseTileCoords);
            this.obstacles.push(obstacle);
        }
        for (const obstacle of this.obstacles) {
            obstacle.update(elapsedMs);
        }
    }

    render(): void {
        const context = this.context;
        context.fillStyle = BACKGROUND_COLOR;
        context.clearRect(0, 0, RENDER_SETTINGS.canvasWidth, RENDER_SETTINGS.canvasHeight);
        context.fillRect(0, 0, RENDER_SETTINGS.canvasWidth, RENDER_SETTINGS.canvasHeight);

        // Draw grid lines.
        for (let i = 0; i < Grid.TILES_WIDE; i++) {
            const startX = i * Grid.TILE_SIZE;
            const endX = startX;
            const startY = 0;
            const endY = RENDER_SETTINGS.canvasHeight;

            context.beginPath();
            context.strokeStyle = GRID_COLOR;
            context.moveTo(startX, startY);
            context.lineTo(endX, endY);
            context.stroke();
        }
        for (let i = 0; i < Grid.TILES_TALL; i++) {
            const startX = 0;
            const endX = RENDER_SETTINGS.canvasWidth;
            const startY = i * Grid.TILE_SIZE;
            const endY = startY;

            context.beginPath();
            context.strokeStyle = GRID_COLOR;
            context.moveTo(startX, startY);
            context.lineTo(endX, endY);
            context.stroke();
        }

        // Indicate hovered tile.
        const mouseTileCoords = Grid.getTileFromCanvasCoords(CONTROLS.getMouseCanvasCoords());
        const tileCanvasTopLeft = Grid.getCanvasFromTileCoords(mouseTileCoords);
        context.fillStyle = HOVERED_TILE_COLOR;
        context.fillRect(tileCanvasTopLeft.x, tileCanvasTopLeft.y, Grid.TILE_SIZE, Grid.TILE_SIZE);

        for (const obstacle of this.obstacles) {
            obstacle.render(context);
        }
    }

    destroy(): void {
        if (this.controlMap) {
            this.controlMap.clear();
        }
    }

    private readonly saveLevel = (): void => {
        // TODO
    };

    private resetGame = (): void => {
        this.destroy();
        this.obstacles = [];
        this.controlMap = new ControlMap();
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
            key: Key.S,
            name: 'Save',
            func: this.saveLevel,
            eventType: EventType.KeyPress,
        });
    }
}
