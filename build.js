const fs = require('fs');
const path = require('path');

// List of files to concatenate in order
const files = [
  'js/constants.js',
  'js/utils.js',
  'js/extractors.js',
  'js/creators.js',
  'js/handlers.js',
  'js/main.js'
];

// Output file
const outputFile = 'src/content.js';

// Read each file and write to output
let content = '';
files.forEach(file => {
  const filePath = path.resolve(__dirname, file);
  const fileContent = fs.readFileSync(filePath, 'utf8');
  
  // Add a separator comment
  content += `\n// ============ ${path.basename(file)} ============\n`;
  content += fileContent;
});

// Write the output file
fs.writeFileSync(outputFile, content);
console.log(`Successfully built ${outputFile}`);