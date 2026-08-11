import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const dateArg = args.find((a) => a.startsWith('--date='));
const targetDir = path.resolve(args.find((a) => !a.startsWith('--')) || '_site');
const sourcePath = path.join(targetDir, 'index.html');
const source = await readFile(sourcePath, 'utf8');
const buildDate = (dateArg ? dateArg.slice('--date='.length) : new Date().toISOString().slice(0, 10));
if (!/^\d{4}-\d{2}-\d{2}$/.test(buildDate)) throw new Error(`Invalid --date: ${buildDate}`);

const defaults = {
  title: 'Lamsturn, a premium grill brand from South Korea',
  description: 'Professional charcoal grills, robata grills and smokers, designed and handcrafted in South Korea for chefs and restaurants worldwide.',
  url: 'https://lamsturn.com/',
  type: 'website',
  image: 'https://lamsturn.com/assets/photos/b-hero-aug-01.jpg'
};

// Section routes. Copy is grounded in the live page copy inside the T object — keep the
// two in step (index.html seoForPage mirrors this table for client-side navigation).
const sections = [
  {
    slug: 'products',
    title: 'Grills & Smokers — The Full Range | Lamsturn',
    description: 'The complete Lamsturn range: gear-driven and chain-driven asado grills, binchotan robata grills, smokers, indoor grills and accessories — handcrafted in South Korea.'
  },
  {
    slug: 'about',
    title: 'About Lamsturn — Hand-built in Korea since 2012',
    description: 'Based on craft since 2012, when the studio took root among the steel workshops of Mullae-dong, Seoul. How Lamsturn designs and builds grills for professional kitchens.'
  },
  {
    slug: 'kitchens',
    title: 'Kitchens Cooking on Lamsturn | Lamsturn',
    description: 'From Michelin-starred rooms in San Sebastián and Hong Kong to smokehouses in Seoul — the professional kitchens cooking on Lamsturn grills, shown on a world map.'
  },
  {
    slug: 'compare',
    title: 'Compare Grill Models | Lamsturn',
    description: 'Compare Lamsturn grills side by side — size, grill area, weight and height control — and find the build that fits your kitchen.'
  },
  {
    slug: 'contact',
    title: 'Contact & Inquiries | Lamsturn',
    description: 'Tell us about your kitchen — the space, the menu, the size you wish existed. Lamsturn engineers reply with drawings, options and a quote.'
  }
];

const catalogMarker = '<script type="application/json" id="lamsturn-product-catalog">';

function catalogItems(html) {
  const start = html.indexOf(catalogMarker);
  if (start < 0) throw new Error('Missing Lamsturn product catalog');
  const contentStart = start + catalogMarker.length;
  const end = html.indexOf('</script>', contentStart);
  if (end < 0) throw new Error('Missing Lamsturn product catalog closing tag');
  const catalog = JSON.parse(html.slice(contentStart, end));
  const groupNames = ['asado', 'robata', 'smokers', 'indoor', 'accessories'];
  if (!catalog || catalog.version !== 1 || !catalog.groups) throw new Error('Invalid Lamsturn product catalog');
  const codes = new Set();
  return groupNames.flatMap((name) => {
    const group = catalog.groups[name];
    if (!Array.isArray(group)) throw new Error(`Invalid Lamsturn product group: ${name}`);
    return group.map((product) => {
      if (!product || typeof product.c !== 'string' || !product.c || codes.has(product.c)) throw new Error('Invalid or duplicate Lamsturn product code');
      codes.add(product.c);
      return product;
    });
  });
}

function detailProduct(product) {
  const detail = product.detail;
  const requiredStrings = ['slug', 'page', 'category', 'title', 'description', 'material', 'fuel', 'manufacturing'];
  if (!product.img || requiredStrings.some((key) => typeof detail[key] !== 'string' || !detail[key])) {
    throw new Error(`Incomplete detail metadata for ${product.c}`);
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(detail.slug)) throw new Error(`Invalid product slug for ${product.c}`);
  return {
    slug: detail.slug,
    // A depth pair is two cards sharing one page: the D300 card owns `detail` and names the
    // family through `detail.model`, so the group is not labelled with that one card's code.
    model: detail.model || product.c,
    category: detail.category,
    title: detail.title,
    description: detail.description,
    url: new URL(`products/${detail.slug}/`, defaults.url).href,
    image: new URL(product.img, defaults.url).href,
    material: detail.material,
    fuel: detail.fuel,
    manufacturing: detail.manufacturing,
    grillArea: detail.grillArea,
    variants: detail.variants,
    width: detail.width,
    depth: detail.depth,
    height: detail.height,
    weight: detail.weight
  };
}

const products = catalogItems(source).filter((product) => product.detail).map(detailProduct);
if (products.length !== 3) throw new Error(`Expected 3 detailed products, found ${products.length}`);

const brand = { '@type': 'Brand', name: 'Lamsturn' };
const manufacturer = { '@type': 'Organization', name: 'Lamsturn', url: 'https://lamsturn.com/' };
const countryOfOrigin = { '@type': 'Country', name: 'South Korea' };
const millimetres = (value) => ({ '@type': 'QuantitativeValue', value, unitCode: 'MMT', unitText: 'mm' });
const kilograms = (value) => ({ '@type': 'QuantitativeValue', value, unitCode: 'KGM', unitText: 'kg' });

function commonProduct(product) {
  return {
    name: product.model,
    model: product.model,
    category: product.category,
    description: product.description,
    url: product.url,
    image: product.image,
    brand,
    manufacturer,
    countryOfOrigin,
    material: product.material
  };
}

function structuredData(product) {
  if (product.variants) {
    return {
      '@context': 'https://schema.org',
      '@type': 'ProductGroup',
      '@id': `${product.url}#product`,
      ...commonProduct(product),
      productGroupID: product.model,
      variesBy: ['https://schema.org/depth', 'https://schema.org/weight'],
      hasVariant: product.variants.map((variant) => ({
        '@type': 'Product',
        '@id': `${product.url}#${variant.model.toLowerCase().replaceAll('_', '-')}`,
        name: variant.model,
        model: variant.model,
        sku: variant.model,
        category: product.category,
        description: `${product.description} ${variant.depth} mm depth configuration.`,
        url: product.url,
        image: product.image,
        brand,
        manufacturer,
        countryOfOrigin,
        material: product.material,
        width: millimetres(product.width),
        depth: millimetres(variant.depth),
        height: millimetres(product.height),
        weight: kilograms(variant.weight),
        additionalProperty: [
          { '@type': 'PropertyValue', name: 'Fuel', value: product.fuel },
          { '@type': 'PropertyValue', name: 'Manufacturing', value: product.manufacturing }
        ]
      }))
    };
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${product.url}#product`,
    ...commonProduct(product),
    sku: product.model,
    width: millimetres(product.width),
    depth: millimetres(product.depth),
    height: millimetres(product.height),
    weight: kilograms(product.weight),
    additionalProperty: [
      { '@type': 'PropertyValue', name: 'Fuel', value: product.fuel },
      { '@type': 'PropertyValue', name: 'Main grill area', value: product.grillArea },
      { '@type': 'PropertyValue', name: 'Manufacturing', value: product.manufacturing }
    ]
  };
}

function breadcrumbs(product) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: defaults.url },
      { '@type': 'ListItem', position: 2, name: 'Products', item: new URL('products/', defaults.url).href },
      { '@type': 'ListItem', position: 3, name: product.model, item: product.url }
    ]
  };
}

function replaceOnce(html, from, to, label) {
  if (!html.includes(from)) throw new Error(`Missing ${label} source marker`);
  return html.replace(from, to);
}

// Shared head rewrite: every generated page swaps the same markers, so a page that
// silently keeps the home metadata is a build error rather than a quiet duplicate.
function pageHtml(page, { ogType = defaults.type, image = defaults.image, jsonLd = [] } = {}) {
  let html = source;
  html = replaceOnce(html, `<title>${defaults.title}</title>`, `<title>${page.title}</title>`, 'title');
  html = replaceOnce(html, `<meta name="description" content="${defaults.description}">`, `<meta name="description" content="${page.description}">`, 'description');
  html = replaceOnce(html, `<link rel="canonical" href="${defaults.url}">`, `<link rel="canonical" href="${page.url}">`, 'canonical');
  if (ogType !== defaults.type) {
    html = replaceOnce(html, `<meta property="og:type" content="${defaults.type}">`, `<meta property="og:type" content="${ogType}">`, 'og:type');
  }
  html = replaceOnce(html, `<meta property="og:title" content="${defaults.title}">`, `<meta property="og:title" content="${page.title}">`, 'og:title');
  html = replaceOnce(html, `<meta property="og:description" content="${defaults.description}">`, `<meta property="og:description" content="${page.description}">`, 'og:description');
  html = replaceOnce(html, `<meta property="og:url" content="${defaults.url}">`, `<meta property="og:url" content="${page.url}">`, 'og:url');
  html = replaceOnce(html, `<meta name="twitter:title" content="${defaults.title}">`, `<meta name="twitter:title" content="${page.title}">`, 'twitter:title');
  html = replaceOnce(html, `<meta name="twitter:description" content="${defaults.description}">`, `<meta name="twitter:description" content="${page.description}">`, 'twitter:description');
  if (image !== defaults.image) {
    html = replaceOnce(html, `<meta property="og:image" content="${defaults.image}">`, `<meta property="og:image" content="${image}">`, 'og:image');
    html = replaceOnce(html, `<meta name="twitter:image" content="${defaults.image}">`, `<meta name="twitter:image" content="${image}">`, 'twitter:image');
  }
  for (const block of jsonLd) {
    const serialized = JSON.stringify(block, null, 2).replaceAll('<', '\\u003c');
    html = replaceOnce(html, '</head>', `<script type="application/ld+json">\n${serialized}\n</script>\n</head>`, 'head closing tag');
  }
  return html;
}

async function emit(slugPath, html) {
  const outputDir = path.join(targetDir, ...slugPath);
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, 'index.html'), html, 'utf8');
}

for (const product of products) {
  await emit(['products', product.slug], pageHtml(product, {
    ogType: 'product',
    image: product.image,
    jsonLd: [structuredData(product), breadcrumbs(product)]
  }));
}

for (const section of sections) {
  await emit([section.slug], pageHtml({ ...section, url: new URL(`${section.slug}/`, defaults.url).href }));
}

const sitemapUrls = [
  { loc: defaults.url, priority: '1.0' },
  ...sections.map((s) => ({ loc: new URL(`${s.slug}/`, defaults.url).href, priority: s.slug === 'products' ? '0.9' : '0.7' })),
  ...products.map((p) => ({ loc: p.url, priority: '0.8' }))
];
const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<!-- Generated by scripts/build-static-pages.mjs — do not edit by hand. -->',
  '<!-- SEO_ORIGIN: update this file if the public origin changes. -->',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...sitemapUrls.map(({ loc, priority }) => [
    '  <url>',
    `    <loc>${loc}</loc>`,
    `    <lastmod>${buildDate}</lastmod>`,
    '    <changefreq>monthly</changefreq>',
    `    <priority>${priority}</priority>`,
    '  </url>'
  ].join('\n')),
  '</urlset>',
  ''
].join('\n');
await writeFile(path.join(targetDir, 'sitemap.xml'), sitemap, 'utf8');

console.log(`Generated ${products.length} product pages, ${sections.length} section pages and sitemap.xml (${sitemapUrls.length} urls, lastmod ${buildDate}) in ${targetDir}`);
