const fs = require('fs');
const snapsUtils = require('@metamask/snaps-utils/node');

// Path to the bundle file
const bundlePath = './dist/bundle.js';

// Read the content of the bundle file
const bundleContent = fs.readFileSync(bundlePath, 'utf8');

// Process the bundle content
const result = snapsUtils.postProcessBundle(bundleContent, {
  stripComments: true,
});

if (result.warnings.length > 0) {
  console.warn(
    `Bundle Warning: Processing of the Snap bundle completed with warnings.\n${result.warnings.join(
      '\n',
    )}`,
  );
}
const finalContent = result.code.replace("/-->/g", '/[-]{2}>/g');

// console.log(result.code);
// Rewrite the bundle file with the processed content
fs.writeFileSync(bundlePath, finalContent);
