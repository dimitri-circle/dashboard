# Reactive Dot Ribbon

Reactive dot-ribbon animation for the main page, including the embeddable
custom element, demo page, and source pattern asset.

## Files

- `index.html` is the cleaned-up demo and tutorial page.
- `styles.css` styles the demo page only.
- `script.js` registers the `<reactive-dot-ribbon>` custom element.
- `dots-pattern.webp` is the source image sampled into animated dots.

## Page background usage

Add the background element once in the shared app layout, before the page
content. That makes it available on the login page and every other page that
uses the layout.

```html
<reactive-dot-ribbon
  background
  aria-hidden="true"
  source="/dots-pattern.webp"
></reactive-dot-ribbon>

<main class="page-content">
  ...
</main>

<script src="/script.js"></script>
```

Keep foreground content above the fixed background layer:

```css
.page-content {
  position: relative;
  z-index: 1;
}
```

The `background` mode is non-interactive, so it will not block login forms,
buttons, or page links.

## Inline interactive usage

Use the same element without the `background` attribute when the ribbon is part
of the page content.

```html
<reactive-dot-ribbon
  aria-label="Interactive halftone ribbon"
  hint="Move pointer through dots"
  source="/dots-pattern.webp"
  style="--dot-ribbon-aspect: 2048 / 1094;"
></reactive-dot-ribbon>
```

The inline version responds to pointer movement. The `hint` text is optional.

## Current attributes

- `source`: image path used to build the dot field. Defaults to
  `./dots-pattern.webp`.
- `hint`: short visible instruction for inline ribbons. Hidden when empty.
- `background`: switches the element to fixed full-page background mode.

## Useful CSS variables

- `--dot-ribbon-aspect`: inline aspect ratio.
- `--dot-ribbon-mobile-aspect`: optional mobile aspect ratio.
- `--dot-ribbon-min-height`: minimum rendered height.
- `--dot-ribbon-aura-strength`: glow intensity from `0` to `1`.
- `--dot-ribbon-aura-blur`: glow blur radius.
- `--dot-ribbon-aura-radius`: glow size around dots.
