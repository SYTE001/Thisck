Redesign the existing Lyrics Motion Generator UI in the current repository from the ground up, while preserving the existing functionality and architecture unless a structural change is required.

REFERENCE SOURCE
- Repository: https://github.com/SYTE001/Thisck
- Read the repository and PRD completely before changing anything.
- Existing product already contains: lyrics parsing, LRC/Enhanced LRC support, timeline engine, audio handling, preview player, style controls, export flow, validation, motion/render logic, and project state.
- Do not rebuild core functionality just for visual changes.
- Treat the existing PRD and implementation as the functional source of truth.

VISUAL REFERENCE
Use the attached image as the visual language reference.

Color palette:
- Everest: #18442A
- Olive: #45644A
- Sand: #E4DBC4
- Off White: #F3EDE3

Use this palette as the foundation of the application UI, not as a decorative accent.

DESIGN DIRECTION
Create a premium editorial creative tool rather than a generic SaaS dashboard.

The interface should feel:
- editorial
- restrained
- sophisticated
- spacious
- intentional
- typography-first
- calm
- professional
- slightly experimental without becoming decorative

Avoid:
- purple gradients
- blue gradients
- neon
- excessive glassmorphism
- excessive rounded cards
- floating-card-everywhere layouts
- overly dense dashboards
- giant shadows
- gradient borders
- excessive icons
- meaningless decorative UI
- AI-generated SaaS visual language
- generic "AI tool" aesthetics

Use the attached reference's visual principles:
- deep green as the dominant base
- warm cream/off-white surfaces
- muted olive supporting color
- sand as a soft neutral
- strong typographic hierarchy
- generous spacing
- thin restrained borders
- editorial proportions
- simple geometric details
- very controlled contrast

CORE UX CHANGE

The current application is too compressed because multiple responsibilities are presented together.

Do NOT keep everything inside one editor page.

Break the application into clear product areas/pages with a persistent but minimal navigation system.

Recommended information architecture:

1. PROJECTS
   - Recent projects
   - New project
   - Open project
   - Import project
   - Project metadata
   - Delete / duplicate / rename

2. LYRICS
   Dedicated lyrics preparation and timing workspace.

   Include:
   - Upload LRC / Enhanced LRC / TXT / JSON
   - Lyrics source information
   - Parsed lyric list
   - Timestamp status
   - Timing source
   - Line-level / word-level indication
   - Lyrics editing
   - Split line
   - Merge line
   - Search
   - Global offset controls
   - Timing warnings
   - Audio attachment status

   This page should focus only on getting lyrics and timing correct.

3. TIMELINE
   Dedicated timeline editing workspace.

   Include:
   - audio waveform when audio exists
   - lyric tracks
   - playhead
   - timestamp markers
   - line blocks
   - duration
   - timing source
   - drag start/end
   - split / merge
   - global offset
   - quick ±100 / ±250 / ±500ms controls
   - zoom
   - snapping
   - preview selected segment
   - timeline quality warnings

   Make this page resemble a serious lightweight editing tool, not a dashboard.

4. DESIGN
   Dedicated visual styling / motion design workspace.

   Include:
   - live vertical 9:16 preview
   - typography controls
   - font
   - weight
   - size
   - line-height
   - alignment
   - text color
   - background color
   - scene variants
   - animation preset
   - enter / hold / exit behavior
   - word emphasis
   - decoration
   - grain
   - texture
   - safe area
   - composition position
   - editorial presets

   Organize controls progressively.
   Do not place every setting visibly at once.
   Use sections, disclosure panels, tabs, or progressive disclosure when appropriate.

5. PREVIEW
   Dedicated playback/review page.

   Include:
   - large 9:16 preview
   - play/pause
   - restart
   - scrub
   - current timestamp
   - previous / next lyric
   - mute
   - fullscreen
   - playback speed
   - timeline overview
   - timing source information

   The preview must use the same underlying timeline/render calculations as the actual export.

6. EXPORT
   Dedicated export page.

   Include:
   - project summary
   - timeline validation
   - audio status
   - output format
   - resolution
   - fps
   - audio inclusion
   - bitrate
   - export preset
   - custom export settings
   - export button
   - render progress
   - completed export state
   - warnings / blocking errors

   Make export feel like the final production stage rather than a modal buried inside the editor.

7. SETTINGS
   Keep application-level settings separate from project-level settings.

GLOBAL NAVIGATION

Create a persistent navigation structure that makes the workflow obvious:

Projects
Lyrics
Timeline
Design
Preview
Export

Possibly:
Settings

The active section should be visually obvious but subtle.

Do not turn navigation into a giant sidebar full of colored icons.

Prefer typography + restrained dividers + small indicators.

LAYOUT SYSTEM

Use a consistent editorial grid.

Desktop:
- generous outer margins
- max-width content
- large negative space
- clear primary/secondary column relationships
- stable alignment across pages

Do not let cards touch each other.

Do not stack multiple bordered containers with no breathing room.

Every major section should have visible spatial separation.

Use:
- section spacing
- intentional grouping
- clear hierarchy
- alignment
- whitespace

Spacing is part of the design system, not leftover empty space.

COMPONENT PRINCIPLES

Reduce "card clutter".

Only use containers when grouping information is functionally useful.

Prefer:
- flat sections
- subtle separators
- framed work areas
- editorial panels
- compact toolbars
- contextual controls

Instead of:
- card inside card inside card
- every field inside its own rounded box
- giant floating settings cards

BORDERS

Use restrained 1px borders with low visual weight.

Favor the palette:
- deep green
- olive
- muted cream
- sand

Avoid default generic gray SaaS borders everywhere.

TYPOGRAPHY

Typography must carry the hierarchy.

Use a sophisticated sans-serif UI font and an optional editorial display face for prominent creative previews.

Priorities:
1. clear hierarchy
2. readable labels
3. compact control typography
4. strong page titles
5. consistent numeric/timestamp typography
6. generous line-height where needed

Do not overuse bold.

Do not make every heading huge.

LYRICS UI

Lyrics should feel like an editorial text workspace.

Make the lyric list easy to scan:
- line number
- timestamp
- source
- lyric text
- duration
- warning state

Give the active line strong visual emphasis.

Use spacing between lyric rows.

Do not compress lines vertically.

Avoid putting too many controls inside every lyric row.

Contextual actions can appear on hover/selection.

TIMELINE UI

Timeline must receive the largest amount of spatial attention on its page.

Use a hierarchy similar to professional creative tools:
- top transport controls
- central timeline
- optional waveform
- lyric tracks
- bottom/side contextual information

Avoid making the timeline look like a collection of unrelated cards.

Use subtle olive/sand accents to distinguish selected states.

DESIGN WORKSPACE

Create a clear separation between:
- preview
- style controls
- animation controls

The preview should always have enough room to evaluate typography.

Do not let the settings panel visually overpower the composition preview.

Use sticky controls where helpful.

EDITORIAL THEMING

Base UI theme:

Everest / deep green:
#18442A

Olive:
#45644A

Sand:
#E4DBC4

Off-white:
#F3EDE3

Suggested relationships:
- main application background: Everest
- primary surfaces: slightly lighter/darker green derived from Everest
- secondary surfaces: Olive
- text on dark background: Off White
- muted text: Sand
- selected/active accents: Sand or Off White
- light creative preview surfaces: Off White / Sand
- primary dark text on light surfaces: Everest

Do not introduce random colors.

Color usage must be systematic.

CREATIVE PRESETS

Update the visual presets so they feel native to the new theme.

Examples:
- Deep Forest
- Olive Editorial
- Sand Paper
- Off White Editorial

Each preset should remain coherent with the core visual language.

Do not create presets that look like unrelated templates.

RESPONSIVE BEHAVIOR

Desktop is the primary editing environment.

Still ensure:
- tablet usability
- narrower desktop widths
- sensible collapse behavior
- no horizontal overflow
- timeline remains usable
- navigation becomes compact appropriately

Do not simply shrink desktop layouts.

Use responsive restructuring when necessary.

MOTION / MICROINTERACTIONS

Use motion sparingly.

Good:
- page transitions
- selection feedback
- subtle panel reveal
- timeline hover
- progress changes
- state transitions

Bad:
- excessive bouncing
- oversized spring animations
- floating cards
- constant movement
- decorative particle effects

The UI motion should support the editing workflow.

ACCESSIBILITY

Maintain:
- keyboard navigation
- visible focus states
- readable contrast
- semantic controls
- clear disabled states
- descriptive labels

Do not sacrifice usability for visual minimalism.

FUNCTIONAL PRESERVATION

Do NOT remove or fake any existing functionality.

Preserve:
- LRC parsing
- Enhanced LRC parsing
- TXT handling
- JSON import
- timing source abstraction
- audio handling
- timeline engine
- adaptive animation engine
- line-level / word-level behavior
- preview synchronization
- render pipeline
- export validation
- project state
- save/reopen/duplicate
- tests

Visual refactoring must not break timing correctness.

IMPORTANT PRODUCT RULES

Never generate fake timestamps.

Never change original lyric timing merely to make animation look better.

Animation must adapt to actual lyric duration.

Preview and final render must use the same timing logic.

All validation states must remain truthful.

IMPLEMENTATION PROCESS

Before modifying:
1. Read the existing source tree.
2. Read the PRD completely.
3. Inspect existing components and styles.
4. Identify current routing/page structure.
5. Identify which UI components can be reused.
6. Identify which UI components need restructuring.
7. Create a concrete implementation plan.

Then implement incrementally.

Do not rewrite the entire application blindly.

Do not create duplicate logic.

Do not move business logic into UI components.

Keep the data model and rendering logic stable unless required.

USE /IMPECCABLE AS THE DESIGN REVIEW ENGINE

Apply the selected Impeccable skill throughout the redesign.

Use it to:
- identify hierarchy problems
- remove AI slop
- improve spacing
- improve typography
- improve component density
- improve interaction clarity
- refine visual rhythm
- simplify unnecessary UI
- reduce card clutter
- improve responsive behavior
- improve consistency
- refine states
- polish microinteractions
- eliminate weak or generic patterns

After the first implementation pass, run an explicit design refinement pass.

Look at the result as a senior product designer would:
- What feels crowded?
- What feels disconnected?
- What is visually competing with the important task?
- Which controls should be grouped?
- Which controls should disappear until needed?
- Where does spacing feel accidental?
- Where does the interface still look like a generic AI-generated dashboard?
- What can be removed without reducing functionality?
- Which areas need stronger hierarchy?
- Which screens need stronger editorial character?

Then refine.

QUALITY BAR

The finished application should feel like a serious creative production tool with an editorial identity.

It should feel:
- designed
- intentional
- calm
- premium
- structured
- spacious
- coherent

It must not feel:
- auto-generated
- template-heavy
- cramped
- dashboard-like
- overly decorative
- visually noisy

FINAL VERIFICATION

After implementation:
1. run typecheck
2. run lint
3. run tests
4. run build
5. inspect every redesigned page
6. verify responsive layouts
7. verify import flow
8. verify lyrics flow
9. verify timeline flow
10. verify design flow
11. verify preview
12. verify export
13. confirm existing timing behavior remains intact

Do not mark the redesign complete just because the code compiles.

The result must be visually coherent AND functionally intact.

START NOW:
Inspect the existing Thisck repository first, understand the current implementation, then redesign the application using this information architecture and visual system.