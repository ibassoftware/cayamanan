/*
 * Missy's drawing, split into the two fragments the app needs: her head (chrome — header,
 * messages, launcher) and the full figure (the hero surfaces, which act out `MissyState`).
 *
 * Authored inline SVG rather than a raster sprite or an animation runtime: it is a few KB,
 * stays crisp at every size, and the poses are driven by CSS classes so a state change is a
 * class swap rather than a re-render. See missy.module.css for the motion.
 *
 * Gradient ids are namespaced per instance — several Missys are on screen at once (header,
 * each assistant message, the panel) and duplicate SVG ids resolve to whichever the browser
 * parsed first.
 */
import styles from "@/components/missy/missy.module.css"

/**
 * The illustration's own palette. The brand shades track the Terracotta tokens (noted per
 * entry) but are duplicated as literals on purpose: `var()` does not resolve inside SVG
 * gradient stops, and the figurative colours — skin, hair, the iBAS crest — have no token
 * equivalent to reference. Light-only, matching the design system.
 */
const PALETTE = {
  brand: "#c56a3c", // --tc-brand
  brandDeep: "#9c4f25", // --tc-brand-strong
  brandSoft: "#f4d5bf", // --tc-brand-soft
  cream: "#fbf4e7", // --tc-neutral-primary
  ink: "#2b1d14", // --tc-heading
  paper: "#ffffff",
  skin: "#f0be95",
  skinShadow: "#d99c6b",
  hairDark: "#3c2a20",
  lip: "#a9532b",
  sun: "#e9a13b",
  sage: "#7a8b6f",
  border: "#e3d2c7",
} as const

// The iBAS wordmark's interlocking puzzle pieces. The navy square-arrows mark is dropped at
// this size — it collapses into a smudge below ~40px, while the coloured pieces stay
// recognisable.
const CREST = ["#e2372b", "#f2c230", "#4d8fd1", "#58b79b"] as const

/** The head, from the top of her bun to her chin: x 113–227, y 15–171. */
export function MissyHead({ uid }: { uid: string }) {
  return (
    <g className={styles.head}>
      {/* bun + scrunchie */}
      <circle cx="170" cy="38" r="19" fill={`url(#${uid}-hair)`} />
      <rect x="155" y="50" width="30" height="9" rx="4.5" fill={PALETTE.brand} />

      {/* hair volume behind the face */}
      <ellipse cx="170" cy="106" rx="55" ry="54" fill={`url(#${uid}-hair)`} />

      {/* ears + earrings */}
      <circle cx="122" cy="128" r="9" fill={PALETTE.skin} />
      <circle cx="218" cy="128" r="9" fill={PALETTE.skin} />
      <circle cx="122" cy="136" r="3" fill={PALETTE.sun} />
      <circle cx="218" cy="136" r="3" fill={PALETTE.sun} />

      <ellipse cx="170" cy="122" rx="46" ry="43" fill={`url(#${uid}-face)`} />

      {/* curtain bangs */}
      <path d="M170 79 Q138 79 126 116 Q130 124 139 118 Q145 95 170 89 Z" fill={`url(#${uid}-hair)`} />
      <path d="M170 79 Q202 79 214 116 Q210 124 201 118 Q195 95 170 89 Z" fill={`url(#${uid}-hair)`} />

      {/* brows — one visible variant per state */}
      <g className={styles.browDefault}>
        <path d="M136 104 Q146 99 156 103" stroke="#4a3327" strokeWidth="3.5" strokeLinecap="round" fill="none" />
        <path d="M184 103 Q194 99 204 104" stroke="#4a3327" strokeWidth="3.5" strokeLinecap="round" fill="none" />
      </g>
      <g className={`${styles.prop} ${styles.browRaised}`}>
        <path d="M136 103 Q146 100 156 104" stroke="#4a3327" strokeWidth="3.5" strokeLinecap="round" fill="none" />
        <path d="M184 100 Q194 94 204 99" stroke="#4a3327" strokeWidth="3.5" strokeLinecap="round" fill="none" />
      </g>
      <g className={`${styles.prop} ${styles.browWorried}`}>
        <path d="M136 99 Q146 103 156 106" stroke="#4a3327" strokeWidth="3.5" strokeLinecap="round" fill="none" />
        <path d="M184 106 Q194 103 204 99" stroke="#4a3327" strokeWidth="3.5" strokeLinecap="round" fill="none" />
      </g>

      {/* eyes */}
      {[147, 193].map((cx) => (
        <g className={styles.eye} key={cx}>
          <ellipse cx={cx} cy="124" rx="11.5" ry="13.5" fill={PALETTE.paper} />
          <g className={styles.pupils}>
            <circle cx={cx} cy="125" r="7.5" fill={`url(#${uid}-iris)`} />
            <circle cx={cx} cy="125" r="3.6" fill="#241610" />
            <circle cx={cx - 2.5} cy="121.5" r="2.5" fill={PALETTE.paper} />
            <circle cx={cx + 2.5} cy="127.5" r="1.2" fill={PALETTE.paper} opacity="0.8" />
          </g>
        </g>
      ))}

      {/* lashes */}
      <path d="M135 116 Q141 110 150 111" stroke="#241610" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.55" />
      <path d="M190 111 Q199 110 205 116" stroke="#241610" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.55" />

      <path d="M167 139 Q170 143 173 139" stroke={PALETTE.skinShadow} strokeWidth="2.5" strokeLinecap="round" fill="none" />

      <ellipse cx="133" cy="140" rx="10" ry="6" fill={`url(#${uid}-blush)`} />
      <ellipse cx="207" cy="140" rx="10" ry="6" fill={`url(#${uid}-blush)`} />

      {/* mouth — one visible variant per state */}
      <path className={styles.mouthSmile} d="M161 148 Q170 156 179 148" stroke={PALETTE.lip} strokeWidth="3" strokeLinecap="round" fill="none" />
      <path className={`${styles.prop} ${styles.mouthFlat}`} d="M162 150 Q170 148 178 150" stroke={PALETTE.lip} strokeWidth="3" strokeLinecap="round" fill="none" />
      <g className={`${styles.prop} ${styles.mouthGrin}`}>
        <path d="M158 147 Q170 163 182 147 Z" fill="#7a3b22" />
        <ellipse cx="170" cy="155" rx="6" ry="3.2" fill="#e88b6f" />
      </g>
    </g>
  )
}

export function MissyDefs({ uid }: { uid: string }) {
  return (
    <defs>
      <radialGradient id={`${uid}-face`} cx="50%" cy="40%" r="70%">
        <stop offset="0%" stopColor="#fbdfc2" />
        <stop offset="78%" stopColor="#f5cba4" />
        <stop offset="100%" stopColor="#edbb8e" />
      </radialGradient>
      <linearGradient id={`${uid}-hair`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#5e4133" />
        <stop offset="100%" stopColor={PALETTE.hairDark} />
      </linearGradient>
      <linearGradient id={`${uid}-body`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#d0784a" />
        <stop offset="100%" stopColor="#b65c2f" />
      </linearGradient>
      <radialGradient id={`${uid}-blush`} cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#f0a183" stopOpacity="0.85" />
        <stop offset="100%" stopColor="#f0a183" stopOpacity="0" />
      </radialGradient>
      <radialGradient id={`${uid}-iris`} cx="40%" cy="35%" r="75%">
        <stop offset="0%" stopColor="#8a5a3b" />
        <stop offset="100%" stopColor="#54341f" />
      </radialGradient>
    </defs>
  )
}

/** Torso, sweater and the iBAS crest. */
function MissyTorso({ uid }: { uid: string }) {
  return (
    <>
      <rect x="161" y="150" width="18" height="38" rx="8" fill="#edbb8e" />
      <path d="M130 254 Q126 188 170 182 Q214 188 214 254 Q214 260 206 260 L138 260 Q130 260 130 254 Z" fill={`url(#${uid}-body)`} />
      <path d="M157 186 L170 202 L183 186 Q170 180 157 186 Z" fill={PALETTE.cream} />

      <g transform="rotate(-8 170 219)">
        <rect x="162" y="209" width="9" height="9" rx="2" fill={CREST[0]} />
        <circle cx="166.5" cy="208.5" r="2" fill={CREST[0]} />
      </g>
      <g transform="rotate(6 158 224)">
        <rect x="153" y="217" width="9" height="9" rx="2" fill={CREST[1]} />
        <circle cx="152.5" cy="221.5" r="2" fill={CREST[1]} />
      </g>
      <g transform="rotate(10 178 223)">
        <rect x="173" y="216" width="9" height="9" rx="2" fill={CREST[2]} />
        <circle cx="182.5" cy="220.5" r="2" fill={CREST[2]} />
      </g>
      <g transform="rotate(-6 168 229)">
        <rect x="163" y="223" width="9" height="9" rx="2" fill={CREST[3]} />
        <circle cx="167.5" cy="232.5" r="2" fill={CREST[3]} />
      </g>
      {/* Rendered as text rather than outlines: at 13px the wordmark is a supporting detail,
          and a font substitution costs nothing legible. Swap for the real logo's paths if
          the crest is ever used at a size where the letterforms carry weight. */}
      <text
        x="170"
        y="248"
        textAnchor="middle"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontSize="13"
        fontWeight="750"
        letterSpacing="1"
        fill={PALETTE.cream}
      >
        IBAS
      </text>
    </>
  )
}

/** Arms, one set per state — the CSS reveals exactly one. */
function MissyArms({ uid }: { uid: string }) {
  const sleeve = { stroke: `url(#${uid}-body)`, strokeWidth: 15, strokeLinecap: "round" as const, fill: "none" }
  return (
    <>
      <g className={styles.armRest}>
        <path d="M138 216 Q122 232 124 250" {...sleeve} />
        <path d="M202 216 Q218 232 216 250" {...sleeve} />
        <circle cx="124" cy="252" r="8" fill={PALETTE.skin} />
        <circle cx="216" cy="252" r="8" fill={PALETTE.skin} />
      </g>

      <g className={`${styles.prop} ${styles.armChin}`}>
        <path d="M138 216 Q122 232 124 250" {...sleeve} />
        <circle cx="124" cy="252" r="8" fill={PALETTE.skin} />
        <path d="M202 216 Q228 206 204 170" {...sleeve} />
        <circle cx="200" cy="164" r="8.5" fill={PALETTE.skin} />
      </g>

      <g className={`${styles.prop} ${styles.armHold}`}>
        <path d="M138 216 Q128 238 148 244" {...sleeve} />
        <path d="M202 216 Q212 238 192 244" {...sleeve} />
      </g>

      <g className={`${styles.prop} ${styles.armType}`}>
        <path d="M138 216 Q126 236 144 246" {...sleeve} />
        <path d="M202 216 Q214 236 196 246" {...sleeve} />
        <circle className={styles.handLeft} cx="147" cy="249" r="8" fill={PALETTE.skin} />
        <circle className={styles.handRight} cx="193" cy="249" r="8" fill={PALETTE.skin} />
      </g>

      <g className={`${styles.prop} ${styles.armPresent}`}>
        <path d="M138 216 Q122 232 124 250" {...sleeve} />
        <circle cx="124" cy="252" r="8" fill={PALETTE.skin} />
        <path d="M202 214 Q232 206 246 190" {...sleeve} />
      </g>

      <g className={`${styles.prop} ${styles.armCheer}`}>
        <path d="M140 212 Q112 192 106 168" {...sleeve} />
        <path d="M200 212 Q228 192 234 168" {...sleeve} />
        <circle cx="104" cy="164" r="8" fill={PALETTE.skin} />
        <circle cx="236" cy="164" r="8" fill={PALETTE.skin} />
      </g>
    </>
  )
}

/** Things in the air around her — drawn behind, so they read as background. */
function MissyAmbientProps() {
  return (
    <>
      <g className={`${styles.prop} ${styles.propThink}`} fill={PALETTE.brand}>
        <circle className={styles.dot} cx="222" cy="58" r="4.5" />
        <circle className={styles.dot} cx="238" cy="48" r="6" />
        <circle className={styles.dot} cx="256" cy="36" r="7.5" />
      </g>

      <g className={`${styles.prop} ${styles.propSpark}`} fill={PALETTE.sun}>
        <path className={styles.spark} d="M92 62 l4 10 10 4 -10 4 -4 10 -4 -10 -10 -4 10 -4 z" />
        <path className={styles.spark} d="M240 42 l3.5 9 9 3.5 -9 3.5 -3.5 9 -3.5 -9 -9 -3.5 9 -3.5 z" />
        <path className={styles.spark} d="M262 108 l3 7.5 7.5 3 -7.5 3 -3 7.5 -3 -7.5 -7.5 -3 7.5 -3 z" />
      </g>
    </>
  )
}

/** Things she holds or shows — drawn in front of her hands. */
function MissyHeldProps() {
  return (
    <>
      <g className={`${styles.prop} ${styles.propDoc}`}>
        <rect x="140" y="198" width="60" height="50" rx="5" fill={PALETTE.paper} stroke={PALETTE.border} transform="rotate(-3 170 223)" />
        <g transform="rotate(-3 170 223)" stroke={PALETTE.brandSoft} strokeWidth="3.5" strokeLinecap="round">
          <line x1="150" y1="210" x2="190" y2="210" />
          <line x1="150" y1="220" x2="184" y2="220" />
          <line x1="150" y1="230" x2="190" y2="230" />
          <line x1="150" y1="240" x2="174" y2="240" />
        </g>
      </g>

      <g className={`${styles.prop} ${styles.propLaptop}`}>
        <rect x="126" y="254" width="88" height="7" rx="3.5" fill="#b9a392" />
        <path d="M136 254 L140 218 Q140 214 145 214 L195 214 Q200 214 200 218 L204 254 Z" fill={PALETTE.ink} />
        <rect className={styles.screenGlow} x="146" y="220" width="48" height="27" rx="3" fill={PALETTE.brandSoft} />
      </g>

      <g className={`${styles.prop} ${styles.propCard}`}>
        <rect x="238" y="160" width="72" height="52" rx="8" fill={PALETTE.paper} stroke={PALETTE.brand} strokeWidth="1.5" />
        <circle cx="254" cy="176" r="7" fill={PALETTE.sun} />
        <text x="254" y="180.5" fontSize="10" fontWeight="700" fill={PALETTE.paper} textAnchor="middle">
          !
        </text>
        <line x1="266" y1="173" x2="300" y2="173" stroke={PALETTE.border} strokeWidth="3.5" strokeLinecap="round" />
        <line x1="266" y1="181" x2="292" y2="181" stroke={PALETTE.border} strokeWidth="3.5" strokeLinecap="round" />
        <rect x="248" y="192" width="26" height="12" rx="6" fill={PALETTE.sage} />
        <rect x="279" y="192" width="26" height="12" rx="6" fill="#eaddd4" />
      </g>
    </>
  )
}

/** Everything, in draw order. */
export function MissyFullFigure({ uid }: { uid: string }) {
  return (
    <g className={styles.breathing}>
      <MissyAmbientProps />
      <MissyTorso uid={uid} />
      <MissyHead uid={uid} />
      <MissyArms uid={uid} />
      <MissyHeldProps />
      <ellipse cx="170" cy="270" rx="60" ry="8" fill={PALETTE.brandDeep} opacity="0.1" />
    </g>
  )
}
