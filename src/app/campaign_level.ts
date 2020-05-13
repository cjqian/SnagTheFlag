import { AiDifficulty } from './game_settings';


interface CampaignLevel {
    readonly levelIndex: number;
    readonly levelName: string;
    readonly teamIndexToSquadSize: Map<number, number>;
    isUnlocked: boolean;
    readonly aiDifficulty: AiDifficulty;
}

const UNLOCK_ALL = false;

export const CAMPAIGN_LEVELS: CampaignLevel[] = [
    // Level 1
    {
        levelIndex: 0,
        levelName: 'Starting grounds',
        teamIndexToSquadSize: new Map([[0, 4], [1, 4]]),
        isUnlocked: true,
        aiDifficulty: AiDifficulty.WEAK,
    },
    // Level 2
    {
        levelIndex: 1,
        levelName: 'Getting tougher',
        teamIndexToSquadSize: new Map([[0, 3], [1, 5]]),
        isUnlocked: UNLOCK_ALL,
        aiDifficulty: AiDifficulty.WEAK,
    },
    // Level 3
    {
        levelIndex: 2,
        levelName: 'Protect it',
        teamIndexToSquadSize: new Map([[0, 4], [1, 8]]),
        isUnlocked: UNLOCK_ALL,
        aiDifficulty: AiDifficulty.WEAK,
    },
    // Level 4
    {
        levelIndex: 3,
        levelName: 'Snag it',
        teamIndexToSquadSize: new Map([[0, 4], [1, 8]]),
        isUnlocked: UNLOCK_ALL,
        aiDifficulty: AiDifficulty.WEAK,
    },
    // Level 5
    {
        levelIndex: 4,
        levelName: 'Familiar',
        teamIndexToSquadSize: new Map([[0, 4], [1, 8]]),
        isUnlocked: UNLOCK_ALL,
        aiDifficulty: AiDifficulty.MEDIUM,
    },

    // Level 6
    {
        levelIndex: 5,
        levelName: 'Snarls',
        teamIndexToSquadSize: new Map([[0, 4], [1, 8]]),
        isUnlocked: UNLOCK_ALL,
        aiDifficulty: AiDifficulty.MEDIUM,
    },
    // Level 7
    {
        levelIndex: 6,
        levelName: 'To snag...',
        teamIndexToSquadSize: new Map([[0, 4], [1, 8]]),
        isUnlocked: UNLOCK_ALL,
        aiDifficulty: AiDifficulty.MEDIUM,
    },
    // Level 8
    {
        levelIndex: 7,
        levelName: 'Or be snagged...',
        teamIndexToSquadSize: new Map([[0, 4], [1, 8]]),
        isUnlocked: true,
        aiDifficulty: AiDifficulty.STRONG,
    },
    // Level 9
    {
        levelIndex: 8,
        levelName: 'Snag and tag',
        teamIndexToSquadSize: new Map([[0, 4], [1, 8]]),
        isUnlocked: UNLOCK_ALL,
        aiDifficulty: AiDifficulty.STRONG,
    },
    // Level 10
    {
        levelIndex: 9,
        levelName: 'Flag of snag',
        teamIndexToSquadSize: new Map([[0, 4], [1, 8]]),
        isUnlocked: UNLOCK_ALL,
        aiDifficulty: AiDifficulty.STRONG,
    },
    // Level 11
    {
        levelIndex: 10,
        levelName: 'Frag and flag',
        teamIndexToSquadSize: new Map([[0, 4], [1, 8]]),
        isUnlocked: UNLOCK_ALL,
        aiDifficulty: AiDifficulty.STRONG,
    },
    // Level 12
    {
        levelIndex: 11,
        levelName: 'Final snag',
        teamIndexToSquadSize: new Map([[0, 4], [1, 8]]),
        isUnlocked: UNLOCK_ALL,
        aiDifficulty: AiDifficulty.STRONG,
    },
]