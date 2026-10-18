# Out West Septic quote request form

A static inquiry form with a reviewable email draft by default and an optional configured form service. `OutWestSepticQuoteForm` validates configuration and input, preserves request details, and distinguishes preparing a draft from receiving a submission response. No build step or production JavaScript dependencies are required.

## Run locally

```sh
python -m http.server 8000 --bind 127.0.0.1
```

Open `http://127.0.0.1:8000`. Serve the directory over HTTP; opening the HTML directly as a `file:` URL may prevent loading the configuration.

## Delivery configuration

`form-config.json` is the single source for delivery settings. The page keeps submission disabled if the configuration cannot be loaded or validated. It never switches a broken webhook to email.

```json
{
  "submit_mode": "mailto",
  "recipient_email": "sales@outwestseptic.com",
  "webhook_url": ""
}
```

In `mailto` mode, the submit button prepares a preview. The visitor reviews the complete text and chooses whether to open an email draft. They must send it in their email app. Nothing is automatically emailed, and the page cannot observe delivery. Long requests remain available as copyable text instead of creating a potentially unusable mail URI; the 1,800-character URI cutoff is a conservative project choice, not a universal mail-client limit.

For `webhook` mode, set `webhook_url` to an HTTPS endpoint you control or have approved to receive personal information. The URL must have no embedded credentials or fragment. Its origin is shown to the visitor before submission. Do not put secrets in this public file.

The endpoint must accept a JSON POST and allow the page's origin through CORS. The payload includes the named contact/property fields and a `services` array containing every selected topic. Requests omit credentials and referrer information, reject redirects, and time out after 15 seconds. A successful HTTP response means the service accepted the request; it does not prove inbox delivery or promise a response time. Failure or timeout preserves the fields and asks the visitor to confirm receipt before retrying. Concurrent submissions from this page are blocked while one is pending.

## Inputs and privacy

Required text is trimmed; whitespace-only fields, unlisted counties/topics, and invalid bedroom counts are rejected. Length limits reject oversized input instead of silently truncating it. The optional bedroom count accepts whole numbers from 1 through 10 as inquiry information, not as a system-sizing calculation. Service choices are topics to discuss, not promises that a service is available for a property.

The page does not store form details in cookies or browser storage. Email providers or the selected form-service provider handle information the visitor chooses to send. Avoid gate codes, passwords, payment details, and other access credentials. This repository provides no backend, spam protection, or delivery monitoring. A configured backend still needs its own validation, access controls, rate limits, retention policy, and privacy review; client-side checks do not enforce those controls.

## Public contact source

The default email and displayed phone number were checked against the [Out West Septic official website](https://outwestseptic.com/) on October 18, 2026. The site describes Palo Pinto County and nearby priority areas and calls for confirmation of the property's actual location and county. The form's county choices do not guarantee service throughout those counties. Parker and Tarrant are excluded from the choices.

Recheck the public contact and priority-area information before publishing a changed configuration. No independent licensing assertion, free-visit promise, or response-time commitment is made by this form.

## Tests

Node 22 or newer:

```sh
npm ci
npm test
npx playwright install chromium --only-shell
npm run test:browser
```

Node tests cover configuration, input boundaries, selected services, and mail URI encoding. Chromium tests exercise the rendered form, alternate configuration, missing configuration, inert user text, long drafts, webhook responses/failures, and mobile layout. All form data is synthetic; external submissions are intercepted and email apps are never opened. CI pins action commits and test dependency versions. Local screenshots and test output stay under ignored `output/playwright/`.

## License

MIT. See `LICENSE`.
