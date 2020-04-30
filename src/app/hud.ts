import { ControlMap, CONTROLS } from 'src/app/controls';
import { RENDER_SETTINGS } from 'src/app/render_settings';
import { THEME } from 'src/app/theme';
import { Point } from 'src/app/math/point';

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
    [Duration.SHORT, 3000],
    [Duration.LONG, 5000],
]);
const textTypeToRenderSettings = new Map<TextType, TextRenderSettings>([
    [TextType.TITLE, {
        fontSize: 72,
        topMargin: RENDER_SETTINGS.canvasHeight / 4,
    }],
    [TextType.SUBTITLE, {
        fontSize: 48,
        topMargin: RENDER_SETTINGS.canvasHeight / 2,
    }],
    [TextType.TOAST, {
        fontSize: 24,
        topMargin: 7 * RENDER_SETTINGS.canvasHeight / 8,
    }],
]);

export class Hud {

    private readonly context: CanvasRenderingContext2D;
    private controlMap?: ControlMap;
    private isShowingControlMap: boolean;

    private titleText?: string;
    private titleMsLeft: number;

    private subtitleText?: string;
    private subtitleMsLeft: number;

    private toastText?: string;
    private toastMsLeft: number;

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

    // TODO - lerp color to fade out.
    render(): void {
        if (this.isShowingControlMap && this.controlMap != null) {
            this.renderControls();
        }
        if (this.titleMsLeft > 0) {
            this.renderText(
                this.titleText, textTypeToRenderSettings.get(TextType.TITLE));
        }
        if (this.subtitleMsLeft > 0) {
            this.renderText(
                this.subtitleText, textTypeToRenderSettings.get(TextType.SUBTITLE));
        }
        if (this.toastMsLeft > 0) {
            this.renderText(
                this.toastText, textTypeToRenderSettings.get(TextType.TOAST));
        }
    }

    setControlMap(controlMap?: ControlMap): void {
        this.controlMap = controlMap;
        this.isShowingControlMap = true;
    }

    toggleShowControlMap(): void {
        this.isShowingControlMap = !this.isShowingControlMap;
    }

    setText(text: string, textType: TextType, duration: Duration): void {
        const ms = durationToMs.get(duration);
        switch (textType) {
            case TextType.TITLE:
                this.titleText = text;
                this.titleMsLeft = ms;
                break;
            case TextType.SUBTITLE:
                this.subtitleText = text;
                this.subtitleMsLeft = ms;
                break;
            case TextType.TOAST:
                this.toastText = text;
                this.toastMsLeft = ms;
                break;
        }
    }

    private renderControls(): void {
        const context = this.context;
        context.fillStyle = THEME.textColor;
        const fontSize = 18;
        context.font = `${fontSize}px fantasy`;

        let renderTop = new Point(
            RENDER_SETTINGS.canvasWidth / 64,
            RENDER_SETTINGS.canvasHeight / 32);
        for (const key of this.controlMap.assignedControls.keys()) {
            const action = CONTROLS.getAssignedControlMap().get(key);
            context.fillText(
                `${CONTROLS.getStringForKey(key)} - ${action}`,
                renderTop.x,
                renderTop.y);

            renderTop = renderTop.add(new Point(0, fontSize + 4));
        }
    }

    private renderText(text: string, textRenderSettings: TextRenderSettings): void {
        this.context.fillStyle = THEME.buttonTextColor;
        this.context.font = `${textRenderSettings.fontSize}px fantasy`;
        const textWidth = this.context.measureText(text).width;
        const textCanvasPosition = new Point(
            RENDER_SETTINGS.canvasWidth / 2,
            textRenderSettings.topMargin);
        this.context.fillText(
            text,
            textCanvasPosition.x - textWidth / 2,
            textCanvasPosition.y - textRenderSettings.fontSize / 2);
    }

}