# Contributing

Reproducible issues and focused improvements are welcome. Provide only redacted or synthetic data; do not upload private notes, subscription credentials, personal exports or access tokens.

1. Use Node.js 22 or newer.
2. Run `npm ci --ignore-scripts --registry=https://registry.npmjs.org`.
3. Add meaningful `node:test` coverage for behavior changes and run `npm test`.
4. Update CLI help and the README. Include an official reference and synthetic fixture for newly supported upstream formats.

Keep operations read-only, offline and deterministic. Reuse established format parsers. Do not introduce telemetry, automatic uploads, source-file changes or implicit network requests. Dependency updates should include the lockfile and explain why the change is needed.

Pull requests and issues in Chinese or English are welcome. This independent project does not speak for its upstream ecosystems.
