const fs = require('fs');
const path = require('path');
const { minify } = require('terser');
const CleanCSS = require('clean-css');

// Advanced build configuration
const config = {
  jsFiles: [
    { input: 'game.js', output: 'game.min.js' },
    { input: 'canvas.js', output: 'canvas.min.js' }
  ],
  cssFiles: [
    { input: 'styles.css', output: 'styles.min.css' }
  ],
  htmlFiles: ['home.html', 'about.html', 'game.html', 'canvas.html'],
  outputDir: 'dist',
  sourceDir: '.',
  // Create source maps for debugging
  sourceMaps: true
};

// Ensure output directory exists
if (!fs.existsSync(config.outputDir)) {
  fs.mkdirSync(config.outputDir, { recursive: true });
}

// Advanced JavaScript minification with source maps
async function minifyJSAdvanced() {
  console.log('🔧 Advanced JavaScript minification...');
  
  for (const file of config.jsFiles) {
    try {
      const inputPath = path.join(config.sourceDir, file.input);
      const outputPath = path.join(config.outputDir, file.output);
      const mapPath = path.join(config.outputDir, file.output + '.map');
      
      if (fs.existsSync(inputPath)) {
        const code = fs.readFileSync(inputPath, 'utf8');
        
        const result = await minify(code, {
          compress: {
            drop_console: true,
            drop_debugger: true,
            pure_funcs: ['console.log', 'console.info', 'console.debug'],
            // Advanced optimizations
            sequences: true,
            dead_code: true,
            conditionals: true,
            booleans: true,
            unused: true,
            if_return: true,
            join_vars: true,
            collapse_vars: true
          },
          mangle: {
            toplevel: true,
            properties: {
              regex: /^_/
            }
          },
          sourceMap: config.sourceMaps ? {
            filename: file.output,
            url: file.output + '.map'
          } : false
        });
        
        fs.writeFileSync(outputPath, result.code);
        
        if (config.sourceMaps && result.map) {
          fs.writeFileSync(mapPath, result.map);
          console.log(`✅ Minified ${file.input} → ${file.output} + source map`);
        } else {
          console.log(`✅ Minified ${file.input} → ${file.output}`);
        }
        
        const originalSize = code.length;
        const minifiedSize = result.code.length;
        const savings = ((originalSize - minifiedSize) / originalSize * 100).toFixed(1);
        console.log(`   📊 Size: ${originalSize} → ${minifiedSize} bytes (${savings}% reduction)`);
      } else {
        console.log(`⚠️  File not found: ${file.input}`);
      }
    } catch (error) {
      console.error(`❌ Error minifying ${file.input}:`, error.message);
    }
  }
}

// Advanced CSS minification
function minifyCSSAdvanced() {
  console.log('🎨 Advanced CSS minification...');
  
  const cleanCSS = new CleanCSS({
    level: {
      1: {
        specialComments: 0 // Remove all comments
      },
      2: {
        mergeMedia: true,
        removeEmpty: true,
        removeDuplicateRules: true,
        removeDuplicateMediaBlocks: true,
        mergeAdjacentRules: true,
        mergeIntoShorthands: true,
        mergeShorthands: true,
        mergeNonAdjacentRules: true,
        removeUnusedAtRules: true
      }
    },
    format: false // No formatting for maximum compression
  });
  
  for (const file of config.cssFiles) {
    try {
      const inputPath = path.join(config.sourceDir, file.input);
      const outputPath = path.join(config.outputDir, file.output);
      
      if (fs.existsSync(inputPath)) {
        const css = fs.readFileSync(inputPath, 'utf8');
        const result = cleanCSS.minify(css);
        
        if (result.errors.length > 0) {
          console.error(`❌ CSS errors in ${file.input}:`, result.errors);
          continue;
        }
        
        if (result.warnings.length > 0) {
          console.log(`⚠️  CSS warnings in ${file.input}:`, result.warnings);
        }
        
        fs.writeFileSync(outputPath, result.styles);
        
        const originalSize = css.length;
        const minifiedSize = result.styles.length;
        const savings = ((originalSize - minifiedSize) / originalSize * 100).toFixed(1);
        console.log(`✅ Minified ${file.input} → ${file.output}`);
        console.log(`   📊 Size: ${originalSize} → ${minifiedSize} bytes (${savings}% reduction)`);
      } else {
        console.log(`⚠️  File not found: ${file.input}`);
      }
    } catch (error) {
      console.error(`❌ Error minifying ${file.input}:`, error.message);
    }
  }
}

// Update HTML files to reference minified versions
function updateHTMLReferences() {
  console.log('📄 Updating HTML file references...');
  
  for (const htmlFile of config.htmlFiles) {
    try {
      const inputPath = path.join(config.sourceDir, htmlFile);
      const outputPath = path.join(config.outputDir, htmlFile);
      
      if (fs.existsSync(inputPath)) {
        let content = fs.readFileSync(inputPath, 'utf8');
        
        // Replace JavaScript file references
        config.jsFiles.forEach(file => {
          const regex = new RegExp(file.input.replace('.', '\\.'), 'g');
          content = content.replace(regex, file.output);
        });
        
        // Replace CSS file references
        config.cssFiles.forEach(file => {
          const regex = new RegExp(file.input.replace('.', '\\.'), 'g');
          content = content.replace(regex, file.output);
        });
        
        fs.writeFileSync(outputPath, content);
        console.log(`✅ Updated references in ${htmlFile}`);
      } else {
        console.log(`⚠️  File not found: ${htmlFile}`);
      }
    } catch (error) {
      console.error(`❌ Error updating ${htmlFile}:`, error.message);
    }
  }
}

// Copy server file
function copyServer() {
  console.log('🖥️  Copying server file...');
  
  try {
    const inputPath = path.join(config.sourceDir, 'server.js');
    const outputPath = path.join(config.outputDir, 'server.js');
    
    if (fs.existsSync(inputPath)) {
      fs.copyFileSync(inputPath, outputPath);
      console.log('✅ Copied server.js');
    } else {
      console.log('⚠️  server.js not found');
    }
  } catch (error) {
    console.error('❌ Error copying server.js:', error.message);
  }
}

// Generate build info
function generateBuildInfo() {
  console.log('📋 Generating build info...');
  
  const buildInfo = {
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    files: {
      js: config.jsFiles.map(f => f.output),
      css: config.cssFiles.map(f => f.output),
      html: config.htmlFiles
    },
    sourceMaps: config.sourceMaps
  };
  
  const outputPath = path.join(config.outputDir, 'build-info.json');
  fs.writeFileSync(outputPath, JSON.stringify(buildInfo, null, 2));
  console.log('✅ Generated build-info.json');
}

// Main advanced build function
async function buildAdvanced() {
  console.log('🚀 Starting advanced build process...\n');
  
  try {
    await minifyJSAdvanced();
    console.log('');
    
    minifyCSSAdvanced();
    console.log('');
    
    updateHTMLReferences();
    console.log('');
    
    copyServer();
    console.log('');
    
    generateBuildInfo();
    console.log('');
    
    console.log('🎉 Advanced build completed successfully!');
    console.log(`📁 Output directory: ${config.outputDir}/`);
    console.log('💡 To run the production version: cd dist && node server.js');
    console.log('🔍 Source maps available for debugging');
    
  } catch (error) {
    console.error('❌ Build failed:', error.message);
    process.exit(1);
  }
}

// Run build if this script is executed directly
if (require.main === module) {
  buildAdvanced();
}

module.exports = { buildAdvanced, minifyJSAdvanced, minifyCSSAdvanced, updateHTMLReferences };
