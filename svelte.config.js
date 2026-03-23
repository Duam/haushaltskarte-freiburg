import adapter from '@sveltejs/adapter-static';

/** Base path for GitHub project pages: https://<user>.github.io/<repo>/ */
const base = process.env.BASE_PATH ?? '';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter({
			fallback: undefined,
			strict: true,
		}),
		paths: {
			base,
		},
	},
	vitePlugin: {
		dynamicCompileOptions: ({ filename }) =>
			filename.includes('node_modules') ? undefined : { runes: true },
	},
};

export default config;
