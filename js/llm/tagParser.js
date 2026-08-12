/**
 * ═══════════════════════════════════════════════════════════
 * REINA MOBILE AR — Tag Parser
 * Dynamically extracts emotion/action tags from anywhere in
 * LLM responses and returns ordered tags + clean TTS text.
 * ═══════════════════════════════════════════════════════════
 */

export class TagParser {
    constructor() {
        this.tagRegex = /\[([^\]]+)\]/gi;

        this.allowedTags = [
            'idle',
            'talking',
            'angry',
            'sad',
            'welcome',
            'kiss',
            'yawn',
            'bashful',
            'hand_raising',
            'sit'
        ];

        this.tagAliases = {
            idle: ['idle'],
            talking: ['talking', 'talk'],
            angry: ['angry', 'marah'],
            sad: ['sad', 'sedih'],
            welcome: ['welcome', 'sapa'],
            kiss: ['kiss', 'cium'],
            yawn: ['yawn'],
            bashful: ['bashful', 'malu'],
            hand_raising: ['hand_raising', 'hand raising', 'handraising', 'angkat'],
            sit: ['sit', 'duduk']
        };

        this.oneShotTags = new Set([
            'welcome',
            'angry',
            'sad',
            'kiss',
            'yawn',
            'bashful',
            'hand_raising'
        ]);

        this.continuousTags = new Set(['idle', 'talking', 'sit']);
    }

    normalizeTag(rawTag) {
        return rawTag.trim().toLowerCase().replace(/\s+/g, '_');
    }

    resolveTag(rawTag) {
        const normalized = this.normalizeTag(rawTag);

        for (const allowed of this.allowedTags) {
            const aliases = this.tagAliases[allowed] || [allowed];
            if (aliases.some((alias) => normalized === alias.replace(/\s+/g, '_'))) {
                return allowed;
            }
            if (normalized === allowed) {
                return allowed;
            }
        }

        const fuzzy = this.allowedTags.find(
            (t) => normalized.includes(t) || t.includes(normalized)
        );
        return fuzzy || null;
    }

    isOneShot(tag) {
        return this.oneShotTags.has(tag);
    }

    isContinuous(tag) {
        return this.continuousTags.has(tag);
    }

    /**
     * @param {string} rawText
     * @returns {{ cleanText: string, tags: string[], primaryTag: string|null }}
     */
    parse(rawText) {
        if (!rawText) {
            return { cleanText: '', tags: [], primaryTag: null };
        }

        const tags = [];
        const seen = new Set();
        let match;
        const regex = new RegExp(this.tagRegex.source, this.tagRegex.flags);

        while ((match = regex.exec(rawText)) !== null) {
            const resolved = this.resolveTag(match[1]);
            if (resolved && !seen.has(resolved)) {
                tags.push(resolved);
                seen.add(resolved);
            }
        }

        let cleanText = rawText.replace(regex, ' ').trim();
        cleanText = cleanText
            .replace(/\s{2,}/g, ' ')
            .replace(/\s+([,.!?;:])/g, '$1')
            .replace(/^[\s,.:;!?-]+/, '')
            .trim();

        const primaryTag = tags.find((t) => this.isOneShot(t)) || tags[0] || null;

        console.log(
            `[TagParser] Tags: [${tags.join(', ')}] | Primary: ${primaryTag} | Clean: "${cleanText}"`
        );

        return { cleanText, tags, primaryTag };
    }
}
