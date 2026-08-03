import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const targetDir = path.resolve(process.argv[2] || '_site');
const sourcePath = path.join(targetDir, 'index.html');
const source = await readFile(sourcePath, 'utf8');

const defaults = {
  title: 'Lamsturn, a premium grill brand from South Korea',
  description: 'Professional charcoal grills, robata grills and smokers, designed and handcrafted in South Korea for chefs and restaurants worldwide.',
  url: 'https://lamsturn.com/',
  type: 'website'
};

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
    model: product.c,
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

function replaceOnce(html, from, to, label) {
  if (!html.includes(from)) throw new Error(`Missing ${label} source marker`);
  return html.replace(from, to);
}

function productHtml(product) {
  let html = source;
  html = replaceOnce(html, `<title>${defaults.title}</title>`, `<title>${product.title}</title>`, 'title');
  html = replaceOnce(html, `<meta name="description" content="${defaults.description}">`, `<meta name="description" content="${product.description}">`, 'description');
  html = replaceOnce(html, `<link rel="canonical" href="${defaults.url}">`, `<link rel="canonical" href="${product.url}">`, 'canonical');
  html = replaceOnce(html, `<meta property="og:type" content="${defaults.type}">`, '<meta property="og:type" content="product">', 'og:type');
  html = replaceOnce(html, `<meta property="og:title" content="${defaults.title}">`, `<meta property="og:title" content="${product.title}">`, 'og:title');
  html = replaceOnce(html, `<meta property="og:description" content="${defaults.description}">`, `<meta property="og:description" content="${product.description}">`, 'og:description');
  html = replaceOnce(html, `<meta property="og:url" content="${defaults.url}">`, `<meta property="og:url" content="${product.url}">`, 'og:url');
  html = replaceOnce(html, `<meta name="twitter:title" content="${defaults.title}">`, `<meta name="twitter:title" content="${product.title}">`, 'twitter:title');
  html = replaceOnce(html, `<meta name="twitter:description" content="${defaults.description}">`, `<meta name="twitter:description" content="${product.description}">`, 'twitter:description');
  const jsonLd = JSON.stringify(structuredData(product), null, 2).replaceAll('<', '\\u003c');
  html = replaceOnce(html, '</head>', `<script type="application/ld+json">\n${jsonLd}\n</script>\n</head>`, 'head closing tag');
  return html;
}

for (const product of products) {
  const outputDir = path.join(targetDir, 'products', product.slug);
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, 'index.html'), productHtml(product), 'utf8');
}

console.log(`Generated ${products.length} product pages in ${path.join(targetDir, 'products')}`);
