/**
 * 分镜提示词中的资产引用：唯一合法格式为方括号标签 [characterN:name]
 * （如 [character1:小兔子]，由底部实体 chip 插入或后端注入）。
 *
 * LLM 润色 / 生成分镜时常不守规矩地输出变体（圆括号包裹、错配括号、
 * @ 前缀、@图N【…】 语法、冗余同名前缀等）。变体一律不参与解析，
 * 而是在各 LLM 输出入口先经 normalizeAssetRefs 归一化为方括号格式，
 * 再进入编辑器与提交链：
 *   木瓜(character2:木瓜)      → [character2:木瓜]
 *   椰子[character3:椰子)      → [character3:椰子]
 *   @character3:椰子)坐在后方  → [character3:椰子]坐在后方
 *   @图2【角色】椰子（描述…）   → [character2:椰子]（描述…）
 *   木瓜[character2:木瓜]      → [character2:木瓜]
 */

export interface AssetRef {
    /** 槽位号（characterN 中的 N），与 reference_image_urls[N-1] 位置对应 */
    slot: number;
    /** 引用的实体名（需与角色/场景/道具的 name 精确匹配） */
    name: string;
}

// 唯一合法格式：[characterN:name]
const BRACKET_TAG_RE = /\[character(\d+):([^\]]+)\]/g;

/**
 * 从提示词中提取全部资产引用，按出现顺序返回。
 * 同一 slot 多次出现只保留首次（与 HappyHorse 的
 * characterN → reference_image_urls[N-1] 位置语义一致）。
 */
export function extractAssetRefs(prompt: string): AssetRef[] {
    if (!prompt) return [];
    const seenSlot = new Set<number>();
    const refs: AssetRef[] = [];
    BRACKET_TAG_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = BRACKET_TAG_RE.exec(prompt)) !== null) {
        const slot = parseInt(m[1], 10);
        const name = (m[2] || "").trim();
        if (!name || seenSlot.has(slot)) continue;
        seenSlot.add(slot);
        refs.push({ slot, name });
    }
    return refs;
}

/** 提示词中是否含有任何可解析的资产引用 */
export function hasAnyAssetRef(prompt: string): boolean {
    return extractAssetRefs(prompt).length > 0;
}

/* ------------------------------------------------------------------ */
/* 变体归一化：把 LLM 输出的各种写法统一为 [characterN:name]           */
/* 不用 lookbehind（旧 Safari 会在解析期抛 SyntaxError），前字符检查    */
/* 放在 replace 回调里做。仅在 LLM 输出入口调用，勿放进逐键编辑路径。   */
/* ------------------------------------------------------------------ */

// ① 错配闭括号：椰子[character3:椰子) → 椰子[character3:椰子]
const MISMATCH_RE = /\[(character\d+[:：][^\]（）()【】@]{1,30})[)）]/g;
// ② 圆括号包裹：木瓜(character2:木瓜) → 木瓜[character2:木瓜]
const PAREN_RE = /[（(](character\d+[:：][^（()）\[\]【】@]{1,30})[）)]/g;
// ③ @图语法：@图2【角色】椰子（描述…） → [character2:椰子]（描述…）
const AT_IMAGE_RE = /@图(\d+)【[^】]*】([^（()）\[\]【】@，,。；;：!！?？\s"'“”]{1,30})/g;
// ④ 裸 @ 变体：@character3:椰子) → [character3:椰子]；@character2:木瓜 → [character2:木瓜]
// （必须带 @：无 @ 的 "characterN:名称" 可能只是英文正文，不归一化）
const BARE_RE = /@(character\d+)([:：])\s*([^（()）\[\]【】@，,。；;：!！?？\s"'“”]{1,30})[)）]?/g;
// ⑤ 冗余同名前缀（后端注入格式）：木瓜[character2:木瓜] → [character2:木瓜]
const REDUNDANT_RE = /([^（()）\[\]【】@，,。；;：!！?？\s"'“”]{1,30})\[(character\d+[:：])\1\]/g;

/**
 * 把提示词中的变体引用写法归一化为唯一合法的方括号格式。
 * 调用点：润色结果应用（PolishPanel onApply）、智能生成分镜导入
 * （frameToShotNode）、后端 polish_r2v_prompt 返回前。
 */
export function normalizeAssetRefs(prompt: string): string {
    if (!prompt) return prompt;
    let out = prompt;
    out = out.replace(MISMATCH_RE, "[$1]");
    out = out.replace(PAREN_RE, "[$1]");
    out = out.replace(AT_IMAGE_RE, "[character$1:$2]");
    // 前字符是 "[" 说明已是合法方括号标签，原样保留，避免 [[...]] 双重包裹
    out = out.replace(BARE_RE, (match, c: string, colon: string, name: string, offset: number) => {
        const prev = offset > 0 ? out[offset - 1] : "";
        return prev === "[" ? match : `[${c}${colon}${name}]`;
    });
    out = out.replace(REDUNDANT_RE, "[$2$1]");
    return out;
}
