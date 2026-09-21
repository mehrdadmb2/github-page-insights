CLOUDFLARE D1 CONSOLE INSTALL ORDER - UNIVERSAL EVENT INSIGHTS v8

Run EVERY numbered .sql file separately, exactly one file/query at a time.
Do not paste multiple statements into the D1 Console.
Do not add BEGIN TRANSACTION or COMMIT.

01-07  Reset old schema (data loss allowed)
08-14  Create tables
15-44  Create indexes
45-46  Seed schema metadata
47-55  Verify installation

The first 44 files change the database. Verification files only read it.
