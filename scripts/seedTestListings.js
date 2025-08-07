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
// Test User IDs (these should exist in your profiles table)
const LANDLORD_USER_ID = '333f8ee4-29df-49ea-be0f-a8e2d9e75617';
const AGENT_USER_ID = 'f92ac354-e021-4df2-ba02-b2087607f775';
// Brooklyn neighborhoods
const neighborhoods = [
    'Midwood', 'Boro Park', 'Crown Heights', 'Williamsburg',
    'Flatbush', 'Kensington', 'Bay Ridge', 'Park Slope',
    'Bensonhurst', 'Sheepshead Bay', 'Brighton Beach', 'Sunset Park'
];
// Cross streets for each neighborhood
const crossStreetsByNeighborhood = {
    'Midwood': ['Ocean Pkwy & Ave J', 'East 17th St & Ave M', 'Ocean Ave & Ave I'],
    'Boro Park': ['13th Ave & 50th St', '48th St & 16th Ave', 'Fort Hamilton Pkwy & 49th St'],
    'Crown Heights': ['Eastern Pkwy & Brooklyn Ave', 'Nostrand Ave & Sterling Pl', 'Franklin Ave & President St'],
    'Williamsburg': ['Bedford Ave & Grand St', 'Graham Ave & Metropolitan Ave', 'Lorimer St & Broadway'],
    'Flatbush': ['Church Ave & Flatbush Ave', 'Nostrand Ave & Campus Rd', 'Ocean Ave & Parkside Ave'],
    'Kensington': ['Ocean Pkwy & Church Ave', 'Coney Island Ave & Ditmas Ave', 'McDonald Ave & Cortelyou Rd'],
    'Bay Ridge': ['5th Ave & 86th St', '3rd Ave & 77th St', 'Ridge Blvd & 95th St'],
    'Park Slope': ['7th Ave & 9th St', '5th Ave & Union St', 'Prospect Park West & 15th St'],
    'Bensonhurst': ['86th St & 20th Ave', 'Bay Pkwy & 79th St', '18th Ave & 85th St'],
    'Sheepshead Bay': ['Sheepshead Bay Rd & Ave Z', 'Nostrand Ave & Ave U', 'Ocean Ave & Ave X'],
    'Brighton Beach': ['Brighton Beach Ave & Ocean Pkwy', 'Coney Island Ave & Brighton 6th St', 'Ocean Pkwy & Neptune Ave'],
    'Sunset Park': ['5th Ave & 45th St', '8th Ave & 60th St', '4th Ave & 36th St']
};
// Real estate agencies
const agencies = [
    'Brooklyn Realty Group',
    'Premier Properties NYC',
    'Metro Brooklyn Homes',
    'Elite Real Estate Partners',
    'Brooklyn Heights Realty',
    'Parkside Property Management',
    'Crown Real Estate Associates',
    'Bay Area Properties',
    'Sunset Realty Solutions',
    'Ocean View Real Estate',
    'Brooklyn Bridge Properties',
    'Neighborhood Realty Co.',
    'Urban Living Brooklyn',
    'Prospect Realty Group',
    'Kings County Properties'
];
// Property types and other enums
const propertyTypes = ['apartment_building', 'apartment_house', 'full_house'];
const parkingTypes = ['yes', 'included', 'optional', 'no'];
const heatTypes = ['included', 'tenant_pays'];
// High-quality real estate images from Pexels
const sampleImages = [
    'https://images.pexels.com/photos/106399/pexels-photo-106399.jpeg?auto=compress&cs=tinysrgb&w=800&h=600',
    'https://images.pexels.com/photos/1396122/pexels-photo-1396122.jpeg?auto=compress&cs=tinysrgb&w=800&h=600',
    'https://images.pexels.com/photos/259751/pexels-photo-259751.jpeg?auto=compress&cs=tinysrgb&w=800&h=600',
    'https://images.pexels.com/photos/276724/pexels-photo-276724.jpeg?auto=compress&cs=tinysrgb&w=800&h=600',
    'https://images.pexels.com/photos/164558/pexels-photo-164558.jpeg?auto=compress&cs=tinysrgb&w=800&h=600',
    'https://images.pexels.com/photos/1571460/pexels-photo-1571460.jpeg?auto=compress&cs=tinysrgb&w=800&h=600',
    'https://images.pexels.com/photos/206172/pexels-photo-206172.jpeg?auto=compress&cs=tinysrgb&w=800&h=600',
    'https://images.pexels.com/photos/186077/pexels-photo-186077.jpeg?auto=compress&cs=tinysrgb&w=800&h=600',
    'https://images.pexels.com/photos/271624/pexels-photo-271624.jpeg?auto=compress&cs=tinysrgb&w=800&h=600',
    'https://images.pexels.com/photos/275484/pexels-photo-275484.jpeg?auto=compress&cs=tinysrgb&w=800&h=600',
    'https://images.pexels.com/photos/1643383/pexels-photo-1643383.jpeg?auto=compress&cs=tinysrgb&w=800&h=600',
    'https://images.pexels.com/photos/1571453/pexels-photo-1571453.jpeg?auto=compress&cs=tinysrgb&w=800&h=600',
    'https://images.pexels.com/photos/2724749/pexels-photo-2724749.jpeg?auto=compress&cs=tinysrgb&w=800&h=600',
    'https://images.pexels.com/photos/1428348/pexels-photo-1428348.jpeg?auto=compress&cs=tinysrgb&w=800&h=600',
    'https://images.pexels.com/photos/2079246/pexels-photo-2079246.jpeg?auto=compress&cs=tinysrgb&w=800&h=600'
];
// Utility functions
function getRandomElement(array) {
    return array[Math.floor(Math.random() * array.length)];
}
function getRandomNumber(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
function getRandomBoolean(probability = 0.5) {
    return Math.random() < probability;
}
function getRandomCrossStreet(neighborhood) {
    const streets = crossStreetsByNeighborhood[neighborhood] || crossStreetsByNeighborhood['Midwood'];
    return getRandomElement(streets);
}
// Generate date functions
function getExpiredDate() {
    // 31-60 days ago (expired)
    const daysAgo = getRandomNumber(31, 60);
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return date.toISOString();
}
function getRecentDate() {
    // 1-29 days ago (still active)
    const daysAgo = getRandomNumber(1, 29);
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return date.toISOString();
}
// Sample listing templates
const listingTemplates = [
    // Landlord listings (15)
    {
        user_id: LANDLORD_USER_ID,
        title: 'Renovated 3BR in Boro Park',
        description: 'Spacious 3-bedroom apartment with modern kitchen, hardwood floors, and updated bathroom. Close to shopping, schools, and public transportation. Perfect for families looking for comfort and convenience.',
        contact_name: 'David Cohen',
        contact_phone: '718-555-0123'
    },
    {
        user_id: LANDLORD_USER_ID,
        title: 'Sunny 2BR in Midwood',
        description: 'Bright and airy 2-bedroom with large windows, updated kitchen, and plenty of closet space. Quiet residential block with tree-lined streets. Near excellent schools and shopping.',
        contact_name: 'David Cohen',
        contact_phone: '718-555-0123'
    },
    {
        user_id: LANDLORD_USER_ID,
        title: 'Cozy 1BR in Crown Heights',
        description: 'Charming 1-bedroom apartment with exposed brick walls, high ceilings, and modern amenities. Perfect for young professionals. Walking distance to subway and trendy cafes.',
        contact_name: 'Sarah Goldman',
        contact_phone: '718-555-0124'
    },
    {
        user_id: LANDLORD_USER_ID,
        title: 'Spacious Studio in Williamsburg',
        description: 'Large studio with separate sleeping area, modern kitchen, and great natural light. Located in the heart of trendy Williamsburg with easy access to Manhattan.',
        contact_name: 'Michael Rosenberg',
        contact_phone: '718-555-0125'
    },
    {
        user_id: LANDLORD_USER_ID,
        title: 'Beautiful 4BR House in Flatbush',
        description: 'Single-family home with private backyard, driveway parking, and finished basement. Great for large families. Near excellent schools and Prospect Park.',
        contact_name: 'Rachel Klein',
        contact_phone: '718-555-0126'
    },
    {
        user_id: LANDLORD_USER_ID,
        title: 'Modern 2BR in Kensington',
        description: 'Newly renovated 2-bedroom with stainless steel appliances, in-unit laundry, and central air. Pet-friendly building with responsive management.',
        contact_name: 'Joshua Friedman',
        contact_phone: '718-555-0127'
    },
    {
        user_id: LANDLORD_USER_ID,
        title: 'Luxury 3BR in Bay Ridge',
        description: 'High-end apartment with water views, granite countertops, and premium finishes throughout. Building amenities include gym and rooftop deck.',
        contact_name: 'Lisa Schwartz',
        contact_phone: '718-555-0128'
    },
    {
        user_id: LANDLORD_USER_ID,
        title: 'Affordable 1BR in Sunset Park',
        description: 'Budget-friendly 1-bedroom near subway stations and local amenities. Perfect for first-time renters or those looking for value in Brooklyn.',
        contact_name: 'Daniel Levy',
        contact_phone: '718-555-0129'
    },
    {
        user_id: LANDLORD_USER_ID,
        title: 'Garden Apartment in Park Slope',
        description: 'Ground floor 2-bedroom with private garden access and outdoor space. Quiet setting on a beautiful tree-lined street in desirable Park Slope.',
        contact_name: 'Rebecca Cohen',
        contact_phone: '718-555-0130'
    },
    {
        user_id: LANDLORD_USER_ID,
        title: 'Duplex 4BR in Bensonhurst',
        description: 'Large duplex apartment perfect for roommates or large families. Multiple bathrooms, living areas, and plenty of storage space.',
        contact_name: 'Aaron Goldberg',
        contact_phone: '718-555-0131'
    },
    {
        user_id: LANDLORD_USER_ID,
        title: 'Waterfront 2BR in Sheepshead Bay',
        description: 'Beautiful apartment with water views and modern amenities. Close to the marina and excellent seafood restaurants. Peaceful waterfront living.',
        contact_name: 'Miriam Rosen',
        contact_phone: '718-555-0132'
    },
    {
        user_id: LANDLORD_USER_ID,
        title: 'Bright Studio in Brighton Beach',
        description: 'Well-lit studio apartment with efficient layout and modern fixtures. Steps from the beach and boardwalk. Great value for beachside living.',
        contact_name: 'Benjamin Katz',
        contact_phone: '718-555-0133'
    },
    {
        user_id: LANDLORD_USER_ID,
        title: 'Family Home 3BR in Midwood',
        description: 'Spacious family home with backyard, garage, and updated kitchen. Great for families with children. Near parks and top-rated schools.',
        contact_name: 'Hannah Stern',
        contact_phone: '718-555-0134'
    },
    {
        user_id: LANDLORD_USER_ID,
        title: 'Penthouse 2BR in Crown Heights',
        description: 'Top floor apartment with private terrace and city views. Modern finishes and plenty of natural light. Elevator building with laundry.',
        contact_name: 'Jacob Miller',
        contact_phone: '718-555-0135'
    },
    {
        user_id: LANDLORD_USER_ID,
        title: 'Charming 1BR in Williamsburg',
        description: 'Quaint 1-bedroom with original details and modern updates. Exposed brick, hardwood floors, and great location near trendy restaurants.',
        contact_name: 'Esther Weiss',
        contact_phone: '718-555-0136'
    },
    // Agent listings (15)
    {
        user_id: AGENT_USER_ID,
        title: 'Executive 2BR in Boro Park',
        description: 'Upscale 2-bedroom in doorman building with gym access, concierge service, and professional management. Premium location with excellent amenities.',
        contact_name: 'Sarah Martinez',
        contact_phone: '718-555-0456'
    },
    {
        user_id: AGENT_USER_ID,
        title: 'Trendy 1BR Loft in Williamsburg',
        description: 'Hip 1-bedroom loft with industrial features, exposed brick, and modern updates. Located in the heart of trendy Williamsburg nightlife district.',
        contact_name: 'Carlos Rodriguez',
        contact_phone: '718-555-0457'
    },
    {
        user_id: AGENT_USER_ID,
        title: 'Family Estate 4BR in Bay Ridge',
        description: 'Spacious family home with driveway, finished basement, and large backyard. Perfect for growing families seeking suburban feel in the city.',
        contact_name: 'Jennifer Kim',
        contact_phone: '718-555-0458'
    },
    {
        user_id: AGENT_USER_ID,
        title: 'Luxury Studio in Park Slope',
        description: 'High-end studio with premium finishes, building amenities, and prime location. Doorman, fitness center, and rooftop access included.',
        contact_name: 'Michael Thompson',
        contact_phone: '718-555-0459'
    },
    {
        user_id: AGENT_USER_ID,
        title: 'Elegant 3BR in Crown Heights',
        description: 'Sophisticated 3-bedroom in historic brownstone with original architectural details and modern conveniences. Character meets comfort.',
        contact_name: 'Amanda Johnson',
        contact_phone: '718-555-0460'
    },
    {
        user_id: AGENT_USER_ID,
        title: 'Contemporary 2BR in Flatbush',
        description: 'Modern 2-bedroom with open floor plan, updated kitchen, and designer finishes. Close to Prospect Park and excellent transportation.',
        contact_name: 'David Park',
        contact_phone: '718-555-0461'
    },
    {
        user_id: AGENT_USER_ID,
        title: 'Penthouse 3BR in Sunset Park',
        description: 'Stunning penthouse with private terrace, Manhattan views, and luxury amenities. Concierge service and premium building features.',
        contact_name: 'Lisa Chen',
        contact_phone: '718-555-0462'
    },
    {
        user_id: AGENT_USER_ID,
        title: 'Designer 1BR in Kensington',
        description: 'Professionally designed 1-bedroom with custom finishes and high-end appliances. Quiet tree-lined street with easy commute options.',
        contact_name: 'Robert Wilson',
        contact_phone: '718-555-0463'
    },
    {
        user_id: AGENT_USER_ID,
        title: 'Spacious 4BR in Bensonhurst',
        description: 'Large 4-bedroom apartment with multiple living areas and updated bathrooms. Perfect for roommate situations or large families.',
        contact_name: 'Maria Gonzalez',
        contact_phone: '718-555-0464'
    },
    {
        user_id: AGENT_USER_ID,
        title: 'Waterfront 2BR in Sheepshead Bay',
        description: 'Premium waterfront living with marina views and luxury finishes. Building amenities include pool, gym, and 24-hour concierge.',
        contact_name: 'James Lee',
        contact_phone: '718-555-0465'
    },
    {
        user_id: AGENT_USER_ID,
        title: 'Beachside 3BR in Brighton Beach',
        description: 'Rare 3-bedroom steps from the beach with ocean views and modern amenities. Perfect for those seeking beachfront lifestyle.',
        contact_name: 'Nicole Davis',
        contact_phone: '718-555-0466'
    },
    {
        user_id: AGENT_USER_ID,
        title: 'Modern 2BR in Midwood',
        description: 'Contemporary 2-bedroom with smart home features, premium appliances, and building amenities. Professional management and maintenance.',
        contact_name: 'Kevin Zhang',
        contact_phone: '718-555-0467'
    },
    {
        user_id: AGENT_USER_ID,
        title: 'Luxury 1BR in Crown Heights',
        description: 'High-end 1-bedroom with designer finishes, in-unit laundry, and building amenities. Prime location with excellent transportation.',
        contact_name: 'Rachel Green',
        contact_phone: '718-555-0468'
    },
    {
        user_id: AGENT_USER_ID,
        title: 'Executive 3BR in Bay Ridge',
        description: 'Executive-level 3-bedroom with home office space, premium finishes, and building amenities. Perfect for professionals and families.',
        contact_name: 'Steven Brown',
        contact_phone: '718-555-0469'
    },
    {
        user_id: AGENT_USER_ID,
        title: 'Penthouse Studio in Williamsburg',
        description: 'Top-floor studio with private terrace, city views, and luxury finishes. Building features rooftop deck and fitness center.',
        contact_name: 'Ashley Taylor',
        contact_phone: '718-555-0470'
    }
];
async function seedTestListings() {
    console.log('🌱 Starting test listing seeding for lifecycle testing...');
    // Clear existing test listings first
    console.log('🧹 Clearing existing test listings...');
    const { error: clearError } = await supabase
        .from('listings')
        .delete()
        .in('user_id', [LANDLORD_USER_ID, AGENT_USER_ID]);
    if (clearError) {
        console.error('❌ Error clearing existing listings:', clearError);
    }
    else {
        console.log('✅ Cleared existing test listings');
    }
    let insertedCount = 0;
    let expiredCount = 0;
    let activeCount = 0;
    for (let i = 0; i < listingTemplates.length; i++) {
        const template = listingTemplates[i];
        const isExpired = i < 15; // First 15 listings are expired
        const neighborhood = getRandomElement(neighborhoods);
        const bedrooms = getRandomNumber(0, 4);
        const bathrooms = getRandomNumber(1, 3) + (Math.random() > 0.7 ? 0.5 : 0);
        const price = getRandomNumber(1800, 5500);
        const squareFootage = bedrooms === 0 ? getRandomNumber(400, 700) : getRandomNumber(600, 2500);
        const createdAt = isExpired ? getExpiredDate() : getRecentDate();
        const isFeatured = getRandomBoolean(0.2); // 20% chance of being featured
        // Assign agency for agent listings
        const agency = template.user_id === AGENT_USER_ID ? getRandomElement(agencies) : null;
        const listingData = {
            ...template,
            location: getRandomCrossStreet(neighborhood),
            neighborhood,
            bedrooms,
            bathrooms,
            floor: getRandomNumber(1, 6),
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
            is_active: !isExpired, // Expired listings are inactive
            views: getRandomNumber(0, 250),
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
                console.error(`❌ Error inserting listing "${template.title}":`, listingError);
                continue;
            }
            // Update profile with agency if it's an agent listing
            if (template.user_id === AGENT_USER_ID && agency) {
                await supabase
                    .from('profiles')
                    .update({ agency })
                    .eq('id', AGENT_USER_ID);
            }
            // Insert 2-4 random images for each listing
            const numImages = getRandomNumber(2, 4);
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
            const status = isExpired ? '🔴 EXPIRED' : '🟢 ACTIVE';
            const role = template.user_id === AGENT_USER_ID ? 'AGENT' : 'LANDLORD';
            const featured = newListing.is_featured ? '⭐ FEATURED' : '';
            console.log(`✅ ${status} ${role} - "${newListing.title}"`);
            console.log(`   💰 $${newListing.price} | 🛏️ ${newListing.bedrooms}BR/${newListing.bathrooms}BA | 📍 ${newListing.neighborhood} ${featured}`);
            console.log(`   📅 Created: ${new Date(createdAt).toLocaleDateString()} | 📸 ${numImages} images`);
            if (agency) {
                console.log(`   🏢 Agency: ${agency}`);
            }
            insertedCount++;
            if (isExpired)
                expiredCount++;
            else
                activeCount++;
        }
        catch (error) {
            console.error(`❌ Unexpected error for listing "${template.title}":`, error);
        }
    }
    console.log(`\n🎉 Test listing seeding complete!`);
    console.log(`📊 Summary:`);
    console.log(`   • ${insertedCount} total listings created`);
    console.log(`   • ${expiredCount} expired listings (>30 days old, is_active=false)`);
    console.log(`   • ${activeCount} active listings (<30 days old, is_active=true)`);
    console.log(`   • ${listingTemplates.filter(l => l.user_id === LANDLORD_USER_ID).length} landlord listings`);
    console.log(`   • ${listingTemplates.filter(l => l.user_id === AGENT_USER_ID).length} agent listings`);
    console.log(`\n🧪 Testing Features:`);
    console.log(`   • Test "Renew" button on expired listings to reset lifecycle`);
    console.log(`   • Verify expired listings show as inactive in dashboard`);
    console.log(`   • Check that renewed listings get fresh 30-day active period`);
    console.log(`   • Test automatic inactivation/deletion functions`);
    console.log(`\n🔍 Next Steps:`);
    console.log(`   • Visit /dashboard to see your test listings`);
    console.log(`   • Try renewing expired listings`);
    console.log(`   • Test the scheduled functions for auto-inactivation`);
}
seedTestListings().catch(console.error);