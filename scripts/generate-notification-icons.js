/**
 * Script to generate notification icons with embedded count indicators
 * Run with: node generate-notification-icons.js
 */

const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

// Configure paths
const ICON_PATH = path.join(__dirname, '../public/icon');
const OUTPUT_PATH = path.join(__dirname, '../public/icon/notification');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_PATH)) {
  fs.mkdirSync(OUTPUT_PATH, { recursive: true });
}

// Generate notification icons for numbers 1-9 and special cases
const countsToGenerate = [1, 2, 3, 4, 5, 6, 7, 8, 9, '9plus', '99plus'];
const iconSizes = [16, 32, 48, 128];

/**
 * Generate notification icon with count indicator
 * 
 * @param {string|number} count - The notification count to display
 * @param {number} size - Icon size in pixels
 */
async function generateIcon(count, size) {
  try {
    // Create canvas with specified dimensions
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    
    // Load and draw the base icon
    const iconPath = path.join(ICON_PATH, `${size}.png`);
    const img = await loadImage(iconPath);
    ctx.drawImage(img, 0, 0, size, size);
    
    // Calculate badge size based on icon dimensions
    const badgeSize = Math.max(size * 0.4, 8); // Minimum 8px, otherwise 40% of icon size
    const badgeX = size * 0.7; // Position in top right
    const badgeY = size * 0.3;
    
    // Draw red circle background
    ctx.beginPath();
    ctx.arc(badgeX, badgeY, badgeSize/2, 0, Math.PI * 2);
    ctx.fillStyle = '#FF4A4A'; // Red badge color
    ctx.fill();
    
    // Format count text
    let countText;
    if (count === '9plus') {
      countText = '9+';
    } else if (count === '99plus') {
      countText = '99+';
    } else {
      countText = count.toString();
    }
    
    // Add white text
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Scale font size based on icon size and character count
    const fontSize = Math.max(size * 0.23, 7); // Min 7px, otherwise 23% of icon
    ctx.font = `bold ${fontSize}px Arial`;
    
    // Adjust font size if text is too long
    if (countText.length > 1) {
      ctx.font = `bold ${fontSize * 0.8}px Arial`;
    }
    
    ctx.fillText(countText, badgeX, badgeY);
    
    // Save the image to file
    const outputFilename = path.join(OUTPUT_PATH, `${count}_${size}.png`);
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(outputFilename, buffer);
    
    console.log(`Generated icon: ${outputFilename}`);
  } catch (error) {
    console.error(`Error generating icon for count ${count} size ${size}:`, error);
  }
}

/**
 * Generate all notification icons
 */
async function generateAllIcons() {
  console.log('Starting notification icon generation...');
  
  for (const count of countsToGenerate) {
    for (const size of iconSizes) {
      await generateIcon(count, size);
    }
  }
  
  console.log('Icon generation complete!');
}

// Run the generation
generateAllIcons().catch(error => {
  console.error('Error generating icons:', error);
}); 