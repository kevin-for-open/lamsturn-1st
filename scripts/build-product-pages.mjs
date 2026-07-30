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
    title: 'LGY_610 Robata Grill | Lamsturn',
    description: 'Compact binchotan robata grill handcrafted in South Korea for professional restaurant counters, available in D300 and D400 depths.',
    url: 'https://lamsturn.com/products/lgy-610/'
  },
  {
    slug: 'lgy-840',
    title: 'LGY_840 Robata Grill | Lamsturn',
    description: 'Wide-format binchotan robata grill handcrafted for professional kitchens, available in D300 and D400 depths with precision height control.',
    url: 'https://lamsturn.com/products/lgy-840/'
  },
  {
    slug: 'lga-j900-t',
    title: 'LGA_J900_T Asado Grill | Lamsturn',
    description: 'Gear-driven tabletop charcoal grill handcrafted in South Korea with precision grate-height control for professional kitchens.',
    url: 'https://lamsturn.com/products/lga-j900-t/'
  }
];

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
  return html;
}

for (const product of products) {
  const outputDir = path.join(targetDir, 'products', product.slug);
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, 'index.html'), productHtml(product), 'utf8');
}

console.log(`Generated ${products.length} product pages in ${path.join(targetDir, 'products')}`);
