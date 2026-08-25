# Viewport matrix definitions

## Ordinary responsive rows

For widths/heights such as `320×568`, `390×844`, `720×560`, `1408×900`, `1440×900`,
and `1440×560`, **PASS** means:

- `document.documentElement.scrollWidth - window.innerWidth <= 0`
- primary navigation targets retain at least `44px` CSS height
- primary CTA and truth qualifier remain readable without clipping at `window.innerWidth`

Record `window.innerWidth`, `window.innerHeight`, and
`document.documentElement.scrollWidth`.

## 1.5 factor rows are not one test

| Mode | What it is | Expected result |
|---|---|---|
| Browser zoom 150% | CSS viewport shrinks; layout reflows | Treat as ordinary narrow-width PASS/FAIL |
| OS display scaling | Device pixel ratio changes; CSS px usually stable | Not a layout contract unless CSS px change |
| CDP `Emulation.setPageScaleFactor(1.5)` / pinch zoom | `visualViewport` shrinks; page may require pan | Mark **AMBIGUOUS** unless the matrix explicitly allows panning and retains a screenshot |

Do **not** report an unqualified `PASS` for CDP page scale merely because
`document.documentElement.scrollWidth` equals `window.innerWidth` while
`visualViewport.width` is ~203 CSS pixels and the screenshot clips chrome.

For page-scale rows, always record:

```text
window.innerWidth
document.documentElement.scrollWidth
window.visualViewport.width
window.visualViewport.scale
pageScaleFactor
screenshot retained: yes/no
panning allowed: yes/no
result: PASS | FAIL | AMBIGUOUS
```
