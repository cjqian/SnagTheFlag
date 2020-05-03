import { Point } from 'src/app/math/point';
import { UP, DOWN, LEFT, RIGHT } from 'src/app/math/direction';
import { RENDER_SETTINGS } from 'src/app/render_settings';

/** 
 * Constants and utilities for a grid of tiles. 
 * Does not/should not store 'map' data (state).
 */
export class Grid {

    static readonly TILE_SIZE = 40;
    static readonly TILES_WIDE = RENDER_SETTINGS.canvasWidth / Grid.TILE_SIZE;
    static readonly TILES_TALL = RENDER_SETTINGS.canvasHeight / Grid.TILE_SIZE;
    static readonly HALF_TILE = new Point(Grid.TILE_SIZE / 2, Grid.TILE_SIZE / 2);

    static getCanvasFromTileCoords(tileCoords: Point): Point {
        return new Point(
            tileCoords.x * Grid.TILE_SIZE,
            tileCoords.y * Grid.TILE_SIZE);
    }

    static getTileFromCanvasCoords(canvasCoords: Point): Point {
        return new Point(
            Math.floor(canvasCoords.x / Grid.TILE_SIZE),
            Math.floor(canvasCoords.y / Grid.TILE_SIZE));
    }

    static inbounds(tileCoords: Point): boolean {
        return tileCoords.x >= 0 && tileCoords.x < Grid.TILES_WIDE &&
            tileCoords.y >= 0 && tileCoords.y < Grid.TILES_TALL;
    }

    static getAdjacentTiles(tileCoords: Point): Point[] {
        const result: Point[] = [];

        const upAdjacent = tileCoords.add(UP);
        const downAdjacent = tileCoords.add(DOWN);
        const leftAdjacent = tileCoords.add(LEFT);
        const rightAdjacent = tileCoords.add(RIGHT);

        if (Grid.inbounds(upAdjacent)) result.push(upAdjacent);
        if (Grid.inbounds(downAdjacent)) result.push(downAdjacent);
        if (Grid.inbounds(leftAdjacent)) result.push(leftAdjacent);
        if (Grid.inbounds(rightAdjacent)) result.push(rightAdjacent);

        return result;
    }
}

interface QueuedTile {
    depth: number;
    coords: Point;
}

export function bfs(params: {
    startTile: Point;
    maxDepth: number;
    isAvailable: (tile: Point) => boolean;
    canGoThrough: (tile: Point) => boolean;
}): Point[] {

    const { startTile, maxDepth, isAvailable, canGoThrough } = params;
    const availableTiles: Point[] = [];
    const queue: QueuedTile[] = Grid.getAdjacentTiles(startTile).map((tile) => {
        return {
            depth: 1,
            coords: tile,
        }
    });
    while (queue.length) {
        const queuedTile = queue.shift()!;
        if (queuedTile.depth > maxDepth || !canGoThrough(queuedTile.coords)) {
            continue;
        }
        if (isAvailable(queuedTile.coords)) {
            availableTiles.push(queuedTile.coords);
        }
        for (const adjacentTile of Grid.getAdjacentTiles(queuedTile.coords)) {
            if (availableTiles.find((tile) => tile.equals(adjacentTile))) continue;
            queue.push({
                depth: queuedTile.depth + 1,
                coords: adjacentTile,
            });
        }
    }

    return availableTiles;
}

/** 
 * Returns tile coordinates that are intersected by the line 
 * from the center of tile A to the center of tile b, excluding A and B. 
 * If a and b are adjacent (manhattanDistance(a, b) == 1), returns [].
 * If a=(0, 0) and b=(2, 1), returns [(0, 1), (1, 1)].
 */
export function getTilesOnLineBetween(a: Point, b: Point): Point[] {
    // I feel like there's a more direct way of figuring this out...
    // But I couldn't figure it out. This works though ¯\_(ツ)_/¯

    let points: Point[] = [];

    // Add .5 to the endpoints because we actually want to go from tile center to tile center.
    const halfTileCoord = new Point(.5, .5);
    const aPlusHalf = a.add(halfTileCoord);
    const bPlusHalf = b.add(halfTileCoord);
    const aToBnotNorm = b.subtract(a);

    const aToB = aToBnotNorm.normalize().multiplyScaler(.25);
    const tileAtPt = (pt: Point) => {
        return new Point(Math.floor(pt.x), Math.floor(pt.y));
    };

    // Move from a to b using (half the) normalized direction vector.
    // Add tiles until b is reached.
    let curPt = aPlusHalf.add(aToB);
    const maxIters = Math.max(Grid.TILES_TALL, Grid.TILES_WIDE);
    let iters = 0;
    while (!tileAtPt(curPt).equals(b) && iters < maxIters) {
        points.push(tileAtPt(curPt));
        curPt = curPt.add(aToB);
        iters++;
    }

    const pointsStrSet = new Set();
    const deduped: Point[] = [];

    // Make sure A and B weren't accidentally included. Mainly A...
    // And de-dupe in case same tile was added twice in a row.
    points.forEach((p: Point) => {
        const pString = p.toString();
        if (pointsStrSet.has(pString) || p.equals(a) || p.equals(b)) {
            return;
        }
        pointsStrSet.add(pString);
        deduped.push(p);
    });
    return deduped;
}
