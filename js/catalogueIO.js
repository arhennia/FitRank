import {
  AVAILABILITY,
  CATEGORIES,
  COLOURS,
  OCCASIONS,
  STYLES,
} from "./weights.js";

const RATING_FIELDS = ["comfortRating", "versatilityRating", "formalityRating", "averageRating"];

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function splitList(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || value.trim() === "") return [];
  return value.split("|").map((part) => part.trim()).filter(Boolean);
}

function optionalNumber(value) {
  if (value == null || value === "") return undefined;
  const number = typeof value === "number" ? value : Number(String(value).replace(/[₹,\s]/g, ""));
  return number;
}

/**
 * Keep the first row for an id. Later copies are reported and dropped.
 * This is identifier hygiene, not cross-listing duplicate detection.
 */
export function validateCatalogue(records) {
  const errors = [];
  const warnings = [];
  const products = [];
  const seen = new Set();
  const list = Array.isArray(records) ? records : [];

  list.forEach((record, index) => {
    const row = index + 1;
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      errors.push(`Row ${row}: record is missing.`);
      return;
    }

    const id = asString(record.id);
    if (!id) {
      errors.push(`Row ${row}: id is required.`);
      return;
    }
    if (seen.has(id)) {
      errors.push(`Row ${row}: duplicate id "${id}" was skipped.`);
      return;
    }

    const rowErrors = [];
    const name = asString(record.name);
    const category = asString(record.category);
    const brand = asString(record.brand);
    const currency = asString(record.currency).toUpperCase();
    const price = optionalNumber(record.price);
    if (!name) rowErrors.push(`Row ${row}: name is required.`);
    if (!category) rowErrors.push(`Row ${row}: category is required.`);
    else if (!CATEGORIES.includes(category)) rowErrors.push(`Row ${row}: category "${category}" is not recognised.`);
    if (!brand) rowErrors.push(`Row ${row}: brand is required.`);
    if (!Number.isFinite(price) || price <= 0) rowErrors.push(`Row ${row}: price must be a number greater than 0.`);
    if (currency !== "INR") rowErrors.push(`Row ${row}: currency must be INR.`);

    const styles = splitList(record.styles).map((style) => style.toLowerCase());
    const occasions = splitList(record.occasions).map((occasion) => occasion.toLowerCase());
    const colours = splitList(record.colours).map((colour) => colour.toLowerCase());
    const sizes = splitList(record.sizes);
    for (const style of styles) {
      if (!STYLES.includes(style)) rowErrors.push(`Row ${row}: style "${style}" is not recognised.`);
    }
    for (const occasion of occasions) {
      if (!OCCASIONS.includes(occasion)) rowErrors.push(`Row ${row}: occasion "${occasion}" is not recognised.`);
    }
    for (const colour of colours) {
      if (!COLOURS.includes(colour)) warnings.push(`Row ${row}: colour "${colour}" is unknown and will not match the form list.`);
    }

    const availability = asString(record.availability);
    if (availability && !AVAILABILITY.includes(availability)) {
      rowErrors.push(`Row ${row}: availability "${availability}" is not recognised.`);
    }

    const numeric = {};
    for (const field of RATING_FIELDS) {
      if (record[field] == null || record[field] === "") continue;
      const value = optionalNumber(record[field]);
      if (!Number.isFinite(value) || value < 1 || value > 5) {
        rowErrors.push(`Row ${row}: ${field} must be from 1 to 5.`);
      } else {
        numeric[field] = value;
      }
    }
    if (record.reviewCount != null && record.reviewCount !== "") {
      const count = optionalNumber(record.reviewCount);
      if (!Number.isInteger(count) || count < 0) rowErrors.push(`Row ${row}: reviewCount must be an integer of 0 or more.`);
      else numeric.reviewCount = count;
    }

    const colour = asString(record.colour).toLowerCase();
    if (colour && colours.length > 0 && !colours.includes(colour)) {
      warnings.push(`Row ${row}: primary colour "${colour}" is not in colours.`);
    }
    if (colour && !COLOURS.includes(colour)) {
      warnings.push(`Row ${row}: colour "${colour}" is unknown and will not match the form list.`);
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      return;
    }

    seen.add(id);
    const product = {
      id,
      name,
      category,
      brand,
      price,
      currency: "INR",
      colour: colour || colours[0] || "",
      colours: colours.length > 0 ? colours : (colour ? [colour] : []),
      styles,
      occasions,
      ...numeric,
    };
    if (sizes.length > 0) product.sizes = sizes;
    if (availability) product.availability = availability;
    for (const field of ["material", "silhouette", "fit", "care", "description"]) {
      const text = asString(record[field]);
      if (text) product[field] = text;
    }
    if (record.material) product.material = asString(record.material).toLowerCase();
    products.push(product);
  });

  return { products, errors, warnings };
}

export function parseJsonCatalogue(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { products: [], errors: ["Catalogue JSON could not be parsed."], warnings: [] };
  }
  const records = Array.isArray(data) ? data : data?.products;
  if (!Array.isArray(records)) {
    return { products: [], errors: ["Catalogue JSON must be an array or an object with products."], warnings: [] };
  }
  return validateCatalogue(records);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  const source = String(text).replace(/^\uFEFF/, "");
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (inQuotes) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((columns) => columns.some((column) => column.trim() !== ""));
}

export function parseCsvCatalogue(text) {
  const rows = parseCsv(text);
  if (rows.length === 0) return { products: [], errors: ["Catalogue CSV is empty."], warnings: [] };
  const header = rows[0].map((column) => column.trim());
  const records = rows.slice(1).map((columns) => {
    const record = {};
    header.forEach((key, index) => {
      record[key] = columns[index] ?? "";
    });
    return record;
  });
  return validateCatalogue(records);
}
