# main-page-animation

Reactive dot-ribbon animation for the main page, including the embeddable
custom element, demo page, and source pattern asset.

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
