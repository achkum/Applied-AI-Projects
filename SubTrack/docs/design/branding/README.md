# Norrsken brand studies — ST-029a

The [concept sheet](concept-sheet.html) collects original icon, splash and imagery-led store-art studies. Open it locally; Fraunces and Manrope resolve from the repository's bundled variable font files at `packages/ui/src/stories/screens/fonts/`. The OFL notices are next to those files. No remote assets or scripts are used.

## Token map

| Use | Token |
| --- | --- |
| Dark / light grounds | `bg.canvas` |
| Main type | `ink.primary` |
| Supporting type and orbit line | `ink.secondary` |
| Three bodies / wordmark sweep | `aurora.violet`, `aurora.teal`, `aurora.green` |
| Display / interface type | `typography.fontFamily.display` (Fraunces) / `typography.fontFamily.ui` (Manrope) |
| Arrival spring | `motion.spring` |

The icon uses body size and placement as well as color, so its three bodies remain distinct in the monochrome study. The splash subtitles reproduce the product contract in Swedish and English. Static artwork is the reduced-motion end state. The timing and easing are design notes only.

## Platform questions kept open

Official Apple and Google documentation could not be retrieved on 2026-10-05: the environment proxy returned HTTP 403 before TLS or document response. References attempted on that date: Apple screenshot specifications (https://developer.apple.com/help/app-store-connect/reference/screenshot-specifications/), app preview specifications (https://developer.apple.com/help/app-store-connect/reference/app-preview-specifications/), and app icons (https://developer.apple.com/design/human-interface-guidelines/app-icons); Google Play graphics requirements (https://support.google.com/googleplay/android-developer/answer/9866151?hl=en), screenshot guidance (https://support.google.com/googleplay/android-developer/answer/1078870?hl=en), and adaptive icons (https://developer.android.com/develop/ui/views/launch/icon_design_adaptive). Exact dimensions, formats, safe zones, file limits, locale rules and platform listing slots remain unconfirmed. These SVG canvases are local studies, not verified exports or compatibility claims. Widget artwork is deferred because no MVP widget requirement was found. Store-art canvas is intentionally platform-neutral and carries no embedded localized text.

Production export requirements, platform review, independent client/design review, and G-DESIGN remain open under parent ST-029.
