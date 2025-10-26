import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface Category {
  name: string;
  slug: string;
  description: string;
  icon: string;
  sort_order: number;
}

interface Article {
  category_slug: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  tags: string[];
  sort_order: number;
  is_published: boolean;
  read_time_minutes: number;
}

const categories: Category[] = [
  {
    name: 'Getting Started',
    slug: 'getting-started',
    description: 'Learn the basics of using our platform to find or list rental properties',
    icon: 'Rocket',
    sort_order: 1,
  },
  {
    name: 'Posting Listings',
    slug: 'posting-listings',
    description: 'Everything you need to know about creating and managing your property listings',
    icon: 'Home',
    sort_order: 2,
  },
  {
    name: 'Browsing Properties',
    slug: 'browsing-properties',
    description: 'Find your perfect rental with our powerful search and filtering tools',
    icon: 'Search',
    sort_order: 3,
  },
  {
    name: 'Account Management',
    slug: 'account-management',
    description: 'Manage your profile, settings, and account preferences',
    icon: 'User',
    sort_order: 4,
  },
  {
    name: 'Featured Listings',
    slug: 'featured-listings',
    description: 'Learn about featured listings and how to boost your property visibility',
    icon: 'Star',
    sort_order: 5,
  },
  {
    name: 'Favorites & Saved Searches',
    slug: 'favorites',
    description: 'Save and organize properties you love for easy access later',
    icon: 'Heart',
    sort_order: 6,
  },
  {
    name: 'Agency Features',
    slug: 'agency-features',
    description: 'Tools and features for real estate agencies managing multiple properties',
    icon: 'Building2',
    sort_order: 7,
  },
  {
    name: 'Community Guidelines',
    slug: 'guidelines',
    description: 'Rules and best practices for maintaining a trusted community',
    icon: 'Shield',
    sort_order: 8,
  },
  {
    name: 'Technical Support',
    slug: 'technical-support',
    description: 'Troubleshooting tips and solutions to common technical issues',
    icon: 'Settings',
    sort_order: 9,
  },
];

const articles: Article[] = [
  // Getting Started
  {
    category_slug: 'getting-started',
    title: 'Welcome to Our Rental Platform',
    slug: 'welcome',
    excerpt: 'Get started with finding your next home or listing your property in our local community.',
    content: `
      <h2>Welcome to the Heart of Local Rentals</h2>
      <p>Welcome! Our platform connects families and property owners in the community, making it easy to find and list rental properties.</p>

      <h3>What You Can Do Here</h3>
      <ul>
        <li><strong>Browse Properties:</strong> Search through available rentals with detailed filters for bedrooms, price, location, and amenities</li>
        <li><strong>Post Listings:</strong> List your rental property with photos and detailed information</li>
        <li><strong>Save Favorites:</strong> Keep track of properties you're interested in</li>
        <li><strong>Manage Your Account:</strong> Update your profile and preferences</li>
      </ul>

      <h3>Getting Started as a Tenant</h3>
      <p>Looking for a rental? Start by browsing our listings or create an account to save your favorites and get notifications about new properties.</p>

      <h3>Getting Started as a Landlord</h3>
      <p>Have a property to rent? Create an account, post your listing with photos and details, and connect with potential tenants in the community.</p>

      <h3>Need Help?</h3>
      <p>Browse through our help articles organized by topic, or contact us if you have specific questions.</p>
    `,
    tags: ['introduction', 'basics', 'overview'],
    sort_order: 1,
    is_published: true,
    read_time_minutes: 3,
  },
  {
    category_slug: 'getting-started',
    title: 'Creating Your Account',
    slug: 'creating-account',
    excerpt: 'Learn how to sign up and set up your profile on our platform.',
    content: `
      <h2>Creating Your Account</h2>
      <p>Creating an account allows you to post listings, save favorites, and manage your activity on the platform.</p>

      <h3>Sign Up Process</h3>
      <ol>
        <li>Click the "Sign In" button in the top navigation</li>
        <li>Select "Sign Up" to create a new account</li>
        <li>Enter your email address and create a secure password</li>
        <li>Complete your profile with your full name and phone number</li>
        <li>Select your role: Tenant, Landlord, or Agent</li>
      </ol>

      <h3>Profile Information</h3>
      <p>Your profile includes:</p>
      <ul>
        <li><strong>Full Name:</strong> Used in communications and listings</li>
        <li><strong>Phone Number:</strong> How interested parties can contact you</li>
        <li><strong>Email:</strong> For account notifications and updates</li>
        <li><strong>Role:</strong> Identifies you as a tenant, landlord, or agent</li>
      </ul>

      <h3>Account Security</h3>
      <p>Keep your account secure by using a strong password and never sharing your login credentials.</p>
    `,
    tags: ['account', 'signup', 'registration', 'profile'],
    sort_order: 2,
    is_published: true,
    read_time_minutes: 4,
  },

  // Posting Listings
  {
    category_slug: 'posting-listings',
    title: 'How to Post a Listing',
    slug: 'how-to-post-listing',
    excerpt: 'Step-by-step guide to creating your first property listing.',
    content: `
      <h2>Posting Your First Listing</h2>
      <p>Ready to list your property? Follow these steps to create an effective listing that attracts quality tenants.</p>

      <h3>Before You Begin</h3>
      <p>Make sure you have:</p>
      <ul>
        <li>High-quality photos of your property</li>
        <li>Detailed property information (size, bedrooms, bathrooms)</li>
        <li>Rental price and lease terms</li>
        <li>Contact information for interested parties</li>
      </ul>

      <h3>Step-by-Step Process</h3>
      <ol>
        <li><strong>Navigate to Post Listing:</strong> Click "List a Property" in the main navigation</li>
        <li><strong>Enter Property Details:</strong>
          <ul>
            <li>Title: Create a clear, descriptive title</li>
            <li>Location: Enter the address or neighborhood</li>
            <li>Property Type: Select apartment building, apartment in house, or full house</li>
            <li>Bedrooms and Bathrooms: Specify the number</li>
            <li>Floor: If applicable, indicate which floor</li>
          </ul>
        </li>
        <li><strong>Set Pricing:</strong> Enter monthly rent or select "Call for Price" if pricing is negotiable</li>
        <li><strong>Add Amenities:</strong>
          <ul>
            <li>Parking availability</li>
            <li>Washer/dryer hookup</li>
            <li>Dishwasher</li>
            <li>Heat included or tenant pays</li>
          </ul>
        </li>
        <li><strong>Upload Photos:</strong> Add up to 10 high-quality images showcasing your property</li>
        <li><strong>Write Description:</strong> Provide detailed information about the property and neighborhood</li>
        <li><strong>Add Contact Information:</strong> Include your name and phone number for inquiries</li>
        <li><strong>Submit for Review:</strong> Your listing will be reviewed before going live</li>
      </ol>

      <h3>Tips for Great Listings</h3>
      <ul>
        <li>Use clear, well-lit photos from multiple angles</li>
        <li>Be accurate and honest in your descriptions</li>
        <li>Highlight unique features and recent updates</li>
        <li>Mention nearby amenities and transportation</li>
        <li>Respond promptly to inquiries</li>
      </ul>
    `,
    tags: ['posting', 'listing', 'create', 'landlord'],
    sort_order: 1,
    is_published: true,
    read_time_minutes: 6,
  },
  {
    category_slug: 'posting-listings',
    title: 'Listing Approval Process',
    slug: 'listing-approval',
    excerpt: 'Understand how listings are reviewed and approved for publication.',
    content: `
      <h2>How Listing Approval Works</h2>
      <p>All listings go through a review process to ensure quality and accuracy for our community.</p>

      <h3>The Approval Process</h3>
      <ol>
        <li><strong>Submission:</strong> After you submit your listing, it enters the review queue</li>
        <li><strong>Review:</strong> Our team reviews listings within 24-48 hours</li>
        <li><strong>Approval:</strong> Once approved, your listing goes live immediately</li>
        <li><strong>Notification:</strong> You'll receive an email when your listing is approved</li>
      </ol>

      <h3>What We Look For</h3>
      <p>During review, we check that listings:</p>
      <ul>
        <li>Have clear, appropriate photos</li>
        <li>Include accurate property information</li>
        <li>Follow community guidelines</li>
        <li>Have complete contact information</li>
        <li>Meet basic quality standards</li>
      </ul>

      <h3>Common Reasons for Delays</h3>
      <ul>
        <li>Missing or unclear photos</li>
        <li>Incomplete property details</li>
        <li>Inappropriate content</li>
        <li>Duplicate listings</li>
      </ul>

      <h3>After Approval</h3>
      <p>Once approved, your listing will appear in search results and can receive inquiries. You can edit your listing anytime from your dashboard.</p>
    `,
    tags: ['approval', 'review', 'moderation', 'waiting'],
    sort_order: 2,
    is_published: true,
    read_time_minutes: 4,
  },
  {
    category_slug: 'posting-listings',
    title: 'Managing Your Listings',
    slug: 'managing-listings',
    excerpt: 'Learn how to edit, update, and manage your property listings effectively.',
    content: `
      <h2>Managing Your Property Listings</h2>
      <p>Once your listing is live, you have complete control to edit, update, and manage it from your dashboard. This guide covers everything you need to know about keeping your listings current and effective.</p>

      <h2>Accessing Your Dashboard</h2>
      <p>Your dashboard is the central hub for managing all your listings:</p>
      <ol>
        <li>Log in to your account using your email and password</li>
        <li>Click "Dashboard" in the main navigation menu</li>
        <li>View all your listings displayed with their current status</li>
        <li>Use the filters to sort by active, inactive, or pending approval</li>
      </ol>
      <p>From your dashboard, you can see at a glance:</p>
      <ul>
        <li><strong>Total Listings:</strong> The number of properties you have posted</li>
        <li><strong>Active Listings:</strong> Properties currently visible in search results</li>
        <li><strong>Inactive Listings:</strong> Properties you've temporarily removed from search</li>
        <li><strong>Pending Approval:</strong> New or edited listings awaiting review</li>
      </ul>

      <h2>Editing Your Listing</h2>
      <p>Need to update information about your property? Making changes is simple:</p>

      <h3>Making Edits</h3>
      <ol>
        <li>Navigate to your Dashboard</li>
        <li>Find the listing you want to modify</li>
        <li>Click the "Edit" button on the listing card</li>
        <li>Update any information you need to change:
          <ul>
            <li>Property details (bedrooms, bathrooms, square footage)</li>
            <li>Pricing and availability</li>
            <li>Description and features</li>
            <li>Photos (add, remove, or reorder)</li>
            <li>Contact information</li>
            <li>Amenities and utilities</li>
          </ul>
        </li>
        <li>Review all your changes carefully</li>
        <li>Click "Save Changes" to submit</li>
      </ol>

      <h3>What Requires Re-Approval</h3>
      <p>Minor updates are published immediately, but significant changes may require our team to re-review your listing. Changes that typically need approval include:</p>
      <ul>
        <li>Major price changes</li>
        <li>Changes to the number of bedrooms or bathrooms</li>
        <li>Adding or replacing primary photos</li>
        <li>Significant rewrites to the description</li>
        <li>Changes to the property type or location</li>
      </ul>
      <p><strong>Note:</strong> If your edit requires re-approval, your listing will remain live with the old information until the new version is approved.</p>

      <h3>Updates That Go Live Immediately</h3>
      <p>These changes typically don't require re-approval:</p>
      <ul>
        <li>Minor description updates or typo corrections</li>
        <li>Small price adjustments (within 10%)</li>
        <li>Contact information changes</li>
        <li>Availability date updates</li>
        <li>Adding or removing amenity checkboxes</li>
      </ul>

      <h2>Managing Listing Status</h2>

      <h3>Deactivating a Listing</h3>
      <p>When your property is rented or temporarily unavailable, you should deactivate the listing:</p>
      <ol>
        <li>Go to your Dashboard</li>
        <li>Locate the listing you want to deactivate</li>
        <li>Click the toggle switch or "Deactivate" button</li>
        <li>Confirm the deactivation</li>
      </ol>
      <p><strong>What happens when you deactivate:</strong></p>
      <ul>
        <li>The listing is immediately removed from search results</li>
        <li>The listing page shows "No longer available"</li>
        <li>Saved links to the listing still work but show it's unavailable</li>
        <li>All listing data is preserved in your dashboard</li>
        <li>You can reactivate it anytime in the future</li>
      </ul>

      <h3>Reactivating a Listing</h3>
      <p>Need to relist the same property? Reactivating is easy:</p>
      <ol>
        <li>Navigate to your Dashboard</li>
        <li>Filter to show inactive listings</li>
        <li>Find the listing you want to reactivate</li>
        <li>Click the toggle switch or "Activate" button</li>
        <li>Review the listing information for accuracy</li>
        <li>Update any outdated information (price, availability, etc.)</li>
        <li>Confirm reactivation</li>
      </ol>
      <p><em>Note: Reactivated listings may require re-approval if significant time has passed or if you made changes.</em></p>

      <h3>Deleting a Listing</h3>
      <p>If you no longer need a listing and don't plan to use it again:</p>
      <ol>
        <li>Go to your Dashboard</li>
        <li>Find the listing you want to permanently remove</li>
        <li>Click the "Delete" button (usually in a dropdown menu)</li>
        <li>Confirm the deletion when prompted</li>
      </ol>
      <p><strong>Warning:</strong> Deletion is permanent and cannot be undone. If you might need the listing again in the future, deactivate it instead.</p>

      <h2>Monitoring Listing Performance</h2>

      <h3>Understanding Your Statistics</h3>
      <p>Each listing provides valuable metrics to help you understand its performance:</p>

      <ul>
        <li><strong>Views:</strong> The total number of times people have viewed your listing detail page. This shows how many people were interested enough to click through and read more.</li>
        <li><strong>Impressions:</strong> How many times your listing appeared in search results, regardless of whether anyone clicked on it. A high impression count with low views might mean your photos or title need improvement.</li>
        <li><strong>Click-Through Rate:</strong> The percentage of people who viewed your listing after seeing it in search (Views ÷ Impressions). Industry average is 5-15%.</li>
        <li><strong>Days Active:</strong> How long your listing has been published. This helps you track how quickly properties in your area typically rent.</li>
        <li><strong>Posted Date:</strong> The exact date and time your listing went live.</li>
        <li><strong>Last Updated:</strong> When you most recently edited the listing.</li>
      </ul>

      <h3>Improving Performance</h3>
      <p>If your listing isn't getting enough views:</p>
      <ul>
        <li><strong>Update Photos:</strong> Add brighter, clearer images that showcase your property's best features</li>
        <li><strong>Revise Title:</strong> Make it more descriptive and include key selling points</li>
        <li><strong>Adjust Pricing:</strong> Research comparable properties and ensure competitive pricing</li>
        <li><strong>Enhance Description:</strong> Add more details about unique features and neighborhood amenities</li>
        <li><strong>Update Regularly:</strong> Even small updates can boost your listing in search results</li>
        <li><strong>Consider Featured Status:</strong> Featured listings get significantly more visibility</li>
      </ul>

      <h2>Best Practices for Listing Management</h2>

      <h3>Keep Information Current</h3>
      <ul>
        <li>Update availability dates as soon as they change</li>
        <li>Adjust pricing if market conditions shift</li>
        <li>Add new photos if you make improvements to the property</li>
        <li>Keep contact information current so interested renters can reach you</li>
        <li>Update the description if neighborhood amenities change</li>
      </ul>

      <h3>Respond Promptly to Inquiries</h3>
      <ul>
        <li>Check your email and phone messages regularly</li>
        <li>Aim to respond to inquiries within 24 hours</li>
        <li>Keep your contact information up to date</li>
        <li>Set up email notifications for new inquiries</li>
      </ul>

      <h3>Maintain Professional Standards</h3>
      <ul>
        <li>Be honest and accurate in all listing information</li>
        <li>Use high-quality, current photos</li>
        <li>Write clear, professional descriptions</li>
        <li>Disclose any important issues or limitations upfront</li>
        <li>Follow fair housing laws in all communications</li>
      </ul>

      <h3>Regular Maintenance Schedule</h3>
      <p>Set reminders to review your listings regularly:</p>
      <ul>
        <li><strong>Weekly:</strong> Check for and respond to any inquiries</li>
        <li><strong>Bi-weekly:</strong> Review your listing statistics and performance</li>
        <li><strong>Monthly:</strong> Update information to keep it fresh and accurate</li>
        <li><strong>Quarterly:</strong> Review and update photos if needed</li>
      </ul>

      <h2>Troubleshooting Common Issues</h2>

      <h3>My Edits Aren't Saving</h3>
      <p>If you're having trouble saving changes:</p>
      <ul>
        <li>Ensure all required fields are filled out</li>
        <li>Check that you haven't exceeded photo or description limits</li>
        <li>Verify your internet connection is stable</li>
        <li>Try refreshing the page and starting again</li>
        <li>Clear your browser cache and try once more</li>
        <li>Contact support if the problem persists</li>
      </ul>

      <h3>My Listing Disappeared</h3>
      <p>If you can't find your listing:</p>
      <ul>
        <li>Check if it's been accidentally deactivated in your dashboard</li>
        <li>Look in the "Pending Approval" section if you recently edited it</li>
        <li>Verify you're logged into the correct account</li>
        <li>Check your email for any notifications about the listing status</li>
        <li>Contact support with your listing details</li>
      </ul>

      <h3>I Need to Make an Urgent Update</h3>
      <p>For time-sensitive changes:</p>
      <ul>
        <li>Make minor edits that don't require approval for immediate updates</li>
        <li>If you must make changes requiring approval, note this in your edit</li>
        <li>Contact support to expedite the review if it's truly urgent</li>
        <li>Consider temporarily deactivating if the information is significantly incorrect</li>
      </ul>

      <h2>Need More Help?</h2>
      <p>If you have questions about managing your listings that aren't covered here:</p>
      <ul>
        <li>Browse other articles in the Posting Listings section</li>
        <li>Check our Community Guidelines for best practices</li>
        <li>Contact our support team through the Contact page</li>
        <li>Review our FAQ for quick answers</li>
      </ul>
    `,
    tags: ['edit', 'manage', 'update', 'dashboard', 'deactivate', 'statistics', 'performance'],
    sort_order: 3,
    is_published: true,
    read_time_minutes: 10,
  },
  {
    category_slug: 'posting-listings',
    title: 'Photography Tips for Listings',
    slug: 'photography-tips',
    excerpt: 'Best practices for taking photos that showcase your property.',
    content: `
      <h2>Photography Tips for Great Listings</h2>
      <p>Quality photos are essential for attracting tenants. Follow these tips to make your property shine.</p>

      <h3>Essential Shots</h3>
      <p>Include photos of:</p>
      <ul>
        <li>Living room from multiple angles</li>
        <li>Kitchen showing appliances and counter space</li>
        <li>Each bedroom</li>
        <li>Bathrooms</li>
        <li>Building exterior or entrance</li>
        <li>Any unique features or recent renovations</li>
      </ul>

      <h3>Photography Best Practices</h3>
      <ul>
        <li><strong>Lighting:</strong> Take photos during the day with natural light. Open curtains and turn on lights</li>
        <li><strong>Cleanliness:</strong> Tidy up spaces before photographing. Remove clutter and personal items</li>
        <li><strong>Angles:</strong> Stand in corners to capture as much of the room as possible</li>
        <li><strong>Quality:</strong> Use a smartphone or camera, not blurry or dark images</li>
        <li><strong>Honest Representation:</strong> Don't over-edit or misrepresent the space</li>
      </ul>

      <h3>What to Avoid</h3>
      <ul>
        <li>Dark or blurry photos</li>
        <li>Photos with people in them</li>
        <li>Excessive filters or editing</li>
        <li>Photos of unfinished or damaged areas</li>
        <li>Images taken from odd angles</li>
      </ul>

      <h3>Image Requirements</h3>
      <ul>
        <li>Format: JPG or PNG</li>
        <li>Maximum: 10 images per listing</li>
        <li>Recommended resolution: At least 1024x768 pixels</li>
        <li>File size: Under 5MB per image</li>
      </ul>
    `,
    tags: ['photos', 'images', 'photography', 'tips'],
    sort_order: 4,
    is_published: true,
    read_time_minutes: 4,
  },

  // Browsing Properties
  {
    category_slug: 'browsing-properties',
    title: 'Searching for Properties',
    slug: 'searching-properties',
    excerpt: 'Master our search and filter tools to find your perfect rental quickly and efficiently.',
    content: `
      <h2>Finding Your Perfect Rental Home</h2>
      <p>Our platform makes it easy to search through available rental properties with powerful filtering and sorting tools. Whether you're looking for a studio apartment, a family home, or something in between, this guide will help you navigate the search process efficiently.</p>

      <h2>Getting Started with Search</h2>

      <h3>Accessing the Browse Page</h3>
      <p>There are several ways to start your property search:</p>
      <ul>
        <li>Click "Find Yours" on the homepage hero section</li>
        <li>Select "Browse" from the main navigation menu</li>
        <li>Use the quick search bar on the homepage (if available)</li>
        <li>Navigate directly to the browse page from any location on the site</li>
      </ul>
      <p>Once on the browse page, you'll see all currently available rental listings displayed in an easy-to-scan grid format.</p>

      <h3>Understanding the Default View</h3>
      <p>By default, listings are displayed with:</p>
      <ul>
        <li><strong>Grid Layout:</strong> Properties shown as cards with key information</li>
        <li><strong>Most Recent First:</strong> Newest listings appear at the top</li>
        <li><strong>All Property Types:</strong> No filters applied initially</li>
        <li><strong>Active Listings Only:</strong> Only currently available properties</li>
      </ul>

      <h2>Using Search Filters</h2>
      <p>Filters help you narrow down the search results to find exactly what you're looking for. Our comprehensive filter system includes:</p>

      <h3>Basic Filters</h3>

      <p><strong>Number of Bedrooms</strong></p>
      <p>Select the number of bedrooms you need:</p>
      <ul>
        <li>Studio/Efficiency (0 bedrooms)</li>
        <li>1 Bedroom</li>
        <li>2 Bedrooms</li>
        <li>3 Bedrooms</li>
        <li>4 Bedrooms</li>
        <li>5+ Bedrooms</li>
      </ul>
      <p><em>Tip: You can select multiple bedroom options to see a range (e.g., 2 or 3 bedrooms).</em></p>

      <p><strong>Price Range</strong></p>
      <p>Set your budget with minimum and maximum monthly rent:</p>
      <ul>
        <li>Enter a minimum price to exclude properties below your budget</li>
        <li>Enter a maximum price to filter out properties above your range</li>
        <li>Use one or both fields depending on your needs</li>
        <li>Prices typically range from $500 to $3000+ per month</li>
      </ul>
      <p><em>Note: Some listings show "Call for Price" and will appear regardless of price filters.</em></p>

      <p><strong>Property Type</strong></p>
      <p>Choose the type of rental that fits your lifestyle:</p>
      <ul>
        <li><strong>Apartment Building:</strong> Unit in a multi-family apartment complex</li>
        <li><strong>Apartment in House:</strong> Converted space within a single-family home</li>
        <li><strong>Full House:</strong> Entire single-family home for rent</li>
      </ul>

      <h3>Advanced Filters</h3>

      <p><strong>Parking Options</strong></p>
      <p>Filter by parking availability:</p>
      <ul>
        <li><strong>Yes (Included):</strong> Parking included in rent at no extra cost</li>
        <li><strong>Yes (Optional):</strong> Parking available for additional fee</li>
        <li><strong>No:</strong> No parking available with the property</li>
      </ul>

      <p><strong>Amenities and Features</strong></p>
      <p>Select specific amenities you need:</p>
      <ul>
        <li><strong>Washer/Dryer Hookup:</strong> In-unit laundry connections available</li>
        <li><strong>Dishwasher:</strong> Built-in dishwasher included</li>
        <li><strong>Pet Friendly:</strong> Pets allowed (check individual listings for restrictions)</li>
        <li><strong>Furnished:</strong> Property comes with furniture</li>
        <li><strong>Air Conditioning:</strong> Central or window AC units</li>
      </ul>

      <p><strong>Utilities and Heat</strong></p>
      <p>Filter by what's included in rent:</p>
      <ul>
        <li><strong>Heat Included:</strong> Heating costs paid by landlord</li>
        <li><strong>Tenant Pays Heat:</strong> Tenant responsible for heating bills</li>
        <li><strong>All Utilities Included:</strong> Rent covers all utility costs</li>
      </ul>

      <p><strong>Additional Options</strong></p>
      <ul>
        <li><strong>Lease Length:</strong> Month-to-month, 6 months, 1 year, or flexible</li>
        <li><strong>Availability Date:</strong> Filter by when you need to move in</li>
        <li><strong>Number of Bathrooms:</strong> Full and half bathroom counts</li>
        <li><strong>Square Footage:</strong> Minimum size requirements</li>
      </ul>

      <h3>Applying and Clearing Filters</h3>
      <ol>
        <li>Select your desired filter options from the sidebar or filter panel</li>
        <li>Filters apply automatically as you select them (or click "Apply Filters" if required)</li>
        <li>Watch the results update in real-time to match your criteria</li>
        <li>The listing count shows how many properties match your filters</li>
        <li>To start over, click "Clear All Filters" to reset to the default view</li>
      </ol>

      <h2>Sorting Search Results</h2>
      <p>Once you've filtered your results, use sorting to organize them in the most helpful way:</p>

      <h3>Available Sort Options</h3>
      <ul>
        <li><strong>Most Recent:</strong> Newest listings first (default) - great for seeing what just became available</li>
        <li><strong>Price: Low to High:</strong> Most affordable options first - perfect for budget-conscious searches</li>
        <li><strong>Price: High to Low:</strong> Premium properties first - ideal when price isn't a constraint</li>
        <li><strong>Most Popular:</strong> Listings with the most views and saves - helps identify desirable properties</li>
      </ul>

      <h3>Combining Filters and Sorting</h3>
      <p>For best results, use filters and sorting together:</p>
      <ol>
        <li>Start by applying filters to match your requirements</li>
        <li>Then use sorting to organize the filtered results</li>
        <li>Adjust filters as needed to expand or narrow results</li>
        <li>Save promising properties to your favorites for comparison</li>
      </ol>

      <h2>Viewing Search Results</h2>

      <h3>Understanding Listing Cards</h3>
      <p>Each property in the search results displays as a card showing:</p>
      <ul>
        <li><strong>Primary Photo:</strong> Main image of the property</li>
        <li><strong>Price:</strong> Monthly rent or "Call for Price"</li>
        <li><strong>Location:</strong> Street address or general neighborhood</li>
        <li><strong>Bedrooms & Bathrooms:</strong> Number of each (e.g., "2 BR / 1 BA")</li>
        <li><strong>Property Type:</strong> Quick icon or text indicating type</li>
        <li><strong>Key Features:</strong> Highlighted amenities (parking, washer/dryer, etc.)</li>
        <li><strong>Featured Badge:</strong> Special marker for promoted listings</li>
        <li><strong>Save Button:</strong> Heart icon to add to favorites</li>
      </ul>

      <h3>Interacting with Listings</h3>
      <p>From the search results page, you can:</p>
      <ul>
        <li><strong>Click Anywhere on Card:</strong> Opens the full listing details page</li>
        <li><strong>Click Heart Icon:</strong> Saves property to your favorites (requires login)</li>
        <li><strong>Hover for Quick Preview:</strong> See additional photos on hover (desktop only)</li>
        <li><strong>Share Listing:</strong> Use share button to send to friends or family</li>
      </ul>

      <h2>Advanced Search Strategies</h2>

      <h3>The Funnel Approach</h3>
      <p>Start broad and gradually narrow your search:</p>
      <ol>
        <li><strong>Begin with Must-Haves:</strong> Apply only essential filters (bedrooms, max price)</li>
        <li><strong>Review Results:</strong> Browse what's available in your basic criteria</li>
        <li><strong>Add Nice-to-Haves:</strong> Layer on additional filters (parking, amenities)</li>
        <li><strong>Adjust as Needed:</strong> If too few results, remove less critical filters</li>
        <li><strong>Save Favorites:</strong> Mark interesting properties throughout the process</li>
      </ol>

      <h3>What to Do When You Have Too Many Results</h3>
      <p>If you're overwhelmed with options:</p>
      <ul>
        <li>Narrow your price range to be more specific</li>
        <li>Add more amenity requirements</li>
        <li>Filter by property type if you have a preference</li>
        <li>Sort by "Most Popular" to see what others are interested in</li>
        <li>Focus on recently posted listings by sorting by "Most Recent"</li>
      </ul>

      <h3>What to Do When You Have Too Few Results</h3>
      <p>Not finding enough options? Try:</p>
      <ul>
        <li>Expanding your price range slightly</li>
        <li>Removing some amenity filters (keep only essentials)</li>
        <li>Including multiple bedroom options instead of just one</li>
        <li>Considering different property types</li>
        <li>Adjusting your move-in date to be more flexible</li>
        <li>Checking back regularly as new listings are added daily</li>
      </ul>

      <h2>Saving and Organizing Your Search</h2>

      <h3>Using the Favorites Feature</h3>
      <p>Create a shortlist of properties you're interested in:</p>
      <ol>
        <li>Click the heart icon on any listing card or detail page</li>
        <li>Access all your saved properties by clicking "Favorites" in navigation</li>
        <li>Compare multiple favorites side by side</li>
        <li>Remove properties as you narrow down your choices</li>
        <li>Share your favorites list with roommates or family</li>
      </ol>
      <p><em>Note: You must be logged in to save favorites.</em></p>

      <h3>Taking Notes</h3>
      <p>As you browse, keep track of important details:</p>
      <ul>
        <li>Screenshot or save photos of properties you like</li>
        <li>Note down questions to ask landlords</li>
        <li>Create a spreadsheet comparing key features</li>
        <li>Record your impressions while they're fresh</li>
        <li>Note any red flags or concerns</li>
      </ul>

      <h2>Best Practices for Property Search</h2>

      <h3>Timing Your Search</h3>
      <ul>
        <li><strong>Start Early:</strong> Begin searching 4-8 weeks before you need to move</li>
        <li><strong>Check Daily:</strong> New listings are added regularly, often in the morning</li>
        <li><strong>Be Ready to Act:</strong> Popular properties get inquiries quickly</li>
        <li><strong>Consider Off-Peak:</strong> Summer is busy; winter may have more availability</li>
      </ul>

      <h3>What to Look For</h3>
      <p>While searching, pay attention to:</p>
      <ul>
        <li><strong>Photo Quality:</strong> Clear, well-lit photos suggest a well-maintained property</li>
        <li><strong>Detailed Descriptions:</strong> Comprehensive information indicates a serious landlord</li>
        <li><strong>Realistic Pricing:</strong> Compare to similar properties in the area</li>
        <li><strong>Recent Posting Date:</strong> Listings open for months may have issues</li>
        <li><strong>Complete Information:</strong> Missing details might indicate incomplete or rushed listing</li>
      </ul>

      <h3>Red Flags to Watch For</h3>
      <ul>
        <li>Prices significantly below market rate</li>
        <li>Stock photos or very limited images</li>
        <li>Vague or minimal descriptions</li>
        <li>Requests for money before viewing</li>
        <li>Landlord refusing in-person showings</li>
        <li>Too-good-to-be-true deals or features</li>
      </ul>

      <h2>Next Steps After Finding Properties</h2>

      <h3>Reviewing Listing Details</h3>
      <p>Once you've found interesting properties:</p>
      <ol>
        <li>Click through to read the full listing</li>
        <li>Review all photos carefully</li>
        <li>Read the complete description</li>
        <li>Check what utilities and amenities are included</li>
        <li>Note the contact information</li>
        <li>Look for any special requirements or restrictions</li>
      </ol>

      <h3>Contacting Landlords</h3>
      <p>Ready to inquire about a property?</p>
      <ul>
        <li>Use the contact form on the listing page</li>
        <li>Call the phone number provided</li>
        <li>Prepare a brief introduction about yourself</li>
        <li>Have your questions ready</li>
        <li>Mention your desired move-in date</li>
        <li>Be professional and courteous</li>
      </ul>
      <p>See our "Contacting Landlords" article for detailed guidance on making a great first impression.</p>

      <h2>Mobile Search Tips</h2>
      <p>Searching on your phone or tablet? Here are some mobile-specific tips:</p>
      <ul>
        <li><strong>Filter Panel:</strong> Tap the filter icon to access all filter options</li>
        <li><strong>Swipe Through Photos:</strong> Swipe left/right on listing cards to see more images</li>
        <li><strong>Save on the Go:</strong> Heart listings when you're out exploring neighborhoods</li>
        <li><strong>Enable Notifications:</strong> Get alerts for new listings matching your criteria</li>
        <li><strong>Use Maps:</strong> View properties on a map to understand their locations</li>
      </ul>

      <h2>Troubleshooting Search Issues</h2>

      <h3>No Results Showing</h3>
      <p>If you see no properties:</p>
      <ul>
        <li>Click "Clear All Filters" to reset</li>
        <li>Check that your filters aren't too restrictive</li>
        <li>Refresh the page</li>
        <li>Try a different browser if issues persist</li>
        <li>Contact support if the problem continues</li>
      </ul>

      <h3>Filters Not Working</h3>
      <p>If filters don't seem to apply:</p>
      <ul>
        <li>Refresh the page and try again</li>
        <li>Clear your browser cache</li>
        <li>Make sure JavaScript is enabled</li>
        <li>Try using a different browser</li>
        <li>Check your internet connection</li>
      </ul>

      <h3>Listings Loading Slowly</h3>
      <p>For performance issues:</p>
      <ul>
        <li>Check your internet connection speed</li>
        <li>Close unnecessary browser tabs</li>
        <li>Disable browser extensions temporarily</li>
        <li>Try during off-peak hours</li>
        <li>Use a wired connection instead of WiFi if possible</li>
      </ul>

      <h2>Need Additional Help?</h2>
      <p>For more information about finding your perfect rental:</p>
      <ul>
        <li>Read "Understanding Listing Details" to learn what information each listing provides</li>
        <li>Check out "Contacting Landlords" for tips on reaching out to property owners</li>
        <li>Browse our "For Tenants" section for complete renter resources</li>
        <li>Contact our support team if you have specific questions</li>
      </ul>
    `,
    tags: ['search', 'browse', 'filter', 'find', 'tenants', 'properties', 'sorting'],
    sort_order: 1,
    is_published: true,
    read_time_minutes: 12,
  },
  {
    category_slug: 'browsing-properties',
    title: 'Understanding Listing Details',
    slug: 'listing-details',
    excerpt: 'Learn what information is included in property listings and what to look for.',
    content: `
      <h2>Understanding Listing Information</h2>
      <p>Each listing provides detailed information to help you make informed decisions.</p>

      <h3>Basic Information</h3>
      <ul>
        <li><strong>Title:</strong> Quick summary of the property</li>
        <li><strong>Price:</strong> Monthly rent (some listings show "Call for Price")</li>
        <li><strong>Location:</strong> Address or general neighborhood</li>
        <li><strong>Bedrooms & Bathrooms:</strong> Number of each</li>
        <li><strong>Square Footage:</strong> Size of the unit (when available)</li>
        <li><strong>Floor:</strong> Which floor the unit is on (for apartments)</li>
      </ul>

      <h3>Property Features</h3>
      <ul>
        <li><strong>Property Type:</strong> Apartment building, apartment in house, or full house</li>
        <li><strong>Parking:</strong> Yes, Included, Optional (extra cost), or No</li>
        <li><strong>Washer/Dryer Hookup:</strong> Available or not</li>
        <li><strong>Dishwasher:</strong> Included or not</li>
        <li><strong>Heat:</strong> Included in rent or tenant pays separately</li>
        <li><strong>Broker Fee:</strong> Whether a broker fee applies</li>
        <li><strong>Lease Length:</strong> Preferred lease duration</li>
      </ul>

      <h3>Photos and Description</h3>
      <p>Review multiple photos to get a complete picture of the property. Read the full description for additional details about:</p>
      <ul>
        <li>Recent renovations or updates</li>
        <li>Neighborhood amenities</li>
        <li>Pet policies</li>
        <li>Available move-in dates</li>
        <li>Application requirements</li>
      </ul>

      <h3>Contact Information</h3>
      <p>Each listing includes contact details for the landlord or agent. You can:</p>
      <ul>
        <li>Call the provided phone number</li>
        <li>Use the contact form to send a message</li>
        <li>Save the listing to favorites for later</li>
      </ul>

      <h3>Listing Statistics</h3>
      <p>Some listings show:</p>
      <ul>
        <li><strong>Views:</strong> How many people have viewed the listing</li>
        <li><strong>Posted Date:</strong> When the listing was published</li>
        <li><strong>Featured Badge:</strong> Indicates promoted listings</li>
      </ul>
    `,
    tags: ['details', 'information', 'features', 'amenities'],
    sort_order: 2,
    is_published: true,
    read_time_minutes: 5,
  },
  {
    category_slug: 'browsing-properties',
    title: 'Contacting Landlords',
    slug: 'contacting-landlords',
    excerpt: 'Master the art of reaching out to property owners and making a memorable first impression.',
    content: `
      <h2>Making Contact with Property Owners</h2>
      <p>You've found the perfect property—now it's time to reach out to the landlord or agent. Making a strong first impression through your initial contact can significantly improve your chances of securing a viewing and ultimately getting the rental. This guide will help you communicate professionally and effectively.</p>

      <h2>Understanding Your Contact Options</h2>

      <h3>Available Contact Methods</h3>
      <p>Most listings provide multiple ways to get in touch:</p>

      <p><strong>Phone Call</strong></p>
      <ul>
        <li><strong>Best for:</strong> Quick questions, immediate availability, urgent inquiries</li>
        <li><strong>Timing:</strong> Call during business hours (9 AM - 7 PM) on weekdays</li>
        <li><strong>Advantages:</strong> Immediate response, personal connection, can ask follow-up questions</li>
        <li><strong>Tips:</strong> Be in a quiet location, have the listing open in front of you, take notes</li>
      </ul>

      <p><strong>Contact Form or Email</strong></p>
      <ul>
        <li><strong>Best for:</strong> Detailed inquiries, multiple questions, documenting communication</li>
        <li><strong>Timing:</strong> Can send anytime; expect response within 24-48 hours</li>
        <li><strong>Advantages:</strong> Time to compose thoughts, written record, can include attachments</li>
        <li><strong>Tips:</strong> Use clear subject lines, check spelling and grammar, keep it concise</li>
      </ul>

      <p><strong>Text Message</strong></p>
      <ul>
        <li><strong>Best for:</strong> Follow-ups, confirming appointments, quick updates</li>
        <li><strong>Timing:</strong> Only after initial contact, respect business hours</li>
        <li><strong>Advantages:</strong> Quick and convenient for both parties</li>
        <li><strong>Tips:</strong> Stay professional, keep messages brief, identify yourself</li>
      </ul>

      <h2>Crafting Your Initial Message</h2>

      <h3>Essential Information to Include</h3>
      <p>Whether calling or writing, your first contact should include:</p>

      <ol>
        <li><strong>Your Full Name:</strong> Introduction with first and last name</li>
        <li><strong>Property Reference:</strong> Specific address or listing title to avoid confusion</li>
        <li><strong>Move-In Timeline:</strong> When you're looking to move (be realistic)</li>
        <li><strong>Household Information:</strong> Number of adults, children, and pets (if any)</li>
        <li><strong>Brief Background:</strong> Current occupation or student status</li>
        <li><strong>Viewing Request:</strong> Ask about scheduling a showing</li>
        <li><strong>Your Contact Info:</strong> Best phone number and email to reach you</li>
      </ol>

      <h3>Optional But Helpful Details</h3>
      <p>These additional points can strengthen your inquiry:</p>
      <ul>
        <li>Why you're interested in this specific property</li>
        <li>Your current rental situation (if applicable)</li>
        <li>That you have stable income and good references</li>
        <li>Any specific questions about the property</li>
        <li>Your flexibility with viewing times</li>
      </ul>

      <h2>Message Templates and Examples</h2>

      <h3>Template for First Contact</h3>
      <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6;">
        <p style="margin: 0; line-height: 1.6;"><strong>Subject: Inquiry About 2BR Apartment at [Address]</strong></p>
        <p style="margin: 16px 0 0 0; line-height: 1.6;">
          Hello,<br><br>
          My name is [Your Full Name] and I'm interested in your [number of bedrooms] bedroom property at [specific address/location].<br><br>
          I'm looking to move in around [target date] and would love to schedule a viewing at your earliest convenience. I work as a [your profession] at [company/industry] and can provide employment verification and references.<br><br>
          It will be [number] adult(s) [and number children if applicable] living in the unit. [Add if applicable: We have one well-behaved pet, a [type of pet].] We're looking for [length of lease] and can move in flexibly within the next [timeframe].<br><br>
          I'm particularly interested in this property because [mention specific features you like]. I have a few questions:<br>
          - [Question 1]<br>
          - [Question 2]<br><br>
          I'm available for a showing [mention your availability]. Please let me know what times work best for you.<br><br>
          You can reach me at [phone number] or reply to this email. I look forward to hearing from you.<br><br>
          Best regards,<br>
          [Your Full Name]<br>
          [Phone Number]
        </p>
      </div>

      <h3>Template for Phone Call</h3>
      <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6;">
        <p style="margin: 0; line-height: 1.6;"><strong>Phone Script Outline:</strong></p>
        <p style="margin: 16px 0 0 0; line-height: 1.6;">
          "Hello, my name is [Your Name]. I'm calling about the [number] bedroom property you have listed at [address]. Is this still available?<br><br>
          [If yes:] Great! I'm very interested and would love to schedule a viewing. I'm looking to move in around [date]. I work as a [profession] and can provide references. When would be a good time to see the property?<br><br>
          [Have pen and paper ready to write down showing date/time]<br><br>
          [Ask 1-2 quick questions if time permits]<br><br>
          Thank you so much. I'm looking forward to seeing it. My number is [phone] if you need to reach me."
        </p>
      </div>

      <h2>Questions to Ask</h2>

      <h3>Essential Questions for First Contact</h3>
      <p>Get clarity on the basics:</p>
      <ul>
        <li>Is the property still available?</li>
        <li>When is the earliest available move-in date?</li>
        <li>When can I schedule a viewing?</li>
        <li>What is the application process?</li>
        <li>What documents will I need to provide?</li>
      </ul>

      <h3>Important Follow-Up Questions</h3>
      <p>Ask during viewing or after initial contact:</p>
      <ul>
        <li>What utilities are included in the rent?</li>
        <li>Is there a security deposit? How much?</li>
        <li>Are there any additional fees? (application fee, parking, pets)</li>
        <li>What is the lease length required?</li>
        <li>What are the income requirements?</li>
        <li>Is renters insurance required?</li>
        <li>How is maintenance handled?</li>
        <li>What is the pet policy specifically?</li>
      </ul>

      <h3>Questions About the Property Itself</h3>
      <ul>
        <li>Which utilities does the tenant pay?</li>
        <li>What is the average utility cost?</li>
        <li>Is laundry in-unit, in-building, or nearby?</li>
        <li>Is parking included? Street or designated?</li>
        <li>Are any appliances or furniture included?</li>
        <li>How old is the building/when was it renovated?</li>
        <li>What storage options are available?</li>
        <li>Is there air conditioning/heating throughout?</li>
      </ul>

      <h2>Response Times and Follow-Up</h2>

      <h3>What to Expect</h3>
      <p>Understanding typical response patterns:</p>
      <ul>
        <li><strong>Email/Form:</strong> 24-48 hours for first response</li>
        <li><strong>Phone:</strong> Immediate if answered; leave voicemail if not</li>
        <li><strong>Peak Times:</strong> Faster responses during business hours Monday-Friday</li>
        <li><strong>Popular Listings:</strong> May receive automated response or quick reply</li>
        <li><strong>Weekends/Evenings:</strong> Responses may take longer</li>
      </ul>

      <h3>Following Up Professionally</h3>
      <p>If you haven't heard back:</p>
      <ol>
        <li><strong>Wait 48-72 Hours:</strong> Give landlord time to respond to initial inquiry</li>
        <li><strong>Send One Follow-Up:</strong> Polite reminder of your interest</li>
        <li><strong>Try Different Method:</strong> If you emailed, try calling (or vice versa)</li>
        <li><strong>Keep It Brief:</strong> Reference your previous message</li>
        <li><strong>Know When to Move On:</strong> After 2-3 attempts with no response, focus elsewhere</li>
      </ol>

      <h3>Follow-Up Message Template</h3>
      <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6;">
        <p style="margin: 0; line-height: 1.6;">
          "Hello,<br><br>
          I wanted to follow up on my inquiry from [date] about your [number] bedroom property at [address]. I remain very interested in viewing the property and learning more about it.<br><br>
          Please let me know if it's still available and when might be a good time for a showing. You can reach me at [phone].<br><br>
          Thank you,<br>
          [Your Name]"
        </p>
      </div>

      <h2>Best Practices for Communication</h2>

      <h3>Do's</h3>
      <ul>
        <li><strong>Be Prompt:</strong> Respond quickly to landlord replies</li>
        <li><strong>Be Professional:</strong> Use proper grammar, spelling, and formatting</li>
        <li><strong>Be Honest:</strong> Provide accurate information about yourself</li>
        <li><strong>Be Specific:</strong> Reference the exact property and your timeline</li>
        <li><strong>Be Prepared:</strong> Have your questions and information ready</li>
        <li><strong>Be Respectful:</strong> Thank them for their time and consideration</li>
        <li><strong>Be Flexible:</strong> Offer multiple viewing time options</li>
        <li><strong>Be Complete:</strong> Include all relevant contact information</li>
      </ul>

      <h3>Don'ts</h3>
      <ul>
        <li><strong>Don't Mass Message:</strong> Customize each inquiry to the property</li>
        <li><strong>Don't Be Pushy:</strong> Avoid excessive follow-ups or demands</li>
        <li><strong>Don't Overshare:</strong> Keep initial contact professional and concise</li>
        <li><strong>Don't Negotiate Yet:</strong> Save pricing discussions for after viewing</li>
        <li><strong>Don't Ghost:</strong> If you lose interest, let the landlord know</li>
        <li><strong>Don't Use Slang:</strong> Maintain professional tone in all communications</li>
        <li><strong>Don't Forget Details:</strong> Include your contact info in every message</li>
        <li><strong>Don't Contact After Hours:</strong> Unless it's an emergency</li>
      </ul>

      <h2>Preparing for the Viewing</h2>

      <h3>Before the Showing</h3>
      <p>Once you've scheduled a viewing:</p>
      <ul>
        <li>Confirm the appointment 24 hours before</li>
        <li>Note the exact address and apartment number</li>
        <li>Plan to arrive 5-10 minutes early</li>
        <li>Prepare your list of questions</li>
        <li>Bring necessary documents (if requested)</li>
        <li>Charge your phone for photos/notes</li>
        <li>Review the listing again for questions</li>
      </ul>

      <h3>Documents to Bring</h3>
      <p>Have these ready if landlord requests:</p>
      <ul>
        <li>Photo ID (driver's license or passport)</li>
        <li>Recent pay stubs or employment letter</li>
        <li>Bank statements (if requested)</li>
        <li>References list with contact information</li>
        <li>Previous landlord contact information</li>
        <li>Completed rental application (if provided in advance)</li>
      </ul>

      <h2>Safety Considerations</h2>

      <h3>Protecting Yourself</h3>
      <p>Stay safe during the rental search process:</p>
      <ul>
        <li><strong>Verify Identity:</strong> Confirm you're dealing with the actual property owner or authorized agent</li>
        <li><strong>Meet in Person:</strong> Always view the property in person before committing</li>
        <li><strong>Bring Someone:</strong> Take a friend or family member to viewings when possible</li>
        <li><strong>Share Your Plans:</strong> Let someone know where you're going and when</li>
        <li><strong>Trust Your Instincts:</strong> If something feels off, walk away</li>
        <li><strong>Verify the Property:</strong> Ensure the listing matches the actual property</li>
      </ul>

      <h3>Red Flags to Watch For</h3>
      <p>Be cautious if you encounter:</p>
      <ul>
        <li><strong>No Viewing Allowed:</strong> Landlord refuses in-person showing</li>
        <li><strong>Pressure Tactics:</strong> Demands immediate decision or payment</li>
        <li><strong>Too Good to Be True:</strong> Price significantly below market rate</li>
        <li><strong>Wire Transfer Requests:</strong> Asks for money before viewing or via untraceable methods</li>
        <li><strong>Overseas Landlord:</strong> Claims to be out of country and can't show property</li>
        <li><strong>No Lease Agreement:</strong> Unwilling to provide written lease terms</li>
        <li><strong>Suspicious Documents:</strong> Requests unusual personal information upfront</li>
        <li><strong>Property Mismatch:</strong> Actual property doesn't match listing photos</li>
      </ul>

      <h3>Legitimate Requests vs. Scams</h3>
      <p><strong>Legitimate landlords may ask for:</strong></p>
      <ul>
        <li>Application fee (typically $20-50, after viewing)</li>
        <li>Credit and background check authorization</li>
        <li>Employment and income verification</li>
        <li>References from previous landlords</li>
        <li>Security deposit (after approval, with signed lease)</li>
      </ul>

      <p><strong>Red flags indicating potential scams:</strong></p>
      <ul>
        <li>Money requested before viewing the property</li>
        <li>Pressure to wire money or use gift cards</li>
        <li>No written lease agreement offered</li>
        <li>Landlord can't meet in person or show property</li>
        <li>Copy/paste responses that don't answer your questions</li>
      </ul>

      <h2>After the Initial Contact</h2>

      <h3>Following Up After Viewing</h3>
      <p>If you're interested after seeing the property:</p>
      <ol>
        <li>Send a thank-you message within 24 hours</li>
        <li>Reiterate your interest in the property</li>
        <li>Mention specific features you liked</li>
        <li>Ask about next steps in the application process</li>
        <li>Provide any additional information requested</li>
        <li>Submit your application promptly</li>
      </ol>

      <h3>Post-Viewing Thank You Template</h3>
      <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6;">
        <p style="margin: 0; line-height: 1.6;">
          "Hi [Landlord Name],<br><br>
          Thank you for taking the time to show me the property at [address] today. I really appreciated the opportunity to see it in person.<br><br>
          I'm very interested in renting the property. I particularly liked [mention 1-2 specific features]. The location and [other features] would be perfect for my needs.<br><br>
          I'm ready to move forward with the application process. Please let me know what the next steps are and what additional information you need from me. I can provide any necessary documents right away.<br><br>
          Thank you again, and I look forward to hearing from you soon.<br><br>
          Best regards,<br>
          [Your Name]<br>
          [Phone Number]"
        </p>
      </div>

      <h3>If You're Not Interested</h3>
      <p>Professional courtesy matters even when declining:</p>
      <ul>
        <li>Let the landlord know you're no longer interested</li>
        <li>Keep the message brief and polite</li>
        <li>Thank them for their time</li>
        <li>No need to explain in detail why it's not a fit</li>
        <li>This maintains good relationships in a small rental community</li>
      </ul>

      <h2>Special Situations</h2>

      <h3>Contacting About Pet-Friendly Rentals</h3>
      <p>If you have pets, be upfront and provide details:</p>
      <ul>
        <li>Mention pets in your initial inquiry</li>
        <li>Specify type, breed, size, and age</li>
        <li>Highlight that pets are well-trained/house-trained</li>
        <li>Offer to provide pet references if available</li>
        <li>Ask about pet deposit or monthly pet rent</li>
        <li>Be prepared to provide vaccination records</li>
      </ul>

      <h3>Inquiring with Roommates</h3>
      <p>When renting with others:</p>
      <ul>
        <li>Designate one person as primary contact</li>
        <li>Mention the total number of adults who will live there</li>
        <li>Indicate that all tenants will be on the lease</li>
        <li>Be prepared for all roommates to apply</li>
        <li>Coordinate schedules for group viewing</li>
      </ul>

      <h3>As a Student</h3>
      <p>Student renters should emphasize:</p>
      <ul>
        <li>Which school you attend and your program</li>
        <li>Expected graduation date or length of stay</li>
        <li>Source of income (job, financial aid, family support)</li>
        <li>Willingness to have a co-signer if needed</li>
        <li>Serious attitude toward renting responsibilities</li>
      </ul>

      <h2>Tips for Competitive Markets</h2>

      <h3>Standing Out in High-Demand Areas</h3>
      <p>When competition is fierce:</p>
      <ul>
        <li><strong>Respond Immediately:</strong> Contact landlords within hours of listing posting</li>
        <li><strong>Be Prepared:</strong> Have all documents ready to submit same-day</li>
        <li><strong>Be Flexible:</strong> Offer flexible move-in dates or longer lease terms</li>
        <li><strong>Provide References:</strong> Attach reference letters to your initial inquiry</li>
        <li><strong>Show Financial Stability:</strong> Mention stable employment and good credit score</li>
        <li><strong>Express Genuine Interest:</strong> Explain why this property is perfect for you</li>
        <li><strong>Be Professional:</strong> Error-free, well-composed messages show responsibility</li>
      </ul>

      <h2>Common Mistakes to Avoid</h2>

      <h3>Inquiry Mistakes</h3>
      <ul>
        <li>Sending generic, copy-paste messages</li>
        <li>Asking questions already answered in the listing</li>
        <li>Making demands before viewing the property</li>
        <li>Being vague about your timeline or situation</li>
        <li>Forgetting to include contact information</li>
        <li>Using unprofessional email addresses</li>
        <li>Sending messages with typos or errors</li>
        <li>Coming across as desperate or overly aggressive</li>
      </ul>

      <h3>Communication Mistakes</h3>
      <ul>
        <li>Taking days to respond to landlord messages</li>
        <li>Providing inconsistent information</li>
        <li>Being dishonest about income, pets, or occupants</li>
        <li>Arguing about price or terms before viewing</li>
        <li>Not confirming scheduled appointments</li>
        <li>No-showing for scheduled viewings</li>
        <li>Being rude or entitled in tone</li>
        <li>Ghosting after viewing if not interested</li>
      </ul>

      <h2>Need More Help?</h2>
      <p>For additional guidance on your rental search:</p>
      <ul>
        <li>Read "Searching for Properties" to find listings that match your needs</li>
        <li>Check out "Understanding Listing Details" to know what to look for</li>
        <li>Review "Saving Favorite Properties" to organize your search</li>
        <li>Browse our Community Guidelines for platform best practices</li>
        <li>Contact our support team if you encounter any issues</li>
      </ul>
    `,
    tags: ['contact', 'landlord', 'message', 'inquiry', 'communication', 'viewing', 'tenants'],
    sort_order: 3,
    is_published: true,
    read_time_minutes: 15,
  },

  // Account Management
  {
    category_slug: 'account-management',
    title: 'Managing Your Profile',
    slug: 'managing-profile',
    excerpt: 'Update your account information and preferences.',
    content: `
      <h2>Managing Your Profile</h2>
      <p>Keep your account information up to date to ensure smooth communication.</p>

      <h3>Accessing Account Settings</h3>
      <ol>
        <li>Log in to your account</li>
        <li>Click your name or profile icon in the navigation</li>
        <li>Select "Account Settings"</li>
      </ol>

      <h3>Profile Information You Can Update</h3>
      <ul>
        <li><strong>Full Name:</strong> Your display name</li>
        <li><strong>Email:</strong> Used for notifications and login</li>
        <li><strong>Phone Number:</strong> Contact number for inquiries</li>
        <li><strong>Role:</strong> Tenant, Landlord, or Agent</li>
        <li><strong>Agency:</strong> If you're part of a real estate agency</li>
      </ul>

      <h3>Changing Your Password</h3>
      <ol>
        <li>Go to Account Settings</li>
        <li>Find the "Change Password" section</li>
        <li>Enter your current password</li>
        <li>Enter and confirm your new password</li>
        <li>Save changes</li>
      </ol>

      <h3>Email Preferences</h3>
      <p>Control which notifications you receive:</p>
      <ul>
        <li>New listing alerts</li>
        <li>Responses to your listings</li>
        <li>Account updates</li>
        <li>Weekly digest of new properties</li>
      </ul>

      <h3>Privacy Settings</h3>
      <p>Manage your privacy preferences:</p>
      <ul>
        <li>Choose what information is visible on your listings</li>
        <li>Control who can contact you</li>
        <li>Manage data sharing preferences</li>
      </ul>
    `,
    tags: ['profile', 'settings', 'account', 'preferences'],
    sort_order: 1,
    is_published: true,
    read_time_minutes: 4,
  },
  {
    category_slug: 'account-management',
    title: 'Resetting Your Password',
    slug: 'reset-password',
    excerpt: 'Learn how to reset your password if you forget it.',
    content: `
      <h2>Password Reset</h2>
      <p>Forgot your password? No problem. Follow these steps to regain access to your account.</p>

      <h3>Requesting a Password Reset</h3>
      <ol>
        <li>Go to the login page</li>
        <li>Click "Forgot Password?"</li>
        <li>Enter the email address associated with your account</li>
        <li>Click "Send Reset Link"</li>
      </ol>

      <h3>Checking Your Email</h3>
      <p>You'll receive an email with a password reset link within a few minutes. Check your spam folder if you don't see it in your inbox.</p>

      <h3>Creating a New Password</h3>
      <ol>
        <li>Click the reset link in your email</li>
        <li>Enter your new password (must be at least 8 characters)</li>
        <li>Confirm your new password</li>
        <li>Submit the form</li>
        <li>Log in with your new password</li>
      </ol>

      <h3>Password Requirements</h3>
      <p>For security, passwords must:</p>
      <ul>
        <li>Be at least 8 characters long</li>
        <li>Contain a mix of letters and numbers (recommended)</li>
        <li>Not be a commonly used password</li>
      </ul>

      <h3>Troubleshooting</h3>
      <p><strong>Didn't receive the email?</strong></p>
      <ul>
        <li>Check your spam/junk folder</li>
        <li>Verify you entered the correct email address</li>
        <li>Wait a few minutes and try again</li>
        <li>Contact support if the issue persists</li>
      </ul>

      <h3>Account Security Tips</h3>
      <ul>
        <li>Use a unique password for this account</li>
        <li>Don't share your password with anyone</li>
        <li>Change your password regularly</li>
        <li>Log out on shared devices</li>
      </ul>
    `,
    tags: ['password', 'reset', 'forgot', 'security'],
    sort_order: 2,
    is_published: true,
    read_time_minutes: 3,
  },

  // Featured Listings
  {
    category_slug: 'featured-listings',
    title: 'What Are Featured Listings?',
    slug: 'what-are-featured-listings',
    excerpt: 'Learn about featured listings and their benefits.',
    content: `
      <h2>Featured Listings Explained</h2>
      <p>Featured listings receive premium placement and increased visibility on our platform.</p>

      <h3>Benefits of Featured Listings</h3>
      <ul>
        <li><strong>Top Placement:</strong> Appear at the top of search results</li>
        <li><strong>Homepage Visibility:</strong> Featured on the homepage</li>
        <li><strong>Special Badge:</strong> Stand out with a "Featured" badge</li>
        <li><strong>Increased Views:</strong> Get significantly more views than regular listings</li>
        <li><strong>Faster Results:</strong> Rent your property faster with increased exposure</li>
      </ul>

      <h3>Who Can Feature Listings?</h3>
      <p>Featured listings are available to:</p>
      <ul>
        <li>Individual landlords and property owners</li>
        <li>Real estate agents</li>
        <li>Property management companies</li>
      </ul>

      <h3>How Long Do Featured Listings Last?</h3>
      <p>Featured listings typically remain promoted for a set period (e.g., 30 days). You can check the expiration date in your dashboard.</p>

      <h3>Pricing and Availability</h3>
      <p>Contact us for information about featured listing packages and pricing. Different options are available based on your needs.</p>

      <h3>Best Practices for Featured Listings</h3>
      <p>Maximize your featured listing's impact by:</p>
      <ul>
        <li>Using high-quality photos</li>
        <li>Writing detailed, accurate descriptions</li>
        <li>Keeping contact information current</li>
        <li>Responding quickly to inquiries</li>
        <li>Updating availability promptly</li>
      </ul>
    `,
    tags: ['featured', 'promotion', 'visibility', 'premium'],
    sort_order: 1,
    is_published: true,
    read_time_minutes: 4,
  },

  // Favorites
  {
    category_slug: 'favorites',
    title: 'Saving Favorite Properties',
    slug: 'saving-favorites',
    excerpt: 'Learn how to save and organize properties you love.',
    content: `
      <h2>Using the Favorites Feature</h2>
      <p>Save properties you're interested in for easy access and comparison later.</p>

      <h3>How to Save a Favorite</h3>
      <ol>
        <li>Browse listings or view a specific property</li>
        <li>Click the heart icon on the listing card or detail page</li>
        <li>The property is instantly saved to your favorites</li>
      </ol>
      <p><em>Note: You must be logged in to save favorites.</em></p>

      <h3>Viewing Your Favorites</h3>
      <ol>
        <li>Log in to your account</li>
        <li>Click "Favorites" in the navigation or go to your Dashboard</li>
        <li>Browse all your saved properties in one place</li>
      </ol>

      <h3>Managing Favorites</h3>
      <ul>
        <li><strong>Remove:</strong> Click the heart icon again to remove from favorites</li>
        <li><strong>Compare:</strong> View multiple favorite properties side by side</li>
        <li><strong>Quick Access:</strong> All saved properties are accessible from one page</li>
      </ul>

      <h3>Why Use Favorites?</h3>
      <ul>
        <li>Keep track of properties during your search</li>
        <li>Compare multiple options easily</li>
        <li>Return to interesting properties later</li>
        <li>Don't lose track of great finds</li>
        <li>Share your shortlist with family or roommates</li>
      </ul>

      <h3>Tips</h3>
      <ul>
        <li>Save any property you're even slightly interested in</li>
        <li>Review your favorites regularly as new properties become available</li>
        <li>Remove properties once they're no longer available or relevant</li>
        <li>Use favorites to narrow down your final choices</li>
      </ul>
    `,
    tags: ['favorites', 'saved', 'wishlist', 'bookmarks'],
    sort_order: 1,
    is_published: true,
    read_time_minutes: 3,
  },

  // Agency Features
  {
    category_slug: 'agency-features',
    title: 'Agency Pages and Profiles',
    slug: 'agency-pages',
    excerpt: 'Learn about agency features for real estate professionals.',
    content: `
      <h2>Agency Features</h2>
      <p>Real estate agencies can create branded pages to showcase their listings and services.</p>

      <h3>Agency Profile Page</h3>
      <p>Agencies get a dedicated page featuring:</p>
      <ul>
        <li><strong>Agency Logo:</strong> Your branded logo</li>
        <li><strong>Banner Image:</strong> Large hero image</li>
        <li><strong>About Section:</strong> Detailed description of your agency</li>
        <li><strong>Contact Information:</strong> Phone, email, and website</li>
        <li><strong>All Listings:</strong> Showcase all your active properties</li>
      </ul>

      <h3>Setting Up Your Agency</h3>
      <ol>
        <li>Create an account with the "Agent" role</li>
        <li>Contact us to set up your agency profile</li>
        <li>Provide your agency information and branding</li>
        <li>Start posting listings under your agency</li>
      </ol>

      <h3>Benefits for Agencies</h3>
      <ul>
        <li>Professional branded presence</li>
        <li>Centralized listing management</li>
        <li>Build your agency's reputation</li>
        <li>Increased visibility for all your properties</li>
        <li>Direct contact from interested renters</li>
      </ul>

      <h3>Agency Listing Management</h3>
      <p>Agencies can:</p>
      <ul>
        <li>Post multiple listings</li>
        <li>Manage all properties from one dashboard</li>
        <li>Track performance across all listings</li>
        <li>Feature select properties</li>
        <li>Update agency information anytime</li>
      </ul>

      <h3>Getting Started as an Agency</h3>
      <p>Contact us to learn more about agency accounts and get set up with your branded presence on our platform.</p>
    `,
    tags: ['agency', 'real estate', 'professional', 'business'],
    sort_order: 1,
    is_published: true,
    read_time_minutes: 4,
  },

  // Community Guidelines
  {
    category_slug: 'guidelines',
    title: 'Community Guidelines and Rules',
    slug: 'community-guidelines',
    excerpt: 'Rules and best practices for using our platform responsibly.',
    content: `
      <h2>Community Guidelines</h2>
      <p>Our platform thrives on trust and respect. Please follow these guidelines to maintain a positive community.</p>

      <h3>Posting Requirements</h3>
      <p>All listings must:</p>
      <ul>
        <li>Be for actual available rental properties</li>
        <li>Include accurate information and pricing</li>
        <li>Use real photos of the property</li>
        <li>Comply with fair housing laws</li>
        <li>Include legitimate contact information</li>
      </ul>

      <h3>Prohibited Content</h3>
      <p>Do not post:</p>
      <ul>
        <li>Fake or fraudulent listings</li>
        <li>Properties you don't have authority to rent</li>
        <li>Discriminatory content or requirements</li>
        <li>Spam or promotional content unrelated to rentals</li>
        <li>Duplicate listings</li>
        <li>Inappropriate or offensive content</li>
      </ul>

      <h3>Communication Guidelines</h3>
      <ul>
        <li>Be professional and respectful</li>
        <li>Respond to inquiries in a timely manner</li>
        <li>Provide accurate information</li>
        <li>No harassment or inappropriate behavior</li>
        <li>Keep communications on-platform when possible</li>
      </ul>

      <h3>Fair Housing Compliance</h3>
      <p>All users must comply with fair housing laws. Listings cannot discriminate based on:</p>
      <ul>
        <li>Race or color</li>
        <li>Religion</li>
        <li>National origin</li>
        <li>Sex or gender</li>
        <li>Familial status</li>
        <li>Disability</li>
      </ul>

      <h3>Consequences of Violations</h3>
      <p>Violations may result in:</p>
      <ul>
        <li>Listing removal</li>
        <li>Account warnings</li>
        <li>Temporary suspension</li>
        <li>Permanent account ban</li>
        <li>Legal action for serious violations</li>
      </ul>

      <h3>Reporting Issues</h3>
      <p>If you encounter inappropriate content or behavior:</p>
      <ol>
        <li>Use the "Report" button on the listing or profile</li>
        <li>Provide details about the issue</li>
        <li>Our team will review and take appropriate action</li>
      </ol>
    `,
    tags: ['guidelines', 'rules', 'policy', 'prohibited', 'compliance'],
    sort_order: 1,
    is_published: true,
    read_time_minutes: 5,
  },
  {
    category_slug: 'guidelines',
    title: 'Privacy and Data Protection',
    slug: 'privacy-data',
    excerpt: 'How we protect your personal information and privacy.',
    content: `
      <h2>Privacy and Data Protection</h2>
      <p>We take your privacy seriously and are committed to protecting your personal information.</p>

      <h3>Information We Collect</h3>
      <ul>
        <li><strong>Account Information:</strong> Name, email, phone number, role</li>
        <li><strong>Listing Information:</strong> Property details and photos you upload</li>
        <li><strong>Usage Data:</strong> How you interact with the platform</li>
        <li><strong>Communications:</strong> Messages sent through our platform</li>
      </ul>

      <h3>How We Use Your Information</h3>
      <ul>
        <li>Provide platform services</li>
        <li>Display your listings and contact information</li>
        <li>Send important account notifications</li>
        <li>Improve our services</li>
        <li>Ensure platform security</li>
      </ul>

      <h3>Information Sharing</h3>
      <p>We do not sell your personal information. Information is only shared:</p>
      <ul>
        <li>As displayed in your public listings</li>
        <li>When you contact other users</li>
        <li>When required by law</li>
        <li>With your explicit consent</li>
      </ul>

      <h3>Your Privacy Rights</h3>
      <ul>
        <li>Access your personal data</li>
        <li>Correct inaccurate information</li>
        <li>Request data deletion</li>
        <li>Opt out of marketing communications</li>
        <li>Export your data</li>
      </ul>

      <h3>Data Security</h3>
      <p>We implement security measures including:</p>
      <ul>
        <li>Encrypted data transmission</li>
        <li>Secure password storage</li>
        <li>Regular security updates</li>
        <li>Access controls and monitoring</li>
      </ul>

      <h3>Contact Us About Privacy</h3>
      <p>For privacy concerns or requests, contact us through our Contact page or email us directly.</p>

      <p><em>For complete details, please review our full Privacy Policy.</em></p>
    `,
    tags: ['privacy', 'data', 'security', 'GDPR', 'personal information'],
    sort_order: 2,
    is_published: true,
    read_time_minutes: 4,
  },

  // Technical Support
  {
    category_slug: 'technical-support',
    title: 'Troubleshooting Common Issues',
    slug: 'troubleshooting',
    excerpt: 'Solutions to common technical problems.',
    content: `
      <h2>Troubleshooting Guide</h2>
      <p>Having technical difficulties? Try these solutions to common problems.</p>

      <h3>Can't Log In</h3>
      <p><strong>Solutions:</strong></p>
      <ul>
        <li>Verify you're using the correct email address</li>
        <li>Check that Caps Lock is off when entering your password</li>
        <li>Clear your browser cache and cookies</li>
        <li>Try a different browser</li>
        <li>Use the "Forgot Password" feature to reset</li>
      </ul>

      <h3>Photos Won't Upload</h3>
      <p><strong>Solutions:</strong></p>
      <ul>
        <li>Check file size (must be under 5MB per image)</li>
        <li>Verify file format (JPG or PNG only)</li>
        <li>Try a different browser</li>
        <li>Check your internet connection</li>
        <li>Reduce image resolution if too large</li>
        <li>Make sure you haven't exceeded the 10 image limit</li>
      </ul>

      <h3>Search Not Working</h3>
      <p><strong>Solutions:</strong></p>
      <ul>
        <li>Refresh the page</li>
        <li>Clear your search filters and try again</li>
        <li>Check your internet connection</li>
        <li>Try different search criteria</li>
        <li>Update your browser to the latest version</li>
      </ul>

      <h3>Changes Not Saving</h3>
      <p><strong>Solutions:</strong></p>
      <ul>
        <li>Ensure all required fields are filled out</li>
        <li>Check your internet connection</li>
        <li>Don't navigate away before saving completes</li>
        <li>Try clearing your browser cache</li>
        <li>Disable browser extensions temporarily</li>
      </ul>

      <h3>Page Not Loading</h3>
      <p><strong>Solutions:</strong></p>
      <ul>
        <li>Refresh the page</li>
        <li>Check your internet connection</li>
        <li>Clear browser cache and cookies</li>
        <li>Try a different browser or device</li>
        <li>Disable ad blockers or VPNs</li>
      </ul>

      <h3>Mobile Issues</h3>
      <p><strong>Solutions:</strong></p>
      <ul>
        <li>Update your mobile browser</li>
        <li>Try the desktop version of the site</li>
        <li>Clear your mobile browser cache</li>
        <li>Ensure you have a stable internet connection</li>
        <li>Restart your device</li>
      </ul>

      <h3>Still Having Problems?</h3>
      <p>If these solutions don't help, please contact our support team with details about:</p>
      <ul>
        <li>What you were trying to do</li>
        <li>What went wrong</li>
        <li>Your browser and device</li>
        <li>Any error messages you saw</li>
      </ul>
    `,
    tags: ['troubleshooting', 'problems', 'help', 'errors', 'bugs'],
    sort_order: 1,
    is_published: true,
    read_time_minutes: 5,
  },
  {
    category_slug: 'technical-support',
    title: 'Browser and Device Compatibility',
    slug: 'compatibility',
    excerpt: 'Learn which browsers and devices work best with our platform.',
    content: `
      <h2>Browser and Device Compatibility</h2>
      <p>Our platform works on most modern browsers and devices. Here's what you need to know.</p>

      <h3>Recommended Browsers</h3>
      <p>For the best experience, use the latest version of:</p>
      <ul>
        <li><strong>Google Chrome</strong> (recommended)</li>
        <li><strong>Mozilla Firefox</strong></li>
        <li><strong>Safari</strong> (Mac and iOS)</li>
        <li><strong>Microsoft Edge</strong></li>
      </ul>

      <h3>Mobile Devices</h3>
      <p>Fully supported on:</p>
      <ul>
        <li><strong>iOS:</strong> iPhone and iPad with iOS 12 or later</li>
        <li><strong>Android:</strong> Devices running Android 8.0 or later</li>
      </ul>

      <h3>Screen Resolutions</h3>
      <p>Optimized for:</p>
      <ul>
        <li>Desktop: 1280x720 and higher</li>
        <li>Tablet: 768x1024 and higher</li>
        <li>Mobile: 375x667 and higher</li>
      </ul>

      <h3>Required Features</h3>
      <p>Your browser must support:</p>
      <ul>
        <li>JavaScript (must be enabled)</li>
        <li>Cookies (for login and preferences)</li>
        <li>Modern CSS (CSS3)</li>
        <li>HTML5</li>
      </ul>

      <h3>Internet Connection</h3>
      <p>Recommended minimum speeds:</p>
      <ul>
        <li>Browsing: 1 Mbps</li>
        <li>Uploading photos: 5 Mbps</li>
      </ul>

      <h3>Accessibility Features</h3>
      <p>Our platform supports:</p>
      <ul>
        <li>Screen readers</li>
        <li>Keyboard navigation</li>
        <li>Text resizing</li>
        <li>High contrast mode</li>
      </ul>

      <h3>Known Issues</h3>
      <ul>
        <li><strong>Internet Explorer:</strong> No longer supported</li>
        <li><strong>Old Browser Versions:</strong> May have limited functionality</li>
        <li><strong>Ad Blockers:</strong> May interfere with some features</li>
      </ul>

      <h3>Optimizing Performance</h3>
      <p>For the best experience:</p>
      <ul>
        <li>Keep your browser updated</li>
        <li>Close unnecessary tabs and programs</li>
        <li>Clear cache regularly</li>
        <li>Disable unnecessary browser extensions</li>
        <li>Use a stable internet connection</li>
      </ul>
    `,
    tags: ['compatibility', 'browser', 'device', 'requirements', 'technical'],
    sort_order: 2,
    is_published: true,
    read_time_minutes: 4,
  },
  {
    category_slug: 'technical-support',
    title: 'Contact Support',
    slug: 'contact-support',
    excerpt: 'How to get help when you need it.',
    content: `
      <h2>Getting Support</h2>
      <p>Need help that you can't find in our help articles? We're here to assist you.</p>

      <h3>Before Contacting Support</h3>
      <p>Save time by first:</p>
      <ul>
        <li>Searching this help center for your issue</li>
        <li>Checking the troubleshooting guide</li>
        <li>Reviewing relevant help articles in your topic area</li>
        <li>Making sure you've tried basic solutions (refresh, clear cache, etc.)</li>
      </ul>

      <h3>How to Contact Us</h3>
      <p><strong>Contact Form:</strong></p>
      <ol>
        <li>Visit our Contact page</li>
        <li>Fill out the contact form with your details</li>
        <li>Describe your issue clearly</li>
        <li>Submit the form</li>
      </ol>

      <p><strong>Email:</strong></p>
      <p>You can also email us directly at the address provided on our Contact page.</p>

      <h3>What to Include</h3>
      <p>Help us help you faster by including:</p>
      <ul>
        <li>Your account email address</li>
        <li>A clear description of the problem</li>
        <li>What you were trying to do</li>
        <li>What happened instead</li>
        <li>Your browser and device information</li>
        <li>Screenshots if applicable</li>
        <li>Any error messages you received</li>
      </ul>

      <h3>Response Times</h3>
      <ul>
        <li><strong>General inquiries:</strong> 24-48 hours</li>
        <li><strong>Technical issues:</strong> 24-48 hours</li>
        <li><strong>Account issues:</strong> 12-24 hours</li>
        <li><strong>Urgent matters:</strong> Same business day when possible</li>
      </ul>

      <h3>Support Hours</h3>
      <p>Our support team is available:</p>
      <ul>
        <li>Monday - Friday: 9:00 AM - 5:00 PM</li>
        <li>Weekends: Email responses only</li>
        <li>Holidays: Limited availability</li>
      </ul>

      <h3>Other Resources</h3>
      <ul>
        <li><strong>Help Center:</strong> Browse all help articles</li>
        <li><strong>Community Guidelines:</strong> Review platform rules</li>
        <li><strong>Privacy Policy:</strong> Learn about data protection</li>
        <li><strong>Terms of Service:</strong> Understand user agreements</li>
      </ul>
    `,
    tags: ['support', 'contact', 'help', 'customer service'],
    sort_order: 3,
    is_published: true,
    read_time_minutes: 3,
  },
];

async function seedKnowledgeBase() {
  console.log('Starting knowledge base seed...');

  try {
    // Insert categories
    console.log('Inserting categories...');
    const { data: insertedCategories, error: categoryError } = await supabase
      .from('knowledge_base_categories')
      .upsert(categories, { onConflict: 'slug' })
      .select();

    if (categoryError) {
      throw new Error(`Error inserting categories: ${categoryError.message}`);
    }

    console.log(`✓ Inserted ${insertedCategories?.length || 0} categories`);

    // Create a map of category slugs to IDs
    const categoryMap = new Map(
      insertedCategories?.map((cat) => [cat.slug, cat.id]) || []
    );

    // Transform articles to include category IDs
    const articlesWithCategoryIds = articles.map((article) => ({
      ...article,
      category_id: categoryMap.get(article.category_slug),
      category_slug: undefined, // Remove the temporary field
    }));

    // Insert articles
    console.log('Inserting articles...');
    const { data: insertedArticles, error: articleError } = await supabase
      .from('knowledge_base_articles')
      .upsert(articlesWithCategoryIds, { onConflict: 'slug' })
      .select();

    if (articleError) {
      throw new Error(`Error inserting articles: ${articleError.message}`);
    }

    console.log(`✓ Inserted ${insertedArticles?.length || 0} articles`);

    console.log('\n✅ Knowledge base seed completed successfully!');
    console.log(`\nSummary:`);
    console.log(`- Categories: ${insertedCategories?.length || 0}`);
    console.log(`- Articles: ${insertedArticles?.length || 0}`);
  } catch (error) {
    console.error('❌ Error seeding knowledge base:', error);
    process.exit(1);
  }
}

seedKnowledgeBase();
