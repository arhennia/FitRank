# FitRank

FitRank is a small, rules-based fashion recommendation prototype. You choose an occasion, a style, optional categories and colours, a maximum budget in INR, and an optional priority. The app filters a local catalogue of 14 fictional products, scores what remains, and explains each match from attributes on the product.

It is a decision-support demo. It does not sell anything, store accounts, or call an external API.

## Features

- Preference form with validation, reset, and edit
- Hard filters for budget and, when you select them, categories
- A deterministic weighted score from 0 to 100
- Ranked results with a short explanation for each product
- Side-by-side comparison of up to three products
- A clear message when nothing qualifies

## Architecture

The page is HTML, CSS, and vanilla JavaScript. Node is used only to serve the files and to run tests. There is no database and no installed library.

```text
index.html              three views on one page
css/styles.css
js/catalogue.js         product data, separate from the rules
js/weights.js           the only place the weights live
js/validate.js          preference checks
js/filter.js            budget and category gates
js/score.js             component scores and the 0–100 total
js/explain.js           reasons from real matches
js/recommend.js         ties the engine together
js/compare.js           three-product limit
js/main.js              form and view events
server.js               static file server
test/engine.test.js     engine tests, no browser
```

The browser and the tests import the same modules. `recommend(products, preferences)` is a pure function, so a later API can call it without rewriting the rules.

Open the app through the server. Loading `index.html` directly from disk blocks ES module imports in most browsers.

## Scoring

Weights, in `js/weights.js`:

| Component | Weight | How it is scored |
| --- | --- | --- |
| Occasion | 30 | Matching occasions divided by the number you selected |
| Style | 25 | Same overlap ratio. Dropped if you select no style |
| Category | 20 | A gate. Survivors score 1. Dropped if you select no category |
| Colour | 10 | 1 if the product colour is in your list, otherwise 0. Dropped if you select no colour |
| Priority | 10 | Comfort, versatility, craftsmanship, or statement. Dropped if unset |
| Comfort or versatility | 5 | Average of comfort rating / 5 and occasions / 4 |

```text
score = round(100 * sum(weight * component) / sum(active weights))
```

Optional components you leave blank are removed from both sides of the fraction, so skipping colour does not stop a strong match from reaching 100.

Budget is not a weight. Any product priced above the maximum is removed before scoring. A price equal to the budget stays. Selected categories are required. If you leave category blank, every in-budget product can still appear.

Several styles or occasions earn partial credit. One match out of three selected styles is `1/3`, not a full style score and not a zero.

Versatility treats four occasions as a full score. Craftsmanship uses a small material table in `js/weights.js`; an unknown material scores 0. Statement design scores 1 only when the product is tagged `bold` or `artistic`. A missing comfort rating scores 0 for a comfort priority, and it is left out of the always-on comfort/versatility average instead of being treated as a fake high score.

Equal scores are ordered by product id, so the same answers always produce the same list.

Explanations mention only overlaps the scorer recorded, plus the price, which is under the budget because the filter already checked it. A colour, style, or occasion that did not match is omitted. It is never called a match.

`formalityRating` is stored and shown. It is not part of the formula.

## Setup and run

Requires Node.js 18 or newer. No `npm install` step.

```bash
npm start
```

Or, without npm:

```bash
node server.js
```

Then open [http://127.0.0.1:5173](http://127.0.0.1:5173).

The catalogue prices are illustrative sample figures, not shop listings. The product names are fictional.

## Testing

```bash
npm test
```

Or:

```bash
node --test
```

The tests cover budget exclusion, category constraints, occasion and style effects, rank changes, deterministic ties, invalid input, missing product fields, the empty result, explanation text, and the three-product comparison limit.

## Limitations

- The catalogue has 14 hand-written products. It is not a retailer feed.
- Scores are transparent rules, not learned from shoppers.
- Colour is a single value per product, not a list.
- Category matching is an exact string match.
- Formality is displayed and does not change the score.
- There is no account, saved search, cart, or checkout.

## Future roadmap

These are intentionally not in this version:

- A real product database
- A backend REST API
- User accounts and saved preferences
- A live retailer catalogue
- Recommendation analytics and evaluation
- Machine-learning ranking
- Feedback and personalisation

`PLAN.md` records the current scope and the scoring rules. `PROGRESS.md` records what has been finished and the latest test run.
