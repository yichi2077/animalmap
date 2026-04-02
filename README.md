# animalmaps

An interactive Australia wild time atlas built with Next.js.

## Development

```bash
npm install
npm run dev
```

Optional map configuration:

```bash
cp .env.example .env.local
```

Validation:

```bash
npm run validate:map
npm run validate:regions
npm run validate:content
npm run validate:assets
```

Current Release A keeps unresolved media in explicit placeholder states instead of pointing at missing files.
`species.json` carries `assetStatus`, `reviewStatus`, `media`, and `sources`; `timeline.json` carries `evidenceType`; `audio.json` only points to a file when audio is genuinely available.

## Production

```bash
npm run build
npm run start
```
