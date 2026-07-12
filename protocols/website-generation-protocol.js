/**
 * PROTO-GEN-002: Website / App Generation Protocol
 * ═══════════════════════════════════════════════════════════════════
 *
 * Co-generation protocol for websites, web apps, and landing pages.
 * Generates: component trees, routing configs, API schema stubs,
 * deployment manifests, and design tokens — all in a single coherent pass.
 *
 * Phi-design system: layouts, spacing, and type scales are derived
 * from the golden ratio so generated UIs have inherent visual harmony.
 *
 * Targets: SvelteKit, Next.js, Astro, Remix, vanilla HTML/CSS,
 *          Cloudflare Pages, ICP-hosted static sites.
 */

'use strict';

const PHI     = 1.618033988749895;
const PHI_INV = 0.618033988749895;

const FRAMEWORK = Object.freeze({
  SVELTEKIT: 'sveltekit',
  NEXTJS:    'nextjs',
  ASTRO:     'astro',
  REMIX:     'remix',
  VANILLA:   'vanilla',
});

const PAGE_TYPE = Object.freeze({
  LANDING:   'landing',
  DASHBOARD: 'dashboard',
  DOCS:      'docs',
  BLOG:      'blog',
  ECOMMERCE: 'ecommerce',
  SAAS:      'saas',
  PORTFOLIO: 'portfolio',
});

/**
 * Generate a phi-based design token set.
 * Base font size → entire type scale via phi multipliers.
 */
function phiDesignTokens({ baseFontPx = 16, accent = '#C49A3C', bg = '#090C14', text = '#DDE3F0' } = {}) {
  const scale = [0, 1, 2, 3, 4, 5].map(n => `${(baseFontPx * Math.pow(PHI, n - 1)).toFixed(2)}px`);
  const spacing = [1,2,3,4,5,6,7,8].map(n => `${(baseFontPx * Math.pow(PHI_INV, n - 4)).toFixed(2)}px`);
  return {
    colors:  { accent, bg, text, surface: '#0F1522', muted: '#566182', ok: '#38D47B', warn: '#F0A840', fail: '#E84040' },
    font:    { scale: { xs: scale[0], sm: scale[1], base: scale[2], lg: scale[3], xl: scale[4], '2xl': scale[5] } },
    spacing: { xs: spacing[0], sm: spacing[1], md: spacing[3], lg: spacing[5], xl: spacing[7] },
    phi:     PHI,
  };
}

/**
 * Generate a component tree for a given page type.
 */
function componentTree(pageType, { siteName = 'Site', sections = [] } = {}) {
  const base = { siteName, pageType, components: [] };

  switch (pageType) {
    case PAGE_TYPE.LANDING:
      base.components = [
        { name: 'Nav',       props: { links: ['About', 'Pricing', 'Docs', 'Login'] } },
        { name: 'Hero',      props: { headline: siteName, cta: 'Get Started' } },
        { name: 'Features',  props: { count: 3 } },
        { name: 'Pricing',   props: { tiers: ['Free', 'Pro', 'Enterprise'] } },
        { name: 'CTA',       props: { text: 'Start Free' } },
        { name: 'Footer',    props: {} },
      ];
      break;
    case PAGE_TYPE.DASHBOARD:
      base.components = [
        { name: 'Sidebar',   props: { nav: sections } },
        { name: 'TopBar',    props: { title: siteName } },
        { name: 'KPIStrip',  props: { metrics: 4 } },
        { name: 'MainPanel', props: { sections } },
      ];
      break;
    case PAGE_TYPE.SAAS:
      base.components = [
        { name: 'Nav',         props: { links: ['Product', 'Pricing', 'Blog', 'Sign In'] } },
        { name: 'Hero',        props: { headline: siteName, sub: '', cta: 'Start Free Trial' } },
        { name: 'SocialProof', props: { logos: 6 } },
        { name: 'Features',    props: { count: 6, layout: 'grid' } },
        { name: 'Testimonials',props: { count: 3 } },
        { name: 'Pricing',     props: { tiers: ['Starter', 'Growth', 'Enterprise'] } },
        { name: 'FAQ',         props: { count: 8 } },
        { name: 'Footer',      props: {} },
      ];
      break;
    default:
      base.components = [
        { name: 'Nav',    props: {} },
        { name: 'Main',   props: { sections } },
        { name: 'Footer', props: {} },
      ];
  }

  return base;
}

/**
 * Generate routing config for a given framework.
 */
function routingConfig(framework, pages = ['/', '/about', '/pricing', '/docs']) {
  switch (framework) {
    case FRAMEWORK.NEXTJS:
      return pages.map(p => ({
        file: `app${p === '/' ? '' : p}/page.tsx`,
        route: p,
      }));
    case FRAMEWORK.SVELTEKIT:
      return pages.map(p => ({
        file: `src/routes${p === '/' ? '' : p}/+page.svelte`,
        route: p,
      }));
    case FRAMEWORK.ASTRO:
      return pages.map(p => ({
        file: `src/pages${p === '/' ? '/index' : p}.astro`,
        route: p,
      }));
    default:
      return pages.map(p => ({ route: p, file: `${p === '/' ? 'index' : p.slice(1)}.html` }));
  }
}

/**
 * Generate a full site spec from a prompt object.
 */
function generateSiteSpec({ name, description, framework, pageType, pages, accent }) {
  return {
    name,
    description,
    framework:    framework || FRAMEWORK.NEXTJS,
    pageType:     pageType  || PAGE_TYPE.SAAS,
    tokens:       phiDesignTokens({ accent }),
    components:   componentTree(pageType || PAGE_TYPE.SAAS, { siteName: name }),
    routing:      routingConfig(framework || FRAMEWORK.NEXTJS, pages),
    phiScore:     1.0,
    generatedAt:  new Date().toISOString(),
  };
}

/**
 * Generate a Cloudflare Pages deployment config.
 */
function pagesConfig({ name, framework, buildCmd, outDir }) {
  const cmds = {
    [FRAMEWORK.NEXTJS]:    { cmd: 'npm run build', out: '.next' },
    [FRAMEWORK.SVELTEKIT]: { cmd: 'npm run build', out: 'build' },
    [FRAMEWORK.ASTRO]:     { cmd: 'npm run build', out: 'dist' },
    [FRAMEWORK.REMIX]:     { cmd: 'npm run build', out: 'build/client' },
    [FRAMEWORK.VANILLA]:   { cmd: 'echo ok',       out: '.' },
  };
  const def = cmds[framework] || cmds[FRAMEWORK.VANILLA];
  return {
    name,
    build_command:   buildCmd || def.cmd,
    destination_dir: outDir  || def.out,
    compatibility_date: new Date().toISOString().slice(0,10),
    env: { PHI: String(PHI) },
  };
}

module.exports = {
  generateSiteSpec, phiDesignTokens, componentTree, routingConfig, pagesConfig,
  FRAMEWORK, PAGE_TYPE, PHI, PHI_INV,
};
