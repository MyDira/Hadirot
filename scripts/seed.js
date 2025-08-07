import { createClient } from '@supabase/supabase-js';
// Load environment variables from .env file
import * as dotenv from 'dotenv';
dotenv.config();
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing Supabase environment variables. Please check your .env file.');
    process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseAnonKey);
// User IDs
const LANDLORD_USER_ID = '333f8ee4-29df-49ea-be0f-a8e2d9e75617';
const AGENT_USER_ID = 'f92ac354-e021-4df2-ba02-b2087607f775';
// Sample neighborhoods
const neighborhoods = ['Midwood', 'Boro Park', 'Crown Heights', 'Williamsburg', 'Flatbush', 'Kensington'];
// Sample addresses for each neighborhood
const addressesByNeighborhood = {
    'Midwood': [
        'Ocean Pkwy & Ave J',
        'East 17th St & Ave M',
        'Ocean Ave & Ave I',
        'Coney Island Ave & Ave K',
        'East 21st St & Ave L'
    ],
    'Boro Park': [
        '13th Ave & 50th St',
        '48th St & 16th Ave',
        'Fort Hamilton Pkwy & 49th St',
        '14th Ave & 55th St',
        '18th Ave & 60th St'
    ],
    'Crown Heights': [
        'Eastern Pkwy & Brooklyn Ave',
        'Nostrand Ave & Sterling Pl',
        'Franklin Ave & President St',
        'Bedford Ave & Crown St',
        'Utica Ave & Empire Blvd'
    ],
    'Williamsburg': [
        'Bedford Ave & Grand St',
        'Graham Ave & Metropolitan Ave',
        'Lorimer St & Broadway',
        'Union Ave & Meeker Ave',
        'Grand St & Driggs Ave'
    ],
    'Flatbush': [
        'Church Ave & Flatbush Ave',
        'Nostrand Ave & Campus Rd',
        'Ocean Ave & Parkside Ave',
        'Flatbush Ave & Newkirk Ave',
        'Coney Island Ave & Avenue H'
    ],
    'Kensington': [
        'Ocean Pkwy & Church Ave',
        'Coney Island Ave & Ditmas Ave',
        'McDonald Ave & Cortelyou Rd',
        'Fort Hamilton Pkwy & Albemarle Rd',
        'East 7th St & Avenue C'
    ]
};
// Property types
const propertyTypes = ['apartment_building', 'apartment_house', 'full_house'];
const parkingTypes = ['yes', 'included', 'optional', 'no'];
const heatTypes = ['included', 'tenant_pays'];
// Sample images
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
// Generate random date between 1-90 days ago
function getRandomDate() {
    const now = new Date();
    const daysAgo = Math.floor(Math.random() * 90) + 1;
    const date = new Date(now.getTime() - (daysAgo * 24 * 60 * 60 * 1000));
    return date.toISOString();
}
// Generate random address for neighborhood
function getRandomAddress(neighborhood) {
    const addresses = addressesByNeighborhood[neighborhood];
    return addresses[Math.floor(Math.random() * addresses.length)];
}
// Generate random array element
function getRandomElement(array) {
    return array[Math.floor(Math.random() * array.length)];
}
// Generate random number in range
function getRandomNumber(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
// Generate random boolean with probability
function getRandomBoolean(probability = 0.5) {
    return Math.random() < probability;
}
// Sample listing data
const sampleListings = [
    // Landlord listings (10)
    {
        user_id: LANDLORD_USER_ID,
        title: 'Renovated 3BR in Boro Park',
        description: 'Spacious 3-bedroom apartment with modern kitchen and hardwood floors. Close to shopping and transportation.',
        contact_name: 'David Cohen',
        contact_phone: '718-555-0123'
    },
    {
        user_id: LANDLORD_USER_ID,
        title: 'Sunny 2BR in Midwood',
        description: 'Bright and airy 2-bedroom with updated bathroom and plenty of closet space. Quiet residential block.',
        contact_name: 'David Cohen',
        contact_phone: '718-555-0123'
    },
    {
        user_id: LANDLORD_USER_ID,
        title: 'Cozy 1BR in Crown Heights',
        description: 'Charming 1-bedroom apartment with exposed brick and high ceilings. Perfect for young professionals.',
        contact_name: 'David Cohen',
        contact_phone: '718-555-0123'
    },
    {
        user_id: LANDLORD_USER_ID,
        title: 'Spacious Studio in Williamsburg',
        description: 'Large studio with separate sleeping area and modern amenities. Walking distance to trendy restaurants.',
        contact_name: 'David Cohen',
        contact_phone: '718-555-0123'
    },
    {
        user_id: LANDLORD_USER_ID,
        title: 'Beautiful 4BR House in Flatbush',
        description: 'Single-family home with backyard and parking. Great for families, near excellent schools.',
        contact_name: 'David Cohen',
        contact_phone: '718-555-0123'
    },
    {
        user_id: LANDLORD_USER_ID,
        title: 'Modern 2BR in Kensington',
        description: 'Newly renovated 2-bedroom with stainless steel appliances and in-unit laundry. Pet-friendly building.',
        contact_name: 'David Cohen',
        contact_phone: '718-555-0123'
    },
    {
        user_id: LANDLORD_USER_ID,
        title: 'Luxury 3BR in Williamsburg',
        description: 'High-end apartment with Manhattan views and rooftop access. Premium finishes throughout.',
        contact_name: 'David Cohen',
        contact_phone: '718-555-0123'
    },
    {
        user_id: LANDLORD_USER_ID,
        title: 'Affordable 1BR in Flatbush',
        description: 'Budget-friendly 1-bedroom near subway stations. Perfect for first-time renters.',
        contact_name: 'David Cohen',
        contact_phone: '718-555-0123'
    },
    {
        user_id: LANDLORD_USER_ID,
        title: 'Garden Apartment in Midwood',
        description: 'Ground floor 2-bedroom with private garden access. Quiet and peaceful setting.',
        contact_name: 'David Cohen',
        contact_phone: '718-555-0123'
    },
    {
        user_id: LANDLORD_USER_ID,
        title: 'Duplex 5BR in Crown Heights',
        description: 'Large duplex apartment perfect for roommates or large families. Multiple bathrooms and living areas.',
        contact_name: 'David Cohen',
        contact_phone: '718-555-0123'
    },
    // Agent listings (10)
    {
        user_id: AGENT_USER_ID,
        title: 'Executive 2BR in Boro Park',
        description: 'Upscale 2-bedroom with doorman building and gym access. Professional management and maintenance.',
        contact_name: 'Sarah Martinez (Brooklyn Realty)',
        contact_phone: '718-555-0456'
    },
    {
        user_id: AGENT_USER_ID,
        title: 'Trendy 1BR in Williamsburg',
        description: 'Hip 1-bedroom loft with industrial features and modern updates. Heart of trendy neighborhood.',
        contact_name: 'Sarah Martinez (Brooklyn Realty)',
        contact_phone: '718-555-0456'
    },
    {
        user_id: AGENT_USER_ID,
        title: 'Family Home 4BR in Kensington',
        description: 'Spacious family home with driveway and finished basement. Great for growing families.',
        contact_name: 'Sarah Martinez (Brooklyn Realty)',
        contact_phone: '718-555-0456'
    },
    {
        user_id: AGENT_USER_ID,
        title: 'Bright Studio in Midwood',
        description: 'Well-lit studio apartment with efficient layout and modern fixtures. Great value for the area.',
        contact_name: 'Sarah Martinez (Brooklyn Realty)',
        contact_phone: '718-555-0456'
    },
    {
        user_id: AGENT_USER_ID,
        title: 'Elegant 3BR in Crown Heights',
        description: 'Sophisticated 3-bedroom with original details and modern conveniences. Historic brownstone building.',
        contact_name: 'Sarah Martinez (Brooklyn Realty)',
        contact_phone: '718-555-0456'
    },
    {
        user_id: AGENT_USER_ID,
        title: 'Contemporary 2BR in Flatbush',
        description: 'Modern 2-bedroom with open floor plan and updated kitchen. Close to Prospect Park.',
        contact_name: 'Sarah Martinez (Brooklyn Realty)',
        contact_phone: '718-555-0456'
    },
    {
        user_id: AGENT_USER_ID,
        title: 'Penthouse 3BR in Williamsburg',
        description: 'Stunning penthouse with private terrace and city views. Luxury amenities and concierge service.',
        contact_name: 'Sarah Martinez (Brooklyn Realty)',
        contact_phone: '718-555-0456'
    },
    {
        user_id: AGENT_USER_ID,
        title: 'Charming 1BR in Boro Park',
        description: 'Quaint 1-bedroom with character details and updated amenities. Quiet tree-lined street.',
        contact_name: 'Sarah Martinez (Brooklyn Realty)',
        contact_phone: '718-555-0456'
    },
    {
        user_id: AGENT_USER_ID,
        title: 'Spacious 4BR in Kensington',
        description: 'Large 4-bedroom apartment with multiple living areas. Perfect for roommate situations.',
        contact_name: 'Sarah Martinez (Brooklyn Realty)',
        contact_phone: '718-555-0456'
    },
    {
        user_id: AGENT_USER_ID,
        title: 'Luxury Studio in Midwood',
        description: 'High-end studio with premium finishes and building amenities. Doorman and fitness center.',
        contact_name: 'Sarah Martinez (Brooklyn Realty)',
        contact_phone: '718-555-0456'
    }
];
async function seedDatabase() {
    console.log('🌱 Starting database seeding with 20 realistic listings...');
    // Check for existing listings to avoid duplicates
    const { data: existingListings, error: fetchError } = await supabase
        .from('listings')
        .select('id, title');
    if (fetchError) {
        console.error('❌ Error fetching existing listings:', fetchError);
        return;
    }
    const existingTitles = new Set(existingListings?.map(l => l.title) || []);
    // Randomly select 5 listings to be featured
    const featuredIndices = new Set();
    while (featuredIndices.size < 5) {
        featuredIndices.add(Math.floor(Math.random() * sampleListings.length));
    }
    let insertedCount = 0;
    for (let i = 0; i < sampleListings.length; i++) {
        const listingTemplate = sampleListings[i];
        if (existingTitles.has(listingTemplate.title)) {
            console.log(`⏭️  Skipping existing listing: "${listingTemplate.title}"`);
            continue;
        }
        // Generate random data for this listing
        const neighborhood = getRandomElement(neighborhoods);
        const bedrooms = getRandomNumber(0, 5); // 0 = studio
        const bathrooms = getRandomNumber(1, 3) + (Math.random() > 0.7 ? 0.5 : 0); // Sometimes .5 bathrooms
        const price = getRandomNumber(1800, 4200);
        const squareFootage = bedrooms === 0 ? getRandomNumber(300, 600) : getRandomNumber(500, 2000);
        const createdAt = getRandomDate();
        const isFeatured = featuredIndices.has(i);
        const listingData = {
            ...listingTemplate,
            location: getRandomAddress(neighborhood),
            neighborhood,
            bedrooms,
            bathrooms,
            floor: getRandomNumber(1, 8),
            price,
            square_footage: squareFootage,
            parking: getRandomElement(parkingTypes),
            washer_dryer_hookup: getRandomBoolean(0.6),
            dishwasher: getRandomBoolean(0.7),
            lease_length: getRandomElement(['12 months', '24 months', '6 months', 'Month to month']),
            heat: getRandomElement(heatTypes),
            property_type: getRandomElement(propertyTypes),
            is_featured: isFeatured,
            featured_until: isFeatured ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : null,
            is_active: true,
            views: getRandomNumber(0, 300),
            created_at: createdAt,
            updated_at: createdAt
        };
        try {
            // Insert the listing
            const { data: newListing, error: listingError } = await supabase
                .from('listings')
                .insert(listingData)
                .select()
                .single();
            if (listingError) {
                console.error(`❌ Error inserting listing "${listingTemplate.title}":`, listingError);
                continue;
            }
            console.log(`✅ Inserted listing: "${newListing.title}" (ID: ${newListing.id})`);
            console.log(`   💰 Price: $${newListing.price} | 🛏️  ${newListing.bedrooms}BR/${newListing.bathrooms}BA | 📍 ${newListing.neighborhood}`);
            console.log(`   ${newListing.is_featured ? '⭐ FEATURED' : '📋 Standard'} | 👀 ${newListing.views} views`);
            // Insert 1-3 random images for each listing
            const numImages = getRandomNumber(1, 3);
            const shuffledImages = [...sampleImages].sort(() => 0.5 - Math.random());
            for (let j = 0; j < numImages; j++) {
                const imageData = {
                    listing_id: newListing.id,
                    image_url: shuffledImages[j % shuffledImages.length],
                    is_featured: j === 0, // First image is featured
                    sort_order: j
                };
                const { error: imageError } = await supabase
                    .from('listing_images')
                    .insert(imageData);
                if (imageError) {
                    console.error(`❌ Error inserting image for listing "${newListing.title}":`, imageError);
                }
            }
            console.log(`   📸 Added ${numImages} images`);
            insertedCount++;
        }
        catch (error) {
            console.error(`❌ Unexpected error for listing "${listingTemplate.title}":`, error);
        }
    }
    console.log(`\n🎉 Database seeding complete!`);
    console.log(`📊 Summary:`);
    console.log(`   • ${insertedCount} listings created`);
    console.log(`   • ${Array.from(featuredIndices).length} featured listings`);
    console.log(`   • Landlord listings: ${sampleListings.filter(l => l.user_id === LANDLORD_USER_ID).length}`);
    console.log(`   • Agent listings: ${sampleListings.filter(l => l.user_id === AGENT_USER_ID).length}`);
    console.log(`\n🔍 Test the following features:`);
    console.log(`   • Browse listings with filters`);
    console.log(`   • View individual listing details`);
    console.log(`   • Check dashboard for each user type`);
    console.log(`   • Test featured listing functionality`);
    console.log(`   • Verify view counts and listing management`);
}
// Install dotenv if not already installed
// npm install dotenv
seedDatabase().catch(console.error);
