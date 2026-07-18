const { ImageAnnotatorClient } = require('@google-cloud/vision');
const fs = require('fs');

async function testModeration() {
  console.log('Initializing Google Cloud Vision Client...');
  
  // Ensure the GCP key exists
  if (!fs.existsSync('./gcp-key.json')) {
    console.error('ERROR: gcp-key.json not found in the root directory.');
    process.exit(1);
  }

  process.env.GOOGLE_APPLICATION_CREDENTIALS = './gcp-key.json';
  const client = new ImageAnnotatorClient();

  const imageUrl = 'https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png';
  console.log(`\nTesting Image: ${imageUrl}`);

  try {
    const [result] = await client.safeSearchDetection(imageUrl);
    const detections = result.safeSearchAnnotation;
    
    if (!detections) {
      console.log('No detections returned. Image is safe.');
      return;
    }

    console.log('\nSafeSearch Results:');
    console.log(`Adult:    ${detections.adult}`);
    console.log(`Medical:  ${detections.medical}`);
    console.log(`Spoof:    ${detections.spoof}`);
    console.log(`Violence: ${detections.violence}`);
    console.log(`Racy:     ${detections.racy}`);

    const isUnsafe = ['LIKELY', 'VERY_LIKELY'].some(likelihood => 
      [detections.adult, detections.violence, detections.racy, detections.medical].includes(likelihood)
    );

    if (isUnsafe) {
      console.log('\nVerdict: UNSAFE ❌');
    } else {
      console.log('\nVerdict: SAFE ✅');
    }
  } catch (error) {
    console.error('Error during moderation API call:', error.message);
  }
}

testModeration();
