# sv

Everything you need to build a Svelte project, powered by [`sv`](https://github.com/sveltejs/cli).

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```sh
# create a new project
npx sv create my-app
```

To recreate this project with the same configuration:

```sh
# recreate this project
npx sv@0.12.8 create --template minimal --types ts --add tailwindcss="plugins:none" --install npm .
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```sh
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

### GitHub Pages (`https://duam.github.io/haushaltskarte-freiburg/`)

The app uses [`@sveltejs/adapter-static`](https://svelte.dev/docs/kit/adapter-static) and `paths.base` from the environment variable `BASE_PATH` (unset locally = site root).

- **CI:** Push to `main` or `master` runs [`.github/workflows/deploy-github-pages.yml`](.github/workflows/deploy-github-pages.yml), which builds with `BASE_PATH=/haushaltskarte-freiburg` and deploys the `build/` folder via [GitHub Actions Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site#publishing-with-a-custom-github-actions-workflow).
- **Repo settings:** **Settings → Pages → Build and deployment** → Source: **GitHub Actions** (first-time setup).
- **Local production preview (same base as Pages):**

```sh
npm run build:gh-pages && npm run preview:gh-pages
```

`static/.nojekyll` disables Jekyll so folders like `_app` are served correctly.
