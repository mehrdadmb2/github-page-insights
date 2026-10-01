Universal Event Insights v9 / Cloudflare D1 Console

IMPORTANT:
- Execute ONE numbered file at a time.
- Do not paste the whole folder into one D1 Console query.
- Files 01-07 reset the database. They delete existing data. Use them only when a clean rebuild is intended.
- Files 08-14 create tables.
- Files 15-44 create indexes.
- Files 45-46 seed schema metadata.
- Files 47-55 verify the result.
- The full release also contains tests/validate.mjs for local/static smoke validation.
- Do NOT use BEGIN TRANSACTION / COMMIT in the Dashboard Console workflow used by this project.
