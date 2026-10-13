# Rokach timetable

A family-created Hebrew, right-to-left grade-one timetable and packing checklist. It includes the supplied A1, A2 and A3 schedules, editable equipment, cover images for identification, optional read-aloud guidance and local PDF export. It is **not an official school website**; confirm schedules, editions and equipment with the teacher.

**Live site:** https://rokach-timetable.magalhoresh.com

## Run and test

Requires Node.js 22.12+ or 24+. The authoritative app is `site/index.html`: styles, application data, application code and existing third-party PDF libraries are bundled so downloaded personal HTML copies work offline.

```sh
npm ci
npm test
npm start
```

Open http://127.0.0.1:8080. This static preview supports the timetable, equipment settings and PDF export, but **does not host `/api/speak`**. To use speech, open the live site; the production API rejects unapproved origins.

Tests use Node's test runner and a **jsdom DOM simulation**, not a real browser. They cover all three schedules, preset selection, saved customizations, equipment migrations, packing order, settings, downloaded HTML, PDF source content, read-aloud text and speech API origin handling. Real-browser layout, PDF rasterization and audio playback need separate manual checks.

## Maintain

- `site/index.html`: change `app-data` for supplied schedules/equipment and `app-script` for behavior. Keep cover images embedded as data URLs so HTML downloads and local PDF rendering remain self-contained.
- `site/staticwebapp.config.json` and `site/robots.txt`: existing hosting, response-header and indexing configuration.
- `api/speak/`: managed Azure Functions HTTP endpoint. It reads `SPEECH_KEY` and `SPEECH_REGION` from existing Azure application settings; no credentials belong in source.
- `scripts/`: minimal localhost preview and code-only deployment helpers.

The math accessories pack is separate from the math book and notebook. The equipment revision migrates older device settings without clearing personal data, edited item names or disabled items. A3's unchanged, unconfirmed sports-clothes example is replaced by sports shoes; deliberately changed/confirmed equipment is retained. A1 keeps its supplied sports-day rules.

A1 remains the default for new installs. A2 is an additional preset, not a replacement for saved schedules or customizations; load it from onboarding or settings. Its six days and five periods follow the supplied image: combined lessons stay in one cell, Friday period five is empty, and sports shoes are required only on Monday and Friday. A2's supplied period times are listed in the help notes; timetable rows retain the existing period-number display without assuming those times apply to other classes. All three presets remain available in personal, class and blank grade HTML downloads.

The five-period presets fit on one landscape A4 weekly sheet in the desktop view and PDF export, including the accessories pack and all book covers. The weekly layout uses compact spacing; mobile lesson cards retain their larger text and controls. Longer or unusually dense custom schedules still paginate rather than hiding lessons or equipment.

## Deploy to the existing Azure app

Deployment is manual, not automatically triggered by GitHub pushes. Requires authenticated Azure CLI and [Azure Static Web Apps CLI](https://azure.github.io/static-web-apps-cli/) 2.0.10. No new resource, paid plan, DNS change or GitHub workflow is needed.

```sh
npm test
export AZURE_SUBSCRIPTION_ID="<subscription containing the existing app>"
npm run deploy
```

The helper targets only `swa-rokach-timetable` in `rg-rokach-timetable`, checks its existing Free SKU and original hostname, retrieves the existing deployment token into process memory and uploads `site/` with `api/`. It does not print or write the token. If `swa` is not on PATH, set `SWA_CLI_PATH` to its installed executable. Existing speech secrets stay in Azure settings. Verify the live HTTPS page after deployment.

## Privacy and consent

Public defaults have no child name, personal items or activities. Personal settings and checklists are saved in this browser's `localStorage`, not an application database. Storage is device/browser/**origin** specific: the original Azure hostname, custom domain and localhost do not share settings. Private browsing, clearing site data or storage restrictions can remove/prevent persistence. Downloaded personal HTML and PDFs can contain personal data: keep them private; never commit them.

Cloud read-aloud is off until a parent consents. After consent, the spoken item text, including any custom equipment text, is sent through `/api/speak` to Microsoft Azure Speech. Including a child's name in the greeting requires **separate, name-specific consent**. The application does not persist speech text/audio on its server; browser audio caching remains local. Hosting and Microsoft services may process their normal operational metadata under their own policies. The free speech service has quotas and rate limits; internet access is required for uncached audio. No microphone is used.

## Authorship and rights

Created by Magal Horesh. Copyright (c) 2026 Magal Horesh, **original application code and original documentation only**. No new software reuse license is granted by this repository's public visibility.

Third-party libraries, illustrations, covers and brands remain subject to their respective owners' rights and licenses; see [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md). Existing bundled license notices are preserved. Book covers are identification aids, not original artwork or a claim of ownership.
