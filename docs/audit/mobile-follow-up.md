# Mobile navigation and first use

The reported iPhone icon had a visible inset tile. The mobile toolbar also missed taps on search and the language selector. Rookie's mobile UI provided the reference for the rounded bottom bar with icons, short labels and a distinct active destination.

- The bottom dock provides Overview, Chapters, Atlas, PDF and Menu. The remaining pages are in a glass bottom sheet. Both respect safe-area insets. The sheet traps focus, closes with Escape and restores focus to Menu. The desktop sidebar stays available.
- Search has its own 44 px target. The native dialog opens synchronously in the tap handler so WebKit can focus the input during the user gesture. The backdrop dismisses on click. The language buttons have individual 44 px targets in a foreground toolbar and keep the open profile on language changes.
- The start screen introduces local analysis and report capabilities before asking for a MyHeritage export. Users can instead try the synthetic example. The guide appears whenever there is no open profile. It adds no browser storage.
- The PWA icon uses an opaque, full-bleed background and a centered nucleus. iOS masks the shape. The renamed touch icon URL separates it from the previous cached asset. An existing iOS Home Screen shortcut can retain its old icon until it is removed and added again.

[First entry on iPhone emulation](assets/mobile-intro.jpg) · [Mobile dock with synthetic data](assets/mobile-dock.jpg)

The new Playwright case uses touch events at 320 px to verify language switching before and after loading data, first-tap search focus and selection, and dock navigation. Physical iOS Home Screen masking and keyboard appearance need a device check.

## Verification

The production build passed 33 local Playwright tests with seven intentional profile skips. All 16 live iPhone and Pixel browser checks passed, including first-tap controls, local file input, no network traffic during the measured processing workflow, and offline PDF preview and export. See the [deployment record](../deployment.md#november-17-2026-mobile-follow-up).

## Header-free mobile layout

The mobile shell now omits the top bar. The dock contains Overview, Chapters, Search, and Menu. The menu includes Atlas, PDF, and the other secondary destinations. Its Settings section contains the language picker and the medical visibility toggle. The intro also offers language selection before data import. The dock opens the search input directly on the first tap.

Build `a3f4b42fd3cd1876` from `d63345e` shipped via [419e7e63](https://419e7e63.rootslocal.pages.dev/). The mobile rollback target is [b53b2dd1](https://b53b2dd1.rootslocal.pages.dev/).

## MyHeritage copy and chapter scrolling

At the breakpoint where Chapters becomes one column, the index now scrolls normally with the chapter text. Sticky positioning previously let the vertically stacked index cover the text. The browser regression checks this on both mobile profiles.

The repository description, [README](../../README.md#which-myheritage-download-to-use), portfolio card, and project detail now focus on the standard MyHeritage **DNA data file**. The README distinguishes the separately available WGS CRAM file and links the provider's source documentation.

App build `00d4ea5941d7502e` from `b3b66a1` went live via [4ecc0b2d](https://4ecc0b2d.rootslocal.pages.dev/) with [419e7e63](https://419e7e63.rootslocal.pages.dev/) as rollback. The portfolio went live via [137c6ace](https://137c6ace.maximilianauer.pages.dev/) with [15276057](https://15276057.maximilianauer.pages.dev/) as rollback.
