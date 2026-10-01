# Cloudflare Workers Builds — Required Repository Configuration

The Worker is intentionally deployed by Cloudflare Workers Builds from GitHub.

## Production

```text
Repository: mehrdadmb2/github-page-insights
Branch: main
Root directory: /
Build command: npm run check
Deploy command: npx wrangler deploy
Preview command: npx wrangler preview
```

## Watch paths

### Include

```text
worker/*
wrangler.jsonc
package.json
package-lock.json
scripts/*
```

### Exclude

```text
data/*
docs/*
db/*
tests/*
.github/*
README.md
*.md
LICENSE
```

Why: the Worker writes telemetry archives into `data/` in the same repository. Those commits must not retrigger the Worker build.
