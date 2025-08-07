import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing Supabase environment variables. Please check your .env file.');
    process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseAnonKey);
// Sample images (reusing from original seed script)
const sampleImages = [
    'https://images.pexels.com/photos/106399/pexels-photo-106399.jpeg?auto=compress&cs=tinysrgb&w=600&h=400',
    'https://images.pexels.com/photos/1396122/pexels-photo-1396122.jpeg?auto=compress&cs=tinysrgb&w=600&h=400',
    'https://images.pexels.com/photos/259751/pexels-photo-259751.jpeg?auto=compress&cs=tinysrgb&w=600&h=400',
    'https://images.pexels.com/photos/276724/pexels-photo-276724.jpeg?auto=compress&cs=tinysrgb&w=600&h=400',
    'https://images.pexels.com/photos/164558/pexels-photo-164558.jpeg?auto=compress&cs=tinysrgb&w=600&h=400',
    'https://images.pexels.com/photos/1571460/pexels-photo-1571460.jpeg?auto=compress&cs=tinysrgb&w=600&h=400',
    'https://images.pexels.com/photos/206172/pexels-photo-206172.jpeg?auto=compress&cs=tinysrgb&w=600&h=400',
    'https://images.pexels.com/photos/186077/pexels-photo-186077.jpeg?auto=compress&cs=tinysrgb&w=600&h=400',
    'https://images.pexels.com/photos/271624/pexels-photo-271624.jpeg?auto=compress&cs=tinysrgb&w=600&h=400',
    'https://images.pexels.com/photos/275484/pexels-photo-275484.jpeg?auto=compress&cs=tinysrgb&w=600&h=400'
];
// Generate random number in range
function getRandomNumber(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
// Generate random array element
function getRandomElement(array) {
    return array[Math.floor(Math.random() * array.length)];
}
async function seedListingImages() {
    console.log('📸 Starting image seeding for existing listings...');
    // Fetch all existing listings
    const { data: listings, error: listingsError } = await supabase
        .from('listings')
        .select('id, title');
    if (listingsError) {
        console.error('❌ Error fetching listings:', listingsError);
        return;
    }
    if (!listings || listings.length === 0) {
        console.log('ℹ️ No listings found to add images to. Please run the main seed script first.');
        return;
    }
    let imagesAddedCount = 0;
    let listingsUpdatedCount = 0;
    for (const listing of listings) {
        // Check if the listing already has images
        const { data: existingImages, error: imagesError } = await supabase
            .from('listing_images')
            .select('id')
            .eq('listing_id', listing.id);
        if (imagesError) {
            console.error(`❌ Error checking images for listing "${listing.title}":`, imagesError);
            continue;
        }
        if (existingImages && existingImages.length > 0) {
            console.log(`⏭️ Listing "${listing.title}" (ID: ${listing.id}) already has images. Skipping.`);
            continue;
        }
        // If no images exist, add 1-3 new images
        const numImages = getRandomNumber(1, 3);
        const shuffledImages = [...sampleImages].sort(() => 0.5 - Math.random());
        const imagesToInsert = [];
        for (let j = 0; j < numImages; j++) {
            imagesToInsert.push({
                listing_id: listing.id,
                image_url: shuffledImages[j % shuffledImages.length],
                is_featured: j === 0, // First image is featured
                sort_order: j
            });
        }
        const { error: insertError } = await supabase
            .from('listing_images')
            .insert(imagesToInsert);
        if (insertError) {
            console.error(`❌ Error inserting images for listing "${listing.title}" (ID: ${listing.id}):`, insertError);
        }
        else {
            console.log(`✅ Added ${numImages} images to listing: "${listing.title}" (ID: ${listing.id})`);
            imagesAddedCount += numImages;
            listingsUpdatedCount++;
        }
    }
    console.log(`\n🎉 Image seeding complete!`);
    console.log(`📊 Summary:`);
    console.log(`   • ${listingsUpdatedCount} listings updated with new images`);
    console.log(`   • ${imagesAddedCount} total images added`);
    console.log(`\nRemember to ensure your Row Level Security (RLS) policies on the 'listing_images' table allow 'INSERT' operations for the user role you are using to run this script.`);
}
seedListingImages().catch(console.error);
