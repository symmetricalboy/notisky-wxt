/**
 * Script to generate notification icons with embedded count indicators (ES Module version)
 * Run with: node generate-notification-icons.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createCanvas, loadImage } from 'canvas';

// Get dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure paths
const ICON_PATH = path.join(__dirname, '../public/icon');
const OUTPUT_PATH = path.join(__dirname, '../public/icon/notification');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_PATH)) {
  fs.mkdirSync(OUTPUT_PATH, { recursive: true });
}

// Generate notification icons for numbers 1-9 and special cases
const countsToGenerate = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, '30plus'];
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
    
    // Create a transparent background
    ctx.clearRect(0, 0, size, size);
    
    // Calculate badge size to fill most of the icon space
    const badgeSize = Math.max(size * 0.9, 14); // 90% of icon size
    const badgeX = size / 2; // Center horizontally
    const badgeY = size / 2; // Center vertically
    
    // Draw red circle background
    ctx.beginPath();
    ctx.arc(badgeX, badgeY, badgeSize/2, 0, Math.PI * 2);
    ctx.fillStyle = '#FF4A4A'; // Red badge color
    ctx.fill();
    
    // Format count text
    let countText;
    if (count === '30plus') {
      countText = '30+';
    } else {
      countText = count.toString();
    }
    
    // Add white text
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Scale font size based on badge size and character count
    const fontSize = Math.max(badgeSize * 0.5, 7); // 50% of badge size
    ctx.font = `bold ${fontSize}px Arial`;
    
    // Adjust font size if text is too long
    if (countText.length > 1) {
      ctx.font = `bold ${fontSize * 0.8}px Arial`;
    }
    if (countText.length > 2) {
      ctx.font = `bold ${fontSize * 0.7}px Arial`;
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
  console.log(`Using icon path: ${ICON_PATH}`);
  console.log(`Output path: ${OUTPUT_PATH}`);
  
  // Generate all notification icons
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