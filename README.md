# Mahasagar storefront (mahasagar.com)

Static site — no build step. Open `index.html` or serve the folder.

```
index.html          home
products.html       full catalogue
product/*.html      one page per product
cart.html           cart
checkout.html       checkout
order.html          order confirmation
track.html          order tracking
assets/site.css     design system
assets/app.js       cart, order API, animations
img/                product photos + brand marks
```

## Turning on online ordering

Ordering is **off by default**: without a reachable backend the cart checks out by
email instead, so a visitor never meets a form that cannot submit.

To switch it on, deploy the Mahasagar API publicly and add this line to
`cart.html`, `checkout.html`, `order.html` and `track.html`, immediately **before**
`<script src="assets/app.js">`:

```html
<script>window.MAHASAGAR_API = "https://api.mahasagar.com/api/v1";</script>
```

The API origin must also list `https://mahasagar.com` in its `CORS_ORIGINS`.

## Regenerating pages

Product pages are generated from the platform catalogue (see the internal
`build-v2.py` / `export-site-data.cjs` scripts). `assets/site.css` and
`assets/app.js` are hand-written — edit them directly.
