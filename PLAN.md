# FitRank plan

This file is the source of truth for the prototype. If a later change conflicts with this document, update this file first and record why in `PROGRESS.md`.

## Project goal

FitRank is a rules-based fashion recommendation prototype. A user describes an occasion, style, category, colour, budget, and an optional priority. The app filters a local catalogue, scores the remaining products with a fixed weighted formula, and explains each match from attributes that are actually on the product.

It is a decision-support demo for a portfolio. It is not a shop.

## Scope and explicit exclusions

In scope:

- A catalogue of 14 fictional products
- Hard-constraint filtering
- Deterministic weighted scoring, ranking, and tie-breaking
- Human-readable explanations
- A preference form, a results view, and a comparison view for at most three products
- Validation and an empty-result state
- Automated tests for the engine
- This plan, `PROGRESS.md`, and `README.md`

Out of scope for this version:

- Authentication, accounts, and saved preferences
- Payments and a shopping cart
- A backend, database, or REST API
- External AI APIs and API keys
- Live retailer catalogues
- Analytics, feedback loops, and machine-learning rankers

## Architecture

The app is static HTML, CSS, and vanilla JavaScript. It runs locally with Node and does not install libraries. The browser and the tests import the same ES modules.

```text
index.html
css/styles.css
js/catalogue.js    product data only
js/weights.js      weights, vocabularies, material table
js/format.js       INR display
js/validate.js     preference checks
js/filter.js       budget and category gates
js/score.js        component scores and the 0–100 total
js/explain.js      reasons from real matches
js/recommend.js    validate, filter, score, rank, explain
js/compare.js      selection cap of three
js/main.js         form, results, and comparison events
server.js          zero-dependency static file server
test/engine.test.js
```

`server.js` exists because browsers block ES module imports from `file://`. `npm start` and `node server.js` both serve the folder at `http://127.0.0.1:5173`.

Data flow:

1. The form builds a preference object.
2. `recommend()` validates it.
3. `filterProducts()` drops anything over budget, outside the chosen categories, or missing required fields.
4. `scoreProduct()` scores each survivor.
5. `rankResults()` sorts by score, then by id.
6. `buildExplanation()` writes the reasons.
7. The page renders that return value. Results are never hardcoded.

## Data model

### Product

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | yes | Unique string. Also the tie-breaker. |
| `name` | yes | Fictional product name. |
| `category` | yes | One of the six catalogue categories. Matching is exact. |
| `colour` | no | Single colour. Compared case-insensitively. |
| `styles` | no | Subset of `minimalist`, `structured`, `classic`, `bold`, `artistic`. |
| `occasions` | no | Subset of `everyday`, `work`, `evening`, `travel`, `special`. |
| `material` | no | Free text. Craftsmanship scoring lowercases it and looks it up. |
| `comfortRating` | no | Number from 1 to 5. |
| `formalityRating` | no | Number from 1 to 5. Stored and shown. Not part of the score. |
| `price` | yes | Illustrative INR amount. |
| `description` | no | One short sentence. |
| `image` | no | Reserved. This version uses a CSS colour swatch instead. |

Prices and names are illustrative. They are not official retailer data.

Categories: Handbags, Jackets and coats, Dresses and skirts, Heels, Flats and loafers, Accessories.

A row without `id`, `name`, `category`, or a numeric `price` is skipped. Missing arrays are treated as empty. The engine does not throw on a missing optional field.

### Preferences

| Field | Required | Meaning |
| --- | --- | --- |
| `occasions` | yes | One or more allowed occasions. |
| `styles` | no | Allowed style tags. |
| `categories` | no | If empty, category does not filter or score. |
| `colours` | no | Lowercased before matching. |
| `maxBudget` | yes | Number greater than 0. Commas and a leading ₹ are accepted. |
| `priority` | no | `comfort`, `versatility`, `craftsmanship`, `statement`, or empty. |

Unknown occasions, styles, and priorities are validation errors. Unknown colours and categories are allowed so a future catalogue is not blocked by the form vocabulary; they simply match nothing.

## Scoring formula

### Hard filters

These run before scoring. They do not add points.

- Exclude `price > maxBudget`. A price equal to the budget stays.
- If `categories` is non-empty, keep only products whose `category` is in that list.
- If `categories` is empty, keep every in-budget product.

### Weights

Defined only in `js/weights.js`:

| Component | Weight |
| --- | --- |
| Occasion | 30 |
| Style | 25 |
| Category | 20 |
| Colour | 10 |
| Priority | 10 |
| Comfort or versatility | 5 |

The weights sum to 100.

### Component scores

Each active component is a number from 0 to 1.

Multiple selections use an overlap ratio, not all-or-nothing credit.

- **Occasion** is always active. Score = `matched occasions / selected occasions`.
- **Style** uses the same ratio. It is inactive when the user selected no style, so that weight is dropped instead of giving everyone a zero.
- **Category** is a gate. After the hard filter, every survivor scores 1. The weight is inactive when the user selected no category, because a flat bonus would not rank anything and would hide that the user set no category constraint.
- **Colour** is 1 when the product colour is in the selected list, otherwise 0. Inactive when no colour is selected. Matching is case-insensitive.
- **Priority** is inactive when unset.
  - Comfort: `comfortRating / 5`, clamped to 0–1. A missing rating scores 0.
  - Versatility: `min(1, number of occasions / 4)`. Four or more occasions is a full score. The divisor is a prototype choice: a piece worn for four of the five occasions is treated as fully versatile.
  - Craftsmanship: lookup in `MATERIAL_CRAFTSMANSHIP` (`leather` 1, `suede` 0.9, `wool` 0.85, `silk` 0.85, `cotton` 0.6, `linen` 0.6, `canvas` 0.55, `metal` 0.7, `synthetic` 0.35). An unknown or missing material scores 0, not a polite middle value.
  - Statement: 1 when the product styles include `bold` or `artistic`, otherwise 0.
- **Comfort or versatility** is always active. It is the average of the comfort ratio and the versatility ratio. If the comfort rating is missing, only versatility is used. If the occasions array is missing, only comfort is used. If both are missing, the component is 0. An empty occasions array is present data and means versatility 0.

### Total

```text
score = round(100 * sum(weight * component) / sum(active weights))
```

When every component is active the denominator is 100. Optional components that the user left blank are removed from both the numerator and the denominator, so skipping colour does not cap the score below 100.

### Ranking

Sort by score descending. If scores are equal, sort by `id` ascending with `localeCompare`. The same input always produces the same order.

### Explanations

`buildExplanation()` may only mention a match that the scorer recorded:

- Overlapping occasions and styles
- The category, only when the user required it and this product is in it
- The colour, only when it is in the user's list
- The priority sentence, only when that priority component is greater than 0
- The comfort rating, when a numeric rating exists and comfort was not already stated as the priority
- The price compared with the budget, which is true for every product that passed the filter

Unmatched colours, styles, and occasions are left out. They are never described as matches.

An empty eligible set returns `products: []` and a message telling the user to raise the budget or clear a category filter. Invalid preferences return `ok: false`, error strings, and no products.

## Implementation phases

1. Write this plan and `PROGRESS.md`.
2. Add the catalogue.
3. Implement validation, filtering, scoring, ranking, explanations, and comparison.
4. Test the engine with `node --test` and fix failures.
5. Build the three views.
6. Connect the views to `recommend()` and check the workflow in the browser.
7. Finish the README, record test results, and check the definition of done.

## Testing strategy

Tests live in `test/engine.test.js` and import the engine directly. They do not start the browser.

They cover:

- Products above budget are excluded, and a price equal to the budget is kept
- Selected categories are required, and an empty category list does not wipe the catalogue
- Occasion and style change scores
- Changing preferences can change rank order
- Repeated calls and equal scores stay deterministic
- Empty, non-numeric, and unknown preference values fail validation
- Missing optional product fields do not throw and do not earn a fake priority match
- No eligible products returns a message and an empty list
- Explanation text follows the attributes on the product
- Comparison stores at most three ids and does not mutate the caller's array
- The published weights still sum to 100
- The sample catalogue has 14 well-formed, unique products

Run `npm test` or `node --test`.

## Definition of done

- `npm start` or `node server.js` serves the app
- A user can submit preferences and get a ranked list from the real engine
- Scores and explanations come from product fields
- Comparison stops at three products
- Invalid input and zero matches are handled in the page
- The tests have been run and the results are written in `PROGRESS.md`
- `PLAN.md`, `PROGRESS.md`, and `README.md` match the code

## Future extensions

Do not build these in the current version:

- A real product database
- A backend REST API
- User accounts and saved preferences
- A real retailer catalogue
- Recommendation analytics and offline evaluation
- Machine-learning ranking
- Feedback and personalisation

The engine is already a pure function of `(products, preferences)`, so a later API can call `recommend()` without rewriting the rules.
