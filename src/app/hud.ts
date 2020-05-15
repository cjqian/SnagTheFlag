import { ControlMap, CONTROLS } from 'src/app/controls';
import { THEME } from 'src/app/theme';
import { Point } from 'src/app/math/point';
import { lerpColors, hexStringToColor, colorToString } from 'src/app/color';
import { Grid } from './grid';

/** Determines how long to display titles, subtitles, and toasts. */
export enum Duration {
    SHORT,
    LONG,
}

export enum TextType {
    TITLE,
    SUBTITLE,
    TOAST,
}

interface TextRenderSettings {
    readonly fontSize: number;
    readonly topMargin: number;
}

const durationToMs = new Map<Duration, number>([
    [Duration.SHORT, 2000],
    [Duration.LONG, 4000],
]);
const textTypeToRenderSettings = new Map<TextType, TextRenderSettings>([
    [TextType.TITLE, {
        fontSize: 72,
        topMargin: Grid.GAME_HEIGHT / 4,
    }],
    [TextType.SUBTITLE, {
        fontSize: 48,
        topMargin: Grid.GAME_HEIGHT / 2,
    }],
    [TextType.TOAST, {
        fontSize: 24,
        topMargin: 7 * Grid.GAME_HEIGHT / 8,
    }],
]);

export class Hud {

    private readonly context: CanvasRenderingContext2D;
    private isShowingControlMap: boolean;

    private titleText?: string;
    private titleMsLeft: number;
    private titleDuration: Duration;

    private subtitleText?: string;
    private subtitleMsLeft: number;
    private subtitleDuration: Duration;

    private toastText?: string;
    private toastMsLeft: number;
    private toastDuration: Duration;

    constructor(context: CanvasRenderingContext2D) {
        this.context = context;
        this.isShowingControlMap = false;
        this.titleMsLeft = -1;
        this.subtitleMsLeft = -1;
        this.toastMsLeft = -1;
    }

    update(elapsedMs: number): void {
        if (this.titleMsLeft > 0) {
            this.titleMsLeft -= elapsedMs;
        }
        if (this.subtitleMsLeft > 0) {
            this.subtitleMsLeft -= elapsedMs;
        }
        if (this.toastMsLeft > 0) {
            this.toastMsLeft -= elapsedMs;
        }
    }

    render(): void {
        if (this.titleMsLeft > 0) {
            if (!this.titleText) {
                throw new Error(`Expected title text to set when titleMsLeft > 0`);
            }
            this.renderText(
                this.titleText,
                textTypeToRenderSettings.get(TextType.TITLE)!,
                this.titleMsLeft / durationToMs.get(this.titleDuration)!);
        }
        if (this.subtitleMsLeft > 0) {
            if (!this.subtitleText) {
                throw new Error(`Expected subtitle text to set when subtitleMsLeft > 0`);
            }
            this.renderText(
                this.subtitleText,
                textTypeToRenderSettings.get(TextType.SUBTITLE)!,
                this.subtitleMsLeft / durationToMs.get(this.subtitleDuration)!);
        }
        if (this.toastMsLeft > 0) {
            if (!this.toastText) {
                throw new Error(`Expected toastText text to set when toastMsLeft > 0`);
            }
            this.renderText(
                this.toastText,
                textTypeToRenderSettings.get(TextType.TOAST)!,
                this.toastMsLeft / durationToMs.get(this.toastDuration)!);
        }
    }

    setText(text: string, textType: TextType, duration: Duration): void {
        const ms = durationToMs.get(duration)!;
        switch (textType) {
            case TextType.TITLE:
                this.titleText = text;
                this.titleMsLeft = ms;
                this.titleDuration = duration;
                break;
            case TextType.SUBTITLE:
                this.subtitleText = text;
                this.subtitleMsLeft = ms;
                this.subtitleDuration = duration;
                break;
            case TextType.TOAST:
                this.toastText = text;
                this.toastMsLeft = ms;
                this.toastDuration = duration;
                break;
        }
    }

    clearText(textType: TextType): void {
        switch (textType) {
            case TextType.TITLE:
                this.titleText = '';
                this.titleMsLeft = 0;
                break;
            case TextType.SUBTITLE:
                this.subtitleText = '';
                this.subtitleMsLeft = 0;
                break;
            case TextType.TOAST:
                this.toastText = '';
                this.toastMsLeft = 0;
                break;
        }
    }

    private renderText(
        text: string, textRenderSettings: TextRenderSettings, percentTimeLeft: number): void {

        const fadedColor = hexStringToColor(THEME.hudTextColor);
        fadedColor.a = percentTimeLeft;
        this.context.fillStyle = colorToString(fadedColor);
        this.context.font = `${textRenderSettings.fontSize}px fantasy`;
        const textWidth = this.context.measureText(text).width;
        const textCanvasPosition = new Point(
            Grid.GAME_WIDTH / 2,
            textRenderSettings.topMargin);
        this.context.fillText(
            text,
            textCanvasPosition.x - textWidth / 2,
            textCanvasPosition.y - textRenderSettings.fontSize / 2);
    }

}