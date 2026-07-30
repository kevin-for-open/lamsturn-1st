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

const products = [
  {
    slug: 'lgy-610',
    model: 'LGY_610',
    category: 'Professional Robata Grill',
    title: 'LGY_610 Robata Grill | Lamsturn',
    description: 'Compact binchotan robata grill handcrafted in South Korea for professional restaurant counters, available in D300 and D400 depths.',
    url: 'https://lamsturn.com/products/lgy-610/',
    image: 'https://lamsturn.com/assets/photos/LGY_610.webp',
    variants: [
      { model: 'LGY_610_D300', depth: 300, weight: 35 },
      { model: 'LGY_610_D400', depth: 400, weight: 45 }
    ],
    width: 610,
    height: 300
  },
  {
    slug: 'lgy-840',
    model: 'LGY_840',
    category: 'Professional Robata Grill',
    title: 'LGY_840 Robata Grill | Lamsturn',
    description: 'Wide-format binchotan robata grill handcrafted for professional kitchens, available in D300 and D400 depths with precision height control.',
    url: 'https://lamsturn.com/products/lgy-840/',
    image: 'https://lamsturn.com/assets/photos/LGY_840.webp',
    variants: [
      { model: 'LGY_840_D300', depth: 300, weight: 46 },
      { model: 'LGY_840_D400', depth: 400, weight: 55 }
    ],
    width: 840,
    height: 300
  },
  {
    slug: 'lga-j900-t',
    model: 'LGA_J900_T',
    category: 'Professional Asado Charcoal Grill',
    title: 'LGA_J900_T Asado Grill | Lamsturn',
    description: 'Gear-driven tabletop charcoal grill handcrafted in South Korea with precision grate-height control for professional kitchens.',
    url: 'https://lamsturn.com/products/lga-j900-t/',
    image: 'https://lamsturn.com/assets/photos/LGA_J900_T.webp',
    width: 900,
    depth: 750,
    height: 920,
    weight: 120
  }
];

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
    material: 'Stainless steel 304'
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
        material: 'Stainless steel 304',
        width: millimetres(product.width),
        depth: millimetres(variant.depth),
        height: millimetres(product.height),
        weight: kilograms(variant.weight),
        additionalProperty: [
          { '@type': 'PropertyValue', name: 'Fuel', value: 'Binchotan charcoal' },
          { '@type': 'PropertyValue', name: 'Manufacturing', value: 'Made to order in South Korea' }
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
      { '@type': 'PropertyValue', name: 'Fuel', value: 'Charcoal' },
      { '@type': 'PropertyValue', name: 'Main grill area', value: 'W378 × D495 mm' },
      { '@type': 'PropertyValue', name: 'Manufacturing', value: 'Made to order in South Korea' }
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
