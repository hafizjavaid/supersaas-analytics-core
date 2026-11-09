# Installation

Add one script tag to your website and Pageviews start arriving within seconds. This page is for a self-hosted copy;
`https://analytics.example.com` stands for your copy's origin. To set up the copy itself, see
[Self-hosting on Cloudflare](self-hosting.md).

## 1. Add a Site

Sign in, open your Organization and choose **Add a website**. Give it a name, the domain you track, such as
`example.com`, and the timezone your days should follow. Each Site belongs to one Organization, and a domain can be
added once per Organization.

## 2. Copy the tracking snippet

Open the Site's **Settings → Install**. The **Tracking code** card shows the snippet with your Site's id filled in. It
looks like this:

```html
<script defer data-site="YOUR_SITE_ID" src="https://analytics.example.com/sd.js"></script>
```

The origin is your copy's own, unless `NUXT_PUBLIC_TRACKER_ORIGIN` sets another.

Put it on every page of the website, ideally just before the closing `</body>` tag. The `defer` attribute keeps it
from slowing the page down, and the script is under 1 KB gzipped.

> The snippet finds your Site from `data-site` and sends its hits to `/collect` on the same origin it was loaded from.
> If `data-site` is missing, it does nothing.

## 3. Check that it works

Open your website in a browser, then open the Site's **Live** page in the dashboard. You should appear as a Live
visitor within a few seconds.

If nothing shows up:

- Check the browser's network tab for a request to `/collect` that answers `204`. The answer is always `204`, even when
  the hit is dropped, so a `204` alone does not prove the hit was stored.
- Make sure your IP or the page's path is not excluded in **Settings → Filtering**.
- Ad blockers may block the script on another domain. [Proxy it through your own domain](proxying.md) to avoid that.

## What is collected automatically

With only the script tag, every page reports:

- **Pageviews**, with the path, the page title, the referrer's domain and any `utm_source`, `utm_medium`,
  `utm_campaign`, `utm_term` and `utm_content` parameters. The rest of the query string and the `#hash` are never
  sent, because they can hold personal data.
- **Route changes** in single-page apps, through the History API (`pushState`, `replaceState` and the back button).
- **Outbound links**: clicks on links to another domain.
- **Contact clicks**: `tel:`, `mailto:` and WhatsApp links, as the Events `Phone click`, `Email click` and
  `WhatsApp click`.
- **Form submits**, as the Event `Form submit`.
- **Clicks on marked elements**, any element with a `data-sd-event` attribute.

It never captures every button or every click. Country, region, city, browser, operating system and device type come
from the request itself, on your copy's side.

Events, `identify()` and the other tracking options are described in the
[hosted documentation](https://supersaasanalytics.com/docs), and work the same on a self-hosted copy.
