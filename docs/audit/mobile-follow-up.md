# Mobile navigation and first use

The reported iPhone icon had a visible inset tile. The mobile toolbar also missed taps on search and the language selector. Rookie's mobile UI provided the reference for the rounded bottom bar with icons, short labels and a distinct active destination.

- The bottom dock provides Overview, Chapters, Atlas, PDF and Menu. The remaining pages are in a glass bottom sheet. Both respect safe-area insets. The sheet traps focus, closes with Escape and restores focus to Menu. The desktop sidebar stays available.
- Search has its own 44 px target. The native dialog opens synchronously in the tap handler so WebKit can focus the input during the user gesture. The backdrop dismisses on click. The language buttons have individual 44 px targets in a foreground toolbar and keep the open profile on language changes.
- The start screen introduces local analysis and report capabilities before asking for a MyHeritage export. Users can instead try the synthetic example. The guide appears whenever there is no open profile. It adds no browser storage.
- The PWA icon uses an opaque, full-bleed background and a centered nucleus. iOS masks the shape. The renamed touch icon URL separates it from the previous cached asset. An existing iOS Home Screen shortcut can retain its old icon until it is removed and added again.

[First entry on iPhone emulation](assets/mobile-intro.jpg) · [Mobile dock with synthetic data](assets/mobile-dock.jpg)

The new Playwright case uses touch events at 320 px to verify language switching before and after loading data, first-tap search focus and selection, and dock navigation. Physical iOS Home Screen masking and keyboard appearance need a device check.
