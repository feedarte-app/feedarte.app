# Knowledge-base media

Screenshots and short animations for `/help` live in `web/public/help-media/` and are served at `/help-media/*`.
Articles reference them as `![caption](/help-media/name.webp)` (see `web/src/help/articles.ts`).

Regenerate after UI changes:

1. Run the app locally with the 600-item sample feed and admin user.
2. `node scripts/help-media.cjs <feedId> /tmp/media` — PNG screenshots + WEBM recordings (with a visible fake cursor).
3. Convert:
   - PNG → WebP: `ffmpeg -i x.png -c:v libwebp -quality 82 x.webp`
   - WEBM → animated WebP: `ffmpeg -ss 2.5 -i gif-x.webm -vf "fps=10,scale=800:-1" -c:v libwebp_anim -loop 0 -quality 70 -compression_level 6 x.webp`
     (crops used: attach `crop=600:720:340:80,scale=480:-1`, rulers `crop=700:760:280:40,scale=520:-1`)
4. Copy into `web/public/help-media/`.

## Public guides on feedarte.com
The knowledge base is also published as SEO pages at feedarte.com/guides/. After changing
`web/src/help/articles.ts` or `web/public/help-media/`, run `npm run build:site` and commit
the regenerated `landing/guides/`, `landing/help-media/`, `landing/sitemap.xml`.
SEO titles/descriptions per article live in `scripts/build-site.ts` (SEO map) — add one for new articles.
