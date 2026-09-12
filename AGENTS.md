# Repository Guidelines

## Project Structure & Module Organization

- `src/` contains the published ESM implementation and CLI: `client.js`, `server.js`, `startServer.js`, `index.js`, and `cli.js`.
- `src/client.test.js` contains Jest integration tests; Jest snapshots are stored in `src/__snapshots__/`.
- `docker/` contains the Dockerfile and container-specific documentation.
- `README.md` documents the public API and development workflow. `CHANGELOG.md` records releases.
- `mise.toml` pins Node.js 24 for local development.

## Build, Test, and Development Commands

Install the locked dependency set with `npm ci`.

- `npm start` runs the CLI/server on the default port (4000).
- `npm run dev` runs the server through Nodemon for automatic restarts.
- `npm test` runs Jest in watch mode.
- `npm run coverage` runs Jest with coverage and open-handle detection.
- `npm run ci` starts the server, waits for port 4000, and runs the coverage suite; use it for CI-style validation.

The package is consumed directly from `src/`; there is no separate compilation step. Set `PORT` when testing a non-default server port.

## Coding Style & Naming Conventions

Use modern JavaScript/ES modules (`import`/`export`) and two-space indentation, matching the existing source. Use `camelCase` for variables and functions, `PascalCase` for classes or constructors, and descriptive lower-case test names. Keep public exports and behavior compatible with the documented Socket.IO/Wire.io API. Prettier is available for formatting; avoid unrelated formatting churn.

## Testing Guidelines

Tests use Jest with `jest-esm-transformer`, Socket.IO clients, and `retry-assert` for asynchronous integration behavior. Name tests descriptively with `it('should ...')`; add or update snapshots only when output changes intentionally. Start the server before running tests that need it, or use `npm run ci` to automate the full flow. Exercise both success and cleanup/error paths for room, publish/subscribe, and RPC changes.

## Commit & Pull Request Guidelines

Recent commits use short imperative summaries such as `Fix CI` and `Add max http size parameter`, alongside version-only releases. Keep commits focused and use a concise imperative subject. Pull requests should explain the behavior change, identify tests run, link an issue when applicable, and include documentation or changelog updates for user-visible API changes. Include screenshots only when useful.

## Configuration & Security Notes

Do not commit secrets or local environment files. The bundled server disables cross-origin access by default; configure an explicit CORS allowlist when exposing it to a browser hosted elsewhere. Review changes involving Socket.IO events, RPC registration, HTTP size limits, or user-supplied room/function names for unintended exposure.
