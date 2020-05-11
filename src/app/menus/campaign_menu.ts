import { UiManager } from 'src/app/ui/ui_manager';
import { Button, ButtonDimensions, ButtonStyle } from 'src/app/ui/button';
import { Point } from 'src/app/math/point';
import { RENDER_SETTINGS } from 'src/app/render_settings';
import { CONTROLS } from 'src/app/controls';
import { GameModeManager } from 'src/app/game_mode_manager';
import { THEME } from 'src/app/theme';
import { LEVELS } from 'src/app/level';
import { GameSettings, MatchType, DEFAULT_GAME_SETTINGS } from 'src/app/game_settings';
import { TextBox, TextBoxStyle } from 'src/app/ui/text_box';
import { CAMPAIGN_LEVELS } from 'src/app/campaign_level';

interface ButtonMetadata {
    text: string;
    callback: () => void;
}

export class CampaignMenu implements GameModeManager {
    private readonly canvas: HTMLCanvasElement;
    private readonly context: CanvasRenderingContext2D;
    private readonly onSelectLevel: (campaignLevelIndex: number, levelIndex: number, gameSettings: GameSettings) => void;
    private readonly uiManager: UiManager;

    constructor(
        canvas: HTMLCanvasElement,
        context: CanvasRenderingContext2D,
        callbacks: {
            readonly onSelectLevel: (campaignLevelIndex: number, levelIndex: number, gameSettings: GameSettings) => void;
        }) {

        this.canvas = canvas;
        this.context = context;
        this.onSelectLevel = callbacks.onSelectLevel;

        this.uiManager = new UiManager(context);
        this.initLevelMenu();
    }

    update(elapsedTime: number): void {
        this.uiManager.onMouseMove(CONTROLS.getMouseCanvasCoords());
        if (CONTROLS.hasClick()) {
            const clickCanvasCoords = CONTROLS.handleClick();
            this.uiManager.onClick(clickCanvasCoords);
        }
    }

    render(): void {
        this.context.fillStyle = THEME.uiBackgroundColor;
        this.context.clearRect(0, 0, RENDER_SETTINGS.canvasWidth, RENDER_SETTINGS.canvasHeight);
        this.context.fillRect(0, 0, RENDER_SETTINGS.canvasWidth, RENDER_SETTINGS.canvasHeight);
        this.renderTitleText();
        this.uiManager.render();
    }

    destroy(): void {
        // no-op
    }

    private initLevelMenu(): void {

        const buttonOffsetY = .04;
        const elementSize = new Point(.24, .08);
        const buttonTopMargin = .24 + buttonOffsetY + elementSize.y;
        const fontSize = 24;

        const buttonStyle: ButtonStyle = {
            fontSize,
            color: '#f7c25e',
            hoverColor: '#fcd281',
            selectedColor: '#db9d2a',
            selectedBorderColor: '#000000',
            textColor: THEME.buttonTextColor,
        };

        const lockedTextBoxStyle: TextBoxStyle = {
            fontSize,
            color: '#bd7e00',
            textColor: THEME.buttonTextColor,
        };

        const leftColumnLeftMargin = .12;
        const middleColumnLeftMargin = .4;
        const rightColumnLeftMargin = middleColumnLeftMargin + elementSize.x + .1;

        for (let campaignLevelIndex = 0; campaignLevelIndex < CAMPAIGN_LEVELS.length; campaignLevelIndex++) {
            const topLeftY = buttonTopMargin + campaignLevelIndex * buttonOffsetY + campaignLevelIndex * elementSize.y;
            const campaignLevel = CAMPAIGN_LEVELS[campaignLevelIndex];
            const dimensions = {
                topLeft: new Point(leftColumnLeftMargin, topLeftY),
                size: elementSize,
                text: campaignLevel.levelName,
            };
            if (campaignLevel.isUnlocked) {
                this.uiManager.addElement(new Button({
                    dimensions,
                    style: buttonStyle,
                    onClick: () => {
                        const settings: GameSettings = {
                            matchType: MatchType.PLAYER_VS_AI,
                            teamIndexToSquadSize: campaignLevel.teamIndexToSquadSize,
                            numTeams: DEFAULT_GAME_SETTINGS.numTeams,
                            maxSpawnDistanceFromFlag: DEFAULT_GAME_SETTINGS.maxSpawnDistanceFromFlag,
                            hasFogOfWar: true,
                            aiDifficulty: campaignLevel.aiDifficulty,
                        };
                        this.onSelectLevel(campaignLevelIndex, campaignLevel.levelIndex, settings);
                    },
                }));
            } else {
                this.uiManager.addElement(new TextBox({
                    dimensions,
                    style: lockedTextBoxStyle,
                }));
            }
        }
    }

    private renderTitleText(): void {
        this.context.fillStyle = THEME.buttonTextColor;
        const fontSize = 72;
        this.context.font = `${fontSize}px fantasy`;
        const text = 'Snag the Flag'
        const textWidth = this.context.measureText(text).width;
        const textCanvasPosition = new Point(
            RENDER_SETTINGS.canvasWidth / 2,
            RENDER_SETTINGS.canvasHeight / 4);
        this.context.fillText(
            text,
            textCanvasPosition.x - textWidth / 2,
            textCanvasPosition.y - fontSize / 2);
    }
}