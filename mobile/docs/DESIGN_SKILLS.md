# TwoPlus.fit design skill index

Project-local register of installed design skills: what each is for, where it lives,
when the agent must load it, and what it cannot do. Read this before any UI work on
the member mobile app (`mobile/`).

## Installed and active

| Skill | Repo / source | Installed at | Use it for | Platform |
|---|---|---|---|---|
| `ui-ux-pro-max` | nextlevelbuilder/ui-ux-pro-max-skill | `~/.agents/skills/ui-ux-pro-max` | Design-system tokens, typography/palette lookup (searchable CSVs: typography, colors, styles, ux-guidelines, motion, charts), accessibility + touch-target rules, stack guidance | Web + mobile concepts; RN via judgment |
| `impeccable` | pbakaus/impeccable | `~/.agents/skills/impeccable` | UX critique pass, visual hierarchy review, accessibility audit, polish loop after implementing a screen | Framework-agnostic critique; applies to RN screens |
| `design-taste-frontend` (taste skill) | jeettrench/taste-skill | `~/.agents/skills/design-taste-frontend` | Anti-generic art direction: researched direction deals (idea, composition, type, palette), no-slop house style, screenshot look-and-fix loop | Web-first; direction principles portable to RN |
| `antislop` (core) | antislop system | `~/.agents/skills/antislop` | The core filter: purpose test, three tiers, delivery gate. Load ALWAYS for UI work | Any UI |
| `antislop-ui` | antislop system | `~/.agents/skills/antislop-ui` | UI depth: color, gradients (forbidden defaults), glass dose cap (R-10: 1–2 elements max), radius/shadow/glow discipline, no grid backgrounds, no dark-mode default | Any UI |
| `antislop-layoutmobile` | antislop system | `~/.agents/skills/antislop-layoutmobile` | Mobile layout discipline: reflow not shrink, tap targets, breakpoint by content not device list | Applies directly to RN layout thinking |
| `antislop-copywriting` | antislop system | `~/.agents/skills/antislop-copywriting` | Screen copy, CTAs, empty states, errors | Any |
| `antislop-human` | antislop system | `~/.agents/skills/antislop-human` | Contrast, focus, states, accessibility for people | Any UI |
| `gsap-core` + timeline/scrolltrigger/react/plugins/utils/performance/frameworks | greensock/gsap-skills | `~/.agents/skills/gsap-*` | **Web surfaces only.** GSAP is already a dependency of the web app | ❌ NOT for the RN app (no DOM). Use `motion` (react-native-reanimated) there |
| `webapp-testing` | built-in | `~/.agents/skills/webapp-testing` | Playwright screenshots of the Expo web preview for the review loop | Web preview of the mobile app |

## Evaluated, not installable (verified 2026-11-15)

| Repo | Verdict |
|---|---|
| `reyjoypsabino/mobile-app-ux-design-skill` | **Stub**: working tree contains only README.md + .gitignore. The README describes a packaged skill (HIG/Material 3/WCAG 2.2 AA) but no SKILL.md or references ship in the repo. skills CLI: `SKILLS_NO_VALID_SKILLS`. Its standards are covered below by our own design system + impeccable/antislop-human. |
| `DavidHDev/react-bits` | **Not a skill**: a React web component-library site (vite app). No SKILL.md. Web-only; would add a dependency for component inspiration we do not need. Skipping. |
| `darkroomengineering/lenis` | Smooth-scroll for web surfaces. The member app is RN (native scrolling is correct). Only candidate: marketing web page, which has no scroll problem today. Not installed. |

## Activation map — when to load what

1. Any UI change → `antislop` core first, then by concern:
   - layout/screens → `antislop-layoutmobile`
   - color/components → `antislop-ui`
   - copy → `antislop-copywriting`
2. Choosing tokens (type, palette, spacing) → `ui-ux-pro-max` CSV search
3. Starting a new screen from scratch → `design-taste-frontend` for direction, then strip web-only parts
4. After implementing → `impeccable` critique + screenshot loop (Expo web preview via `webapp-testing`)
5. Web marketing pages only → `gsap-*`
6. Never load: react-bits, lenis, GSAP skills for RN work

## Conflicts and resolution

- `design-taste-frontend` web techniques (backdrop blur, scroll effects) vs RN:
  use its *direction* (composition, type, palette), not its *techniques*.
- antislop R-10 glass cap vs existing TwoPlus web glassmorphism: brand direction
  overrides (already decided in the web redesign). The mobile app does NOT inherit
  the glass look; it follows this project's mobile design system instead.
- impeccable boldness vs antislop restraint: for a consumer fitness app, bold color
  is the brand; restraint applies to decoration, not palette.
